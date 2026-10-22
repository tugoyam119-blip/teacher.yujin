/**
 * PHASE 2-5 — interception and recovery, intentionally separate from rewards.
 * One originating academic attempt can have at most ONE interception.  The
 * original wrong team's recovery claim survives even a correct interception.
 * Teacher decisions, attempts, and participant rosters are immutable audit
 * evidence. Only reduceCommand persists them as one IndexedDB transaction.
 */
import {clone,insist,requireId,validTimestamp,timerRemainingMs} from '../engine/model.js';
import {assessAnswer,validateTeacherJudgement} from '../questions/adjudication.js';
import {effectiveOriginDecision} from '../corrections/reconcile.js';

export const INTERCEPTION_COMMANDS=Object.freeze([
  'INTERCEPTION_OPENED','INTERCEPTION_SKIPPED',
  'INTERCEPTION_TIMER_STARTED','INTERCEPTION_TIMER_PAUSED','INTERCEPTION_TIMER_RESUMED','INTERCEPTION_TIMER_EXPIRED',
  'INTERCEPTION_ANSWER_SUBMITTED','INTERCEPTION_JUDGED','INTERCEPTION_FORFEITED'
]);
export const RECOVERY_COMMANDS=Object.freeze([
  'RECOVERY_DEFERRED','RECOVERY_RELEASED','RECOVERY_ORIGIN_FORFEITED','RECOVERY_CALLED',
  'RECOVERY_TIMER_STARTED','RECOVERY_TIMER_PAUSED','RECOVERY_TIMER_RESUMED','RECOVERY_TIMER_EXPIRED',
  'RECOVERY_ANSWER_SUBMITTED','RECOVERY_JUDGED','RECOVERY_FORFEITED'
]);
const TT=new Set(['RUNNING','PAUSED','PREPARED','EXPIRED_AWAITING_TEACHER','RESOLVED']);
const reason=(s,label='사유')=>{
  insist(typeof s==='string'&&s.trim().length>0&&s.length<=2000,'REASON_REQUIRED',`${label}는 1~2000자로 기록해야 합니다.`);
  return s.trim();
};
const teacher=(p)=>insist(p?.teacherConfirmed===true,'TEACHER_REQUIRED','교사 확인이 필요합니다.');
export const extension=s=>{
  if(!s.interception)s.interception={records:[],activeId:null,lastTeamId:null};
  if(!s.recovery)s.recovery={pending:[],resolved:[],activeId:null};
  if(s.recovery.activeId===undefined)s.recovery.activeId=null;
  return s;
};
const activeLesson=s=>insist(s.sessions.find(x=>x.id===s.activeSessionId)?.phase==='ACTIVE',
  'SESSION_NOT_ACTIVE','차시가 실제 진행 중이어야 합니다.');
