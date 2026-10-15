/** PHASE 2-5: interception + recovery. Node and fake-IDB tests, NOT browser PASS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {planQuestionDraw,listRecoveryCandidates,inspectDrawPool} from '../src/questions/draw.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {verifyBackup} from '../src/storage/backup.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
const qe=createQuestionEngine(pack);
let serial=0;const id=()=>`p25-${++serial}`;const T=1_831_000_000_000;
const act=(s,type,payload={},delta=1,eventId=id())=>reduceCommand(s,{type,payload,eventId,at:s.meta.updatedAt+delta}).state;
const code=(fn,expected)=>assert.throws(fn,e=>e.code===expected,`expected ${expected}`);
const reject=(promise,expected)=>assert.rejects(promise,e=>e.code===expected,`expected ${expected}`);
const copy=v=>structuredClone(v);
function init({teamCount=4,slot=1}={}){
  let s=newExpedition({slot,world,expeditionId:id(),createdAt:T,teamCount});
  s=act(s,'EXPEDITION_CREATED');s=act(s,'SESSION_STARTED',{sessionId:id()});return s;
}
function addMember(s,teamId,memberId,name){return act(s,'TEAM_MEMBER_ADDED',{teamId,memberId,name,teacherConfirmed:true});}
function wrong(s,{teamId='TEAM_01',regionId='T1-R1'}={}){
  const attemptId=id(),at=s.meta.updatedAt+1;
  const draw=planQuestionDraw(s,qe,{regionId,teamId,attemptId,at,random:()=>0});
  s=act(s,'QUESTION_DRAWN',draw);s=act(s,'TIMER_STARTED');
  const q=pack.questions.find(x=>x.id===draw.questionId);
  const response=q.type==='single_choice'?q.options.find(x=>x.key!==q.answer.correct[0]).key:
    q.type==='true_false'?!q.answer.correct:'명백히 다른 내용';
  s=act(s,'ANSWER_SUBMITTED',{attemptId,response});
  s=act(s,'ANSWER_JUDGED',{attemptId,decision:'INCORRECT',teacherConfirmed:true,
    teacherReason:'교사가 원답안을 직접 확인하여 오답으로 확정'});
  return {state:s,attemptId,questionId:draw.questionId};
}
function rightAnswer(s){
  const origin=s.attempts[s.activeAttemptId];
  const original=pack.questions.find(x=>x.id===origin.questionId);
  switch(original.type){
    case 'single_choice':return original.answer.correct[0];
    case 'true_false':return original.answer.correct;
    case 'matching':return copy(original.answer.pairs);
    case 'ordering':return copy(original.answer.order);
    case 'categorization':return copy(original.answer.assignments);
    case 'short_text':return original.answer.accepted[0];
    case 'manual':return '학생이 이유와 사례를 제시하고 학습한 개념을 정확하게 설명하였습니다.';
  }
}
const first=s=>s.recovery.pending[0];
const intercept=(s,targetTeamId='TEAM_02')=>act(s,'INTERCEPTION_OPENED',{
  sourceAttemptId:s.activeAttemptId,targetTeamId,interceptionId:id(),teacherConfirmed:true
});
const activeI=s=>s.interception.records.find(x=>x.id===s.interception.activeId);
const iAct=(s,type,p={})=>act(s,type,{interceptionId:s.interception.activeId,teacherConfirmed:true,...p});
const openRecovery=(s,{recoveryId=first(s).id,teamId='TEAM_01',mode='FORCED',regionId='T1-R1',reason='교사의 보충 회수 진행'}={})=>act(s,'RECOVERY_CALLED',{
  recoveryId,runId:id(),teamId,mode,regionId,reason,teacherConfirmed:true
});
const activeR=s=>s.recovery.pending.find(x=>x.id===s.recovery.activeId);
const runningR=s=>activeR(s).runs.find(x=>x.id===activeR(s).activeRunId);
const rAct=(s,type,p={})=>act(s,type,{recoveryId:s.recovery.activeId,runId:runningR(s).id,teacherConfirmed:true,...p});

// Interception: one opportunity per origin, never changes original wrong/recovery.
test('기본 오답: 회수 대기, 원문제 신분·원모둠·지역 보존',()=>{
  const {state:s,attemptId,questionId}=wrong(init());
  assert.equal(first(s).sourceAttemptId,attemptId);
  assert.equal(first(s).originTeamId,'TEAM_01');assert.equal(first(s).questionId,questionId);
  assert.deepEqual(s.questions.recoveryOnlyIds,[questionId]);
  assert.equal(s.rewards.starlight,0);assert.equal(s.rewards.keys,0);checkState(s);
});
test('가로채기 생성: 원모둠 제외, 교사 확인, 미확정 시도 거부',()=>{
  let s=wrong(init()).state;
  code(()=>act(s,'INTERCEPTION_OPENED',{sourceAttemptId:s.activeAttemptId,targetTeamId:'TEAM_02',interceptionId:id()}),'TEACHER_REQUIRED');
  code(()=>intercept(s,'TEAM_01'),'INTERCEPTION_ORIGIN_TEAM');
  s=intercept(s);assert.equal(activeI(s).targetTeamId,'TEAM_02');
  assert.equal(activeI(s).questionSnapshot.questionId,s.attempts[s.activeAttemptId].questionId);
  code(()=>intercept(s,'TEAM_03'),'SIDE_MISSION_ACTIVE');checkState(s);
});
test('가로채기 정답 성공해도 원모둠 회수 대기·최초 정답 별빛1',()=>{
  let s=wrong(init()).state;const before=copy(s.attempts[s.activeAttemptId]);s=intercept(s);
  s=iAct(s,'INTERCEPTION_TIMER_STARTED');
  s=iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s)});
  s=iAct(s,'INTERCEPTION_JUDGED',{decision:'CORRECT',teacherReason:'교사 재확인'});
  assert.equal(s.interception.activeId,null);
  const record=s.interception.records[0];assert.equal(record.status,'RESOLVED');
  assert.equal(record.judgement.decision,'CORRECT');assert.equal(record.judgement.solverTeamId,'TEAM_02');
  assert.deepEqual(s.attempts[before.id],before);
  assert.equal(s.recovery.pending.length,1);assert.equal(first(s).originTeamId,'TEAM_01');
  assert.deepEqual(s.questions.recoveryOnlyIds,[before.questionId]);
  assert.equal(s.rewards.starlight,1);assert.equal(s.rewards.keys,0);checkState(s);
});
test('동일 원문제는 두 번째 가로채기·생략 추가 불가',()=>{
  let s=wrong(init()).state;s=intercept(s);s=iAct(s,'INTERCEPTION_FORFEITED',{reason:'타모둠 포기'});
  code(()=>intercept(s,'TEAM_03'),'INTERCEPTION_ALREADY_USED');
  code(()=>act(s,'INTERCEPTION_SKIPPED',{sourceAttemptId:s.activeAttemptId,reason:'시간 부족',teacherConfirmed:true}),'INTERCEPTION_ALREADY_USED');
});
test('교사가 가로채기 생략하면 감사 기록 및 원모둠 회수만 유지',()=>{
  let s=wrong(init()).state;s=act(s,'INTERCEPTION_SKIPPED',{sourceAttemptId:s.activeAttemptId,teacherConfirmed:true,reason:'남은 수업 시간이 부족함'});
  assert.equal(s.interception.records[0].status,'SKIPPED');
  assert.equal(s.interception.lastTeamId,null);assert.equal(s.recovery.pending.length,1);
  code(()=>intercept(s),'INTERCEPTION_ALREADY_USED');checkState(s);
});
test('교사의 원답 판정 전에는 가로채기 불가',()=>{
  let s=init();const at=s.meta.updatedAt+1;
  const p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at,random:()=>0});
  s=act(s,'QUESTION_DRAWN',p);code(()=>intercept(s),'ATTEMPT_ACTIVE');
});
test('동일 모둠 연속 가로채기 제한',()=>{
  let s=wrong(init()).state;s=intercept(s,'TEAM_02');s=iAct(s,'INTERCEPTION_FORFEITED',{reason:'정답 기회를 포기'});
  let p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at:s.meta.updatedAt+1,random:()=>0});
  s=act(s,'QUESTION_DRAWN',p);s=act(s,'TIMER_STARTED');s=act(s,'TIMER_PAUSED');
  s=act(s,'ANSWER_JUDGED',{attemptId:s.activeAttemptId,decision:'INCORRECT',teacherConfirmed:true,missingResponseConfirmed:true,teacherReason:'명시적 포기'});
  code(()=>intercept(s,'TEAM_02'),'INTERCEPTION_CONSECUTIVE');
  s=intercept(s,'TEAM_03');assert.equal(activeI(s).targetTeamId,'TEAM_03');checkState(s);
});
test('가로채기 중 새 출제·명단 수정·차시 종료·화면 이동 모두 차단',()=>{
  let s=wrong(init()).state;s=intercept(s);
  code(()=>act(s,'QUESTION_DRAWN',{foo:1}),'SIDE_MISSION_ACTIVE');
  code(()=>act(s,'TEAM_RENAMED',{teamId:'TEAM_01',name:'변경',teacherConfirmed:true}),'ROSTER_CHANGE_DURING_ATTEMPT');
  code(()=>act(s,'SESSION_ENDED'),'SIDE_MISSION_ACTIVE');
  code(()=>act(s,'SCREEN_CHANGED',{screen:'HOME'}),'SIDE_MISSION_ACTIVE');
});
test('가로채기 시간 1ms 전 접수 허용, 0ms 거절, 자동 오답 없음',()=>{
  let s=intercept(wrong(init()).state);s=iAct(s,'INTERCEPTION_TIMER_STARTED');
  const a=activeI(s);
  const before=act(s,'INTERCEPTION_ANSWER_SUBMITTED',{interceptionId:a.id,teacherConfirmed:true,response:rightAnswer(s)},59999);
  assert.equal(activeI(before).timer.remainingMs,1);
  code(()=>act(s,'INTERCEPTION_ANSWER_SUBMITTED',{interceptionId:a.id,teacherConfirmed:true,response:rightAnswer(s)},60000),'TIMER_DEADLINE');
  s=act(s,'INTERCEPTION_TIMER_EXPIRED',{interceptionId:a.id,teacherConfirmed:true},60000);
  assert.equal(activeI(s).judgement,null);assert.equal(s.recovery.pending.length,1);
});
test('가로채기 만료 후 답변은 교사 사유를 요구',()=>{
  let s=intercept(wrong(init()).state);s=iAct(s,'INTERCEPTION_TIMER_STARTED');s=act(s,'INTERCEPTION_TIMER_EXPIRED',{interceptionId:s.interception.activeId,teacherConfirmed:true},60000);
  code(()=>iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s)}),'REASON_REQUIRED');
  s=iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s),lateReason:'프로젝터 오류 지연'});
  assert.equal(activeI(s).answer.afterExpiry,true);checkState(s);
});
test('가로채기 타이머 일시정지/재개/다시 접수',()=>{
  let s=intercept(wrong(init()).state);
  s=iAct(s,'INTERCEPTION_TIMER_STARTED');s=iAct(s,'INTERCEPTION_TIMER_PAUSED');
  s=iAct(s,'INTERCEPTION_TIMER_RESUMED');s=iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s)});
  assert.equal(activeI(s).timer.phase,'PAUSED');
  code(()=>iAct(s,'INTERCEPTION_TIMER_RESUMED'),'ANSWER_ALREADY_SUBMITTED');
});
test('가로채기 학생은 대상 모둠의 해당 시점 출석자만 허용',()=>{
  let s=init();s=addMember(s,'TEAM_02','student-t2','두모둠학생');s=wrong(s).state;s=intercept(s);
  s=iAct(s,'INTERCEPTION_TIMER_STARTED');
  code(()=>iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s),solverMemberId:'student-out'}),'SOLVER_NOT_IN_TEAM');
  s=iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s),solverMemberId:'student-t2'});
  s=iAct(s,'INTERCEPTION_JUDGED',{decision:'CORRECT',solverMemberId:'student-t2'});
  assert.equal(s.interception.records[0].judgement.solverMemberId,'student-t2');checkState(s);
});
test('가로채기 성공 이후 명단 이동에도 해결자/원모둠 이력 불변',()=>{
  let s=init();s=addMember(s,'TEAM_02','p2','참여자');s=wrong(s).state;s=intercept(s);
  s=iAct(s,'INTERCEPTION_TIMER_STARTED');s=iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s),solverMemberId:'p2'});
  s=iAct(s,'INTERCEPTION_JUDGED',{decision:'CORRECT'});const saved=copy(s.interception.records[0]);
  s=act(s,'TEAM_MEMBER_MOVED',{memberId:'p2',fromTeamId:'TEAM_02',toTeamId:'TEAM_03',teacherConfirmed:true});
  assert.deepEqual(s.interception.records[0],saved);assert.equal(s.interception.records[0].originTeamId,'TEAM_01');checkState(s);
});
// Recovery: held state, natural gating, origin-first, alternate after failure.
test('오답 회수 자연 호출: 지역 방문 순서가 없으면 보류, 강제 호출만 허용',()=>{
  let s=wrong(init()).state;
  code(()=>openRecovery(s,{mode:'NATURAL',regionId:'T1-R2'}),'RECOVERY_TOO_EARLY');
  s=openRecovery(s);assert.equal(activeR(s).status,'ACTIVE');
  assert.equal(runningR(s).mode,'FORCED');
  assert.equal(runningR(s).targetRoster.teamId,'TEAM_01');checkState(s);
});
test('지역 방문 이력이 확인되어야 다음 지역 자연 회수 호출 가능',()=>{
  let s=wrong(init()).state;
  s.world.regionEntryOrder=['T1-R1','T1-R2'];
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R2'}).length,1);
  s=openRecovery(s,{mode:'NATURAL',regionId:'T1-R2'});
  assert.equal(runningR(s).mode,'NATURAL');checkState(s);
});
test('원모둠 우선: 첫 회수에서 타모둠 호출 차단',()=>{
  const s=wrong(init()).state;
  code(()=>openRecovery(s,{teamId:'TEAM_02'}),'RECOVERY_ORIGIN_PRIORITY');
});
test('원모둠 포기 사유 기록 후에만 첫 타모둠 회수 허용',()=>{
  let s=wrong(init()).state;const idr=first(s).id;
  code(()=>act(s,'RECOVERY_ORIGIN_FORFEITED',{recoveryId:idr,teacherConfirmed:true}),'REASON_REQUIRED');
  s=act(s,'RECOVERY_ORIGIN_FORFEITED',{recoveryId:idr,teacherConfirmed:true,reason:'결석으로 회수 포기'});
  s=openRecovery(s,{teamId:'TEAM_02'});
  assert.equal(runningR(s).teamId,'TEAM_02');checkState(s);
});
test('교사 보류·해제·강제 호출, 보류 중 자연 호출 차단',()=>{
  let s=wrong(init()).state;const idr=first(s).id;
  s=act(s,'RECOVERY_DEFERRED',{recoveryId:idr,teacherConfirmed:true,reason:'수업 상황'});
  assert.equal(first(s).status,'HELD');
  code(()=>openRecovery(s,{mode:'NATURAL',regionId:'T1-R2'}),'RECOVERY_HELD');
  s=act(s,'RECOVERY_RELEASED',{recoveryId:idr,teacherConfirmed:true});
  assert.equal(first(s).status,'PENDING');s=openRecovery(s);
  assert.equal(activeR(s).status,'ACTIVE');checkState(s);
});
test('보류된 회수는 강제 호출 사유가 있어야 진행',()=>{
  let s=wrong(init()).state;const idr=first(s).id;
  s=act(s,'RECOVERY_DEFERRED',{recoveryId:idr,teacherConfirmed:true,reason:'다음 시간까지'});
  code(()=>openRecovery(s,{reason:''}),'REASON_REQUIRED');
  s=openRecovery(s);assert.equal(activeR(s).status,'ACTIVE');
});
test('원모둠 회수 정답: 회수 전용 제거/복습 등록/별빛 +1',()=>{
  let s=wrong(init()).state,questionId=first(s).questionId;
  s=openRecovery(s);s=rAct(s,'RECOVERY_TIMER_STARTED');
  s=rAct(s,'RECOVERY_ANSWER_SUBMITTED',{response:rightAnswer(s)});
  s=rAct(s,'RECOVERY_JUDGED',{decision:'CORRECT',teacherReason:'교사 확인'});
  assert.equal(s.recovery.pending.length,0);assert.equal(s.recovery.resolved.length,1);
  const success=s.recovery.resolved[0];assert.equal(success.solverTeamId,'TEAM_01');
  assert.equal(success.originTeamId,'TEAM_01');assert.equal(success.questionId,questionId);
  assert.equal(s.questions.recoveryOnlyIds.includes(questionId),false);
  assert.equal(s.questions.reviewEligibleIds.includes(questionId),true);
  assert.equal(s.rewards.starlight,1);assert.equal(s.rewards.keys,0);checkState(s);
});
test('회수 첫 실패 후 원모둠 재회수 차단, 타모둠 재시도',()=>{
  let s=wrong(init()).state;s=openRecovery(s);s=rAct(s,'RECOVERY_TIMER_STARTED');
  s=rAct(s,'RECOVERY_ANSWER_SUBMITTED',{response:pack.questions.find(q=>q.id===first(s).questionId).options.find(o=>o.key!==pack.questions.find(q=>q.id===first(s).questionId).answer.correct[0]).key});
  s=rAct(s,'RECOVERY_JUDGED',{decision:'INCORRECT',teacherReason:'오답 설명'});
  assert.equal(first(s).status,'PENDING');assert.equal(first(s).runs.length,1);
  code(()=>openRecovery(s,{teamId:'TEAM_01'}),'RECOVERY_ALTERNATE_TEAM');
  s=openRecovery(s,{teamId:'TEAM_02'});
  assert.equal(runningR(s).teamId,'TEAM_02');checkState(s);
});
test('회수 첫 포기 -> 타모둠 해결 시 원래 회수 주체 보존',()=>{
  let s=wrong(init()).state;
  s=openRecovery(s);s=rAct(s,'RECOVERY_FORFEITED',{reason:'원모둠이 포기함'});
  s=openRecovery(s,{teamId:'TEAM_02'});s=rAct(s,'RECOVERY_TIMER_STARTED');
  s=rAct(s,'RECOVERY_ANSWER_SUBMITTED',{response:rightAnswer(s)});
  s=rAct(s,'RECOVERY_JUDGED',{decision:'CORRECT'});
  const r=s.recovery.resolved[0];assert.equal(r.originTeamId,'TEAM_01');assert.equal(r.solverTeamId,'TEAM_02');
  assert.equal(r.runs.length,2);assert.equal(r.runs[0].forfeited.reason,'원모둠이 포기함');checkState(s);
});
test('회수 타이머 1ms 잔여 제출/0ms 만료 처리',()=>{
  let s=openRecovery(wrong(init()).state);s=rAct(s,'RECOVERY_TIMER_STARTED');
  const p={recoveryId:activeR(s).id,runId:runningR(s).id,teacherConfirmed:true,response:rightAnswer(s)};
  const before=act(s,'RECOVERY_ANSWER_SUBMITTED',p,59999);assert.equal(runningR(before).timer.remainingMs,1);
  code(()=>act(s,'RECOVERY_ANSWER_SUBMITTED',p,60000),'TIMER_DEADLINE');
  s=act(s,'RECOVERY_TIMER_EXPIRED',{recoveryId:activeR(s).id,runId:runningR(s).id,teacherConfirmed:true},60000);
  assert.equal(activeR(s).status,'ACTIVE');assert.equal(runningR(s).judgement,null);
});
test('회수 진행 중 새 일반 출제·명단 변경·다른 회수 호출 금지',()=>{
  let s=openRecovery(wrong(init()).state);
  code(()=>act(s,'QUESTION_DRAWN',{dummy:true}),'SIDE_MISSION_ACTIVE');
  code(()=>act(s,'TEAM_RENAMED',{teamId:'TEAM_02',name:'지금 변경',teacherConfirmed:true}),'ROSTER_CHANGE_DURING_ATTEMPT');
  code(()=>openRecovery(s),'RECOVERY_ACTIVE');
});
test('교사 차시 일시정지 및 복원 이벤트는 회수 타이머를 정지',()=>{
  let s=openRecovery(wrong(init()).state);s=rAct(s,'RECOVERY_TIMER_STARTED');
  s=act(s,'SESSION_PAUSED');assert.equal(runningR(s).timer.phase,'PAUSED');
  s=act(s,'SESSION_RESUMED');s=rAct(s,'RECOVERY_TIMER_RESUMED');
  s=act(s,'RECOVER_INTERRUPTED',{reason:'REOPEN'});
  assert.equal(runningR(s).timer.phase,'PAUSED');checkState(s);
});
test('학생 공개 데이터에는 원문제 정답·회수 대상·학생 고유ID·교사 판정 없음',()=>{
  let s=init();s=addMember(s,'TEAM_02','private-student','개인 이름');s=wrong(s).state;s=intercept(s);
  const text=JSON.stringify(publicProjection(s,s.meta.updatedAt));
  for(const leak of ['private-student','개인 이름','questionSnapshot','originTeamId','recovery','judgement','correct','answer','audit']){
    assert.equal(text.includes(leak),false,leak);
  }
});
test('가로채기 장부 변조: 원모둠/활성 포인터 검출',()=>{
  let s=intercept(wrong(init()).state),broken=copy(s);
  broken.interception.records[0].originTeamId='TEAM_04';code(()=>checkState(broken),'SIDE_MISSION_INVALID');
  broken=copy(s);broken.interception.activeId=null;code(()=>checkState(broken),'SIDE_MISSION_INVALID');
});
test('회수 장부 변조: 원모둠/질문ID/활성 포인터 검출',()=>{
  let s=openRecovery(wrong(init()).state),broken=copy(s);
  broken.recovery.pending[0].originTeamId='TEAM_03';code(()=>checkState(broken),'RECOVERY_INVALID');
  broken=copy(s);broken.recovery.activeId=null;code(()=>checkState(broken),'RECOVERY_INVALID');
});
test('동일 이벤트 ID 동일 payload 멱등, 다른 payload 차단',()=>{
  let s=wrong(init()).state;
  const p={sourceAttemptId:s.activeAttemptId,targetTeamId:'TEAM_02',interceptionId:id(),teacherConfirmed:true};
  const eventId=id();const c={type:'INTERCEPTION_OPENED',eventId,payload:p,at:s.meta.updatedAt+1};
  const once=reduceCommand(s,c).state;const again=reduceCommand(once,c);
  assert.equal(again.duplicate,true);assert.strictEqual(again.state,once);
  code(()=>reduceCommand(once,{...c,payload:{...p,targetTeamId:'TEAM_03'}}),'EVENT_ID_CONFLICT');
});
test('모의 IndexedDB: 3슬롯 저장 실패 뒤 회수 시작·판정 전체 롤백',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>T+10000+serial});
  const clock=()=>T+10000+serial,teacher=new TeacherEngineSession(store,{clock,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:id()});
  const s=teacher.getState();assert.equal(s.recovery.pending.length,0);
  // FakeDB's failNext transaction hook is exercised by existing PHASE 1/2-4 tests.
  assert.equal(s.rewards.starlight,0);await teacher.close();
});

test('모의 DB 원시 거래: 가로채기·회수 강제 호출 모두 실패 시 원자 롤백 후 동일 ID 재시도',async()=>{
  let tick=T+100_000;const nid=()=>`p25-db-${++serial}`;
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>tick});
  const t=new TeacherEngineSession(store,{clock:()=>tick,newId:nid,heartbeatMs:0});
  await t.create({slot:1,world});tick++;await t.dispatch('SESSION_STARTED',{sessionId:'s1'});
  tick++;const issue=await t.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  tick++;await t.dispatch('TIMER_STARTED');
  const rawq=pack.questions.find(x=>x.id===issue.questionId);
  const invalid=rawq.type==='single_choice'?rawq.options.find(x=>x.key!==rawq.answer.correct[0]).key:
    rawq.type==='true_false'?!rawq.answer.correct:null;
  tick++;
  if(invalid!==null)await t.submitAnswer({attemptId:issue.attemptId,response:invalid});
  else await t.dispatch('TIMER_PAUSED');
  tick++;
  await t.judgeAnswer({attemptId:issue.attemptId,decision:'INCORRECT',teacherConfirmed:true,
    missingResponseConfirmed:invalid===null,teacherReason:'교사 최종 오답 확인'});
  const previous=t.getState(),eid='p25-stable-opening',interceptionId='p25-stable-interception';
  db.failNextWrite=true;tick++;
  await assert.rejects(t.openInterception({sourceAttemptId:issue.attemptId,targetTeamId:'TEAM_02',interceptionId},{eventId:eid}),
    e=>e.name==='QuotaExceededError');
  assert.deepEqual(t.getState(),previous);
  assert.equal(db.inspect('slots',1).state.meta.revision,previous.meta.revision);
  assert.equal(db.inspect('checkpoints','1:latest').revision,previous.meta.revision);
  tick++;
  const opened=await t.openInterception({sourceAttemptId:issue.attemptId,targetTeamId:'TEAM_02',interceptionId},{eventId:eid});
  assert.equal(opened.committed,true);
  const repeat=await t.openInterception({sourceAttemptId:issue.attemptId,targetTeamId:'TEAM_02',interceptionId},{eventId:eid});
  assert.equal(repeat.duplicate,true);assert.equal(t.getState().interception.records.length,1);
  tick++;await t.controlInterception('INTERCEPTION_FORFEITED',{interceptionId,reason:'재시도 테스트 종료'});
  const rId=t.getState().recovery.pending[0].id,runId='p25-stable-run';
  const before=t.getState();db.failNextWrite=true;tick++;
  await assert.rejects(t.controlRecovery('RECOVERY_CALLED',{recoveryId:rId,runId,teamId:'TEAM_01',regionId:'T1-R1',mode:'FORCED',reason:'교사 회수 호출'}),e=>e.name==='QuotaExceededError');
  assert.deepEqual(t.getState(),before);
  tick++;await t.controlRecovery('RECOVERY_CALLED',{recoveryId:rId,runId,teamId:'TEAM_01',regionId:'T1-R1',mode:'FORCED',reason:'교사 회수 호출'});
  assert.equal(t.getState().recovery.activeId,rId);
  await t.close();
});

test('모의 저장·내보내기·복원 후 활성 가로채기는 자동 재개 없이 정지',async()=>{
  let clockVal=T+300_000;
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>clockVal});
  const t=new TeacherEngineSession(store,{clock:()=>clockVal,newId:id,heartbeatMs:0});
  await t.create({slot:1,world});clockVal++;await t.dispatch('SESSION_STARTED',{sessionId:id()});
  clockVal++;const issue=await t.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  clockVal++;await t.dispatch('TIMER_STARTED');
  clockVal++;await t.dispatch('TIMER_PAUSED');
  clockVal++;await t.judgeAnswer({attemptId:issue.attemptId,decision:'INCORRECT',teacherConfirmed:true,
    missingResponseConfirmed:true,teacherReason:'원모둠의 문제 포기'});
  clockVal++;await t.openInterception({sourceAttemptId:issue.attemptId,targetTeamId:'TEAM_02'});
  const iid=t.getState().interception.activeId;
  clockVal++;await t.controlInterception('INTERCEPTION_TIMER_STARTED',{interceptionId:iid});
  assert.equal(t.getState().interception.records[0].timer.phase,'RUNNING');
  const backup=await t.exportJSON();const decoded=await verifyBackup(backup);
  assert.equal(decoded.state.interception.records[0].timer.phase,'RUNNING');
  await t.close();
  const db2=new FakeDatabase(),store2=new IndexedDbExpeditionStore(db2,{clock:()=>clockVal+100});
  const t2=new TeacherEngineSession(store2,{clock:()=>clockVal+100,newId:id,heartbeatMs:0});
  await t2.restoreJSONToEmptySlot(1,backup);
  const s=t2.getState();assert.equal(s.interception.records[0].timer.phase,'PAUSED');
  assert.equal(s.sessions.find(x=>x.id===s.activeSessionId).phase,'PAUSED');
  assert.equal(s.recovery.pending.length,1);checkState(s);
  await t2.close();
});

test('모의 DB 재접속: 실행 중 회수미션 타이머를 교사 재개 전 정지',async()=>{
  let clockVal=T+500_000;
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>clockVal});
  const teacher=new TeacherEngineSession(store,{clock:()=>clockVal,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});clockVal++;await teacher.dispatch('SESSION_STARTED',{sessionId:id()});
  clockVal++;const d=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  clockVal++;await teacher.dispatch('TIMER_STARTED');clockVal++;await teacher.dispatch('TIMER_PAUSED');
  clockVal++;await teacher.judgeAnswer({attemptId:d.attemptId,decision:'INCORRECT',teacherConfirmed:true,
    missingResponseConfirmed:true,teacherReason:'시간 부족으로 미응답'});
  const rid=teacher.getState().recovery.pending[0].id;
  clockVal++;await teacher.controlRecovery('RECOVERY_CALLED',{recoveryId:rid,runId:id(),teamId:'TEAM_01',regionId:'T1-R1',mode:'FORCED',reason:'보충 회수'});
  const runId=teacher.getState().recovery.pending[0].activeRunId;
  clockVal++;await teacher.controlRecovery('RECOVERY_TIMER_STARTED',{recoveryId:rid,runId});
  assert.equal(teacher.getState().recovery.pending[0].runs.at(-1).timer.phase,'RUNNING');
  await teacher.close();
  const reopened=new TeacherEngineSession(store,{clock:()=>clockVal+50000,newId:id,heartbeatMs:0});
  await reopened.open(1);
  const state=reopened.getState();
  assert.equal(state.recovery.pending[0].runs.at(-1).timer.phase,'PAUSED');
  assert.equal(state.recovery.pending[0].status,'ACTIVE');
  assert.equal(state.sessions.find(x=>x.id===state.activeSessionId).phase,'PAUSED');
  await reopened.close();
});

test('가로채기·회수 시도에서 중복 판정 및 이벤트 변조를 차단',()=>{
  let s=wrong(init()).state;s=intercept(s);s=iAct(s,'INTERCEPTION_TIMER_STARTED');
  s=iAct(s,'INTERCEPTION_ANSWER_SUBMITTED',{response:rightAnswer(s)});
  s=iAct(s,'INTERCEPTION_JUDGED',{decision:'CORRECT'});
  code(()=>act(s,'INTERCEPTION_JUDGED',{interceptionId:s.interception.records[0].id,teacherConfirmed:true,decision:'CORRECT'}),'INTERCEPTION_NOT_ACTIVE');
  let r=openRecovery(s);r=rAct(r,'RECOVERY_TIMER_STARTED');r=rAct(r,'RECOVERY_ANSWER_SUBMITTED',{response:rightAnswer(r)});
  r=rAct(r,'RECOVERY_JUDGED',{decision:'CORRECT'});
  const record=r.recovery.resolved[0];
  const altered=copy(r);altered.recovery.resolved[0].solverTeamId='TEAM_03';
  code(()=>checkState(altered),'RECOVERY_INVALID');
  assert.equal(record.runs.length,1);
  assert.equal(r.rewards.starlight,2); // 가로채기 최초 정답 1 + 회수 성공 1
});

test('학생 화면에는 미션 종류/대상 모둠/시간만 공개되고 정답·원오답 주체는 노출되지 않음',()=>{
  let s=intercept(wrong(init()).state);
  let out=publicProjection(s,s.meta.updatedAt);
  assert.deepEqual(out.mission,{kind:'INTERCEPTION',teamId:'TEAM_02',phase:'PREPARED',remainingMs:60000});
  assert.equal(JSON.stringify(out).includes('originTeamId'),false);
  s=iAct(s,'INTERCEPTION_FORFEITED',{reason:'참여 포기'});
  s=openRecovery(s);
  out=publicProjection(s,s.meta.updatedAt);
  assert.deepEqual(out.mission,{kind:'RECOVERY',teamId:'TEAM_01',phase:'PREPARED',remainingMs:60000});
  assert.equal(JSON.stringify(out).includes('questionSnapshot'),false);
});

test('CHECKPOINT_REPAIRED 한 이벤트에서 회수 타이머/차시를 안전 정지',()=>{
  let s=openRecovery(wrong(init()).state);
  s=rAct(s,'RECOVERY_TIMER_STARTED');
  const expectedRemaining=runningR(s).timer.remainingMs;
  s=act(s,'CHECKPOINT_REPAIRED',{teacherConfirmed:true,source:'previous'},10000);
  assert.equal(runningR(s).timer.phase,'PAUSED');
  assert.equal(runningR(s).timer.remainingMs,expectedRemaining);
  assert.equal(s.sessions.find(x=>x.id===s.activeSessionId).phase,'PAUSED');
  assert.equal(s.eventLog.at(-1).type,'CHECKPOINT_REPAIRED');
  checkState(s);
});

test('강제 호출 교사 미확인, 원모둠 미응답 판정 무단 우회 차단',()=>{
  let s=wrong(init()).state;
  code(()=>act(s,'RECOVERY_CALLED',{recoveryId:first(s).id,runId:id(),teamId:'TEAM_01',mode:'FORCED',regionId:'T1-R1',reason:'임의',teacherConfirmed:false}),'TEACHER_REQUIRED');
  s=openRecovery(s);s=rAct(s,'RECOVERY_TIMER_STARTED');
  code(()=>rAct(s,'RECOVERY_JUDGED',{decision:'CORRECT',missingResponseConfirmed:true,teacherReason:'근거 불충분'}),'NO_ANSWER_CONFIRMATION');
  code(()=>rAct(s,'RECOVERY_JUDGED',{decision:'INCORRECT',missingResponseConfirmed:false,teacherReason:'미응답'}),'NO_ANSWER_CONFIRMATION');
  s=rAct(s,'RECOVERY_TIMER_PAUSED');
  s=rAct(s,'RECOVERY_JUDGED',{decision:'INCORRECT',missingResponseConfirmed:true,teacherReason:'교사가 미응답 확인'});
  assert.equal(first(s).status,'PENDING');checkState(s);
});

test('회수의 첫 성공 후 같은 recoveryId로 중복 호출 불가',()=>{
  let s=openRecovery(wrong(init()).state);s=rAct(s,'RECOVERY_TIMER_STARTED');
  s=rAct(s,'RECOVERY_ANSWER_SUBMITTED',{response:rightAnswer(s)});
  const rid=activeR(s).id;
  s=rAct(s,'RECOVERY_JUDGED',{decision:'CORRECT'});
  code(()=>openRecovery(s,{recoveryId:rid}),'RECOVERY_NOT_PENDING');
  assert.equal(s.recovery.resolved.length,1);checkState(s);
});
