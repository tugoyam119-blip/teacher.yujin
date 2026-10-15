/** PHASE 2-7 correction/compensating ledger — pure Node and Fake-IDB only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {planQuestionDraw,listRecoveryCandidates} from '../src/questions/draw.js';
import {effectiveDecision,effectiveEntitlements} from '../src/corrections/reconcile.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {makeBackup,verifyBackup} from '../src/storage/backup.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
const qe=createQuestionEngine(pack), BASE=1_834_000_000_000;
let counter=0;const id=()=>`p27-${++counter}`;
const copy=v=>structuredClone(v);
const run=(s,type,payload={},eventId=id(),delta=1)=>reduceCommand(s,{type,payload,eventId,at:s.meta.updatedAt+delta}).state;
const refuse=(f,code)=>assert.throws(f,e=>e.code===code,`Expected ${code}`);
function boot(){let s=newExpedition({slot:1,world,expeditionId:id(),createdAt:BASE});s=run(s,'EXPEDITION_CREATED');return run(s,'SESSION_STARTED',{sessionId:id()});}
function answer(q,correct){if(q.type==='single_choice')return correct?q.answer.correct[0]:q.options.find(o=>o.key!==q.answer.correct[0]).key;
  if(q.type==='true_false')return correct?q.answer.correct:!q.answer.correct;
  if(q.type==='ordering')return correct?copy(q.answer.order):['INVALID'];
  if(q.type==='matching')return correct?copy(q.answer.pairs):[['L1','FAKE']];
  if(q.type==='categorization')return correct?copy(q.answer.assignments):{};
  if(q.type==='short_text')return correct?q.answer.accepted[0]:'no match';
  return '해당 사회 개념을 바탕으로 근거와 사례를 제시한 서술 답변';}
function issue(s,{teamId='TEAM_01'}={}){const at=s.meta.updatedAt+1,attemptId=id();const p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId,attemptId,at,random:()=>0});return run(s,'QUESTION_DRAWN',p);}
function final(s,decision){s=run(s,'TIMER_STARTED');const a=s.attempts[s.activeAttemptId],q=pack.questions.find(q=>q.id===a.questionId);
  s=run(s,'ANSWER_SUBMITTED',{attemptId:a.id,response:answer(q,decision==='CORRECT')});
  return run(s,'ANSWER_JUDGED',{attemptId:a.id,decision,teacherConfirmed:true,teacherReason:'원본문항 교사 검증'});}
const good=(s=boot(),teamId='TEAM_01')=>final(issue(s,{teamId}),'CORRECT');
const bad=(s=boot())=>final(issue(s),'INCORRECT');
const correction=(s,scope,targetId,decision,reason='교사가 기존 정답의 판정 근거를 다시 검증함',eventId=id())=>run(s,'JUDGEMENT_CORRECTED',{scope,targetId,decision,reason,teacherConfirmed:true},eventId);
function intercepted(s){const aid=s.activeAttemptId;s=run(s,'INTERCEPTION_OPENED',{sourceAttemptId:aid,interceptionId:id(),targetTeamId:'TEAM_02',teacherConfirmed:true});
 const iid=s.interception.activeId;s=run(s,'INTERCEPTION_TIMER_STARTED',{interceptionId:iid,teacherConfirmed:true});
 const q=pack.questions.find(q=>q.id===s.attempts[aid].questionId);
 s=run(s,'INTERCEPTION_ANSWER_SUBMITTED',{interceptionId:iid,response:answer(q,true),teacherConfirmed:true});
 return run(s,'INTERCEPTION_JUDGED',{interceptionId:iid,decision:'CORRECT',teacherConfirmed:true});}
function recovered(s){const rid=s.recovery.pending.find(x=>x.status==='PENDING').id,runId=id();
 s=run(s,'RECOVERY_CALLED',{recoveryId:rid,runId,teamId:'TEAM_01',regionId:'T1-R1',mode:'FORCED',reason:'학습 결손 보완',teacherConfirmed:true});
 s=run(s,'RECOVERY_TIMER_STARTED',{recoveryId:rid,runId,teacherConfirmed:true});
 const q=pack.questions.find(q=>q.id===s.attempts[rid].questionId);
 s=run(s,'RECOVERY_ANSWER_SUBMITTED',{recoveryId:rid,runId,response:answer(q,true),teacherConfirmed:true});
 return run(s,'RECOVERY_JUDGED',{recoveryId:rid,runId,decision:'CORRECT',teacherConfirmed:true});}

// Baseline sources must be recorded immutably.
test('원오답 정정: 원판정/답안/타이머/학생 이력 불변, 정정 원장만 추가',()=>{
 let s=bad(),aid=s.activeAttemptId;const original=copy(s.attempts[aid]);s=correction(s,'ANSWER',aid,'CORRECT');
 assert.deepEqual(s.attempts[aid],original);assert.equal(effectiveDecision(s,'ANSWER',aid),'CORRECT');
 assert.equal(s.corrections.records.length,1);assert.equal(s.audit.at(-1).type,'JUDGEMENT_CORRECTED');checkState(s);
});
test('오답에서 정답으로: 원래 모둠 최초 정답 보상 +1, 미회수는 무효화되어 공개 회수 후보 제외',()=>{
 let s=bad(),aid=s.activeAttemptId,qid=s.attempts[aid].questionId;s=correction(s,'ANSWER',aid,'CORRECT');
 assert.equal(s.rewards.starlight,1);assert.equal(s.teams[0].contribution,1);
 assert.equal(s.recovery.pending[0].status,'INVALIDATED');assert.ok(!s.questions.recoveryOnlyIds.includes(qid));
 assert.ok(s.questions.reviewEligibleIds.includes(qid));
 assert.deepEqual(listRecoveryCandidates(s,{inRegionId:'T1-R1',force:true,teacherConfirmed:true}),[]);checkState(s);
});
test('정답에서 오답으로: 이전 적립을 감액, 복습 제외, 원모둠 회수 대상 생성 및 감사 보존',()=>{
 let s=good(),aid=s.activeAttemptId,qid=s.attempts[aid].questionId;s=correction(s,'ANSWER',aid,'INCORRECT');
 assert.equal(s.rewards.starlight,0);assert.equal(s.teams[0].contribution,0);
 assert.equal(s.rewards.ledger.length,2);assert.equal(s.rewards.ledger[0].type,'STAR_EARN');
 assert.equal(s.rewards.ledger[1].type,'STAR_ADJUST');assert.equal(s.rewards.ledger[1].amount,-1);
 assert.equal(s.recovery.pending[0].id,aid);assert.ok(s.questions.recoveryOnlyIds.includes(qid));
 assert.ok(!s.questions.reviewEligibleIds.includes(qid));checkState(s);
});
test('같은 판정 재정정·교사 확인 생략·근거 2자 미만·존재하지 않는 대상 거부',()=>{
 const s=bad(),aid=s.activeAttemptId,b=copy(s);
 refuse(()=>correction(s,'ANSWER',aid,'INCORRECT'),'CORRECTION_NO_CHANGE');
 refuse(()=>run(s,'JUDGEMENT_CORRECTED',{scope:'ANSWER',targetId:aid,decision:'CORRECT',reason:'유효한 재검토 사유',teacherConfirmed:false}),'TEACHER_REQUIRED');
 refuse(()=>correction(s,'ANSWER',aid,'CORRECT','짧음'),'CORRECTION_REASON_REQUIRED');
 refuse(()=>correction(s,'ANSWER','MISSING','CORRECT'),'CORRECTION_SOURCE_MISSING');
 assert.deepEqual(s,b);
});
test('같은 eventId/같은 내용 재시도는 멱등, 같은 ID 다른 판정은 EVENT_ID_CONFLICT',()=>{
 let s=bad(),aid=s.activeAttemptId;const eid=id(),payload={scope:'ANSWER',targetId:aid,decision:'CORRECT',reason:'원답 정정 재검토',teacherConfirmed:true};
 const evt={type:'JUDGEMENT_CORRECTED',eventId:eid,at:s.meta.updatedAt+1,payload};
 s=reduceCommand(s,evt).state;const count=s.eventLog.length;
 assert.equal(reduceCommand(s,evt).duplicate,true);assert.equal(s.eventLog.length,count);
 refuse(()=>reduceCommand(s,{...evt,payload:{...payload,decision:'INCORRECT'}}),'EVENT_ID_CONFLICT');checkState(s);
});
test('가로채기+회수 성공 후 원오답을 정답으로 정정: 가로채기 기여 회수, 회수별빛 무효, 원모둠으로 귀속',()=>{
 let s=recovered(intercepted(bad())),aid=s.activeAttemptId;
 assert.equal(s.rewards.starlight,2);const originalI=copy(s.interception.records),originalR=copy(s.recovery.resolved);
 s=correction(s,'ANSWER',aid,'CORRECT');
 assert.equal(s.rewards.starlight,1);assert.equal(s.teams[0].contribution,1);assert.equal(s.teams[1].contribution,0);
 assert.deepEqual(s.interception.records,originalI);assert.deepEqual(s.recovery.resolved,originalR);
 assert.equal(effectiveEntitlements(s).size,1);checkState(s);
});
test('가로채기 성공만 있었던 원오답 정정: 별빛 잔액 유지, 기여도는 실효 귀속팀 이동',()=>{
 let s=intercepted(bad()),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT');
 assert.equal(s.rewards.starlight,1);assert.deepEqual(s.teams.slice(0,2).map(t=>t.contribution),[1,0]);checkState(s);
});
test('원오답 정정 번복: 회수 대기 복귀, 최초 보상 원복, 감사 이벤트 2건 보존',()=>{
 let s=intercepted(bad()),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT');
 s=correction(s,'ANSWER',aid,'INCORRECT');
 assert.equal(s.recovery.pending[0].status,'PENDING');assert.equal(s.rewards.starlight,1);
 assert.deepEqual(s.teams.slice(0,2).map(x=>x.contribution),[0,1]);assert.equal(s.corrections.records.length,2);checkState(s);
});
test('이미 회수한 원오답을 CORRECT 후 INCORRECT로 번복: 원래 회수 기록·공헌 다시 유효',()=>{
 let s=recovered(intercepted(bad())),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT');
 s=correction(s,'ANSWER',aid,'INCORRECT');
 assert.equal(s.rewards.starlight,2);assert.equal(s.recovery.resolved.length,1);assert.equal(s.recovery.pending.length,0);
 assert.deepEqual(s.teams.slice(0,2).map(x=>x.contribution),[1,1]);checkState(s);
});
test('가로채기 성공 판정을 INCORRECT로 정정: 원오답 권리 유지, 가로채기만 보상 감액',()=>{
 let s=intercepted(bad()),iid=s.interception.records[0].id,aid=s.activeAttemptId;
 s=correction(s,'INTERCEPTION',iid,'INCORRECT');
 assert.equal(s.rewards.starlight,0);assert.equal(s.teams[1].contribution,0);
 assert.equal(s.attempts[aid].judgement.decision,'INCORRECT');assert.equal(s.recovery.pending.length,1);checkState(s);
});
test('가로채기 판정 번복: 첫 정답 보상 복원, 원본 가로채기 판정/학생 응답 그대로',()=>{
 let s=intercepted(bad()),iid=s.interception.records[0].id,old=copy(s.interception.records[0]);
 s=correction(s,'INTERCEPTION',iid,'INCORRECT');s=correction(s,'INTERCEPTION',iid,'CORRECT');
 assert.deepEqual(s.interception.records[0],old);assert.equal(s.rewards.starlight,1);
 assert.equal(s.teams[1].contribution,1);checkState(s);
});
test('회수 성공 판정 INCORRECT: 원회수 시도 보존하며 다시 미회수 후보로 복귀',()=>{
 let s=recovered(bad()),rid=s.recovery.resolved[0].id,runId=s.recovery.resolved[0].runs[0].id;
 const historical=copy(s.recovery.resolved[0].runs);
 s=correction(s,'RECOVERY',runId,'INCORRECT');
 assert.equal(s.rewards.starlight,0);assert.equal(s.recovery.pending[0].id,rid);
 assert.deepEqual(s.recovery.pending[0].runs,historical);assert.equal(s.recovery.resolved.length,0);
 assert.equal(s.teams[0].contribution,0);checkState(s);
});
test('회수 판정 INCORRECT→CORRECT로 정정 재역전: 기여/보상 복원 및 해결 기록 보존',()=>{
 let s=recovered(bad()),runId=s.recovery.resolved[0].runs[0].id;
 s=correction(s,'RECOVERY',runId,'INCORRECT');s=correction(s,'RECOVERY',runId,'CORRECT');
 assert.equal(s.recovery.resolved.length,1);assert.equal(s.recovery.pending.length,0);
 assert.equal(s.rewards.starlight,1);assert.equal(s.teams[0].contribution,1);checkState(s);
});
test('이미 소비한 별빛을 감액하면 음수 대신 정산 필요 금액을 표시·소비 차단',()=>{
 let s=good();s=good(s);s=good(s);s=run(s,'MAGIC_USED',{magicId:'STAR_COMPASS',regionId:'T1-R1',teacherConfirmed:true});
 assert.equal(s.rewards.starlight,0);const original=s.magic.used.length;
 const a=Object.values(s.attempts).find(a=>a.judgement?.decision==='CORRECT');
 s=correction(s,'ANSWER',a.id,'INCORRECT');
 assert.equal(s.rewards.starlight,0);assert.equal(s.rewards.settlementDue,1);
 assert.equal(s.rewards.settlementRequired,true);assert.equal(s.magic.used.length,original);
 s.magic.unlocked.push('HIDDEN_STAR_EYE');
 refuse(()=>run(s,'MAGIC_USED',{magicId:'HIDDEN_STAR_EYE',regionId:'T1-R1',teacherConfirmed:true}),'SETTLEMENT_REQUIRED');checkState(s);
});
test('정산 부족 회복: 유효한 정정 재역전으로 정산 해소·소비 내역 불변',()=>{
 let s=good();s=good(s);s=good(s);s=run(s,'MAGIC_USED',{magicId:'STAR_COMPASS',regionId:'T1-R1',teacherConfirmed:true});
 const a=Object.values(s.attempts).find(a=>a.judgement?.decision==='CORRECT');
 s=correction(s,'ANSWER',a.id,'INCORRECT');s=correction(s,'ANSWER',a.id,'CORRECT');
 assert.equal(s.rewards.settlementRequired,false);assert.equal(s.rewards.settlementDue,0);
 assert.equal(s.rewards.starlight,0);assert.equal(s.magic.used.length,1);checkState(s);
});
test('교사 정정 이벤트가 답안·원판정·정정 이유를 공개 정보로 보내지 않는다',()=>{
 let s=bad(),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT','교사 개인 메모 비공개');
 const pub=JSON.stringify(publicProjection(s,s.meta.updatedAt));
 for(const term of ['교사 개인 메모 비공개','CORRECT','INCORRECT','corrections','teacherReason','sourceAttemptId','settlementDue'])
   assert.equal(pub.includes(term),false,term);
});
for(const [label,mutate] of [
 ['정정 결정변조',s=>s.corrections.records[0].decision='INCORRECT'],
 ['정정 근거변조',s=>s.corrections.records[0].reason='전혀 다른 조작'],
 ['정정 원본 ID 위조',s=>s.corrections.records[0].sourceAttemptId='FAKE'],
 ['정정 별빛 장부 변조',s=>s.rewards.ledger.at(-1).amount=2],
 ['정정 모둠 기여도 위조',s=>s.teams[0].contribution++],
 ['정산 잔액 위조',s=>s.rewards.starlight++],
 ['정정 보상 감사 누락',s=>s.rewards.ledger.pop()],
]){
 test(`${label}: 저장 상태 무결성 검사에서 차단`,()=>{
  let s=bad(),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT');const forged=copy(s);mutate(forged);
  assert.throws(()=>checkState(forged),e=>Boolean(e.code));
 });
}
test('교정된 JSON 백업 roundtrip: 원답안·정정장부·별빛·모둠 기여 모두 보존',async()=>{
 let s=intercepted(bad()),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT');
 const backup=await makeBackup({state:s,events:s.eventLog});
 const restored=(await verifyBackup(JSON.stringify(backup))).state;
 assert.deepEqual(restored,s);assert.equal(restored.rewards.starlight,1);checkState(restored);
});
test('Fake IDB: 교사 정정 저장 실패시 메모리/이벤트/장부/체크포인트 전체 불변 후 동일 ID 재시도',async()=>{
 let now=BASE+100_000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>now});
 const teacher=new TeacherEngineSession(store,{clock:()=>now,newId:id,heartbeatMs:0});
 await teacher.create({slot:1,world});now++;await teacher.dispatch('SESSION_STARTED',{sessionId:id()});
 now++;await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
 now++;await teacher.dispatch('TIMER_STARTED');const a=teacher.getState().attempts[teacher.getState().activeAttemptId];
 const q=pack.questions.find(q=>q.id===a.questionId);
 now++;await teacher.submitAnswer({attemptId:a.id,response:answer(q,true)});
 now++;await teacher.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true,teacherReason:'원답 평가'});
 const before=teacher.getState(),eventId=id(),revision=before.meta.revision;
 db.failNextWrite=true;now++;
 await assert.rejects(teacher.correctJudgement({scope:'ANSWER',targetId:a.id,decision:'INCORRECT',reason:'교사 재검토 결과 수정'},{eventId}));
 assert.deepEqual(teacher.getState(),before);assert.deepEqual(db.inspect('slots',1).state,before);
 assert.equal(db.inspect('events',`1:${String(revision+1).padStart(12,'0')}`),undefined);
 const ok=await teacher.correctJudgement({scope:'ANSWER',targetId:a.id,decision:'INCORRECT',reason:'교사 재검토 결과 수정'},{eventId});
 assert.equal(ok.state.rewards.starlight,0);assert.equal(ok.state.corrections.records.length,1);
 const again=await teacher.correctJudgement({scope:'ANSWER',targetId:a.id,decision:'INCORRECT',reason:'교사 재검토 결과 수정'},{eventId});
 assert.equal(again.duplicate,true);assert.equal(teacher.getState().meta.revision,revision+1);
 await teacher.close();
});

test('회수 정답을 오답으로 정정한 뒤 타모둠이 실제 재도전 성공하면 별빛·공헌도는 새 해결자에게 귀속',()=>{
 let s=recovered(bad()),rid=s.recovery.resolved[0].id,oldRun=s.recovery.resolved[0].runs[0].id;
 s=correction(s,'RECOVERY',oldRun,'INCORRECT');
 assert.equal(s.recovery.pending[0].status,'PENDING');
 const newRunId=id();s=run(s,'RECOVERY_CALLED',{recoveryId:rid,runId:newRunId,teamId:'TEAM_02',regionId:'T1-R1',mode:'FORCED',reason:'직전 회수 판정 정정 후 재도전',teacherConfirmed:true});
 s=run(s,'RECOVERY_TIMER_STARTED',{recoveryId:rid,runId:newRunId,teacherConfirmed:true});
 const q=pack.questions.find(x=>x.id===s.attempts[rid].questionId);
 s=run(s,'RECOVERY_ANSWER_SUBMITTED',{recoveryId:rid,runId:newRunId,response:answer(q,true),teacherConfirmed:true});
 s=run(s,'RECOVERY_JUDGED',{recoveryId:rid,runId:newRunId,decision:'CORRECT',teacherConfirmed:true});
 assert.equal(s.rewards.starlight,1);assert.equal(s.teams[0].contribution,0);assert.equal(s.teams[1].contribution,1);
 assert.equal(s.recovery.resolved[0].runs.length,2);assert.equal(s.recovery.resolved[0].runs[0].judgement.decision,'CORRECT');
 checkState(s);
});
test('원정답 CORRECT→INCORRECT 정정 후 새 가로채기 성공은 이력과 기여를 정확하게 이관',()=>{
 let s=good(),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'INCORRECT');
 s=intercepted(s);
 assert.equal(s.interception.records[0].targetTeamId,'TEAM_02');
 assert.equal(s.rewards.starlight,1);assert.equal(s.teams[0].contribution,0);assert.equal(s.teams[1].contribution,1);
 checkState(s);
});
test('원오답 CORRECT 정정 후 회수 보류·강제호출은 무효 회수로 차단',()=>{
 let s=bad(),rid=s.recovery.pending[0].id;s=correction(s,'ANSWER',rid,'CORRECT');
 refuse(()=>run(s,'RECOVERY_DEFERRED',{recoveryId:rid,reason:'회수 보류',teacherConfirmed:true}),'RECOVERY_NOT_PENDING');
 refuse(()=>run(s,'RECOVERY_CALLED',{recoveryId:rid,runId:id(),teamId:'TEAM_01',regionId:'T1-R1',mode:'FORCED',reason:'정정 뒤 호출',teacherConfirmed:true}),'RECOVERY_HELD');
 checkState(s);
});
test('정정 단계가 2-6 보상 채굴을 허용하지 않음: 동일 문항 정답/오답 번복 10회',()=>{
 let s=bad(),aid=s.activeAttemptId;
 for(let i=0;i<10;i++){
   s=correction(s,'ANSWER',aid,i%2===0?'CORRECT':'INCORRECT');
   assert.ok(s.rewards.starlight<=1);assert.ok(s.teams[0].contribution<=1);
 }
 assert.equal(s.rewards.starlight,0);assert.equal(s.teams[0].contribution,0);
 assert.equal(s.corrections.records.length,10);assert.equal(s.rewards.ledger.filter(x=>x.type==='STAR_ADJUST').length,10);checkState(s);
});
test('원모둠 이전 명단 변경 뒤 정정해도 당시 모둠·원답안·해결자 스냅샷은 그대로',()=>{
 let s=bad(),aid=s.activeAttemptId,history=copy(s.attempts[aid]);
 s=run(s,'TEAM_MEMBER_ADDED',{teamId:'TEAM_01',memberId:'member-p27',name:'이름',status:'PRESENT',teacherConfirmed:true});
 s=run(s,'TEAM_MEMBER_MOVED',{memberId:'member-p27',fromTeamId:'TEAM_01',toTeamId:'TEAM_02',teacherConfirmed:true});
 s=correction(s,'ANSWER',aid,'CORRECT');
 assert.deepEqual(s.attempts[aid],history);assert.equal(s.teams[0].contribution,1);assert.equal(s.teams[1].contribution,0);checkState(s);
});
test('차시 중 새 일반문제가 미완료인 상황에서 과거 판정 정정 금지',()=>{
 let s=good(),aid=s.activeAttemptId;s=issue(s);
 refuse(()=>correction(s,'ANSWER',aid,'INCORRECT'),'CORRECTION_ATTEMPT_ACTIVE');checkState(s);
});
test('진행 중 회수/가로채기에서 정정하면 기존 가로채기 원기록을 지키며 차단',()=>{
 let s=bad(),aid=s.activeAttemptId;s=run(s,'INTERCEPTION_OPENED',{sourceAttemptId:aid,interceptionId:id(),targetTeamId:'TEAM_02',teacherConfirmed:true});
 refuse(()=>correction(s,'ANSWER',aid,'CORRECT'),'CORRECTION_MISSION_ACTIVE');checkState(s);
});
test('정정된 정상 상태의 JSON 백업을 변조하고 무결성 SHA 재계산해도 내부 불일치 탐지',async()=>{
 let s=bad(),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT');
 const backup=await makeBackup({state:s,events:s.eventLog});
 backup.state.teams[0].contribution=15;
 const {sha256}=await import('../src/storage/backup.js');
 const {integrity,...payload}=backup;backup.integrity.hex=await sha256(JSON.stringify(payload));
 await assert.rejects(verifyBackup(JSON.stringify(backup)),e=>Boolean(e.code));
});
test('정답→오답 정정으로 가로채기 성공 후 다시 정답으로 변경해도 역사적 가로채기 시도가 보존됨',()=>{
 let s=good(),aid=s.activeAttemptId;
 s=correction(s,'ANSWER',aid,'INCORRECT');s=intercepted(s);
 const historical=copy(s.interception.records);
 s=correction(s,'ANSWER',aid,'CORRECT');
 assert.deepEqual(s.interception.records,historical);assert.equal(s.rewards.starlight,1);
 assert.deepEqual(s.teams.slice(0,2).map(x=>x.contribution),[1,0]);checkState(s);
});
for(const flips of [1,2,3,4,5,8,11,20]){
 test(`원답 정정 ${flips}회 반복: 음수 별빛·중복 실효 보상 없이 마지막 유효 판정으로 귀속`,()=>{
  let s=good(),aid=s.activeAttemptId,base=copy(s.attempts[aid]);
  for(let k=0;k<flips;k++){
   s=correction(s,'ANSWER',aid,k%2===0?'INCORRECT':'CORRECT');
   assert.equal(s.rewards.starlight,k%2===0?0:1);
   assert.equal(s.teams[0].contribution,k%2===0?0:1);
  }
  assert.deepEqual(s.attempts[aid],base);
  assert.equal(s.corrections.records.length,flips);checkState(s);
 });
}
for(const invalid of ['UNKNOWN','ANSWERED','NULL']){
 test(`잘못된 정정 판정(${invalid})은 원본과 감사 원장을 그대로 유지하며 차단`,()=>{
  const s=good(),before=copy(s);refuse(()=>correction(s,'ANSWER',s.activeAttemptId,invalid),'CORRECTION_DECISION_INVALID');assert.deepEqual(s,before);
 });
}
for(const badScope of ['MULTI','PAYOUT','KEY']){
 test(`정정 scope ${badScope} 지원 안 함: 기록 변경 금지`,()=>{
  const s=good(),before=copy(s);refuse(()=>correction(s,badScope,s.activeAttemptId,'INCORRECT'),'CORRECTION_SCOPE_INVALID');assert.deepEqual(s,before);
 });
}
test('정산 부족 1별빛은 이후 유효한 최초 정답으로 충당되며 추가 소비는 그때까지 차단',()=>{
 let s=good();s=good(s);s=good(s);s=run(s,'MAGIC_USED',{magicId:'STAR_COMPASS',regionId:'T1-R1',teacherConfirmed:true});
 const aid=Object.values(s.attempts)[0].id;s=correction(s,'ANSWER',aid,'INCORRECT');
 assert.equal(s.rewards.settlementDue,1);
 s=good(s);
 assert.equal(s.rewards.settlementDue,0);assert.equal(s.rewards.starlight,0);assert.equal(s.rewards.settlementRequired,false);checkState(s);
});
test('시간의 모래 구매 뒤 원득점 정정: 사용 시간·원래 소비 기록 불변, 정산 필요만 증가',()=>{
 let s=good();for(let i=0;i<3;i++)s=good(s);
 s.magic.unlocked.push('TIME_SAND');s=issue(s);s=run(s,'TIMER_STARTED');
 s=run(s,'MAGIC_USED',{magicId:'TIME_SAND',teacherConfirmed:true});
 const a=s.attempts[s.activeAttemptId],extended=copy(a.timer),spent=copy(s.magic.used);
 s=run(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'연장 시간 보존 실험 종료'});
 const prev=Object.values(s.attempts)[0];s=correction(s,'ANSWER',prev.id,'INCORRECT');
 assert.equal(s.rewards.settlementDue,1);assert.equal(s.rewards.starlight,0);
 assert.deepEqual(s.magic.used,spent);assert.equal(s.attempts[a.id].timer.usedTimeSand,true);
 assert.equal(extended.usedTimeSand,true);checkState(s);
});
test('정정한 오답을 다시 회수 호출하려면 실제 미회수임을 확인해야 하며 원래 명단 버전 보존',()=>{
 let s=good(),aid=s.activeAttemptId,old=copy(s.attempts[aid]);s=correction(s,'ANSWER',aid,'INCORRECT');
 assert.equal(s.recovery.pending[0].originRosterVersion,old.teamAssignment.rosterVersion);
 const rid=s.recovery.pending[0].id,runId=id();
 s=run(s,'RECOVERY_CALLED',{recoveryId:rid,runId,teamId:'TEAM_01',regionId:'T1-R1',mode:'FORCED',reason:'판정 정정 후 교사의 회수 요청',teacherConfirmed:true});
 assert.equal(s.recovery.pending[0].runs.length,1);assert.equal(s.attempts[aid].judgement.decision,'CORRECT');checkState(s);
});
test('교사 PIN·정답·해설·정정 감사는 보상 정정 후에도 학생 공개 데이터에 없음',()=>{
 let s=recovered(intercepted(bad())),aid=s.activeAttemptId;s=correction(s,'ANSWER',aid,'CORRECT','정정 비공개 메모');
 const text=JSON.stringify(publicProjection(s,s.meta.updatedAt));
 for(const word of ['teacherReason','studentId','answer','explanation','audit','corrections','원래 오답','정정 비공개 메모','recoveryOnlyIds'])
   assert.equal(text.includes(word),false,word);
});