const noParallel=s=>{
  extension(s);
  insist(!s.interception.activeId&&!s.recovery.activeId,'SIDE_MISSION_ACTIVE','이전 가로채기·회수미션을 먼저 종료해야 합니다.');
  const a=s.activeAttemptId&&s.attempts[s.activeAttemptId];
  insist(!a||a.timer.phase==='RESOLVED','ATTEMPT_ACTIVE','일반 문제의 교사 판정을 먼저 마쳐야 합니다.');
};
const source=s=>{
  const a=s.activeAttemptId&&s.attempts[s.activeAttemptId];
  insist(a?.questionSnapshot && a.judgement && effectiveOriginDecision(s,a.id)==='INCORRECT' && a.timer.phase==='RESOLVED',
    'INTERCEPTION_NOT_ELIGIBLE','교사가 확정한 원모둠 오답 또는 포기 문제에만 가로채기가 가능합니다.');
  insist(a.sessionId===s.activeSessionId,'INTERCEPTION_NOT_ELIGIBLE',
    '가로채기는 해당 문제가 나온 차시에서만 바로 진행할 수 있습니다.');
  insist(s.recovery.pending.some(r=>r.sourceAttemptId===a.id),'RECOVERY_REQUIRED','원래 오답 회수 기록이 필요합니다.');
  return a;
};
const teamSnapshot=(s,teamId)=>{
  requireId(teamId,'대상 모둠');
  const t=s.teams.find(x=>x.id===teamId);
  insist(t,'INVALID_TEAM','대상 모둠을 찾을 수 없습니다.');
  const present=t.members.filter(m=>m.status==='PRESENT');
  insist(!t.members.length||present.length,'NO_ELIGIBLE_REPRESENTATIVE','대상 모둠에 출석한 학생이 없습니다.');
  return {teamId:t.id,teamName:t.name,rosterVersion:t.rosterVersion,members:clone(t.members),
    representativeMemberId:present[0]?.id??null};
};
const solver=(snap,memberId)=>{
  if(memberId===null||memberId===undefined)return null;
  requireId(memberId,'실제 해결 학생');
  insist(snap?.members?.some(m=>m.id===memberId&&m.status==='PRESENT'),
    'SOLVER_NOT_IN_TEAM','해당 미션 당시 출석한 대상 모둠의 학생만 해결자로 기록할 수 있습니다.');
  return memberId;
};
const timer=seconds=>({phase:'PREPARED',remainingMs:seconds*1000,runningSince:null,usedTimeSand:false});
const timerCommand=(t,type,at,seconds)=>{
  insist(TT.has(t.phase),'TIMER_INVALID','미션 타이머가 올바르지 않습니다.');
  if(type.endsWith('TIMER_STARTED')){
    insist(t.phase==='PREPARED','TIMER_NOT_PREPARED','미션 시작 전 상태가 아닙니다.');
    t.phase=seconds===0?'PAUSED':'RUNNING';t.runningSince=t.phase==='RUNNING'?at:null;t.startedAt=at;
  }else if(type.endsWith('TIMER_PAUSED')){
    insist(t.phase==='RUNNING'&&timerRemainingMs({timer:t},at)>0,'TIMER_NOT_RUNNING','실행 중이며 유효 시간이 남아 있어야 합니다.');
    t.remainingMs=timerRemainingMs({timer:t},at);t.runningSince=null;t.phase='PAUSED';
  }else if(type.endsWith('TIMER_RESUMED')){
    insist(t.phase==='PAUSED'&&t.remainingMs>0,'TIMER_NOT_PAUSED','재개 가능한 일시정지 상태가 아닙니다.');
    t.phase='RUNNING';t.runningSince=at;
  }else if(type.endsWith('TIMER_EXPIRED')){
    insist(t.phase==='RUNNING'&&timerRemainingMs({timer:t},at)===0,'TIMER_NOT_EXPIRED','만료 시점이 아닙니다.');
    t.remainingMs=0;t.runningSince=null;t.phase='EXPIRED_AWAITING_TEACHER';
  }else insist(false,'COMMAND_INVALID','지원하지 않는 미션 타이머 명령입니다.');
};
const takeAnswer=(flow,p,at,eventId)=>{
  insist(flow.timer.startedAt!==undefined&&['RUNNING','PAUSED','EXPIRED_AWAITING_TEACHER'].includes(flow.timer.phase),
    'ANSWER_BAD_PHASE','교사 시작 후 유효한 타이머 상태여야 합니다.');
  insist(!flow.answer&&!flow.judgement&&!flow.forfeited,'ANSWER_ALREADY_SUBMITTED','이미 답변 또는 판정이 기록되었습니다.');
  const late=flow.timer.phase==='EXPIRED_AWAITING_TEACHER';
  if(flow.timer.phase==='RUNNING')insist(timerRemainingMs(flow,at)>0,'TIMER_DEADLINE','시간이 만료되었습니다. 먼저 만료 이벤트를 기록하세요.');
  if(flow.timer.phase!=='RUNNING')teacher(p);
  const lateReason=late?reason(p.lateReason,'시간 만료 후 접수 사유'):null;
  const assessed=assessAnswer(flow,p.response);
  const solverMemberId=solver(flow.targetRoster,p.solverMemberId);
  flow.answer={response:assessed.response,suggestion:assessed.suggestion,submittedAt:at,
    receivedEventId:eventId,solverMemberId,afterExpiry:late,lateReason};
  if(flow.timer.phase==='RUNNING'){
    flow.timer.remainingMs=timerRemainingMs(flow,at);flow.timer.runningSince=null;flow.timer.phase='PAUSED';
  }
};
const judge=(flow,p,at,eventId)=>{
  const decision=validateTeacherJudgement(flow,p,at);
  const solverMemberId=solver(flow.targetRoster,p.solverMemberId??flow.answer?.solverMemberId??null);
  if(flow.timer.phase==='RUNNING'){
    flow.timer.remainingMs=timerRemainingMs(flow,at);flow.timer.runningSince=null;
  }
  flow.timer.phase='RESOLVED';flow.resolvedAt=at;
  flow.judgement={...decision,teacherConfirmed:true,solverTeamId:flow.targetRoster.teamId,
    solverMemberId,judgedAt:at,eventId};
};
const forfeit=(flow,p,at,eventId)=>{
  teacher(p);
  insist(flow.timer.phase!=='RESOLVED'&&!flow.answer,'FORFEIT_INVALID','판정/제출 후에는 포기할 수 없습니다.');
  flow.forfeited={reason:reason(p.reason,'포기 사유'),eventId,at};
  if(flow.timer.phase==='RUNNING'){
    flow.timer.remainingMs=timerRemainingMs(flow,at);flow.timer.runningSince=null;
  }
  flow.timer.phase='RESOLVED';flow.resolvedAt=at;
};
export const activeInterception=s=>s.interception?.records?.find(x=>x.id===s.interception.activeId)||null;
export const activeRecovery=s=>s.recovery?.pending?.find(x=>x.id===s.recovery.activeId)||null;
const sameSourceRecord=(s,id)=>s.interception.records.some(x=>x.sourceAttemptId===id);

