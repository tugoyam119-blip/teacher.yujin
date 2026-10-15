/**
 * PHASE 2-7 — append-only teacher correction and compensating reward accounting.
 * Original student answers, judgements, side-mission attempts, and historic awards
 * are NEVER deleted/replaced. Negative balance is represented as a settlement due,
 * never as a negative spendable starlight balance.
 * The reducer's single event + IDB transaction is the only persistence boundary.
 */
import {insist, requireId, validTimestamp} from '../engine/model.js';

export const CORRECTION_EVENT = 'JUDGEMENT_CORRECTED';
export const CORRECTION_SCOPES = Object.freeze(['ANSWER', 'INTERCEPTION', 'RECOVERY']);
const correctionKey = (scope,id)=>`${scope}:${id}`;
const reason = value=>{
  insist(typeof value==='string' && value.trim().length>=3 && value.trim().length<=2000,
    'CORRECTION_REASON_REQUIRED','판정 정정에는 3~2000자 사유가 필요합니다.');
  return value.trim();
};
const candidates = state=>[...(state.recovery?.pending??[]),...(state.recovery?.resolved??[])];
function findTarget(state,scope,id){
  if(scope==='ANSWER'){
    const row=state.attempts[id];
    insist(row?.judgement?.teacherConfirmed===true,'CORRECTION_SOURCE_MISSING','교사 확정 원문제 판정이 필요합니다.');
    return {target:row,decision:row.judgement.decision,sourceAttemptId:id,questionId:row.questionId};
  }
  if(scope==='INTERCEPTION'){
    const row=state.interception?.records?.find(x=>x.id===id);
    insist(row?.judgement?.teacherConfirmed===true && row.status==='RESOLVED',
      'CORRECTION_SOURCE_MISSING','교사 확정 가로채기 판정이 필요합니다.');
    return {target:row,decision:row.judgement.decision,sourceAttemptId:row.sourceAttemptId,questionId:row.questionId};
  }
  if(scope==='RECOVERY'){
    const match=candidates(state).flatMap(row=>(row.runs??[]).map(run=>({row,run}))).find(x=>x.run.id===id);
    insist(match?.run?.judgement?.teacherConfirmed===true && match.run.timer.phase==='RESOLVED',
      'CORRECTION_SOURCE_MISSING','교사 확정 회수 시도 판정이 필요합니다.');
    return {target:match.run,decision:match.run.judgement.decision,sourceAttemptId:match.row.sourceAttemptId,
      questionId:match.row.questionId};
  }
  insist(false,'CORRECTION_SCOPE_INVALID','정정 대상 판정 종류가 올바르지 않습니다.');
}
export function effectiveDecision(state,scope,id){
  const target=findTarget(state,scope,id);
  const list=state.corrections?.records??[];
  return [...list].reverse().find(x=>x.key===correctionKey(scope,id))?.decision ?? target.decision;
}
export const effectiveOriginDecision=(state,attemptId)=>effectiveDecision(state,'ANSWER',attemptId);

/** The historical eligibility at the moment a dependent action was opened.
 * Later corrections cannot erase the fact that an action was legitimately started. */
export function originIncorrectAtEvent(s,attemptId,eventId){
  const a=s.attempts[attemptId],boundary=s.eventLog.find(e=>e.eventId===eventId);
  if(!a?.judgement||!boundary)return false;
  let decision=a.judgement.decision;
  const index=new Map(s.eventLog.map(e=>[e.eventId,e.seq]));
  for(const r of s.corrections?.records??[]){
    if(r.key===correctionKey('ANSWER',attemptId) && (index.get(r.eventId)??Infinity)<boundary.seq)
      decision=r.decision;
  }
  return decision==='INCORRECT';
}

