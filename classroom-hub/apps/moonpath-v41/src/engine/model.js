/** The rules below are v4.1.1 design decisions; this file contains only PHASE 1 groundwork. */
import {checkRewardHistory} from '../rewards/ledger.js';
import {checkCorrectionHistory,effectiveOriginDecision,originIncorrectAtEvent} from '../corrections/reconcile.js';
export const ENGINE_VERSION = '4.1.1';
export const SCHEMA_VERSION = 1;
export const DB_NAME = 'moonpath-v411-engine-db'; // Deliberately never touch legacy localStorage keys.
export const MIN_SLOT = 1;
export const MAX_SLOT = 3;
export const TIMER_PHASES = Object.freeze(['PREPARED','RUNNING','PAUSED','EXPIRED_AWAITING_TEACHER','RESOLVED']);
export const TIMER_CHOICES_SEC = Object.freeze([0,45,60,90,120]);
export const DEFAULT_TIMER_SEC = 60;
export const TIME_SAND_COST = 4;
export const TIME_SAND_EXTENSION_MS = 20_000;

export class EngineError extends Error {
  constructor(code,message){super(message);this.name='EngineError';this.code=code;}
}
export function insist(test,code,message){if(!test)throw new EngineError(code,message);}
export function clone(value){return structuredClone(value);}
/** Deterministic object representation used ONLY for duplicate-command/evidence comparison. */
export function canonicalJson(value){
  return JSON.stringify(value,(k,v)=>{
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      return Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]]));
    }
    return v;
  });
}
export function checkSlot(slot){insist(Number.isInteger(slot)&&slot>=MIN_SLOT&&slot<=MAX_SLOT,'SLOT_INVALID','슬롯은 I~III(1~3) 중 하나여야 합니다.');return slot;}
export function requireId(str,label){insist(typeof str==='string'&&str.length>0&&str.length<=128,'INVALID_ID',`${label} ID가 올바르지 않습니다.`);return str;}
export function validTimestamp(at){insist(Number.isSafeInteger(at)&&at>=0,'INVALID_TIME','이벤트 시각이 올바르지 않습니다.');return at;}
export function newExpedition({slot,expeditionId,createdAt,teamCount=4,timerSeconds=60,packId='KR-HS-IS2-U01',packVersion='1.0.0',world}){
  checkSlot(slot);requireId(expeditionId,'원정');validTimestamp(createdAt);
  insist(Number.isInteger(teamCount)&&teamCount>=2&&teamCount<=8,'INVALID_TEAM_COUNT','모둠은 2~8개여야 합니다.');
  insist(TIMER_CHOICES_SEC.includes(timerSeconds),'INVALID_TIMER','타이머 값은 끔/45/60/90/120초 중 하나여야 합니다.');
  insist(world?.themes?.length===6&&world.themes.every(t=>t.regions?.length===5),'INVALID_WORLD','공식 6테마 30지역 기준이 필요합니다.');
  return {
    meta:{schemaVersion:SCHEMA_VERSION,engineVersion:ENGINE_VERSION,expeditionId,slot,revision:0,createdAt,updatedAt:createdAt,packId,packVersion},
    screen:'HOME',
    settings:{teamCount,timerSeconds,interception:true,lessonMinutes:45},
    world:{currentRegionId:null,mainRouteChoice:{},additionalExplorationReturn:null,regions:Object.fromEntries(world.themes.flatMap(t=>t.regions).map(r=>[r.id,{status:'LOCKED',completedAt:null}])),themes:world.themes.map(t=>({id:t.id,name:t.name,regionIds:t.regions.map(r=>r.id)}))},
    sessions:[],
    activeSessionId:null,
    questions:{packId,packVersion,issuedIds:[],recoveryOnlyIds:[],reviewEligibleIds:[],draws:[]},
    attempts:{},activeAttemptId:null,
    teams:Array.from({length:teamCount},(_,i)=>({id:`TEAM_${String(i+1).padStart(2,'0')}`,name:`${i+1}모둠`,rosterVersion:1,members:[],representativeCursor:0,contribution:0})),
    participation:{memberIds:[],rosterChanges:[],assignments:[],nextTeamIndex:0},
    recovery:{pending:[],resolved:[],activeId:null},
    interception:{records:[],activeId:null,lastTeamId:null},
    rewards:{keys:0,starlight:0,ledger:[],settlementRequired:false,settlementDue:0},
    magic:{used:[],unlocked:['MOON_WHISPER','STAR_COMPASS']},clues:{collected:[],combinations:[]},
    eventLog:[],audit:[],corrections:{records:[]}
  };
}
export function checkState(s){
  insist(s?.meta?.schemaVersion===SCHEMA_VERSION,'SCHEMA_MISMATCH','저장 파일 스키마가 호환되지 않습니다.');
  insist(s.meta.engineVersion===ENGINE_VERSION,'ENGINE_MISMATCH','엔진 버전이 다릅니다.');
  checkSlot(s.meta.slot);requireId(s.meta.expeditionId,'원정');
  insist(Number.isSafeInteger(s.meta.revision)&&s.meta.revision>=0,'INVALID_REVISION','revision이 올바르지 않습니다.');
  insist(Array.isArray(s.eventLog)&&s.eventLog.length===s.meta.revision,'EVENT_COUNT','이벤트 개수와 revision이 다릅니다.');
  validTimestamp(s.meta.createdAt);validTimestamp(s.meta.updatedAt);
  insist(s.meta.updatedAt>=s.meta.createdAt,'INVALID_TIME','최종 저장 시각이 생성 시각보다 빠릅니다.');
  if(s.eventLog.length)insist(s.meta.updatedAt===s.eventLog.at(-1).at,'EVENT_TIME_MISMATCH','최종 수정 시각과 이벤트 시각이 다릅니다.');
  insist(Array.isArray(s.sessions)&&Array.isArray(s.teams)&&s.teams.length===s.settings.teamCount,'INVALID_STATE','필수 상태 데이터가 잘못되었습니다.');
  insist(Array.isArray(s.world?.themes)&&s.world.themes.length===6&&Object.keys(s.world.regions||{}).length===30,'INVALID_WORLD','30지역 구조가 일치하지 않습니다.');
  checkParticipationHistory(s);
  checkSideMissionHistory(s);
  // PHASE 2-2: a saved draw ledger cannot claim extra unseen questions or
  // hide a first issuance. Legacy PHASE 1 timer-only attempts have no draw row.
  const q=s.questions;
  insist(q?.packId===s.meta.packId&&q?.packVersion===s.meta.packVersion,'PACK_MISMATCH','문항팩과 원정 정보가 다릅니다.');
  insist(Array.isArray(q.issuedIds)&&Array.isArray(q.recoveryOnlyIds)&&Array.isArray(q.reviewEligibleIds),
    'DRAW_HISTORY_INVALID','문항 이력 필수 배열이 없습니다.');
  const unique=a=>new Set(a).size===a.length&&a.every(id=>typeof id==='string'&&id.length>0);
  insist(unique(q.issuedIds)&&unique(q.recoveryOnlyIds)&&unique(q.reviewEligibleIds),
    'DRAW_HISTORY_INVALID','문항 ID가 중복되거나 올바르지 않습니다.');
  insist(q.issuedIds.length<=60,'DRAW_HISTORY_INVALID','원본 전체 문항 수를 넘었습니다.');
  const issuedSet=new Set(q.issuedIds),recoverSet=new Set(q.recoveryOnlyIds);
  insist(q.recoveryOnlyIds.every(id=>issuedSet.has(id)) && q.reviewEligibleIds.every(id=>issuedSet.has(id)&&!recoverSet.has(id)),
    'DRAW_HISTORY_INVALID','미회수·복습 목록이 출제 이력과 충돌합니다.');
  const draws=q.draws??[];
  insist(Array.isArray(draws),'DRAW_HISTORY_INVALID','출제 상세 이력이 배열이 아닙니다.');
  const issuedFromDraws=[],seenDrawAttempts=new Set(),seenNew=new Set();
  for(const row of draws){
    insist(row&&typeof row.attemptId==='string'&&typeof row.questionId==='string'&&
      ['NEW','REVIEW'].includes(row.mode)&&typeof row.regionId==='string'&&typeof row.teamId==='string'&&
      !seenDrawAttempts.has(row.attemptId),
      'DRAW_HISTORY_INVALID','출제 이력의 ID 또는 모드가 올바르지 않습니다.');
    seenDrawAttempts.add(row.attemptId);
    const attempt=s.attempts[row.attemptId];
    insist(attempt&&attempt.questionId===row.questionId&&attempt.drawMode===row.mode&&
      attempt.questionSnapshot?.questionId===row.questionId,
      'DRAW_HISTORY_INVALID','출제 이력과 문제 시도 스냅샷이 일치하지 않습니다.');
    if(attempt.teamAssignment){
      insist(row.teamRosterVersion===attempt.teamAssignment.rosterVersion&&
        row.representativeMemberId===attempt.teamAssignment.representativeMemberId,
        'DRAW_HISTORY_INVALID','출제 장부와 명단 버전·대표 학생 스냅샷이 다릅니다.');
    }
    if(row.mode==='NEW'){
      insist(!seenNew.has(row.questionId),'DRAW_HISTORY_INVALID','신규 발행 ID가 중복되었습니다.');
      seenNew.add(row.questionId);issuedFromDraws.push(row.questionId);
    }else{
      insist(seenNew.has(row.questionId),'DRAW_HISTORY_INVALID','최초 출제 전에 복습 로그가 기록되었습니다.');
    }
  }
  insist(q.issuedIds.length===issuedFromDraws.length && q.issuedIds.every((id,i)=>id===issuedFromDraws[i]),
    'DRAW_HISTORY_INVALID','발행 ID 목록과 트랜잭션 출제 이력이 일치하지 않습니다.');
  // PHASE 2-3: all academic evidence is attached to the original saved attempt.
  // Do not derive a judgement from the current display or from a reloaded pack.
  for(const attempt of Object.values(s.attempts)){
    if(!attempt.questionSnapshot)continue; // PHASE 1 timer-only fixtures
    if(attempt.answer){
      insist(attempt.answer&&typeof attempt.answer==='object'&&
        attempt.answer.suggestion?.questionId===attempt.questionId&&
        ['correct','incorrect','needs_teacher'].includes(attempt.answer.suggestion?.status)&&
        typeof attempt.answer.receivedEventId==='string'&&
        s.eventLog.some(e=>e.eventId===attempt.answer.receivedEventId&&e.type==='ANSWER_SUBMITTED'),
        'ANSWER_HISTORY_INVALID','접수 답변과 시도·이벤트 기록이 일치하지 않습니다.');
      validTimestamp(attempt.answer.submittedAt);
      insist(attempt.timer.phase!=='RUNNING','ANSWER_HISTORY_INVALID','답변 제출 뒤 타이머가 실행 중일 수 없습니다.');
    }
    if(attempt.judgement){
      insist(['CORRECT','INCORRECT'].includes(attempt.judgement.decision)&&
        attempt.judgement.teacherConfirmed===true&&attempt.timer.phase==='RESOLVED'&&
        attempt.resolvedAt===attempt.judgement.judgedAt&&
        s.eventLog.some(e=>e.eventId===attempt.judgement.eventId&&e.type==='ANSWER_JUDGED'),
        'JUDGEMENT_HISTORY_INVALID','교사 판정과 문제/이벤트 기록이 일치하지 않습니다.');
      if(!attempt.answer)insist(attempt.judgement.missingResponse===true,'JUDGEMENT_HISTORY_INVALID','미응답 판정 사유가 누락되었습니다.');
    }
    if(attempt.voided){
      insist(!attempt.answer&&!attempt.judgement&&attempt.timer.phase==='RESOLVED'&&
        typeof attempt.voided.reason==='string'&&attempt.voided.reason.length>0,
        'ATTEMPT_VOID_INVALID','교사 무효 처리의 사유 또는 시도 상태가 올바르지 않습니다.');
    }
  }
  insist(Number.isInteger(s.rewards?.starlight)&&s.rewards.starlight>=0,'INVALID_REWARDS','음수 별빛은 허용하지 않습니다.');
  insist(Number.isInteger(s.rewards.keys)&&s.rewards.keys>=0,'INVALID_REWARDS','음수 열쇠는 허용하지 않습니다.');
  const seen=new Set();let previousAt=-1;
  for(let i=0;i<s.eventLog.length;i++){
    const item=s.eventLog[i];
    insist(item.seq===i+1,'BROKEN_SEQUENCE','이벤트 순번이 연속하지 않습니다.');
    requireId(item.eventId,'이벤트');validTimestamp(item.at);
    insist(!seen.has(item.eventId),'DUPLICATE_EVENT','이벤트 ID가 중복되었습니다.');
    insist(item.at>=previousAt,'EVENT_CLOCK_BACKWARD','저장된 이벤트 시각이 역전되었습니다.');
    seen.add(item.eventId);previousAt=item.at;
  }
  if(s.activeAttemptId){
    const a=s.attempts[s.activeAttemptId];insist(a&&TIMER_PHASES.includes(a.timer.phase),'INVALID_ATTEMPT','활성 문제와 타이머 상태가 맞지 않습니다.');
    insist(a.timer.remainingMs>=0&&Number.isFinite(a.timer.remainingMs),'INVALID_TIMER','음수 또는 유효하지 않은 잔여 시간입니다.');
  }
  checkRewardHistory(s);
  checkCorrectionHistory(s);
  return s;
}
/**
 * Cross-check mutable rosters against immutable per-attempt snapshots.
 * Optional participation object keeps old schema-v1 saves readable.
 */