export function processInterception(s,type,p,{eventId,at}){
  extension(s);validTimestamp(at);requireId(eventId,'이벤트');
  const book=s.interception;
  if(type==='INTERCEPTION_OPENED'||type==='INTERCEPTION_SKIPPED'){
    teacher(p);activeLesson(s);noParallel(s);
    const origin=source(s);
    insist(p.sourceAttemptId===origin.id,'ATTEMPT_MISMATCH','가로채기 원문제 ID가 일치하지 않습니다.');
    insist(!sameSourceRecord(s,origin.id),'INTERCEPTION_ALREADY_USED','문제당 가로채기/포기는 한 번만 결정할 수 있습니다.');
    if(type==='INTERCEPTION_SKIPPED'){
      book.records.push({id:eventId,sourceAttemptId:origin.id,questionId:origin.questionId,originTeamId:origin.teamId,
        originRosterVersion:origin.teamAssignment?.rosterVersion??null,
        originRepresentativeMemberId:origin.teamAssignment?.representativeMemberId??null,
        targetTeamId:null,status:'SKIPPED',reason:reason(p.reason,'가로채기 생략 사유'),openedEventId:eventId,openedAt:at});
      book.lastTeamId=null;return;
    }
    insist(s.settings.interception!==false,'INTERCEPTION_DISABLED','완전 협동 탐험에서는 가로채기를 사용하지 않습니다.');
    requireId(p.interceptionId,'가로채기');
    insist(!book.records.some(x=>x.id===p.interceptionId),'INTERCEPTION_DUPLICATE','가로채기 ID가 중복되었습니다.');
    insist(p.targetTeamId!==origin.teamId,'INTERCEPTION_ORIGIN_TEAM','원래 문제의 모둠은 가로채기 대상이 될 수 없습니다.');
    insist(book.lastTeamId!==p.targetTeamId,'INTERCEPTION_CONSECUTIVE','같은 모둠의 연속 가로채기는 제한합니다.');
    const target=teamSnapshot(s,p.targetTeamId);
    book.records.push({id:p.interceptionId,sourceAttemptId:origin.id,questionId:origin.questionId,
      originRegionId:origin.regionId,originTeamId:origin.teamId,
      originRosterVersion:origin.teamAssignment?.rosterVersion??null,
      originRepresentativeMemberId:origin.teamAssignment?.representativeMemberId??null,
      targetTeamId:p.targetTeamId,targetRoster:target,questionSnapshot:clone(origin.questionSnapshot),
      openedAt:at,openedEventId:eventId,status:'ACTIVE',timer:timer(s.settings.timerSeconds),answer:null,judgement:null,
      resolvedAt:null});
    book.activeId=p.interceptionId;book.lastTeamId=p.targetTeamId;return;
  }
  const row=activeInterception(s);
  insist(row&&p.interceptionId===row.id,'INTERCEPTION_NOT_ACTIVE','활성 가로채기 ID가 일치하지 않습니다.');
  activeLesson(s);
  if(type.startsWith('INTERCEPTION_TIMER_')){
    insist(!row.answer,'ANSWER_ALREADY_SUBMITTED','답변 접수 뒤에는 타이머를 재개할 수 없습니다.');
    timerCommand(row.timer,type,at,s.settings.timerSeconds);
  }else if(type==='INTERCEPTION_ANSWER_SUBMITTED'){
    takeAnswer(row,p,at,eventId);
  }else if(type==='INTERCEPTION_JUDGED'){
    teacher(p);judge(row,p,at,eventId);row.status='RESOLVED';book.activeId=null;
  }else if(type==='INTERCEPTION_FORFEITED'){
    forfeit(row,p,at,eventId);row.status='RESOLVED';book.activeId=null;
  }else insist(false,'COMMAND_INVALID','지원하지 않는 가로채기 명령입니다.');
}

