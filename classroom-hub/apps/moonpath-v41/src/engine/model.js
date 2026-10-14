/** The rules below are v4.1.1 design decisions; this file contains only PHASE 1 groundwork. */
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
    questions:{packId,packVersion,issuedIds:[],recoveryOnlyIds:[],reviewEligibleIds:[]},
    attempts:{},activeAttemptId:null,
    teams:Array.from({length:teamCount},(_,i)=>({id:`TEAM_${String(i+1).padStart(2,'0')}`,name:`${i+1}모둠`,rosterVersion:1,members:[],representativeCursor:0,contribution:0})),
    recovery:{pending:[],resolved:[]},
    rewards:{keys:0,starlight:0,ledger:[],settlementRequired:false},
    magic:{used:[],unlocked:[]},clues:{collected:[],combinations:[]},
    eventLog:[],audit:[]
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
  // Explicit public allowlist. Never serialize the full state into a student message.
  return {
    version:ENGINE_VERSION,revision:s.meta.revision,slot:s.meta.slot,expeditionId:s.meta.expeditionId,
    screen:s.screen,regionId:s.world.currentRegionId,
    teamNames:s.teams.map(({id,name})=>({id,name})),
    resources:{keys:s.rewards.keys,starlight:s.rewards.starlight},
    attempt:attempt?{id:attempt.id,phase:attempt.timer.phase,remainingMs:timerRemainingMs(attempt,at)}:null,
    lesson:s.activeSessionId?{active:true}:null,
  };
}