export function checkParticipationHistory(s){
  const validStatuses=new Set(['PRESENT','ABSENT','LATE','LEFT_EARLY','INACTIVE']);
  const teamIds=new Set(),memberIds=new Set();
  for(const team of s.teams){
    requireId(team.id,'모둠');insist(!teamIds.has(team.id),'TEAM_DUPLICATE','모둠 고유 ID가 중복되었습니다.');teamIds.add(team.id);
    insist(typeof team.name==='string'&&team.name.trim().length>0&&team.name.length<=80,
      'TEAM_NAME_INVALID','모둠 이름 형식이 잘못되었습니다.');
    insist(Number.isSafeInteger(team.rosterVersion)&&team.rosterVersion>=1,
      'ROSTER_VERSION_INVALID','명단 버전이 올바르지 않습니다.');
    insist(Array.isArray(team.members)&&team.members.length<=80,'ROSTER_INVALID','모둠 명단이 유효하지 않습니다.');
    insist(Number.isSafeInteger(team.representativeCursor)&&team.representativeCursor>=0&&
      (team.members.length?team.representativeCursor<team.members.length:team.representativeCursor===0),
      'REPRESENTATIVE_CURSOR_INVALID','대표 순환 위치가 유효하지 않습니다.');
    for(const m of team.members){
      requireId(m.id,'학생');validTimestamp(m.joinedAt);
      insist(!memberIds.has(m.id),'ROSTER_MEMBER_DUPLICATE','학생 고유 ID가 여러 모둠에 동시에 있습니다.');
      memberIds.add(m.id);
      insist(typeof m.name==='string'&&m.name.trim().length>0&&m.name.length<=80 && validStatuses.has(m.status),
        'ROSTER_INVALID','학생 이름 또는 출결 상태가 유효하지 않습니다.');
    }
  }
  const p=s.participation;
  if(!p)return s;
  insist(Array.isArray(p.memberIds)&&Array.isArray(p.rosterChanges)&&Array.isArray(p.assignments)&&
    Number.isSafeInteger(p.nextTeamIndex)&&p.nextTeamIndex>=0&&p.nextTeamIndex<s.teams.length,
    'PARTICIPATION_INVALID','참여 장부와 모둠 순환 위치가 유효하지 않습니다.');
  const registry=new Set(p.memberIds);
  insist(registry.size===p.memberIds.length&&p.memberIds.every(id=>typeof id==='string'&&id.length>0)&&
    [...memberIds].every(id=>registry.has(id)), 'ROSTER_HISTORY_INVALID','학생 ID 등록부가 누락되거나 중복되었습니다.');
  const events=new Map(s.eventLog.map(e=>[e.eventId,e]));
  const lastByTeam=new Map(),lastSnapshots=new Map();
  for(const record of p.rosterChanges){
    const ev=events.get(record.eventId);
    insist(ev&&ev.type===record.type&&ev.at===record.at && Array.isArray(record.before)&&
      Array.isArray(record.after)&&record.before.length===record.after.length&&[1,2].includes(record.before.length),
      'ROSTER_HISTORY_INVALID','명단 변경 기록과 이벤트 이력이 일치하지 않습니다.');
    for(let i=0;i<record.before.length;i++){
      const before=record.before[i],after=record.after[i];
      insist(before.teamId===after.teamId&&after.rosterVersion===before.rosterVersion+1,
        'ROSTER_HISTORY_INVALID','명단 버전 증가가 올바르지 않습니다.');
      if(lastByTeam.has(before.teamId)){
        insist(lastByTeam.get(before.teamId)===before.rosterVersion &&
          canonicalJson(lastSnapshots.get(before.teamId).members)===canonicalJson(before.members) &&
          lastSnapshots.get(before.teamId).teamName===before.teamName,
          'ROSTER_HISTORY_INVALID','명단 변경 이력의 버전·구성이 이어지지 않습니다.');
      }
      lastByTeam.set(after.teamId,after.rosterVersion);
      lastSnapshots.set(after.teamId,after);
    }
  }
  for(const [id,v] of lastByTeam){
    const current=s.teams.find(t=>t.id===id),saved=lastSnapshots.get(id);
    insist(current?.rosterVersion===v && current.name===saved.teamName &&
      canonicalJson(current.members)===canonicalJson(saved.members),
      'ROSTER_HISTORY_INVALID','현재 명단의 내용 또는 버전이 마지막 감사 스냅샷과 다릅니다.');
  }
  const assigned=new Set();
  for(const row of p.assignments){
    const attempt=s.attempts[row.attemptId],ev=events.get(row.eventId),a=row.assignment;
    insist(attempt&&ev&&ev.at===row.at&&['QUESTION_DRAWN','ATTEMPT_PREPARED'].includes(ev.type)&&
      attempt.teamId===a?.teamId&&attempt.teamAssignment&&canonicalJson(attempt.teamAssignment)===canonicalJson(a)&&
      !assigned.has(row.attemptId),'REPRESENTATIVE_HISTORY_INVALID','대표 배정 기록과 출제 시도가 일치하지 않습니다.');
    assigned.add(row.attemptId);
    insist(Number.isSafeInteger(a.rosterVersion)&&a.rosterVersion>=1&&Array.isArray(a.members)&&
      ['AUTO','MANUAL'].includes(a.selectionMode)&&typeof a.teamName==='string',
      'REPRESENTATIVE_HISTORY_INVALID','대표 배정 스냅샷이 불완전합니다.');
    const representative=a.members.find(m=>m.id===a.representativeMemberId);
    insist((a.representativeMemberId===null&&a.members.length===0)||
      (representative&&representative.status==='PRESENT'&&representative.name===a.representativeName),
      'REPRESENTATIVE_HISTORY_INVALID','대표는 당시 출석한 학생이어야 합니다.');
  }
  for(const attempt of Object.values(s.attempts)){
    if(attempt.teamAssignment)insist(assigned.has(attempt.id),'REPRESENTATIVE_HISTORY_INVALID','문제별 대표 배정 이력이 누락되었습니다.');
    if(attempt.answer?.submittedByMemberId)insist(attempt.teamAssignment?.members?.some(m=>m.id===attempt.answer.submittedByMemberId&&m.status==='PRESENT'),
      'SOLVER_HISTORY_INVALID','답변 제출자가 출제 당시 출석 명단에 없습니다.');
    if(attempt.judgement?.solverTeamId)insist(attempt.judgement.solverTeamId===attempt.teamId &&
      (attempt.judgement.solverMemberId===null||attempt.teamAssignment?.members?.some(m=>m.id===attempt.judgement.solverMemberId&&m.status==='PRESENT')),
      'SOLVER_HISTORY_INVALID','실제 해결자 기록이 출제 원본과 맞지 않습니다.');
  }
  return s;
}

