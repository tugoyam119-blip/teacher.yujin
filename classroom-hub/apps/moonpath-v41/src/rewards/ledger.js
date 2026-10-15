/** PHASE 2-6: deterministic rewards & magic on the reducer's cloned draft only. */
import {insist,requireId,timerRemainingMs,validTimestamp,TIME_SAND_EXTENSION_MS} from '../engine/model.js';

export const MAGIC_CATALOG=Object.freeze({
  MOON_WHISPER:Object.freeze({tier:1,cost:2,scope:'ATTEMPT',label:'달빛의 속삭임'}),
  STAR_COMPASS:Object.freeze({tier:1,cost:3,scope:'REGION',label:'별의 나침반'}),
  MEMORY_CRYSTAL:Object.freeze({tier:2,cost:3,scope:'RECOVERY',label:'기억의 수정'}),
  TIME_SAND:Object.freeze({tier:3,cost:4,scope:'ATTEMPT',label:'시간의 모래'}),
  HIDDEN_STAR_EYE:Object.freeze({tier:4,cost:5,scope:'REGION',label:'숨겨진 별의 눈'}),
});
const winner=(s,id)=>{const t=s.teams.find(x=>x.id===id);insist(t,'REWARD_TEAM_INVALID','보상 대상 모둠이 없습니다.');return t;};
const hasClaim=(s,claim)=>s.rewards.ledger.some(r=>r.claim===claim);
const earn=(s,{eventId,at,claim,kind,questionId,sourceAttemptId,teamId,recoveryId})=>{
  if(hasClaim(s,claim))return false;
  const t=winner(s,teamId);t.contribution+=1;s.rewards.starlight+=1;
  s.rewards.ledger.push({eventId,at,type:'STAR_EARN',amount:1,claim,kind,questionId,sourceAttemptId,teamId,
    contribution:1,...(recoveryId?{recoveryId}:{})});
  return true;
};
/** Same question, FIRST valid NEW success (ordinary OR interception) earns only once. */
export function creditFirstCorrect(s,{attemptId,eventId,at,kind}){
  const origin=s.attempts[attemptId];
  insist(origin?.questionSnapshot?.questionId===origin.questionId,'REWARD_SOURCE_INVALID','원본 문항 증거가 없습니다.');
  if(origin.drawMode!=='NEW')return false; // a REVIEW re-answer never earns a new star
  let teamId;
  if(kind==='ANSWER'){
    insist(origin.judgement?.decision==='CORRECT'&&origin.judgement.eventId===eventId,'REWARD_SOURCE_INVALID','교사 확정 정답이 없습니다.');
    teamId=origin.teamId;
  }else if(kind==='INTERCEPTION'){
    const i=s.interception.records.find(x=>x.sourceAttemptId===attemptId&&x.judgement?.eventId===eventId);
    insist(i?.judgement?.decision==='CORRECT','REWARD_SOURCE_INVALID','교사 확정 가로채기 정답이 없습니다.');
    teamId=i.targetTeamId;
  }else insist(false,'REWARD_KIND_INVALID','지급 종류가 잘못되었습니다.');
  return earn(s,{eventId,at,claim:`FIRST_CORRECT:${origin.questionId}`,kind,
    questionId:origin.questionId,sourceAttemptId:origin.id,teamId});
}
/** One valid recovery credit per question, no farming through repeated reviews. */
export function creditRecovery(s,{recoveryId,eventId,at}){
  const row=s.recovery.resolved.find(r=>r.id===recoveryId);
  insist(row?.resolutionEventId===eventId&&row.runs?.at(-1)?.judgement?.decision==='CORRECT',
    'REWARD_SOURCE_INVALID','유효하게 완료된 회수 기록이 없습니다.');
  return earn(s,{eventId,at,claim:`RECOVERY_CORRECT:${row.questionId}`,kind:'RECOVERY',
    questionId:row.questionId,sourceAttemptId:row.sourceAttemptId,
    teamId:row.solverTeamId,recoveryId:row.id});
}
/** 2-8 will supply the verified region-completion transaction. No starlight here. */
export function creditFirstRegionKey(s,{regionId,eventId,at}){
  validTimestamp(at);requireId(regionId,'지역');
  const row=s.world.regions[regionId];
  insist(row?.status==='COMPLETED'&&row.completedAt===at,'REGION_NOT_COMPLETED','확정된 지역 완료가 없습니다.');
  const claim=`REGION_KEY:${regionId}`;
  if(hasClaim(s,claim))return false;
  s.rewards.keys+=1;
  s.rewards.ledger.push({eventId,at,type:'KEY_EARN',amount:1,claim,regionId});
  return true;
}
function spend(s,{eventId,at,magicId,scopeId,legacy=false}){
  const cost=MAGIC_CATALOG[magicId].cost;
  insist(!s.rewards.settlementRequired,'SETTLEMENT_REQUIRED','정산 필요 상태에서 별빛을 사용할 수 없습니다.');
  insist(s.rewards.starlight>=cost,'INSUFFICIENT_STARS','별빛이 부족합니다.');
  insist(!hasClaim(s,`MAGIC_USE:${eventId}`),'MAGIC_DUPLICATE','이미 사용한 마법 이벤트입니다.');
  s.rewards.starlight-=cost;
  s.rewards.ledger.push({eventId,at,type:legacy?'TIME_SAND_SPEND':'STAR_SPEND',amount:-cost,claim:`MAGIC_USE:${eventId}`,magicId,
    scopeId,...(magicId==='TIME_SAND'?{attemptId:scopeId}:{})});
  s.magic.used.push({eventId,magicId,scopeId,at,cost,...(magicId==='TIME_SAND'?{attemptId:scopeId}:{})});
}

