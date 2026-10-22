/**
 * PHASE 2 / STEP 2-2: official global YQBank issue order.
 * Decisions 11/31: 60-question shared pool, unseen first; after exhaustion only
 * eligible solved questions may be reviewed; pending recovery is never a normal draw.
 * Pure planning only. Persist QUESTION_DRAWN with the PHASE 1 event transaction.
 */
import {checkState,clone,insist,requireId,validTimestamp} from '../engine/model.js';

import {seedRandomForDraw} from '../engine/preparation.js';

const MODE_NEW = 'NEW';
const MODE_REVIEW = 'REVIEW';
export const DRAW_MODES = Object.freeze([MODE_NEW,MODE_REVIEW]);

function uniqueIds(ids,label){
  insist(Array.isArray(ids) && ids.every(id=>typeof id==='string'&&id.length>0), 'DRAW_HISTORY_INVALID', `${label} ID 목록이 올바르지 않습니다.`);
  insist(new Set(ids).size===ids.length,'DRAW_HISTORY_INVALID',`${label} ID가 중복되었습니다.`);
  return ids;
}
function prepared(state,questionEngine){
  checkState(state);
  insist(questionEngine && typeof questionEngine.ids==='function' && typeof questionEngine.info==='function' &&
    typeof questionEngine.getNormalized==='function' && typeof questionEngine.snapshot==='function',
  'PACK_REQUIRED','검증된 원본 문제 엔진이 필요합니다.');
  const pack=questionEngine.info();
  insist(state.meta.packId===pack.packId&&state.meta.packVersion===pack.packVersion&&
    state.questions?.packId===pack.packId&&state.questions?.packVersion===pack.packVersion,
    'PACK_MISMATCH','원정의 문제팩 ID 또는 버전이 다릅니다.');
  const ids=questionEngine.ids();
  insist(ids.length===60 && new Set(ids).size===60 && pack.count===60,'PACK_COUNT','공식 60문항 구성이 아닙니다.');
  const issued=uniqueIds(state.questions.issuedIds,'발행');
  const recovery=uniqueIds(state.questions.recoveryOnlyIds,'미회수');
  const review=uniqueIds(state.questions.reviewEligibleIds,'복습 허용');
  const inventory=new Set(ids),issuedSet=new Set(issued),recoverySet=new Set(recovery);
  for(const id of [...issued,...recovery,...review]) {
    insist(inventory.has(id),'DRAW_HISTORY_INVALID',`문제은행에 없는 문항입니다: ${id}`);
  }
  for(const id of recovery)insist(issuedSet.has(id),'DRAW_HISTORY_INVALID','미회수 목록은 이미 출제한 문항이어야 합니다.');
  for(const id of review){
    insist(issuedSet.has(id),'DRAW_HISTORY_INVALID','복습 목록은 이미 출제한 문항이어야 합니다.');
    insist(!recoverySet.has(id),'DRAW_HISTORY_INVALID','미회수 문항은 복습 목록에 동시에 들어갈 수 없습니다.');
  }
  const draws=state.questions.draws??[];
  insist(Array.isArray(draws),'DRAW_HISTORY_INVALID','출제 기록이 올바르지 않습니다.');
  const attempts=new Set();
  for(const row of draws){
    insist(row&&typeof row==='object'&&DRAW_MODES.includes(row.mode)&&
      typeof row.attemptId==='string'&&typeof row.questionId==='string'&&
      row.regionId && row.teamId && inventory.has(row.questionId),
      'DRAW_HISTORY_INVALID','출제 로그의 필수 항목이 잘못되었습니다.');
    insist(!attempts.has(row.attemptId),'DRAW_HISTORY_INVALID','출제 로그에 같은 시도 ID가 중복됩니다.');
    attempts.add(row.attemptId);
  }
  return {ids,issued,issuedSet,recoverySet,review,draws,inventory};
}