/** Check origins, recovery identity, timer and resolved history after any event. */
export function checkSideMissionHistory(s){
  const history=new Map(s.eventLog.map(e=>[e.eventId,e]));
  const checkTimer=t=>insist(t&&TIMER_PHASES.includes(t.phase)&&Number.isFinite(t.remainingMs)&&
    t.remainingMs>=0&& (t.phase!=='RUNNING'||Number.isSafeInteger(t.runningSince)),
    'SIDE_MISSION_INVALID','미션 타이머 상태가 올바르지 않습니다.');
  const checkRoster=x=>insist(x?.teamId&&Number.isInteger(x.rosterVersion)&&x.rosterVersion>=1&&
    Array.isArray(x.members)&&x.members.every(m=>typeof m.id==='string'),
    'SIDE_MISSION_INVALID','미션 참여 당시 명단 스냅샷이 없습니다.');
  const checkFlow=(flow,sourceId,sourceQuestion)=>{
    checkTimer(flow.timer);checkRoster(flow.targetRoster);
    insist(flow.questionId===sourceQuestion&&flow.questionSnapshot?.questionId===sourceQuestion&&
      flow.targetRoster.teamId===flow.teamId,
      'SIDE_MISSION_INVALID','미션 원문항/대상 스냅샷이 일치하지 않습니다.');
    if(flow.answer){
      const e=history.get(flow.answer.receivedEventId);
      insist(e&&e.type.endsWith('_ANSWER_SUBMITTED')&&flow.answer.suggestion?.questionId===sourceQuestion&&
        flow.timer.phase!=='RUNNING', 'SIDE_MISSION_INVALID','미션 답안/이벤트 이력이 유효하지 않습니다.');
      if(flow.answer.solverMemberId)insist(flow.targetRoster.members.some(m=>m.id===flow.answer.solverMemberId&&m.status==='PRESENT'),
        'SIDE_MISSION_INVALID','미션 실제 제출 학생이 당시 출석 명단에 없습니다.');
    }
    if(flow.judgement){
      const e=history.get(flow.judgement.eventId);
      insist(e&&e.type.endsWith('_JUDGED')&&flow.judgement.teacherConfirmed===true&&
        ['CORRECT','INCORRECT'].includes(flow.judgement.decision)&&flow.judgement.solverTeamId===flow.teamId&&
        flow.timer.phase==='RESOLVED'&&flow.resolvedAt===flow.judgement.judgedAt,
        'SIDE_MISSION_INVALID','미션 교사 판정/해결 모둠 기록이 유효하지 않습니다.');
      if(flow.judgement.solverMemberId)insist(flow.targetRoster.members.some(m=>m.id===flow.judgement.solverMemberId&&m.status==='PRESENT'),
        'SIDE_MISSION_INVALID','미션 실제 해결 학생이 출제 당시 대상 모둠에 없습니다.');
    }
    if(flow.forfeited)insist(flow.timer.phase==='RESOLVED'&&!flow.judgement&&!flow.answer&&
      history.get(flow.forfeited.eventId)?.type.endsWith('_FORFEITED'),
      'SIDE_MISSION_INVALID','미션 포기 근거가 일치하지 않습니다.');
  };
  const interceptions=s.interception;
  if(interceptions){
    insist(Array.isArray(interceptions.records)&&
      (interceptions.activeId===null||typeof interceptions.activeId==='string'),
      'SIDE_MISSION_INVALID','가로채기 장부가 손상되었습니다.');
    const ids=new Set(),origins=new Set();let live=0,previousTeamId=null;
    for(const x of interceptions.records){
      requireId(x.id,'가로채기');
      const source=s.attempts[x.sourceAttemptId];
      insist(!ids.has(x.id)&&!origins.has(x.sourceAttemptId)&&source?.judgement && originIncorrectAtEvent(s,source.id,x.openedEventId)&&
        source.questionId===x.questionId&&source.teamId===x.originTeamId&&
        x.originRosterVersion===(source.teamAssignment?.rosterVersion??null)&&
        x.originRepresentativeMemberId===(source.teamAssignment?.representativeMemberId??null)&&
        history.get(x.openedEventId)?.type.startsWith('INTERCEPTION_'),
        'SIDE_MISSION_INVALID','원본 없는 가로채기나 중복 기록이 존재합니다.');
      ids.add(x.id);origins.add(x.sourceAttemptId);
      if(x.status==='SKIPPED'){
        insist(x.targetTeamId===null&&typeof x.reason==='string'&&x.reason.length>0,
          'SIDE_MISSION_INVALID','생략 근거가 누락되었습니다.');
        previousTeamId=null;continue;
      }
      insist(x.targetTeamId!==x.originTeamId&&x.teamId===undefined&&
        ['ACTIVE','RESOLVED'].includes(x.status)&&previousTeamId!==x.targetTeamId,
        'SIDE_MISSION_INVALID','가로채기 대상·순환·상태가 잘못되었습니다.');
      const opening=history.get(x.openedEventId);
      insist(opening?.payload?.sourceAttemptId===x.sourceAttemptId&&
        opening?.payload?.interceptionId===x.id&&opening?.payload?.targetTeamId===x.targetTeamId,
        'SIDE_MISSION_INVALID','가로채기 생성 이벤트와 현재 기록이 다릅니다.');
      for(const [evId,expected] of [[x.answer?.receivedEventId,'INTERCEPTION_ANSWER_SUBMITTED'],
        [x.judgement?.eventId,'INTERCEPTION_JUDGED'],[x.forfeited?.eventId,'INTERCEPTION_FORFEITED']]){
        if(evId)insist(history.get(evId)?.type===expected&&history.get(evId).payload?.interceptionId===x.id,
          'SIDE_MISSION_INVALID','가로채기 이벤트의 대상 ID가 불일치합니다.');
      }
      checkTimer(x.timer);checkRoster(x.targetRoster);
      insist(x.questionSnapshot?.questionId===x.questionId&&x.targetRoster.teamId===x.targetTeamId,
        'SIDE_MISSION_INVALID','가로채기 질문과 참여 명단이 일치하지 않습니다.');
      // Side mission stores teamId in targetTeamId to avoid changing origin team attribution.
      checkFlow({...x,teamId:x.targetTeamId},x.sourceAttemptId,x.questionId);
      previousTeamId=x.targetTeamId;
      if(x.status==='ACTIVE'){
        live++;insist(interceptions.activeId===x.id&&x.timer.phase!=='RESOLVED',
          'SIDE_MISSION_INVALID','활성 가로채기 연결 정보가 손상되었습니다.');
      }else insist(x.timer.phase==='RESOLVED'&&(x.judgement||x.forfeited),
        'SIDE_MISSION_INVALID','종료 가로채기 판정이 없습니다.');
    }
    insist(live===(interceptions.activeId?1:0)&&interceptions.lastTeamId===previousTeamId,
      'SIDE_MISSION_INVALID','가로채기 활성/연속 이력이 일치하지 않습니다.');
  }
  const r=s.recovery;
  insist(r&&Array.isArray(r.pending)&&Array.isArray(r.resolved),'RECOVERY_INVALID','회수 장부가 누락되었습니다.');
  if(r.activeId!==undefined)insist(r.activeId===null||typeof r.activeId==='string','RECOVERY_INVALID','회수 활성 ID가 올바르지 않습니다.');
  const used=new Set(),pendingQuestions=new Set(),recoverOnly=new Set(s.questions.recoveryOnlyIds);let active=0;
  for(const row of [...r.pending,...r.resolved]){
    const origin=s.attempts[row.sourceAttemptId];
    insist(typeof row.id==='string'&&row.id===row.sourceAttemptId&&!used.has(row.id)&&
      origin?.judgement?.teacherConfirmed===true&&
      (origin.judgement.decision==='INCORRECT'||row.createdByCorrectionEventId)&&origin.teamId===row.originTeamId&&
      origin.questionId===row.questionId&&origin.regionId===row.originRegionId&&
      row.originRosterVersion===(origin.teamAssignment?.rosterVersion??null)&&
      row.originRepresentativeMemberId===(origin.teamAssignment?.representativeMemberId??null)&&
      history.get(row.sourceEventId)?.type==='ANSWER_JUDGED',
      'RECOVERY_INVALID','회수 원문제/출처 기록이 유효하지 않습니다.');
    used.add(row.id);
    const resolved=row.status==='RESOLVED';
    if(!resolved&&row.status!=='INVALIDATED'){
      insist(!pendingQuestions.has(row.questionId),'RECOVERY_INVALID','같은 문항에 미회수 대기가 중복되었습니다.');
      pendingQuestions.add(row.questionId);
    }
    insist((resolved?r.resolved:r.pending).includes(row),'RECOVERY_INVALID','회수 대기/완료 분류가 일치하지 않습니다.');
    insist(resolved||row.status==='INVALIDATED'?true:recoverOnly.has(row.questionId),
      'RECOVERY_INVALID','회수 완료 여부와 출제 전용 목록이 일치하지 않습니다.');
    if(row.status==='INVALIDATED'){
      insist(effectiveOriginDecision(s,row.sourceAttemptId)==='CORRECT' && !recoverOnly.has(row.questionId)&&
        s.eventLog.some(e=>e.eventId===row.invalidatedByCorrectionId&&e.type==='JUDGEMENT_CORRECTED'),
        'RECOVERY_INVALID','정정 무효화 기록이 올바르지 않습니다.');
    }
    if(row.createdByCorrectionEventId)insist(s.eventLog.some(e=>e.eventId===row.createdByCorrectionEventId&&e.type==='JUDGEMENT_CORRECTED'),
      'RECOVERY_INVALID','정정으로 생성된 회수 기록의 근거가 없습니다.');
    insist((row.runs??[]).every(run=>run.sourceAttemptId===row.sourceAttemptId&&run.questionId===row.questionId),
      'RECOVERY_INVALID','회수 시도와 원문제 연결이 손상되었습니다.');
    const runIds=new Set();
    for(const [i,run] of (row.runs??[]).entries()){
      insist(!runIds.has(run.id)&&history.get(run.calledEventId)?.type==='RECOVERY_CALLED'&&
        (i===0&&!row.originForfeited?run.teamId===row.originTeamId:run.teamId!==row.originTeamId),
        'RECOVERY_INVALID','회수 시도의 순번·원모둠 우선권이 손상되었습니다.');
      const opened=history.get(run.calledEventId);
      insist(opened.payload?.recoveryId===row.id&&opened.payload?.runId===run.id&&
        opened.payload?.teamId===run.teamId&&opened.payload?.regionId===run.regionId,
        'RECOVERY_INVALID','회수 호출 이벤트와 실제 대상이 불일치합니다.');
      for(const [evId,expected] of [[run.answer?.receivedEventId,'RECOVERY_ANSWER_SUBMITTED'],
        [run.judgement?.eventId,'RECOVERY_JUDGED'],[run.forfeited?.eventId,'RECOVERY_FORFEITED']]){
        if(evId)insist(history.get(evId)?.type===expected&&history.get(evId).payload?.recoveryId===row.id&&
          history.get(evId).payload?.runId===run.id,'RECOVERY_INVALID','회수 이벤트의 시도 ID가 불일치합니다.');
      }
      runIds.add(run.id);checkFlow(run,row.sourceAttemptId,row.questionId);
      if(i<(row.runs.length-1))insist(run.timer.phase==='RESOLVED',
        'RECOVERY_INVALID','이전 회수 시도가 종료되지 않았습니다.');
    }
    if(row.status==='ACTIVE'){
      active++;
      insist(r.activeId===row.id&&row.runs?.some(x=>x.id===row.activeRunId&&x.timer.phase!=='RESOLVED'),
        'RECOVERY_INVALID','활성 회수 시도와 장부가 일치하지 않습니다.');
    }else insist(row.activeRunId===undefined||row.activeRunId===null,
      'RECOVERY_INVALID','종료/보류 회수에서 활성 시도 ID가 남아 있습니다.');
    if(resolved){
      const win=row.runs?.at(-1);
      insist(win?.judgement?.decision==='CORRECT'&&row.solverTeamId===win.teamId&&
        row.solverMemberId===win.judgement.solverMemberId&&row.resolvedAt===win.resolvedAt,
        'RECOVERY_INVALID','회수 성공 기록과 실제 해결자/이력이 일치하지 않습니다.');
    }
  }
  insist(active===(r.activeId?1:0),'RECOVERY_INVALID','활성 회수 ID의 수가 잘못되었습니다.');
  return s;
}