/** Step 2-6 records purchases, not invented hints, correct answers or routes. */
export function useMagic(s,p,{eventId,at,legacy=false}){
  validTimestamp(at);requireId(eventId,'마법 이벤트');
  const {magicId,teacherConfirmed}=p;
  const spec=MAGIC_CATALOG[magicId];
  insist(spec,'MAGIC_UNKNOWN','등록되지 않은 마법입니다.');
  insist(s.magic.unlocked.includes(magicId),'MAGIC_LOCKED','해금되지 않은 마법입니다.');
  insist(s.sessions.some(x=>x.id===s.activeSessionId&&x.phase==='ACTIVE'),
    'SESSION_NOT_ACTIVE','진행 중인 차시에서만 마법을 사용할 수 있습니다.');
  let scopeId;
  const a=s.activeAttemptId?s.attempts[s.activeAttemptId]:null;
  if(spec.scope==='ATTEMPT'){
    insist(a?.questionSnapshot&&a.id===(p.attemptId??a.id),'MAGIC_SCOPE_INVALID','실제 출제 문항이 필요합니다.');
    insist(!s.interception?.activeId&&!s.recovery?.activeId,'SIDE_MISSION_ACTIVE','미션 진행 중 일반 문항 마법을 사용할 수 없습니다.');
    insist(!a.answer&&!a.judgement&&['PREPARED','RUNNING','PAUSED'].includes(a.timer.phase),
      'MAGIC_BAD_PHASE','문제 답변/판정 후에는 사용할 수 없습니다.');
    scopeId=a.id;
    if(magicId==='TIME_SAND'){
      insist(['RUNNING','PAUSED'].includes(a.timer.phase),'MAGIC_BAD_PHASE','시간 연장은 타이머 시작 후 사용합니다.');
      insist(s.settings.timerSeconds!==0,'TIMER_DISABLED','타이머 끔에서는 연장하지 않습니다.');
      insist(!a.timer.usedTimeSand,'MAGIC_DUPLICATE','시간 연장은 문제당 한 번입니다.');
      insist(a.timer.phase!=='RUNNING'||timerRemainingMs(a,at)>0,
        'TIMER_DEADLINE','만료한 시간을 다시 연장할 수 없습니다.');
    }
  }else if(spec.scope==='REGION'){
    insist(!s.interception?.activeId&&!s.recovery?.activeId,'SIDE_MISSION_ACTIVE','미션 진행 중 지역 정보 구매 불가');
    insist(!a||a.timer.phase==='RESOLVED','ATTEMPT_ACTIVE','문제 진행 중 지역 정보 구매 불가');
    scopeId=p.regionId??s.world.currentRegionId;
    requireId(scopeId,'지역');
    insist(!!s.world.regions[scopeId]&&scopeId===s.world.currentRegionId,'MAGIC_SCOPE_INVALID','현재 지역만 대상입니다.');
  }else {
    scopeId=p.recoveryId??s.recovery.activeId;
    requireId(scopeId,'회수');
    insist(s.recovery.pending.some(r=>r.id===scopeId&&r.status!=='HELD')&&!s.interception?.activeId,
      'MAGIC_SCOPE_INVALID','진행 가능한 미회수 대상이 필요합니다.');
  }
  insist(!s.magic.used.some(x=>x.magicId===magicId&&(x.scopeId??x.attemptId)===scopeId),
    'MAGIC_DUPLICATE','같은 범위에서 동일 마법을 반복 사용할 수 없습니다.');
  insist(teacherConfirmed===true,'TEACHER_REQUIRED','마법 소비에는 교사 확인이 필요합니다.');
  // ALL validation (including sufficient starlight) must precede ANY state mutation.
  insist(!s.rewards.settlementRequired,'SETTLEMENT_REQUIRED','별빛 정산이 필요합니다.');
  insist(s.rewards.starlight>=spec.cost,'INSUFFICIENT_STARS','별빛이 부족합니다.');
  if(magicId==='TIME_SAND'){
    const remaining=timerRemainingMs(a,at);
    a.timer.remainingMs=remaining+TIME_SAND_EXTENSION_MS;
    if(a.timer.phase==='RUNNING')a.timer.runningSince=at;
    a.timer.usedTimeSand=true;
  }
  spend(s,{eventId,at,magicId,scopeId,legacy});
  return {magicId,scopeId,cost:spec.cost};
}