function recoveryRow(s,id){
  requireId(id,'회수 대상');const r=s.recovery.pending.find(x=>x.id===id);
  insist(r,'RECOVERY_NOT_PENDING','해당 미회수 원문제를 찾을 수 없습니다.');return r;
}
function currentRun(row){return row.runs?.find(x=>x.id===row.activeRunId)||null;}
function validRegion(s,regionId){
  requireId(regionId,'지역');insist(s.world.regions[regionId],'REGION_INVALID','공식 지역이 아닙니다.');
}
function canEmerge(s,row,regionId){
  const visits=s.world.regionEntryOrder??[];
  const i=visits.indexOf(row.originRegionId),j=visits.lastIndexOf(regionId);
  return i>=0&&j>i&&regionId!==row.originRegionId&&visits.at(-1)===regionId;
}
export function processRecovery(s,type,p,{eventId,at}){
  if(type==='RECOVERY_CALLED')insist(!s.sessions.find(x=>x.id===s.activeSessionId)?.wrapRequested,'LESSON_WRAP_REQUESTED','수업 마무리 예약 후 새 회수 문항을 시작할 수 없습니다.');
  extension(s);validTimestamp(at);requireId(eventId,'이벤트');
  teacher(p);
  if(['RECOVERY_DEFERRED','RECOVERY_RELEASED','RECOVERY_ORIGIN_FORFEITED','RECOVERY_CALLED'].includes(type)){
    const row=recoveryRow(s,p.recoveryId);
    insist(row.status!=='ACTIVE','RECOVERY_ACTIVE','진행 중인 회수미션을 먼저 종료해야 합니다.');
    if(type==='RECOVERY_DEFERRED'){
      insist(row.status==='PENDING','RECOVERY_NOT_PENDING','대기 중인 회수만 보류할 수 있습니다.');
      row.status='HELD';row.holdReason=reason(p.reason,'보류 사유');row.holdEventId=eventId;return;
    }
    if(type==='RECOVERY_RELEASED'){
      insist(row.status==='HELD','RECOVERY_NOT_HELD','보류된 회수만 해제할 수 있습니다.');
      row.status='PENDING';row.holdReason=null;row.releaseEventId=eventId;return;
    }
    if(type==='RECOVERY_ORIGIN_FORFEITED'){
      insist(row.status==='PENDING'&&!row.runs?.length&&!row.originForfeited,'RECOVERY_ORIGIN_PRIORITY','원모둠의 첫 회수 기회만 포기할 수 있습니다.');
      row.originForfeited={reason:reason(p.reason,'원모둠 포기 사유'),eventId,at};return;
    }
    activeLesson(s);noParallel(s);
    validRegion(s,p.regionId);
    insist(row.status==='PENDING'||row.status==='HELD'&&p.mode==='FORCED','RECOVERY_HELD','보류된 회수는 명시적 강제 호출만 가능합니다.');
    insist(['NATURAL','FORCED'].includes(p.mode),'RECOVERY_MODE_INVALID','회수 호출 방식이 올바르지 않습니다.');
    if(p.mode==='NATURAL')insist(canEmerge(s,row,p.regionId),'RECOVERY_TOO_EARLY','다음 지역 이후 방문 기록이 확인되지 않았습니다.');
    else reason(p.reason,'강제 회수 호출 사유');
    const previous=row.runs??[];
    if(!previous.length&&!row.originForfeited)insist(p.teamId===row.originTeamId,'RECOVERY_ORIGIN_PRIORITY','첫 회수 기회는 원래 오답 모둠에 있습니다.');
    else insist(p.teamId!==row.originTeamId,'RECOVERY_ALTERNATE_TEAM','실패·포기 후에는 다른 모둠이 해결해야 합니다.');
    requireId(p.runId,'회수 시도');
    insist(![...s.recovery.pending,...s.recovery.resolved].some(x=>x.runs?.some(run=>run.id===p.runId)),
      'RECOVERY_RUN_DUPLICATE','이미 존재하는 회수 시도 ID입니다.');
    const original=s.attempts[row.sourceAttemptId];
    insist(original?.questionSnapshot?.questionId===row.questionId,'RECOVERY_INVALID','원래 오답 문제 기록이 손상되었습니다.');
    const targetRoster=teamSnapshot(s,p.teamId);
    const run={id:p.runId,sourceAttemptId:row.sourceAttemptId,questionId:row.questionId,
      regionId:p.regionId,mode:p.mode,reason:p.mode==='FORCED'?p.reason.trim():null,
      teamId:p.teamId,targetRoster,questionSnapshot:clone(original.questionSnapshot),
      calledEventId:eventId,calledAt:at,timer:timer(s.settings.timerSeconds),answer:null,judgement:null,
      forfeited:null,resolvedAt:null};
    row.runs??=[];row.runs.push(run);row.activeRunId=p.runId;row.status='ACTIVE';s.recovery.activeId=row.id;return;
  }
  const row=activeRecovery(s);
  insist(row&&row.id===p.recoveryId,'RECOVERY_NOT_ACTIVE','활성 회수미션을 찾지 못했습니다.');
  const run=currentRun(row);
  insist(run&&p.runId===run.id,'RECOVERY_RUN_MISMATCH','회수 시도 ID가 일치하지 않습니다.');
  activeLesson(s);
  if(type.startsWith('RECOVERY_TIMER_')){
    insist(!run.answer,'ANSWER_ALREADY_SUBMITTED','답변 제출 후 미션 타이머를 조작할 수 없습니다.');
    timerCommand(run.timer,type,at,s.settings.timerSeconds);
  }else if(type==='RECOVERY_ANSWER_SUBMITTED'){
    takeAnswer(run,p,at,eventId);
  }else if(type==='RECOVERY_JUDGED'){
    judge(run,p,at,eventId);
    if(run.judgement.decision==='CORRECT'){
      row.status='RESOLVED';row.resolvedAt=at;row.resolutionEventId=eventId;
      row.solverTeamId=run.teamId;row.solverMemberId=run.judgement.solverMemberId;
      s.recovery.pending=s.recovery.pending.filter(x=>x.id!==row.id);
      s.recovery.resolved.push(row);
      s.questions.recoveryOnlyIds=s.questions.recoveryOnlyIds.filter(id=>id!==row.questionId);
      if(!s.questions.reviewEligibleIds.includes(row.questionId))s.questions.reviewEligibleIds.push(row.questionId);
    }else row.status='PENDING';
    row.activeRunId=null;s.recovery.activeId=null;
  }else if(type==='RECOVERY_FORFEITED'){
    forfeit(run,p,at,eventId);row.status='PENDING';row.activeRunId=null;s.recovery.activeId=null;
  }else insist(false,'COMMAND_INVALID','지원하지 않는 회수 명령입니다.');
}