/** Determine valid rewards from the actual original outcomes + subsequent audit corrections. */
export function effectiveEntitlements(s){
  const result=new Map();
  const attempts=Object.values(s.attempts).filter(a=>a.questionSnapshot&&a.judgement&&a.drawMode==='NEW')
    .sort((a,b)=>a.preparedAt-b.preparedAt||a.id.localeCompare(b.id));
  for(const a of attempts){
    const claim=`FIRST_CORRECT:${a.questionId}`;
    if(result.has(claim))continue;
    const decision=effectiveOriginDecision(s,a.id);
    if(decision==='CORRECT'){
      result.set(claim,{teamId:a.teamId,kind:'ANSWER',sourceAttemptId:a.id});continue;
    }
    const intercept=s.interception?.records?.find(x=>x.sourceAttemptId===a.id&&x.judgement);
    if(intercept && effectiveDecision(s,'INTERCEPTION',intercept.id)==='CORRECT')
      result.set(claim,{teamId:intercept.targetTeamId,kind:'INTERCEPTION',sourceAttemptId:a.id});
  }
  for(const row of candidates(s)){
    if(effectiveOriginDecision(s,row.sourceAttemptId)!=='INCORRECT')continue;
    const win=(row.runs??[]).filter(x=>x.judgement).at(-1);
    if(!win||effectiveDecision(s,'RECOVERY',win.id)!=='CORRECT')continue;
    const claim=`RECOVERY_CORRECT:${row.questionId}`;
    if(!result.has(claim))result.set(claim,{teamId:win.teamId,kind:'RECOVERY',sourceAttemptId:row.sourceAttemptId});
  }
  return result;
}

/** Historic ledger entries plus all earlier correction adjustments; may hold + or - per team. */
export function ledgerClaims(s){
  const claims=new Map();
  for(const row of s.rewards.ledger){
    if(row.type!=='STAR_EARN'&&row.type!=='STAR_ADJUST')continue;
    const claim=row.type==='STAR_EARN'?row.claim:row.sourceClaim;
    if(!claims.has(claim))claims.set(claim,new Map());
    const values=claims.get(claim);
    values.set(row.teamId,(values.get(row.teamId)??0)+row.amount);
  }
  return claims;
}
const entryBy=(s,query)=>candidates(s).find(x=>x.id===query);
function updateRecoveryClassification(s,{eventId,at}){
  for(const a of Object.values(s.attempts)){
    if(!a.questionSnapshot||!a.judgement)continue;
    const corrections=s.corrections.records.some(x=>x.key===correctionKey('ANSWER',a.id));
    if(!corrections&&!candidates(s).some(r=>r.sourceAttemptId===a.id))continue;
    const decision=effectiveOriginDecision(s,a.id),qid=a.questionId;
    let row=entryBy(s,a.id);
    if(decision==='INCORRECT'&&!row){
      insist(!s.recovery.pending.some(x=>x.questionId===qid),'RECOVERY_DUPLICATE',
        '같은 문항의 다른 미회수 기록과 정정이 충돌합니다. 수동 검토가 필요합니다.');
      row={id:a.id,sourceAttemptId:a.id,questionId:qid,originTeamId:a.teamId,
        originRosterVersion:a.teamAssignment?.rosterVersion??null,
        originRepresentativeMemberId:a.teamAssignment?.representativeMemberId??null,
        originRegionId:a.regionId,status:'PENDING',createdAt:at,
        sourceEventId:a.judgement.eventId,createdByCorrectionEventId:eventId};
      s.recovery.pending.push(row);
    }
    if(!row)continue;
    if(decision==='CORRECT'){
      if(s.recovery.activeId===row.id)insist(false,'CORRECTION_MISSION_ACTIVE','진행 중인 회수미션은 정정할 수 없습니다.');
      if(row.status!=='RESOLVED' && row.status!=='INVALIDATED'){
        row.statusBeforeInvalidation=row.status;row.status='INVALIDATED';
        row.invalidatedByCorrectionId=eventId;
      }
      s.questions.recoveryOnlyIds=s.questions.recoveryOnlyIds.filter(x=>x!==qid);
      if(!s.questions.reviewEligibleIds.includes(qid))s.questions.reviewEligibleIds.push(qid);
    }else{
      if(row.status==='INVALIDATED'){
        row.status=row.statusBeforeInvalidation??'PENDING';
        delete row.statusBeforeInvalidation;delete row.invalidatedByCorrectionId;
      }
      // Recovery judgement correction can reopen a historically successful recovery.
      const last=(row.runs??[]).filter(x=>x.judgement).at(-1);
      if(row.status==='RESOLVED'&&last&&effectiveDecision(s,'RECOVERY',last.id)!=='CORRECT'){
        s.recovery.resolved=s.recovery.resolved.filter(x=>x.id!==row.id);
        row.status='PENDING';row.reopenedByCorrectionId=eventId;
        s.recovery.pending.push(row);
      }else if(row.status==='PENDING' && row.reopenedByCorrectionId && last &&
        effectiveDecision(s,'RECOVERY',last.id)==='CORRECT'){
        s.recovery.pending=s.recovery.pending.filter(x=>x.id!==row.id);
        row.status='RESOLVED';delete row.reopenedByCorrectionId;
        s.recovery.resolved.push(row);
      }
      if(row.status==='RESOLVED'){
        s.questions.recoveryOnlyIds=s.questions.recoveryOnlyIds.filter(x=>x!==qid);
        if(!s.questions.reviewEligibleIds.includes(qid))s.questions.reviewEligibleIds.push(qid);
      }else{
        s.questions.reviewEligibleIds=s.questions.reviewEligibleIds.filter(x=>x!==qid);
        if(!s.questions.recoveryOnlyIds.includes(qid))s.questions.recoveryOnlyIds.push(qid);
      }
    }
  }
}

