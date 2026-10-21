import {insist} from '../engine/model.js';
import {effectiveDecision,effectiveOriginDecision} from '../corrections/reconcile.js';

export const HEALTH_MAX=8;
/** Rebuild from effective judgements in original event order; corrections never erase activity. */
export function healthFromHistory(s){
 if(s.settings.healthEnabled!==true)return null;
 let current=HEALTH_MAX,returnRequired=false;const recovered=new Set();
 const rows=[...s.recovery.pending,...s.recovery.resolved];
 for(const event of s.eventLog){
  if(event.type==='HEALTH_RETURNED'){current=HEALTH_MAX;returnRequired=false;continue;}
  if(event.type==='ANSWER_JUDGED'){
   const a=s.attempts[event.payload.attemptId];
   if(a?.questionSnapshot&&effectiveOriginDecision(s,a.id)==='INCORRECT'){
    current=Math.max(0,current-1);if(current===0)returnRequired=true;
   }
  }
  if(event.type==='RECOVERY_JUDGED'){
   const row=rows.find(r=>(r.runs??[]).some(run=>run.judgement?.eventId===event.eventId));
   const run=row?.runs.find(run=>run.judgement?.eventId===event.eventId);
   if(run&&effectiveOriginDecision(s,row.sourceAttemptId)==='INCORRECT'&&
     effectiveDecision(s,'RECOVERY',run.id)==='CORRECT'&&!recovered.has(row.questionId)){
    recovered.add(row.questionId);if(!returnRequired)current=Math.min(HEALTH_MAX,current+1);
   }
  }
 }
 return {version:1,max:HEALTH_MAX,current,returnRequired};
}
export function refreshHealth(s){const health=healthFromHistory(s);if(health)s.health=health;}
export function checkHealth(s){
 if(s.settings.healthEnabled!==true){insist(s.health===undefined,'HEALTH_INVALID','기존 탐험에 체력을 자동 적용할 수 없습니다.');return;}
 const expected=healthFromHistory(s);
 insist(s.health&&Object.keys(expected).every(k=>s.health[k]===expected[k]),'HEALTH_INVALID','체력과 판정·복귀 기록이 다릅니다.');
}
export function requireHealth(s){insist(!s.health?.returnRequired,'HEALTH_RETURN_REQUIRED','체력이 소진됐습니다. 현재 판정·미션을 마친 뒤 책장으로 복귀해 회복하세요.');}
