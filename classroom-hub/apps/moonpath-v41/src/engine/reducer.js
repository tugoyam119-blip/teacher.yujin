import {checkState,clone,insist,requireId,validTimestamp,timerRemainingMs,TIME_SAND_COST,TIME_SAND_EXTENSION_MS,canonicalJson} from './model.js';
import {validateDrawCommand} from '../questions/draw.js';
import {assessAnswer,validateTeacherJudgement} from '../questions/adjudication.js';
import {ROSTER_COMMANDS,applyRosterCommand,assignRepresentative,validateSolverIdentity} from '../teams/roster.js';
import {INTERCEPTION_COMMANDS,RECOVERY_COMMANDS,processInterception,processRecovery,extension,activeInterception,activeRecovery} from '../recovery/flows.js';

/** Pure event reducer: no DOM, network, localStorage, IndexedDB, Date.now or random IDs. */
export function reduceCommand(current,command){
  checkState(current);
  insist(command&&typeof command==='object','COMMAND_INVALID','명령은 객체여야 합니다.');
  const {eventId,type,at}=command;
  requireId(eventId,'이벤트');validTimestamp(at);
  insist(typeof type==='string','COMMAND_INVALID','명령 유형이 없습니다.');
  const prior=current.eventLog.find(e=>e.eventId===eventId);
  if(prior){
    insist(prior.type===type,'EVENT_ID_CONFLICT','같은 이벤트 ID로 다른 명령을 제출할 수 없습니다.');
    if(prior.payload!==undefined){
      insist(canonicalJson(prior.payload)===canonicalJson(command.payload??{}),'EVENT_ID_CONFLICT','같은 이벤트 ID로 다른 내용의 명령을 제출할 수 없습니다.');
    }
    return {duplicate:true,state:current,event:null};
  }
  insist(at>=current.meta.updatedAt,'CLOCK_BACKWARD','저장된 마지막 이벤트보다 앞선 시각입니다. PC 시각을 확인하세요.');
  const state=clone(current);
  const payload=clone(command.payload??{});
  const last=()=>{const a=state.activeAttemptId&&state.attempts[state.activeAttemptId];insist(a,'NO_ATTEMPT','활성 문제가 없습니다.');return a;};
  const activeSession=()=>{const x=state.sessions.find(s=>s.id===state.activeSessionId);insist(x,'NO_SESSION','현재 차시가 없습니다.');return x;};
  const finishActiveTime=s=>{if(s.phase==='ACTIVE'){s.activeMs+=Math.max(0,at-s.activeSince);s.activeSince=null;}};
  extension(state);
  const sideBusy=()=>!!(activeInterception(state)||activeRecovery(state));
  const pauseSideMissions=()=>{
    for(const row of [activeInterception(state),activeRecovery(state)?.runs?.find(x=>x.id===activeRecovery(state)?.activeRunId)]){
      if(row?.timer?.phase==='RUNNING'){row.timer.remainingMs=timerRemainingMs(row,at);row.timer.runningSince=null;row.timer.phase=row.timer.remainingMs?'PAUSED':'EXPIRED_AWAITING_TEACHER';}
    }
  };
  const ensureRunningNotExpired=a=>insist(a.timer.phase!=='RUNNING'||timerRemainingMs(a,at)>0,'TIMER_DEADLINE','시각 만료가 도달했습니다. 만료 이벤트를 확정해야 합니다.');
  switch(type){
    case 'EXPEDITION_CREATED':
      insist(current.meta.revision===0,'NOT_INITIAL','신규 원정 생성 명령은 최초에만 허용합니다.');
      break;
    case 'SCREEN_CHANGED':
      insist(typeof payload.screen==='string'&&/^[A-Z_]+$/.test(payload.screen),'INVALID_SCREEN','화면 ID가 올바르지 않습니다.');
      if(state.activeAttemptId){const a=last();insist(a.timer.phase==='RESOLVED','ATTEMPT_ACTIVE','문제 진행 중 일반 화면 이동을 할 수 없습니다.');}
      insist(!sideBusy(),'SIDE_MISSION_ACTIVE','가로채기/회수미션 진행 중 화면 이동은 제한됩니다.');
      state.screen=payload.screen;
      break;
    case 'TEAM_MEMBER_ADDED':
    case 'TEAM_ATTENDANCE_SET':
    case 'TEAM_MEMBER_MOVED':
    case 'TEAM_MEMBER_RENAMED':
    case 'TEAM_RENAMED':{
      applyRosterCommand(state,type,payload,{eventId,at});
      break;
    }
    case 'SESSION_STARTED':{
      insist(!state.activeSessionId,'SESSION_ACTIVE','이미 진행 중인 차시가 있습니다.');
      requireId(payload.sessionId,'차시');
      insist(!state.sessions.some(x=>x.id===payload.sessionId),'SESSION_EXISTS','이미 존재하는 차시 ID입니다.');
      state.sessions.push({id:payload.sessionId,startedAt:at,endedAt:null,activeMs:0,activeSince:at,phase:'ACTIVE'});
      state.activeSessionId=payload.sessionId;break;
    }
    case 'SESSION_PAUSED':{
      const s=activeSession();insist(s.phase==='ACTIVE','SESSION_NOT_ACTIVE','차시가 진행 중이 아닙니다.');
      if(state.activeAttemptId){
        const a=last();if(a.timer.phase==='RUNNING'){
          a.timer.remainingMs=timerRemainingMs(a,at);
          a.timer.phase=a.timer.remainingMs===0?'EXPIRED_AWAITING_TEACHER':'PAUSED';
          a.timer.runningSince=null;
        }
      }
      pauseSideMissions();finishActiveTime(s);s.phase='PAUSED';break;
    }
    case 'SESSION_RESUMED':{
      const s=activeSession();insist(s.phase==='PAUSED','SESSION_NOT_PAUSED','일시정지된 차시가 아닙니다.');s.phase='ACTIVE';s.activeSince=at;break;
    }
    case 'SESSION_ENDED':{
      const s=activeSession();insist(state.activeAttemptId?last().timer.phase==='RESOLVED':true,'ATTEMPT_ACTIVE','진행 중인 문제를 먼저 처리해야 합니다.');
      insist(!sideBusy(),'SIDE_MISSION_ACTIVE','진행 중인 회수/가로채기를 먼저 종료해야 합니다.');
      finishActiveTime(s);s.phase='ENDED';s.endedAt=at;state.activeSessionId=null;break;
    }
    case 'ATTEMPT_PREPARED':{
      const s=activeSession();insist(s.phase==='ACTIVE','SESSION_NOT_ACTIVE','진행 중인 차시가 필요합니다.');
      insist(!state.activeAttemptId||last().timer.phase==='RESOLVED','ATTEMPT_ACTIVE','기존 문제를 먼저 처리해야 합니다.');
      insist(!sideBusy(),'SIDE_MISSION_ACTIVE','진행 중인 가로채기/회수미션을 먼저 종료해야 합니다.');
      requireId(payload.attemptId,'문제 시도');requireId(payload.questionId,'문항');
      insist(!state.attempts[payload.attemptId],'ATTEMPT_EXISTS','같은 문제 시도 ID가 존재합니다.');
      insist(state.teams.some(t=>t.id===payload.teamId),'INVALID_TEAM','존재하지 않는 모둠입니다.');
      const sec=state.settings.timerSeconds;
      const assignment=assignRepresentative(state,{teamId:payload.teamId,attemptId:payload.attemptId,eventId,at,teamSelection:payload.teamSelection??'MANUAL'});
      state.attempts[payload.attemptId]={id:payload.attemptId,questionId:payload.questionId,questionRevision:payload.questionRevision??null,teamId:payload.teamId,
        teamAssignment:assignment,sessionId:s.id,preparedAt:at,resolvedAt:null,
        timer:{phase:'PREPARED',remainingMs:sec*1000,runningSince:null,usedTimeSand:false}};
      state.activeAttemptId=payload.attemptId;break;
    }
    case 'QUESTION_DRAWN':{
      // PHASE 2-2. A selected question and its PREPARED attempt are committed in
      // the SAME event/IndexedDB transaction. No grading or reward takes place.
      const s=activeSession();insist(s.phase==='ACTIVE','SESSION_NOT_ACTIVE','진행 중인 차시가 필요합니다.');
      insist(!state.activeAttemptId||last().timer.phase==='RESOLVED','ATTEMPT_ACTIVE','기존 문제를 먼저 처리해야 합니다.');
      insist(!sideBusy(),'SIDE_MISSION_ACTIVE','진행 중인 가로채기/회수미션을 먼저 종료해야 합니다.');
      validateDrawCommand(state,payload,at);
      const assignment=assignRepresentative(state,{teamId:payload.teamId,attemptId:payload.attemptId,eventId,at,teamSelection:payload.teamSelection??'MANUAL'});
      const sec=state.settings.timerSeconds;
      const {attemptId,questionId,regionId,teamId,mode,questionSnapshot}=payload;
      const row={attemptId,questionId,regionId,teamId,mode,issuedAt:at,questionRevision:questionSnapshot.questionRevision,
        teamRosterVersion:assignment.rosterVersion,representativeMemberId:assignment.representativeMemberId};
      state.questions.draws??=[];
      state.questions.draws.push(row);
      if(mode==='NEW')state.questions.issuedIds.push(questionId);
      if(state.world.currentRegionId===null)state.world.currentRegionId=regionId;
      state.attempts[attemptId]={id:attemptId,questionId,questionRevision:questionSnapshot.questionRevision,
        teamId,regionId,drawMode:mode,questionSnapshot:clone(questionSnapshot),sessionId:s.id,
        teamAssignment:assignment,
        preparedAt:at,resolvedAt:null,
        timer:{phase:'PREPARED',remainingMs:sec*1000,runningSince:null,usedTimeSand:false}};
      state.activeAttemptId=attemptId;break;
    }
    case 'TIMER_STARTED':{
      const a=last();insist(a.timer.phase==='PREPARED','TIMER_NOT_PREPARED','준비된 문제가 아닙니다.');
      insist(activeSession().phase==='ACTIVE','SESSION_NOT_ACTIVE','차시를 먼저 재개해야 합니다.');
      a.timer.phase=state.settings.timerSeconds===0?'PAUSED':'RUNNING';
      a.timer.runningSince=a.timer.phase==='RUNNING'?at:null;a.timer.startedAt=at;break;
    }
    case 'TIMER_PAUSED':{
      const a=last();insist(a.timer.phase==='RUNNING','TIMER_NOT_RUNNING','타이머가 실행 중이 아닙니다.');ensureRunningNotExpired(a);
      a.timer.remainingMs=timerRemainingMs(a,at);a.timer.phase='PAUSED';a.timer.runningSince=null;break;
    }
    case 'TIMER_RESUMED':{
      const a=last();insist(a.timer.phase==='PAUSED','TIMER_NOT_PAUSED','타이머가 정지 상태가 아닙니다.');
      insist(activeSession().phase==='ACTIVE','SESSION_NOT_ACTIVE','차시를 먼저 재개해야 합니다.');
      insist(!a.answer,'ANSWER_ALREADY_SUBMITTED','제출한 답변의 타이머는 다시 시작할 수 없습니다.');
      insist(a.timer.remainingMs>0,'NO_REMAINING_TIME','잔여 시간이 없습니다.');
      a.timer.phase='RUNNING';a.timer.runningSince=at;break;
    }
    case 'TIMER_EXPIRED':{
      const a=last();insist(a.timer.phase==='RUNNING'&&timerRemainingMs(a,at)===0,'TIMER_NOT_EXPIRED','아직 만료되지 않은 타이머입니다.');
      a.timer.remainingMs=0;a.timer.runningSince=null;a.timer.phase='EXPIRED_AWAITING_TEACHER';break;
    }
    case 'TIME_SAND_USED':{
      const a=last();insist(!a.answer,'ANSWER_ALREADY_SUBMITTED','제출한 답변에 시간 연장을 사용할 수 없습니다.');
      insist(['RUNNING','PAUSED'].includes(a.timer.phase),'MAGIC_BAD_PHASE','진행/일시정지 문제에서만 사용할 수 있습니다.');
      ensureRunningNotExpired(a);
      insist(state.settings.timerSeconds!==0,'TIMER_DISABLED','타이머 끔 설정에서는 시간을 연장할 수 없습니다.');
      insist(state.magic.unlocked.includes('TIME_SAND'),'MAGIC_LOCKED','시간의 모래 해금 조건이 충족되지 않았습니다.');
      insist(!a.timer.usedTimeSand,'MAGIC_DUPLICATE','한 문제에 시간의 모래를 중복 사용할 수 없습니다.');
      insist(!state.rewards.settlementRequired,'SETTLEMENT_REQUIRED','별빛 정산이 필요하여 추가 소비를 차단했습니다.');
      insist(state.rewards.starlight>=TIME_SAND_COST,'INSUFFICIENT_STARS','별빛이 부족합니다.');
      const left=timerRemainingMs(a,at);
      a.timer.remainingMs=left+TIME_SAND_EXTENSION_MS;
      if(a.timer.phase==='RUNNING')a.timer.runningSince=at;
      a.timer.usedTimeSand=true;
      state.rewards.starlight-=TIME_SAND_COST;
      state.rewards.ledger.push({eventId,type:'TIME_SAND_SPEND',amount:-TIME_SAND_COST,attemptId:a.id});
      state.magic.used.push({eventId,magicId:'TIME_SAND',attemptId:a.id,at,cost:TIME_SAND_COST});break;
    }
    case 'ANSWER_SUBMITTED':{
      const a=last();insist(a.questionSnapshot,'QUESTION_SNAPSHOT_MISSING','실제 원본으로 출제된 문항이 필요합니다.');
      insist(payload.attemptId===a.id,'ATTEMPT_MISMATCH','진행 중인 문항 시도 ID와 다릅니다.');
      insist(!a.answer&&!a.judgement,'ANSWER_ALREADY_SUBMITTED','이미 접수된 답안은 변경할 수 없습니다.');
      insist(a.timer.startedAt!==undefined,'QUESTION_NOT_STARTED','교사가 먼저 문제를 시작해야 합니다.');
      insist(activeSession().phase==='ACTIVE','SESSION_NOT_ACTIVE','차시가 진행 중이어야 답변을 접수할 수 있습니다.');
      insist(['RUNNING','PAUSED','EXPIRED_AWAITING_TEACHER'].includes(a.timer.phase),
        'ANSWER_BAD_PHASE','해당 타이머 단계에서 답변을 접수할 수 없습니다.');
      const afterExpiry=a.timer.phase==='EXPIRED_AWAITING_TEACHER';
      if(a.timer.phase==='RUNNING')ensureRunningNotExpired(a);
      if(a.timer.phase==='PAUSED'||afterExpiry){
        insist(payload.teacherConfirmed===true,'TEACHER_REQUIRED','일시정지·시간 만료 이후 답변 접수에는 교사 확인이 필요합니다.');
      }
      if(afterExpiry)insist(typeof payload.lateReason==='string'&&payload.lateReason.trim().length>0&&payload.lateReason.length<=1000,
        'LATE_REASON_REQUIRED','시간 만료 후 답변을 받는 사유를 기록해야 합니다.');
      const assessed=assessAnswer(a,payload.response);
      const submittedByMemberId=validateSolverIdentity(a,payload.submittedByMemberId);
      a.answer={response:assessed.response,suggestion:assessed.suggestion,submittedAt:at,
        receivedEventId:eventId,submittedByMemberId,afterExpiry,lateReason:afterExpiry?payload.lateReason.trim():null};
      if(a.timer.phase==='RUNNING'){
        a.timer.remainingMs=timerRemainingMs(a,at);
        a.timer.runningSince=null;
        a.timer.phase='PAUSED';
      }
      break;
    }
    case 'ANSWER_JUDGED':{
      const a=last();insist(payload.attemptId===a.id,'ATTEMPT_MISMATCH','활성 문항 시도 ID와 다릅니다.');
      const evaluated=validateTeacherJudgement(a,payload,at);
      // A confirmed teacher judgement and the review/recovery classification are
      // ONE reducer event. Rewards (including first-answer stars) are PHASE 2-6.
      const questionId=a.questionId,ids=state.questions;
      if(evaluated.decision==='CORRECT'){
        insist(!ids.recoveryOnlyIds.includes(questionId),'RECOVERY_REQUIRED','미회수 오답을 정답으로 조용히 덮어쓸 수 없습니다.');
        if(!ids.reviewEligibleIds.includes(questionId))ids.reviewEligibleIds.push(questionId);
      }else{
        ids.reviewEligibleIds=ids.reviewEligibleIds.filter(id=>id!==questionId);
        if(!ids.recoveryOnlyIds.includes(questionId))ids.recoveryOnlyIds.push(questionId);
        const pending=state.recovery.pending;
        insist(!pending.some(x=>x.questionId===questionId),
          'RECOVERY_DUPLICATE','이미 미회수 목록에 있는 문제입니다.');
        pending.push({id:a.id,sourceAttemptId:a.id,questionId,originTeamId:a.teamId,
          originRosterVersion:a.teamAssignment?.rosterVersion??null,
          originRepresentativeMemberId:a.teamAssignment?.representativeMemberId??null,
          originRegionId:a.regionId,status:'PENDING',createdAt:at,sourceEventId:eventId});
      }
      const solverMemberId=validateSolverIdentity(a,payload.solverMemberId??a.answer?.submittedByMemberId??null);
      a.judgement={decision:evaluated.decision,teacherConfirmed:true,teacherReason:evaluated.teacherReason,
        missingResponse:evaluated.missingResponse,solverTeamId:a.teamId,solverMemberId,judgedAt:at,eventId};
      if(a.timer.phase==='RUNNING'){a.timer.remainingMs=timerRemainingMs(a,at);a.timer.runningSince=null;}
      a.timer.phase='RESOLVED';a.resolvedAt=at;break;
    }
    case 'INTERCEPTION_OPENED':
    case 'INTERCEPTION_SKIPPED':
    case 'INTERCEPTION_TIMER_STARTED':
    case 'INTERCEPTION_TIMER_PAUSED':
    case 'INTERCEPTION_TIMER_RESUMED':
    case 'INTERCEPTION_TIMER_EXPIRED':
    case 'INTERCEPTION_ANSWER_SUBMITTED':
    case 'INTERCEPTION_JUDGED':
    case 'INTERCEPTION_FORFEITED':{
      processInterception(state,type,payload,{eventId,at});break;
    }
    case 'RECOVERY_DEFERRED':
    case 'RECOVERY_RELEASED':
    case 'RECOVERY_ORIGIN_FORFEITED':
    case 'RECOVERY_CALLED':
    case 'RECOVERY_TIMER_STARTED':
    case 'RECOVERY_TIMER_PAUSED':
    case 'RECOVERY_TIMER_RESUMED':
    case 'RECOVERY_TIMER_EXPIRED':
    case 'RECOVERY_ANSWER_SUBMITTED':
    case 'RECOVERY_JUDGED':
    case 'RECOVERY_FORFEITED':{
      processRecovery(state,type,payload,{eventId,at});break;
    }
    case 'CHECKPOINT_REPAIRED':{
      insist(payload.teacherConfirmed===true&&['latest','previous'].includes(payload.source),'TEACHER_REQUIRED','체크포인트 복구에는 교사 명시 확인이 필요합니다.');
      // A repaired checkpoint MUST be safety-paused in this SAME transaction.
      // Do not count unknown wall-clock time while the browser was closed.
      const attempt=state.activeAttemptId?last():null;
      if(attempt?.timer.phase==='RUNNING'){
        attempt.timer.phase='PAUSED';attempt.timer.runningSince=null;
      }
      for(const item of [activeInterception(state),activeRecovery(state)?.runs?.find(x=>x.id===activeRecovery(state)?.activeRunId)]){
        if(item?.timer.phase==='RUNNING'){item.timer.phase='PAUSED';item.timer.runningSince=null;}
      }
      const lesson=state.activeSessionId?activeSession():null;
      if(lesson?.phase==='ACTIVE'){lesson.phase='PAUSED';lesson.activeSince=null;}
      break;
    }
    case 'RECOVER_INTERRUPTED':{
      const a=state.activeAttemptId?last():null;
      const s=state.activeSessionId?activeSession():null;
      const sideRunning=[activeInterception(state),activeRecovery(state)?.runs?.find(x=>x.id===activeRecovery(state)?.activeRunId)].some(x=>x?.timer.phase==='RUNNING');
      insist((a?.timer.phase==='RUNNING')||(s?.phase==='ACTIVE')||sideRunning,'RECOVERY_NOT_NEEDED','복원으로 정지시킬 실행 상태가 없습니다.');
      // Intentional: pause at the last persisted remaining time, never run/expire in the closed interval.
      if(a?.timer.phase==='RUNNING'){a.timer.phase='PAUSED';a.timer.runningSince=null;}
      pauseSideMissions();
      if(s?.phase==='ACTIVE'){
        // Active time between last persisted event and unexpected shutdown is unknown; do not invent it.
        s.activeSince=null;s.phase='PAUSED';
      }
      break;
    }
    case 'ATTEMPT_RESOLVED':{
      // PHASE 1 timer harness ONLY. Academic judgement and rewards are PHASE 2, never auto-credit.
      const a=last();insist(a.timer.phase!=='RESOLVED','ALREADY_RESOLVED','이미 확정한 문제입니다.');
      insist(payload.teacherConfirmed===true,'TEACHER_REQUIRED','문제 종료에는 교사 확인이 필요합니다.');
      if(a.questionSnapshot){
        insist(!a.answer,'ANSWER_ALREADY_SUBMITTED','제출한 답변을 판정 없이 종료할 수 없습니다.');
        insist(typeof payload.voidReason==='string'&&payload.voidReason.trim().length>0,
          'JUDGEMENT_REQUIRED','출제된 문제를 판정 없이 종료할 때는 교사의 무효 처리 사유가 필요합니다.');
        a.voided={reason:payload.voidReason.trim(),eventId,at};
      }
      if(a.timer.phase==='RUNNING'){a.timer.remainingMs=timerRemainingMs(a,at);a.timer.runningSince=null;}
      a.timer.phase='RESOLVED';a.resolvedAt=at;break;
    }
    default:throw new Error(`UNIMPLEMENTED_COMMAND: ${type}`);
  }
  const seq=current.meta.revision+1;
  const event={seq,eventId,type,at,payload};
  state.meta.revision=seq;state.meta.updatedAt=at;
  state.eventLog.push({seq,eventId,type,at,payload:clone(payload)});
  if(INTERCEPTION_COMMANDS.includes(type)||RECOVERY_COMMANDS.includes(type)||ROSTER_COMMANDS.includes(type)||type==='TIME_SAND_USED'||type==='RECOVER_INTERRUPTED'||type==='SESSION_ENDED'||type==='CHECKPOINT_REPAIRED'||type==='ANSWER_JUDGED'||type==='ATTEMPT_RESOLVED'||(type==='ANSWER_SUBMITTED'&&payload.lateReason)) state.audit.push({seq,eventId,type,at});
  checkState(state);
  return {duplicate:false,state,event};
}