/** This mutation happens ONLY in the reducer draft. On failure, it is discarded. */
export function applyJudgementCorrection(s,p,{eventId,at}){
  insist(p?.teacherConfirmed===true,'TEACHER_REQUIRED','판정 정정에는 교사 확인이 필요합니다.');
  insist(CORRECTION_SCOPES.includes(p.scope),'CORRECTION_SCOPE_INVALID','지원하지 않는 정정 종류입니다.');
  requireId(p.targetId,'정정 대상');validTimestamp(at);
  const target=findTarget(s,p.scope,p.targetId);
  insist(['CORRECT','INCORRECT'].includes(p.decision),'CORRECTION_DECISION_INVALID','정정 판정이 올바르지 않습니다.');
  insist(!s.interception?.activeId && !s.recovery?.activeId,
    'CORRECTION_MISSION_ACTIVE','미션 진행 중에는 과거 판정을 정정할 수 없습니다.');
  const active=s.activeAttemptId&&s.attempts[s.activeAttemptId];
  insist(!active||active.timer.phase==='RESOLVED','CORRECTION_ATTEMPT_ACTIVE','문제 진행 중에는 과거 판정을 정정할 수 없습니다.');
  const key=correctionKey(p.scope,p.targetId),prior=effectiveDecision(s,p.scope,p.targetId);
  insist(prior!==p.decision,'CORRECTION_NO_CHANGE','동일 판정은 정정할 수 없습니다.');
  const message=reason(p.reason);
  s.corrections??={records:[]};
  s.corrections.records.push({key,eventId,at,scope:p.scope,targetId:p.targetId,sourceAttemptId:target.sourceAttemptId,
    questionId:target.questionId,previousDecision:prior,decision:p.decision,reason:message});
  // If correcting the original answer, dependent side activities remain *as historical evidence*
  // and are excluded from effective eligibility, rather than physically deleted.
  updateRecoveryClassification(s,{eventId,at});
  reconcileEntitlementLedger(s,{eventId,at,reason:message});
}


/** Called by corrections AND later legitimately completed side-mission judgements.
 * Corrections can reopen a recovered question: a second valid recovery should
 * reapply the existing unique claim instead of silently keeping the old reversal.
 */