/** Distinct normal vs recovery pool; never silently recycle an unresolved wrong question. */
export function inspectDrawPool(state,questionEngine){
  const {ids,issued,issuedSet,recoverySet,review,draws}=prepared(state,questionEngine);
  const unseen=ids.filter(id=>!issuedSet.has(id)&&!recoverySet.has(id));
  const eligibleReview=review.filter(id=>issuedSet.has(id)&&!recoverySet.has(id));
  const recoveryOnly=ids.filter(id=>recoverySet.has(id));
  const mode=unseen.length?MODE_NEW:eligibleReview.length?MODE_REVIEW:'BLOCKED';
  return {
    mode, // If no unseen questions remain, review can begin; never before.
    regularIds:mode===MODE_NEW?unseen:mode===MODE_REVIEW?eligibleReview:[],
    unseenIds:unseen,
    reviewIds:eligibleReview,
    recoveryOnlyIds:recoveryOnly,
    issuedCount:issued.length,drawCount:draws.length,total:ids.length,
    blockedReason:mode==='BLOCKED'?'NO_ELIGIBLE_NORMAL_QUESTIONS':null,
    teacherActionRequired:mode==='BLOCKED'
  };
}

/**
 * The recovery queue is a separate READ-ONLY route, not an alternative source
 * of general questions. Real recovery adjudication/priority is STEP 2-5.
 */
export function listRecoveryCandidates(state,{inRegionId,force=false,teacherConfirmed=false}={}){
  checkState(state);
  insist(typeof inRegionId==='string'&&!!state.world.regions[inRegionId],'REGION_INVALID','유효한 현재 지역을 지정하세요.');
  insist(typeof force==='boolean','RECOVERY_INVALID','강제 호출 여부가 올바르지 않습니다.');
  insist(!force||teacherConfirmed===true,'TEACHER_REQUIRED','회수 강제 호출에는 교사 확인이 필요합니다.');
  // Natural appearance needs a CONFIRMED region-entry order. Merely picking a
  // different region name does NOT prove it was visited later. PHASE 2-8 will
  // populate this visit history; until then the preview is conservatively empty.
  const visited=state.world.regionEntryOrder??[];
  insist(Array.isArray(visited)&&visited.every(id=>typeof id==='string'&&!!state.world.regions[id]),
    'REGION_HISTORY_INVALID','지역 방문 순서 기록이 올바르지 않습니다.');
  const queued=state.recovery?.pending??[],only=new Set(state.questions?.recoveryOnlyIds??[]);
  insist(Array.isArray(queued),'RECOVERY_INVALID','회수 대기열이 올바르지 않습니다.');
  const seen=new Set(),out=[];
  for(const x of queued){
    if(x?.status==='INVALIDATED')continue; // historic invalidation is not an active recovery candidate.
    insist(x&&typeof x.id==='string'&&typeof x.questionId==='string'&&typeof x.originRegionId==='string'&&
      typeof x.originTeamId==='string'&&['PENDING','HELD','ACTIVE'].includes(x.status),
      'RECOVERY_INVALID','회수 대기 정보가 불완전합니다.');
    insist(!seen.has(x.id),'RECOVERY_DUPLICATE','회수 대상 ID가 중복되었습니다.');seen.add(x.id);
    insist(only.has(x.questionId),'RECOVERY_INVALID','미회수 전용 목록에 없는 문항입니다.');
    const originIndex=visited.indexOf(x.originRegionId);
    const presentIndex=visited.lastIndexOf(inRegionId);
    const laterVerified=originIndex>=0&&presentIndex>originIndex&&
      visited.at(-1)===inRegionId&&x.originRegionId!==inRegionId;
    if(x.status!=='ACTIVE' && (x.status==='PENDING'||force) && (force || laterVerified))out.push(clone(x));
  }
  return out;
}

function balancer(all,history,candidates,questionEngine,kind){
  const categories=kind==='difficulty'?[1,2,3,4,5]:Object.keys(questionEngine.info().counts);
  const field=q=>kind==='difficulty'?q.difficulty:q.type;
  const totals=new Map(categories.map(x=>[x,0])),used=new Map(categories.map(x=>[x,0]));
  for(const id of all){const v=field(questionEngine.getNormalized(id));totals.set(v,(totals.get(v)??0)+1);}
  for(const row of history){const v=field(questionEngine.getNormalized(row.questionId));used.set(v,(used.get(v)??0)+1);}
  const target=history.length+1;
  return candidates.map(q=>{
    let dist=0;
    for(const k of categories){
      const expected=target*(totals.get(k)??0)/all.length;
      const actual=(used.get(k)??0)+(field(q)===k?1:0);
      dist+=Math.abs(actual-expected);
    }
    return dist;
  });
}