export function timerRemainingMs(attempt,at){
  validTimestamp(at);
  if(!attempt)return null;
  const t=attempt.timer;
  if(t.phase!=='RUNNING')return t.remainingMs;
  return Math.max(0,t.remainingMs-Math.max(0,at-t.runningSince));
}
export function publicProjection(s,at){
  checkState(s);
  const attempt=s.activeAttemptId?s.attempts[s.activeAttemptId]:null;
  // PHASE 2-5 public mission progress is a narrow allowlist: NO question ID,
  // student identity, source team, original wrong response or correction history.
  const interception=s.interception?.records?.find(x=>x.id===s.interception.activeId);
  const recovering=s.recovery?.pending?.find(x=>x.id===s.recovery.activeId);
  const recoveryRun=recovering?.runs?.find(x=>x.id===recovering.activeRunId);
  const mission=interception?{kind:'INTERCEPTION',teamId:interception.targetTeamId,
    phase:interception.timer.phase,remainingMs:timerRemainingMs(interception,at)}:
    recoveryRun?{kind:'RECOVERY',teamId:recoveryRun.teamId,
      phase:recoveryRun.timer.phase,remainingMs:timerRemainingMs(recoveryRun,at)}:null;
  // Explicit public allowlist. Never serialize the full state into a student message.
  return {
    version:ENGINE_VERSION,revision:s.meta.revision,slot:s.meta.slot,expeditionId:s.meta.expeditionId,
    screen:s.screen,regionId:s.world.currentRegionId,
    teamNames:s.teams.map(({id,name})=>({id,name})),
    resources:{keys:s.rewards.keys,starlight:s.rewards.starlight},
    attempt:attempt?{id:attempt.id,phase:attempt.timer.phase,remainingMs:timerRemainingMs(attempt,at)}:null,
    lesson:s.activeSessionId?{active:true}:null,
    mission,
  };
}
