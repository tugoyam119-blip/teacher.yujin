/** PHASE 2-8: one event stream for 6-theme/30-region progression and region results.
 * Images, endings, clue synthesis and browser deployment are out of scope.
 * Earlier 2-1..2-7 prototype saves may have no explicit region visit history;
 * the explicit flow starts only with REGION_ENTERED and never backfills imaginary visits.
 */
import {insist,requireId,validTimestamp} from '../engine/model.js';
import {effectiveOriginDecision} from '../corrections/reconcile.js';

export const REGION_COMMANDS=Object.freeze([
 'REGION_ENTERED','REGION_QUOTA_SET','REGION_COMPLETED',
 'EXTRA_EXPLORATION_STARTED','EXTRA_EXPLORATION_RETURNED'
]);
const statuses=new Set(['LOCKED','AVAILABLE','IN_PROGRESS','COMPLETED']);
const selections=new Set(['LEFT','RIGHT']);
const findPosition=(s,id)=>{
  requireId(id,'지역');
  for(let i=0;i<s.world.themes.length;i++){
    const offset=s.world.themes[i].regionIds.indexOf(id);
    if(offset>=0)return{theme:s.world.themes[i],themeIndex:i,index:offset};
  }
  insist(false,'REGION_INVALID','30개 공식 지역 중 하나여야 합니다.');
};
const row=(s,id)=>{const p=findPosition(s,id);const r=s.world.regions[id];insist(r,'REGION_INVALID','공식 지역이 아닙니다.');return{...p,r};};
const completed=(s,id)=>s.world.regions[id]?.status==='COMPLETED';
const noLiveQuestion=s=>{
  const a=s.activeAttemptId&&s.attempts[s.activeAttemptId];
  insist(!a||a.timer?.phase==='RESOLVED','ATTEMPT_ACTIVE','활성 문제의 교사 확정을 먼저 완료해야 합니다.');
  insist(!s.interception?.activeId&&!s.recovery?.activeId,'SIDE_MISSION_ACTIVE','가로채기/회수 진행 중 이동·완료 불가');
};
const activeLesson=s=>insist(s.sessions.some(x=>x.id===s.activeSessionId&&x.phase==='ACTIVE'),
  'SESSION_NOT_ACTIVE','지역 진행에는 활성 차시가 필요합니다.');