/**
 * Select among globally unissued records using type/difficulty balance.
 * Numeric random injection makes QA reproducible; it is not saved as a reward.
 * Primary sorting is strict balance score; random breaks ties/nearly-equal scores.
 */
export function planQuestionDraw(state,questionEngine,{regionId,teamId,attemptId,at,random=null}={}){
  random??=seedRandomForDraw(state,regionId,teamId);
  const pool=inspectDrawPool(state,questionEngine);
  insist(!state.sessions.find(s=>s.id===state.activeSessionId)?.wrapRequested,'LESSON_WRAP_REQUESTED','수업 마무리가 예약되어 새 문항을 준비할 수 없습니다.');
  requireId(regionId,'지역');requireId(teamId,'모둠');requireId(attemptId,'문제 시도');validTimestamp(at);
  insist(state.world.regions[regionId],'REGION_INVALID','공식 30지역에 없는 지역입니다.');
  insist(state.world.currentRegionId===null||state.world.currentRegionId===regionId,'REGION_CHANGED','진행 중인 지역을 변경할 수 없습니다.');
  insist(state.teams.some(t=>t.id===teamId),'INVALID_TEAM','존재하지 않는 모둠입니다.');
  const s=state.sessions.find(s=>s.id===state.activeSessionId);
  insist(s?.phase==='ACTIVE','SESSION_NOT_ACTIVE','진행 중인 차시가 필요합니다.');
  if(state.activeAttemptId){
    const a=state.attempts[state.activeAttemptId];
    insist(a?.timer?.phase==='RESOLVED','ATTEMPT_ACTIVE','이전 시도를 교사가 먼저 종료해야 합니다.');
  }
  insist(!state.attempts[attemptId] && !(state.questions.draws??[]).some(r=>r.attemptId===attemptId),
    'ATTEMPT_EXISTS','문제 시도 ID가 이미 사용되었습니다.');
  insist(pool.mode!=='BLOCKED','DRAW_POOL_EXHAUSTED','미출제 문항과 복습 허용 문항이 모두 없습니다. 교사 확인이 필요합니다.');
  insist(typeof random==='function','RANDOM_INVALID','난수 함수가 필요합니다.');
  let ids=pool.regularIds;
  // For reviews, avoid showing the same question in the same region if there is an alternative.
  if(pool.mode===MODE_REVIEW){
    const inRegion=new Set((state.questions.draws??[]).filter(d=>d.regionId===regionId).map(d=>d.questionId));
    const freshHere=ids.filter(id=>!inRegion.has(id));
    if(freshHere.length)ids=freshHere;
  }
  const all=questionEngine.ids();
  const past=(state.questions.draws??[]).filter(row=>row.mode===pool.mode);
  const candidateQuestions=ids.map(id=>questionEngine.getNormalized(id));
  const typeDist=balancer(pool.mode===MODE_NEW?all:pool.reviewIds,past,candidateQuestions,questionEngine,'type');
  const diffDist=balancer(pool.mode===MODE_NEW?all:pool.reviewIds,past,candidateQuestions,questionEngine,'difficulty');
  const scores=ids.map((id,i)=>2*typeDist[i]+diffDist[i]);
  const minimum=Math.min(...scores);
  // Balance first, randomized among similarly suitable questions. 
  const near=ids.filter((_,i)=>scores[i]<=minimum+0.001);
  const draw=random();
  insist(typeof draw==='number'&&Number.isFinite(draw)&&draw>=0&&draw<1,'RANDOM_INVALID','난수는 0 이상 1 미만이어야 합니다.');
  const questionId=near[Math.floor(draw*near.length)];
  const snapshot=questionEngine.snapshot({questionId,attemptId,issuedAt:at});
  return {
    attemptId,questionId,teamId,regionId,mode:pool.mode,questionSnapshot:snapshot,
    // This flag is NOT a reward grant. The rule engine may later check it at first judgement.
    firstIssue:pool.mode===MODE_NEW,
  };
}