/** Strict event/claim/provenance checks, while existing PHASE 1 fixture states remain loadable. */
export function checkRewardHistory(s){
  insist(Array.isArray(s.rewards?.ledger)&&Array.isArray(s.magic?.used)&&Array.isArray(s.magic?.unlocked),
    'REWARD_LEDGER_INVALID','보상·마법 장부가 올바르지 않습니다.');
  insist(new Set(s.magic.unlocked).size===s.magic.unlocked.length&&
    s.magic.unlocked.every(id=>Boolean(MAGIC_CATALOG[id])),
    'MAGIC_UNLOCK_INVALID','해금된 마법 목록에 중복/미등록 항목이 있습니다.');
  const byEvent=new Map(s.eventLog.map(e=>[e.eventId,e]));
  const claims=new Set(),creditByTeam=new Map();
  for(const row of s.rewards.ledger){
    insist(typeof row?.eventId==='string'&&Number.isInteger(row.amount)&&
      ['STAR_EARN','STAR_SPEND','KEY_EARN','TIME_SAND_SPEND'].includes(row.type),'REWARD_LEDGER_INVALID','장부 유형/수량이 유효하지 않습니다.');
    if(row.claim){insist(!claims.has(row.claim),'REWARD_DUPLICATE','중복된 보상 청구가 있습니다.');claims.add(row.claim);}
    if(row.type==='STAR_EARN'){
      const source=s.attempts[row.sourceAttemptId],e=byEvent.get(row.eventId);
      insist(row.amount===1&&source?.questionId===row.questionId&&row.contribution===1&&e,
        'REWARD_LEDGER_INVALID','보상 지급 근거가 올바르지 않습니다.');
      if(row.kind==='ANSWER')insist(e.type==='ANSWER_JUDGED'&&source.judgement?.eventId===row.eventId&&
        source.judgement.decision==='CORRECT'&&source.teamId===row.teamId,
        'REWARD_LEDGER_INVALID','원문제 정답 기록이 불일치합니다.');
      else if(row.kind==='INTERCEPTION')insist(e.type==='INTERCEPTION_JUDGED'&&s.interception.records.some(x=>
        x.sourceAttemptId===row.sourceAttemptId&&x.targetTeamId===row.teamId&&x.judgement?.eventId===row.eventId&&x.judgement.decision==='CORRECT'),
        'REWARD_LEDGER_INVALID','가로채기 성공 기록이 불일치합니다.');
      else if(row.kind==='RECOVERY')insist(e.type==='RECOVERY_JUDGED'&&s.recovery.resolved.some(x=>x.id===row.recoveryId&&
        x.solverTeamId===row.teamId&&x.sourceAttemptId===row.sourceAttemptId&&x.resolutionEventId===row.eventId),
        'REWARD_LEDGER_INVALID','회수 성공 기록이 불일치합니다.');
      else insist(false,'REWARD_LEDGER_INVALID','알 수 없는 별빛 지급입니다.');
      insist(row.claim===(row.kind==='RECOVERY'?`RECOVERY_CORRECT:${row.questionId}`:`FIRST_CORRECT:${row.questionId}`)&&
        (row.kind==='RECOVERY'||source.drawMode==='NEW'),
        'REWARD_LEDGER_INVALID','복습/회수 보상 청구가 올바르지 않습니다.');
      creditByTeam.set(row.teamId,(creditByTeam.get(row.teamId)||0)+1);
    }else if(row.type==='KEY_EARN'){
      insist(row.amount===1&&row.claim===`REGION_KEY:${row.regionId}`&&s.world.regions[row.regionId]?.status==='COMPLETED',
        'REWARD_LEDGER_INVALID','지역 완료 열쇠의 근거가 없습니다.');
    }else {
      const use=s.magic.used.find(u=>u.eventId===row.eventId),e=byEvent.get(row.eventId);
      insist(row.amount<0&&use?.magicId===row.magicId&&use.cost===-row.amount&&
        MAGIC_CATALOG[row.magicId]?.cost===-row.amount&&
        ((e?.type==='MAGIC_USED'&&e.payload.magicId===row.magicId)||
          (e?.type==='TIME_SAND_USED'&&row.magicId==='TIME_SAND'))&&
        row.claim===`MAGIC_USE:${row.eventId}`&&
        row.scopeId===(use.scopeId??use.attemptId),
        'REWARD_LEDGER_INVALID','마법 지출과 별빛 차감 기록이 다릅니다.');
    }
  }
  for(const [id,num] of creditByTeam)insist(winner(s,id).contribution>=num,
    'REWARD_LEDGER_INVALID','모둠 공헌도가 지급 기록과 불일치합니다.');
  insist(s.teams.every(t=>Number.isSafeInteger(t.contribution)&&t.contribution>=0),
    'REWARD_LEDGER_INVALID','모둠 공헌도가 유효하지 않습니다.');
  return s;
}