export function reconcileEntitlementLedger(s,{eventId,at,reason='교사 확정 결과에 따른 정산'}){
  const valid=effectiveEntitlements(s),current=ledgerClaims(s);
  const claims=new Set([...valid.keys(),...current.keys()]);
  for(const claim of [...claims].sort()){
    const old=current.get(claim)??new Map(),want=valid.get(claim);
    const teams=new Set([...old.keys(),...(want?[want.teamId]:[])]);
    for(const teamId of [...teams].sort()){
      const n=(want?.teamId===teamId?1:0)-(old.get(teamId)??0);
      insist(n>=-1&&n<=1,'CORRECTION_LEDGER_CONFLICT','기존 보상 원장이 유효하지 않습니다.');
      if(!n)continue;
      const correctionClaim=`CORRECTION:${eventId}:${claim}:${teamId}`;
      s.rewards.ledger.push({eventId,at,type:'STAR_ADJUST',amount:n,claim:correctionClaim,sourceClaim:claim,
        sourceAttemptId:want?.sourceAttemptId??null,teamId,contribution:n,reason});
      const team=s.teams.find(x=>x.id===teamId);
      insist(team,'CORRECTION_TEAM_INVALID','기여 모둠이 존재하지 않습니다.');
      team.contribution+=n;
      insist(team.contribution>=0,'CORRECTION_CONTRIBUTION_INVALID','모둠 공헌도 정산이 음수입니다.');
    }
  }
  const net=s.rewards.ledger.reduce((sum,row)=>sum+(row.type==='STAR_EARN'||row.type==='STAR_ADJUST'||
    row.type==='STAR_SPEND'||row.type==='TIME_SAND_SPEND'?row.amount:0),0);
  s.rewards.starlight=Math.max(0,net);
  s.rewards.settlementDue=Math.max(0,-net);
  s.rewards.settlementRequired=net<0;
}

/** Strict immutable audit chain and exact derived ledger verification, for corrected saves. */
export function checkCorrectionHistory(s){
  const list=s.corrections?.records??[];
  insist(Array.isArray(list),'CORRECTION_HISTORY_INVALID','정정 이력이 올바르지 않습니다.');
  const eventMap=new Map(s.eventLog.map(e=>[e.eventId,e])),prev=new Map();
  for(const r of list){
    const ev=eventMap.get(r.eventId);
    insist(ev?.type===CORRECTION_EVENT && ev.at===r.at && ev.payload?.scope===r.scope &&
      ev.payload.targetId===r.targetId && ev.payload.decision===r.decision &&
      ev.payload.teacherConfirmed===true && reason(ev.payload.reason)===r.reason,
      'CORRECTION_HISTORY_INVALID','정정 감사 이벤트의 근거가 없습니다.');
    const source=findTarget(s,r.scope,r.targetId);
    insist(source.sourceAttemptId===r.sourceAttemptId && source.questionId===r.questionId &&
      r.key===correctionKey(r.scope,r.targetId) && ['CORRECT','INCORRECT'].includes(r.decision) &&
      (prev.get(r.key)??source.decision)===r.previousDecision && r.previousDecision!==r.decision,
      'CORRECTION_HISTORY_INVALID','정정 순서 또는 원본 참조가 잘못되었습니다.');
    prev.set(r.key,r.decision);
  }
  if(!list.length)return s;
  insist(s.eventLog.filter(e=>e.type===CORRECTION_EVENT).length===list.length,
    'CORRECTION_HISTORY_INVALID','정정 이벤트와 정정 원장이 일치하지 않습니다.');
  const current=ledgerClaims(s),valid=effectiveEntitlements(s);
  for(const claim of new Set([...current.keys(),...valid.keys()])){
    const have=current.get(claim)??new Map(),want=valid.get(claim);
    for(const id of new Set([...have.keys(),...(want?[want.teamId]:[])]))
      insist((have.get(id)??0)===(want?.teamId===id?1:0),'CORRECTION_RECONCILE_INVALID','정정 후 보상 귀속이 일치하지 않습니다.');
  }
  const contribution=new Map();for(const r of s.rewards.ledger){
    if(['STAR_EARN','STAR_ADJUST'].includes(r.type))contribution.set(r.teamId,(contribution.get(r.teamId)??0)+r.amount);
  }
  insist(s.teams.every(t=>t.contribution===(contribution.get(t.id)??0)),
    'CORRECTION_RECONCILE_INVALID','정정 후 모둠 공헌도가 장부와 다릅니다.');
  const net=s.rewards.ledger.reduce((sum,r)=>sum+(['STAR_EARN','STAR_ADJUST','STAR_SPEND','TIME_SAND_SPEND'].includes(r.type)?r.amount:0),0);
  insist(s.rewards.starlight===Math.max(0,net)&&s.rewards.settlementDue===Math.max(0,-net)&&
    s.rewards.settlementRequired===(net<0),
    'CORRECTION_RECONCILE_INVALID','정정 후 별빛 잔액·정산 필요 금액이 일치하지 않습니다.');
  return s;
}