/** Validates the persistence payload independently of any graphical caller. */
export function validateDrawCommand(state,payload,at){
  insist(payload&&typeof payload==='object','DRAW_INVALID','출제 이벤트가 올바르지 않습니다.');
  const {attemptId,questionId,teamId,regionId,mode,questionSnapshot,firstIssue}=payload;
  requireId(attemptId,'문제 시도');requireId(questionId,'문항');requireId(regionId,'지역');requireId(teamId,'모둠');
  insist(DRAW_MODES.includes(mode),'DRAW_INVALID','출제 모드가 올바르지 않습니다.');
  insist(firstIssue===(mode===MODE_NEW),'DRAW_INVALID','최초 출제 정보가 일치하지 않습니다.');
  insist(state.world.regions[regionId],'REGION_INVALID','지역 ID가 올바르지 않습니다.');
  insist(state.world.currentRegionId===null||state.world.currentRegionId===regionId,'REGION_CHANGED','현재 지역과 출제 지역이 다릅니다.');
  if(state.world.progressionMode==='EXPLICIT')insist(state.world.regions[regionId].status==='IN_PROGRESS'&&
    state.world.currentRegionId===regionId,'REGION_NOT_ENTERED','먼저 해당 지역에 교사가 진입해야 합니다.');
  insist(state.teams.some(t=>t.id===teamId),'INVALID_TEAM','존재하지 않는 모둠입니다.');
  insist(!state.attempts[attemptId],'ATTEMPT_EXISTS','시도 ID가 중복되었습니다.');
  const issued=new Set(state.questions.issuedIds),recovery=new Set(state.questions.recoveryOnlyIds);
  insist(!recovery.has(questionId),'RECOVERY_ONLY','미회수 문제는 일반 출제로 낼 수 없습니다.');
  if(mode===MODE_NEW){
    insist(!issued.has(questionId) && issued.size<60,'QUESTION_ALREADY_ISSUED','이미 출제된 문항을 신규로 다시 출제할 수 없습니다.');
  }else{
    insist(issued.size===60&&issued.has(questionId)&&state.questions.reviewEligibleIds.includes(questionId),
      'REVIEW_NOT_ELIGIBLE','전체 미출제 소진 전 또는 복습 허용되지 않은 문항입니다.');
  }
  validTimestamp(at);
  const snap=questionSnapshot;
  insist(snap&&snap.issuedAt===at&&snap.attemptId===attemptId&&snap.questionId===questionId&&
      snap.packId===state.meta.packId&&snap.packVersion===state.meta.packVersion&&
      Number.isInteger(snap.questionRevision)&&snap.questionRevision>=1&&
      snap.issuedSnapshot?.questionId===questionId&&snap.originalSnapshot?.questionId===questionId&&
      snap.issuedSnapshot?.revision===snap.questionRevision&&snap.originalSnapshot?.revision===snap.questionRevision&&
      snap.issuedSnapshot?.packId===state.meta.packId&&snap.originalSnapshot?.packId===state.meta.packId&&
      snap.issuedSnapshot?.packVersion===state.meta.packVersion&&snap.originalSnapshot?.packVersion===state.meta.packVersion&&
      !!snap.issuedSnapshot?.answer&&!!snap.originalSnapshot?.answer&&
      snap.issuedSnapshot.original?.id===questionId&&snap.originalSnapshot.original?.id===questionId&&
      snap.issuedSnapshot.type===snap.originalSnapshot.type&&
      snap.issuedSnapshot.stem===snap.originalSnapshot.stem&&
      JSON.stringify(snap.issuedSnapshot.answer)===JSON.stringify(snap.originalSnapshot.answer),
      'DRAW_SNAPSHOT_INVALID','원본 및 실제 발행 문항 스냅샷이 일치하지 않습니다.');
  return true;
}