const confirm=p=>insist(p.teacherConfirmed===true,'TEACHER_REQUIRED','교사 확인이 필요합니다.');
const extra=s=>s.world.additionalExplorationReturn;
function branchChosen(s,theme){return s.world.mainRouteChoice[theme.id]??null;}
const branchFor=(idx)=>idx===1?'LEFT':idx===2?'RIGHT':null;
function nextInMain(s,{theme,themeIndex,index},regionId){
  if(index===0){
    if(themeIndex===0)return !Object.values(s.world.regions).some(r=>r.completedAt!==null);
    return completed(s,s.world.themes[themeIndex-1].regionIds[4]);
  }
  const ids=theme.regionIds,ch=branchChosen(s,theme);
  if(index===1||index===2){
    return completed(s,ids[0])&&(!ch||ch===branchFor(index));
  }
  if(index===3)return !!ch&&completed(s,ids[ch==='LEFT'?1:2]);
  if(index===4)return completed(s,ids[3]);
  return false;
}
/** Only judged, original regional questions count toward the baseline quota. */
export function processedRegionalAttempts(s,regionId){
  return (s.questions.draws??[]).filter(d=>d.regionId===regionId)
    .map(d=>s.attempts[d.attemptId])
    .filter(a=>a?.judgement?.teacherConfirmed===true&&a.timer?.phase==='RESOLVED');
}
function ensureProgress(s){
  s.world.regionEntryOrder??=[];
  s.world.visitHistory??=[];
  s.world.results??=[];
  s.world.progressionMode??=null;
}
/** Private details kept in the teacher state; returned public result contains counts only. */
export function regionResult(s,regionId,{publicOnly=false}={}){
  const {theme,r}=row(s,regionId);
  const proof=(s.world.results??[]).find(x=>x.regionId===regionId);
  if(!proof)return null;
  const attempts=proof.attemptIds.map(id=>s.attempts[id]);
  const correct=attempts.filter(a=>effectiveOriginDecision(s,a.id)==='CORRECT').length;
  const incorrect=attempts.length-correct;
  const unresolved=[...s.recovery.pending].filter(x=>x.originRegionId===regionId&&x.status!=='INVALIDATED').length;
  const basic={regionId,themeId:theme.id,completedAt:proof.at,baseQuota:proof.baseQuota,
    processed:attempts.length,correct,incorrect,unresolvedRecovery:unresolved,
    keyGranted:!!s.rewards.ledger.find(x=>x.claim===`REGION_KEY:${regionId}`),starlightFromRegionCompletion:0};
  if(publicOnly)return basic;
  return {...basic,attemptIds:[...proof.attemptIds],sessionId:proof.sessionId,
    perTeam:s.teams.map(t=>({teamId:t.id,processed:attempts.filter(a=>a.teamId===t.id).length,
      correct:attempts.filter(a=>a.teamId===t.id&&effectiveOriginDecision(s,a.id)==='CORRECT').length}))};
}
export function worldProgress(s){
  const themes=s.world.themes.map(theme=>{
    const ids=theme.regionIds,done=ids.filter(id=>completed(s,id));
    const main=s.world.mainRouteChoice[theme.id];
    const mainFinished=!!main&&completed(s,ids[0])&&completed(s,ids[main==='LEFT'?1:2])&&completed(s,ids[3])&&completed(s,ids[4]);
    const unresolved=s.recovery.pending.filter(r=>ids.includes(r.originRegionId)&&r.status!=='INVALIDATED').length;
    return {themeId:theme.id,mainFinished,fullExploration:done.length===5,
      learningComplete:mainFinished&&unresolved===0,completedRegions:done.length,unresolvedRecovery:unresolved};
  });
  return{currentRegionId:s.world.currentRegionId,visitCount:(s.world.regionEntryOrder??[]).length,
    mainEndingUnlocked:themes.every(t=>t.mainFinished),themes};
}
function markAvailable(s,regionId){
  const r=s.world.regions[regionId];
  if(r.status==='LOCKED')r.status='AVAILABLE';
}
function afterCompleted(s,position){
  const ids=position.theme.regionIds,i=position.index;
  if(i===0){markAvailable(s,ids[1]);markAvailable(s,ids[2]);}
  if(i===1||i===2){markAvailable(s,ids[3]);}
  if(i===3)markAvailable(s,ids[4]);
  if(i===4){
    const other=branchChosen(s,position.theme)==='LEFT'?2:1;
    markAvailable(s,ids[other]);
    const next=s.world.themes[position.themeIndex+1];if(next)markAvailable(s,next.regionIds[0]);
  }
}
export function applyRegionCommand(s,type,p,{eventId,at}){
  insist(REGION_COMMANDS.includes(type),'REGION_COMMAND_INVALID','지역 이벤트가 아닙니다.');
  validTimestamp(at);confirm(p);ensureProgress(s);
  activeLesson(s);noLiveQuestion(s);
  if(type==='REGION_ENTERED'){
    const {theme,themeIndex,index,r}=row(s,p.regionId);
    insist(['MAIN','EXTRA'].includes(p.mode),'REGION_MODE_INVALID','주경로/추가 탐험을 지정하세요.');
    insist(r.status!=='COMPLETED','REGION_COMPLETED','완료한 지역에 중복 진입할 수 없습니다.');
    if(s.world.progressionMode===null){
      insist(!s.questions.draws.length,'LEGACY_REGION_HISTORY','이전 버전의 출제 기록이 있어 명시적 방문으로 자동 변환할 수 없습니다.');
      insist(p.regionId===s.world.themes[0].regionIds[0]&&p.mode==='MAIN','REGION_LOCKED','첫 지역에서 시작해야 합니다.');
      s.world.progressionMode='EXPLICIT';
    }
    const returning=r.status==='IN_PROGRESS'&&s.world.currentRegionId===p.regionId;
    if(returning)insist(r.lastEnteredSessionId!==s.activeSessionId,'REGION_ALREADY_ENTERED',
      '동일 차시에서 같은 지역을 중복 진입할 수 없습니다.');
    if(!returning){
      const current=s.world.currentRegionId;
      insist(!current||completed(s,current),'REGION_IN_PROGRESS','이전 지역을 완료해야 이동할 수 있습니다.');
      if(p.mode==='EXTRA'){
        insist(extra(s)?.regionId===p.regionId,'EXTRA_NOT_STARTED','책장에서 추가 탐험을 먼저 선택해야 합니다.');
        insist(index===1||index===2,'EXTRA_INVALID','미방문 분기만 추가 탐험할 수 있습니다.');
        insist(completed(s,theme.regionIds[4]),'EXTRA_LOCKED','주경로를 완료한 뒤 추가 탐험이 가능합니다.');
        insist(branchChosen(s,theme)!==branchFor(index),'EXTRA_MAIN_BRANCH','이미 선택한 주경로는 추가 탐험이 아닙니다.');
      }else{
        insist(!extra(s),'EXTRA_RETURN_REQUIRED','추가 탐험 복귀를 먼저 완료하세요.');
        insist(nextInMain(s,{theme,themeIndex,index},p.regionId),'REGION_LOCKED','선행 지역·주경로 조건을 충족하지 못했습니다.');
      }
    }else{
      insist((extra(s)?'EXTRA':'MAIN')===p.mode,'REGION_MODE_INVALID','기존 진입 모드를 유지해야 합니다.');
    }
    if(index===1||index===2){
      if(p.mode==='MAIN'){
        if(!branchChosen(s,theme))s.world.mainRouteChoice[theme.id]=branchFor(index);
        const other=theme.regionIds[index===1?2:1];
        if(s.world.regions[other].status==='AVAILABLE')s.world.regions[other].status='LOCKED';
      }
    }
    if(r.status!=='IN_PROGRESS'){
      r.status='IN_PROGRESS';r.enteredAt=at;r.entryEventId=eventId;
      r.baseQuota=s.settings.teamCount;
    }
    r.lastEnteredAt=at;r.lastEnteredSessionId=s.activeSessionId;
    s.world.currentRegionId=p.regionId;s.screen='REGION';
    s.world.regionEntryOrder.push(p.regionId);
    s.world.visitHistory.push({regionId:p.regionId,eventId,at,mode:p.mode,sessionId:s.activeSessionId});
    return;
  }
  insist(s.world.progressionMode==='EXPLICIT','REGION_NOT_ENTERED','지역 진입 이벤트를 먼저 확정해야 합니다.');
  if(type==='EXTRA_EXPLORATION_STARTED'){
    insist(s.screen==='BOOKSHELF','EXTRA_FROM_BOOKSHELF','추가 탐험은 책장에서 시작해야 합니다.');
    const {theme,index,r}=row(s,p.regionId);
    insist(!extra(s),'EXTRA_ALREADY_STARTED','이미 추가 탐험이 진행 중입니다.');
    insist((index===1||index===2)&&!completed(s,p.regionId)&&r.status==='AVAILABLE',
      'EXTRA_NOT_AVAILABLE','미방문 분기가 해금되지 않았습니다.');
    insist(completed(s,theme.regionIds[4])&&branchChosen(s,theme)!==branchFor(index),
      'EXTRA_LOCKED','해당 테마 주경로 완료 뒤 미방문 분기만 탐험할 수 있습니다.');
    insist(!s.world.currentRegionId||completed(s,s.world.currentRegionId),
      'REGION_IN_PROGRESS','진행 중인 주경로를 남겨 두고 이동할 수 없습니다.');
    s.world.additionalExplorationReturn={regionId:p.regionId,themeId:theme.id,
      fromRegionId:s.world.currentRegionId,startedEventId:eventId,startedAt:at};
    s.screen='BOOKSHELF';return;
  }
  if(type==='EXTRA_EXPLORATION_RETURNED'){
    const x=extra(s);
    insist(x&&completed(s,x.regionId),'EXTRA_NOT_COMPLETED','추가 탐험을 완료해야 복귀할 수 있습니다.');
    insist(s.world.currentRegionId===x.regionId,'EXTRA_NOT_CURRENT','추가 탐험의 현재 지역이 일치하지 않습니다.');
    s.world.currentRegionId=x.fromRegionId;s.world.additionalExplorationReturn=null;
    s.screen='BOOKSHELF';return;
  }
  const {r,...position}=row(s,p.regionId);
  insist(s.world.currentRegionId===p.regionId&&r.status==='IN_PROGRESS','REGION_NOT_ACTIVE','현재 진행 중인 지역이어야 합니다.');
  if(type==='REGION_QUOTA_SET'){
    requireId(p.regionId,'지역');
    insist(Number.isInteger(p.baseQuota)&&p.baseQuota>=1&&p.baseQuota<=60,'REGION_QUOTA_INVALID','지역 기본 문제 수는 1~60이어야 합니다.');
    insist(typeof p.reason==='string'&&p.reason.trim().length>=2&&p.reason.length<=1000,
      'REGION_REASON_REQUIRED','기본 문제 수 변경에는 교사 사유가 필요합니다.');
    const processed=processedRegionalAttempts(s,p.regionId).length;
    insist(p.baseQuota>=processed,'REGION_QUOTA_BELOW_PROCESSED','이미 확정한 문제 수보다 적게 변경할 수 없습니다.');
    insist(p.baseQuota!==r.baseQuota,'REGION_QUOTA_NO_CHANGE','변경할 문제 수가 동일합니다.');
    r.baseQuota=p.baseQuota;
    s.world.quotaHistory??=[];s.world.quotaHistory.push({regionId:p.regionId,baseQuota:p.baseQuota,eventId,at,reason:p.reason.trim()});
    return;
  }
  if(type==='REGION_COMPLETED'){
    const done=processedRegionalAttempts(s,p.regionId);
    insist(done.length===r.baseQuota,'REGION_QUOTA_NOT_MET','지역 기본 문제 수를 정확히 처리해야 완료할 수 있습니다.');
    // Completion is separate from learning mastery. Pending wrong answers stay pending.
    const proof={regionId:p.regionId,eventId,at,sessionId:s.activeSessionId,baseQuota:r.baseQuota,
      attemptIds:done.map(a=>a.id)};
    r.status='COMPLETED';r.completedAt=at;r.completionEventId=eventId;
    s.world.results.push(proof);
    afterCompleted(s,{...position,r});
    s.screen='REGION_RESULT';return;
  }
}
/** Check the event-backed world state without rejecting older pre-2-8 prototype saves. */
export function checkWorldHistory(s){
  const w=s.world;
  if(!w.progressionMode)return s; // Earlier prototype saves: no invented region visits.
  insist(w.progressionMode==='EXPLICIT'&&Array.isArray(w.regionEntryOrder)&&Array.isArray(w.visitHistory)&&
    Array.isArray(w.results)&&w.visitHistory.length===w.regionEntryOrder.length&&w.visitHistory.length>0,
    'REGION_HISTORY_INVALID','명시적 지역 방문 장부가 손상되었습니다.');
  const events=new Map(s.eventLog.map(e=>[e.eventId,e]));
  for(let i=0;i<w.visitHistory.length;i++){
    const v=w.visitHistory[i],ev=events.get(v.eventId);
    insist(ev?.type==='REGION_ENTERED'&&ev.at===v.at&&ev.payload.regionId===v.regionId&&
      ev.payload.mode===v.mode&&w.regionEntryOrder[i]===v.regionId&&!!w.regions[v.regionId]&&
      typeof v.sessionId==='string'&&s.sessions.some(x=>x.id===v.sessionId),
      'REGION_HISTORY_INVALID','지역 방문 순서가 이벤트와 다릅니다.');
  }
  for(const r of Object.values(w.regions))insist(statuses.has(r.status),'REGION_STATUS_INVALID','지역 상태가 올바르지 않습니다.');
  // Main-route choice must come from an actual first branch-entry event, not a mutable flag.
  const selected={};
  for(const visit of w.visitHistory){
    const {theme,index}=findPosition(s,visit.regionId);
    if(visit.mode==='MAIN'&&(index===1||index===2)){
      const choice=branchFor(index);
      if(selected[theme.id])insist(selected[theme.id]===choice,'REGION_ROUTE_INVALID','주경로 분기 기록이 변경되었습니다.');
      selected[theme.id]=choice;
    }
  }
  const selectedKeys=Object.keys(selected).sort(), actualKeys=Object.keys(w.mainRouteChoice||{}).sort();
  insist(JSON.stringify(selectedKeys)===JSON.stringify(actualKeys)&&
    selectedKeys.every(k=>w.mainRouteChoice[k]===selected[k]),
    'REGION_ROUTE_INVALID','주경로 선택 장부와 실제 지역 방문 기록이 다릅니다.');
  const seen=new Set();
  for(const proof of w.results){
    const ev=events.get(proof.eventId),r=w.regions[proof.regionId];
    insist(!seen.has(proof.regionId)&&ev?.type==='REGION_COMPLETED'&&
      ev.payload.regionId===proof.regionId&&ev.at===proof.at&&r?.status==='COMPLETED'&&
      r.completedAt===proof.at&&r.completionEventId===proof.eventId&&
      Number.isInteger(proof.baseQuota)&&proof.baseQuota>0&&
      Array.isArray(proof.attemptIds)&&proof.attemptIds.length===proof.baseQuota,
      'REGION_COMPLETION_INVALID','지역 완료 증거가 누락되거나 중복되었습니다.');
    for(const id of proof.attemptIds){
      const a=s.attempts[id];
      insist(a?.regionId===proof.regionId&&a.judgement?.teacherConfirmed===true&&
        a.timer?.phase==='RESOLVED','REGION_COMPLETION_INVALID','완료 기록에 잘못된 문제 시도가 있습니다.');
    }
    insist(s.rewards.ledger.some(x=>x.type==='KEY_EARN'&&x.regionId===proof.regionId&&
      x.claim===`REGION_KEY:${proof.regionId}`&&x.eventId===proof.eventId&&x.at===proof.at),
      'REGION_KEY_MISSING','지역 완료의 최초 열쇠 지급 기록이 없습니다.');
    seen.add(proof.regionId);
  }
  for(const [id,r] of Object.entries(w.regions)){
    if(r.status==='COMPLETED')insist(seen.has(id),'REGION_COMPLETION_INVALID','완료 지역에 원본 완료 이벤트가 없습니다.');
    if(r.status==='IN_PROGRESS')insist(w.visitHistory.some(v=>v.regionId===id),'REGION_HISTORY_INVALID','진행 중 지역에 방문 기록이 없습니다.');
    if(r.status==='AVAILABLE'){
      const pos=findPosition(s,id);
      const x=pos.index===1||pos.index===2;
      const extraAvailable=x&&completed(s,pos.theme.regionIds[4])&&
        branchChosen(s,pos.theme)!==branchFor(pos.index);
      insist(nextInMain(s,pos,id)||extraAvailable,'REGION_UNLOCK_INVALID','지역 해금 기록과 선행 방문 조건이 충돌합니다.');
    }
  }
  const keys=s.rewards.ledger.filter(x=>x.type==='KEY_EARN');
  insist(keys.length===seen.size&&s.rewards.keys===seen.size,
    'REGION_KEY_INVALID','최초 완료 지역 수와 열쇠 장부/잔액이 다릅니다.');
  if(w.additionalExplorationReturn){
    const x=w.additionalExplorationReturn,ev=events.get(x.startedEventId);
    insist(ev?.type==='EXTRA_EXPLORATION_STARTED'&&ev.payload.regionId===x.regionId&&
      ev.at===x.startedAt&&w.regions[x.regionId]?.status!=='LOCKED'&&
      findPosition(s,x.regionId).theme.id===x.themeId&&
      (!x.fromRegionId||completed(s,x.fromRegionId)),
      'EXTRA_HISTORY_INVALID','추가 탐험 복귀점/이력이 손상되었습니다.');
  }
  for(const x of w.quotaHistory??[]){
    const ev=events.get(x.eventId);
    insist(ev?.type==='REGION_QUOTA_SET'&&ev.payload.regionId===x.regionId&&
      ev.payload.baseQuota===x.baseQuota&&ev.at===x.at,
      'REGION_QUOTA_INVALID','문제 수 변경 장부가 손상되었습니다.');
  }
  return s;
}
