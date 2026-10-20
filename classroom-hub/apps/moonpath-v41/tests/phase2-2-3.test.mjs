import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection} from '../src/engine/model.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {makeBackup,verifyBackup} from '../src/storage/backup.js';

const raw=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const qe=createQuestionEngine(raw);const T=1_800_000_000_000;
let sequence=0;const uid=()=>`p23-${++sequence}`;
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code,`Expected ${code}`);
const expectReject=(promise,code)=>assert.rejects(promise,e=>e.code===code,`Expected ${code}`);
const act=(s,type,payload={},delta=1,eventId=uid())=>reduceCommand(s,{type,eventId,at:s.meta.updatedAt+delta,payload}).state;
function boot(timerSeconds=60){let s=newExpedition({slot:1,expeditionId:uid(),createdAt:T,world,timerSeconds});s=act(s,'EXPEDITION_CREATED');return act(s,'SESSION_STARTED',{sessionId:uid()});}
function draw(s,questionId=qe.ids()[0]){
  const at=s.meta.updatedAt+1,attemptId=uid(),snapshot=qe.snapshot({questionId,attemptId,issuedAt:at});
  return act(s,'QUESTION_DRAWN',{attemptId,questionId,regionId:'T1-R1',teamId:'TEAM_01',mode:'NEW',firstIssue:true,questionSnapshot:snapshot});
}
function started(s,questionId=qe.ids()[0]){return act(draw(s,questionId),'TIMER_STARTED');}
function attempt(s){return s.attempts[s.activeAttemptId];}
function correctFor(q){switch(q.type){
  case 'single_choice':return q.answer.correct[0];
  case 'true_false':return q.answer.correct;
  case 'matching':return structuredClone(q.answer.pairs);
  case 'ordering':return structuredClone(q.answer.order);
  case 'categorization':return structuredClone(q.answer.assignments);
  case 'short_text':return q.answer.accepted[0];
  case 'manual':return '학생이 수업에서 학습한 개념을 자신의 언어로 타당하게 설명하였습니다.';
  default:throw Error('type');
}}
function wrongFor(q){switch(q.type){
  case 'single_choice':return q.options.find(x=>x.key!==q.answer.correct[0]).key;
  case 'true_false':return !q.answer.correct;
  case 'matching':{const arr=structuredClone(q.answer.pairs);arr[0][1]=q.options.right.find(x=>x.key!==arr[0][1]).key;return arr;}
  case 'ordering':return structuredClone(q.answer.order).reverse();
  case 'categorization':{const obj=structuredClone(q.answer.assignments);const key=Object.keys(obj)[0];obj[key]=q.options.categories.find(x=>x.key!==obj[key]).key;return obj;}
  case 'short_text':return '판정 전 동의어 확인이 필요한 표현';
  case 'manual':return '짧은 시험 답안';
  default:throw Error('type');
}}
function submitted(s,response,opts={}){return act(s,'ANSWER_SUBMITTED',{attemptId:s.activeAttemptId,response,...opts});}
function judged(s,decision='CORRECT',extra={}){return act(s,'ANSWER_JUDGED',{attemptId:s.activeAttemptId,decision,teacherConfirmed:true,...extra});}

// Validate EVERY verified source item, not just one example per type.
for(const q of raw.questions){
  test(`실제 60문항 전체 2-3 종단 판정: ${q.id} (${q.type})`,()=>{
    let s=started(boot(),q.id);
    const original=s.attempts[s.activeAttemptId].questionSnapshot.originalSnapshot;
    s=submitted(s,correctFor(q));
    assert.equal(attempt(s).answer.suggestion.status,q.type==='manual'?'needs_teacher':'correct');
    assert.equal(attempt(s).timer.phase,'PAUSED');
    assert.equal(attempt(s).judgement,undefined);
    assert.deepEqual(s.questions.reviewEligibleIds,[]);
    assert.deepEqual(s.questions.recoveryOnlyIds,[]);
    assert.equal(s.rewards.starlight,0);
    s=judged(s,'CORRECT',q.type==='manual'?{teacherReason:'교사가 제시한 핵심 설명과 근거를 직접 대조함'}:{});
    assert.equal(attempt(s).timer.phase,'RESOLVED');
    assert.equal(attempt(s).judgement.decision,'CORRECT');
    assert.deepEqual(s.questions.reviewEligibleIds,[q.id]);
    assert.deepEqual(s.questions.recoveryOnlyIds,[]);
    assert.deepEqual(attempt(s).questionSnapshot.originalSnapshot,original);
    assert.equal(s.rewards.starlight,1);assert.equal(s.rewards.keys,0); // PHASE 2-6 최초 정답 보상
    checkState(s);
  });
}

for(const type of ['single_choice','true_false','matching','ordering','categorization','short_text','manual']){
  test(`실제 ${type} 오답/검토 필요 후 교사 오답 확정·회수 전용 등록`,()=>{
    const q=raw.questions.find(x=>x.type===type);let s=started(boot(),q.id);
    s=submitted(s,wrongFor(q));
    const suggestion=attempt(s).answer.suggestion;
    assert.equal(suggestion.status,['short_text','manual'].includes(type)?'needs_teacher':'incorrect');
    s=judged(s,'INCORRECT',['short_text','manual'].includes(type)?{teacherReason:'교사 확인 결과 기준을 충족하지 못함'}:{});
    assert.deepEqual(s.questions.recoveryOnlyIds,[q.id]);
    assert.equal(s.questions.reviewEligibleIds.length,0);
    assert.equal(s.recovery.pending.length,1);
    const rec=s.recovery.pending[0];assert.equal(rec.originRegionId,'T1-R1');assert.equal(rec.originTeamId,'TEAM_01');
    assert.equal(rec.questionId,q.id);assert.equal(rec.sourceAttemptId,s.activeAttemptId);
    assert.equal(rec.status,'PENDING');assert.equal(s.rewards.starlight,0);
    checkState(s);
  });
}

test('교사 시작 전 답안 수신 및 존재하지 않는 시도 ID 차단',()=>{
  const s=draw(boot());expectCode(()=>submitted(s,'A'),'QUESTION_NOT_STARTED');
  const startedState=act(s,'TIMER_STARTED');expectCode(()=>act(startedState,'ANSWER_SUBMITTED',{attemptId:'OTHER',response:'A'}),'ATTEMPT_MISMATCH');
});

test('문제 시계가 1ms 남았을 때 답변 허용, 정확한 만료 시각은 접수 차단',()=>{
  const startedState=started(boot());const a=attempt(startedState);
  const left=60000-1;
  const ok=act(startedState,'ANSWER_SUBMITTED',{attemptId:a.id,response:'B'},left);
  assert.equal(attempt(ok).timer.remainingMs,1);
  expectCode(()=>act(startedState,'ANSWER_SUBMITTED',{attemptId:a.id,response:'B'},60000),'TIMER_DEADLINE');
  const expired=act(startedState,'TIMER_EXPIRED',{},60000);
  assert.equal(attempt(expired).answer,undefined);
  assert.deepEqual(expired.questions.recoveryOnlyIds,[]);
  assert.equal(expired.rewards.starlight,0);
});

test('만료 후 답변은 교사 승인+사유가 모두 필요한 예외 접수',()=>{
  let s=started(boot());s=act(s,'TIMER_EXPIRED',{},60000);
  expectCode(()=>submitted(s,'B'),'TEACHER_REQUIRED');
  expectCode(()=>submitted(s,'B',{teacherConfirmed:true}),'LATE_REASON_REQUIRED');
  s=submitted(s,'B',{teacherConfirmed:true,lateReason:'수업 중 기술 장애를 교사가 인정함'});
  assert.equal(attempt(s).answer.afterExpiry,true);
  assert.equal(attempt(s).timer.phase,'EXPIRED_AWAITING_TEACHER');
  assert.equal(s.questions.reviewEligibleIds.length,0);
});

test('교사가 정지한 타이머는 승인 없이는 답안 접수 불가, 미제출 시험도 보존',()=>{
  let s=started(boot());s=act(s,'TIMER_PAUSED');
  expectCode(()=>submitted(s,'B'),'TEACHER_REQUIRED');
  s=submitted(s,'B',{teacherConfirmed:true});
  assert.equal(attempt(s).answer.suggestion.status,'correct');
});

test('타이머 끔에서도 교사 START 후 명시 확인으로 답변 접수',()=>{
  let s=started(boot(0));assert.equal(attempt(s).timer.phase,'PAUSED');
  expectCode(()=>submitted(s,'B'),'TEACHER_REQUIRED');
  s=submitted(s,'B',{teacherConfirmed:true});s=judged(s,'CORRECT');
  assert.equal(s.questions.reviewEligibleIds.length,1);
});

test('답안은 한 번만 수신, 재제출·타이머 재개·추가 연장 차단',()=>{
  let s=submitted(started(boot()),'B');
  expectCode(()=>submitted(s,'B'),'ANSWER_ALREADY_SUBMITTED');
  expectCode(()=>act(s,'TIMER_RESUMED'),'ANSWER_ALREADY_SUBMITTED');
  expectCode(()=>act(s,'TIME_SAND_USED'),'ANSWER_ALREADY_SUBMITTED');
  assert.equal(attempt(s).answer.suggestion.status,'correct');
});

test('자동 권고는 최종판정 아님, 교사 확인 없는 판정은 원천 차단',()=>{
  const s=submitted(started(boot()),'B');
  expectCode(()=>act(s,'ANSWER_JUDGED',{attemptId:s.activeAttemptId,decision:'CORRECT',teacherConfirmed:false}),'TEACHER_REQUIRED');
  assert.equal(attempt(s).judgement,undefined);
  assert.equal(s.questions.reviewEligibleIds.length,0);
});

test('자동 권고와 다른 판정에는 교사 입력 사유가 필수',()=>{
  let s=submitted(started(boot()),'B');
  expectCode(()=>judged(s,'INCORRECT'),'JUDGEMENT_REASON_REQUIRED');
  s=judged(s,'INCORRECT',{teacherReason:'선택 과정에서 학생 설명이 서로 모순되어 오답으로 판정'});
  assert.equal(attempt(s).judgement.decision,'INCORRECT');
  assert.equal(s.questions.recoveryOnlyIds.length,1);
});

test('서술형·모호한 단답형은 자동 정답/오답 확정하지 않음',()=>{
  for(const type of ['manual','short_text']){
    const q=raw.questions.find(x=>x.type===type);let s=submitted(started(boot(),q.id),wrongFor(q));
    assert.equal(attempt(s).answer.suggestion.status,'needs_teacher');
    expectCode(()=>judged(s,'CORRECT'),'JUDGEMENT_REASON_REQUIRED');
    s=judged(s,'CORRECT',{teacherReason:'답변의 맥락과 인정 가능한 표현을 교사가 검토함'});
    assert.equal(attempt(s).judgement.decision,'CORRECT');
  }
});

test('교사가 만료 시점을 확인해도 자동 오답·회수 등록되지 않음',()=>{
  let s=started(boot());s=act(s,'TIMER_EXPIRED',{},60000);
  assert.equal(s.questions.recoveryOnlyIds.length,0);
  expectCode(()=>judged(s,'INCORRECT'),'NO_ANSWER_CONFIRMATION');
  expectCode(()=>judged(s,'INCORRECT',{missingResponseConfirmed:true}),'JUDGEMENT_REASON_REQUIRED');
  s=judged(s,'INCORRECT',{missingResponseConfirmed:true,teacherReason:'60초간 학생 제출이 없었음을 교사가 확인함'});
  assert.equal(attempt(s).judgement.missingResponse,true);
  assert.equal(s.recovery.pending.length,1);
});

test('타이머 미시작 문제는 미응답 교사 오답 판정도 불허',()=>{
  const s=draw(boot());expectCode(()=>judged(s,'INCORRECT',{missingResponseConfirmed:true,teacherReason:'미답변'}),'NO_ANSWER_CONFIRMATION');
});

test('결과 확인 후 새로운 이벤트 ID로 재판정하는 행위 차단',()=>{
  const s=judged(submitted(started(boot()),'B'),'CORRECT');
  expectCode(()=>judged(s,'INCORRECT',{teacherReason:'늦은 수정'}),'ALREADY_JUDGED');
});

test('같은 eventId 재시도는 제출·판정 두 번 처리하지 않고 내용 변경은 거절',()=>{
  let s=started(boot());const ev={type:'ANSWER_SUBMITTED',eventId:'same-answer',at:s.meta.updatedAt+1,payload:{attemptId:s.activeAttemptId,response:'B'}};
  const a=reduceCommand(s,ev);s=a.state;
  assert.equal(reduceCommand(s,ev).duplicate,true);
  expectCode(()=>reduceCommand(s,{...ev,payload:{...ev.payload,response:'C'}}),'EVENT_ID_CONFLICT');
  const good={type:'ANSWER_JUDGED',eventId:'same-judge',at:s.meta.updatedAt+1,payload:{attemptId:s.activeAttemptId,decision:'CORRECT',teacherConfirmed:true}};
  s=reduceCommand(s,good).state;
  assert.equal(reduceCommand(s,good).duplicate,true);
  expectCode(()=>reduceCommand(s,{...good,payload:{...good.payload,decision:'INCORRECT'}}),'EVENT_ID_CONFLICT');
  assert.equal(s.questions.reviewEligibleIds.length,1);
});

test('기존 타이머 시험용 교사 종료는 실제 출제 문제에서 사유 없는 판정 우회 불가',()=>{
  const s=started(boot());expectCode(()=>act(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true}),'JUDGEMENT_REQUIRED');
  const cleared=act(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'실제 채점 전 교사가 시험 시도를 무효로 확인함'});
  assert.equal(attempt(cleared).timer.phase,'RESOLVED');
  assert.equal(cleared.questions.recoveryOnlyIds.length,0);
  assert.equal(cleared.questions.reviewEligibleIds.length,0);
  assert.ok(attempt(cleared).voided);
});

test('학생 공개 상태에는 답변·교사 판정·정답·해설·PIN·루브릭 노출 없음',()=>{
  let s=submitted(started(boot()),'B');s=judged(s,'CORRECT');
  const serialized=JSON.stringify(publicProjection(s,s.meta.updatedAt));
  for(const privateKey of ['response','suggestion','judgement','teacherReason','answer','explanation','rubric','correct','eventLog','audit','originTeamId'])assert.equal(serialized.includes(privateKey),false,privateKey);
});

test('교사 답변 UI가 제출 대신 결과를 위조하려 해도 무시하고 발행 스냅샷으로 채점',()=>{
  let s=started(boot());
  s=act(s,'ANSWER_SUBMITTED',{attemptId:s.activeAttemptId,response:'C',autoStatus:'correct',recommendation:'correct'});
  assert.equal(attempt(s).answer.suggestion.status,'incorrect');
});

test('빈 응답·없는 선택지·초대형 답안은 저장 전 검증 실패',()=>{
  const s=started(boot());
  expectCode(()=>submitted(s,''),'ANSWER_EMPTY');
  expectCode(()=>submitted(s,'UNKNOWN'),'RESPONSE_INVALID');
  expectCode(()=>submitted(s,'x'.repeat(20001)),'RESPONSE_TOO_LARGE');
});

test('문항 처리 후 신규 출제는 교사 확정이 끝난 다음만 가능',()=>{
  let s=started(boot());s=submitted(s,'B');
  expectCode(()=>draw(s,qe.ids()[1]),'ATTEMPT_ACTIVE');
  s=judged(s,'CORRECT');s=draw(s,qe.ids()[1]);
  assert.equal(s.questions.draws.length,2);
});

test('문항 제출·교사 판정·회수 장부·타이머를 Fake IDB 이벤트 단일 거래에 확정',async()=>{
  let time=T+5000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>time});
  const teacher=new TeacherEngineSession(store,{clock:()=>time,newId:uid,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'test-session'});
  await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  await teacher.dispatch('TIMER_STARTED');
  let s=teacher.getState(),response=wrongFor(qe.getOriginal(s.attempts[s.activeAttemptId].questionId));
  const got=await teacher.submitAnswer({attemptId:s.activeAttemptId,response});
  assert.equal(got.committed,true);assert.equal(teacher.getState().rewards.starlight,0);
  const before=teacher.getState().meta.revision;
  const result=await teacher.judgeAnswer({attemptId:s.activeAttemptId,decision:'INCORRECT',teacherConfirmed:true});
  assert.equal(result.committed,true);
  assert.equal(result.state.meta.revision,before+1);
  assert.equal(db.inspect('slots',1).state.questions.recoveryOnlyIds.length,1);
  assert.equal(db.inspect('events',`1:${String(before+1).padStart(12,'0')}`).event.type,'ANSWER_JUDGED');
  assert.equal(db.inspect('checkpoints','1:previous').revision,before);
  assert.equal(db.inspect('checkpoints','1:latest').revision,before+1);
  await teacher.close();
});

test('실패한 제출 거래는 메모리·저장소·체크포인트의 답변 변경 0건',async()=>{
  let time=T+11000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>time});
  const teacher=new TeacherEngineSession(store,{clock:()=>time,newId:uid,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'submit-failure'});
  await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});await teacher.dispatch('TIMER_STARTED');
  const before=teacher.getState(),revision=before.meta.revision;
  db.failNextWrite=true;
  await assert.rejects(teacher.submitAnswer({attemptId:before.activeAttemptId,response:'B'}),e=>e.name==='QuotaExceededError');
  assert.deepEqual(teacher.getState(),before);
  assert.equal(db.inspect('slots',1).state.meta.revision,revision);
  assert.equal(db.inspect('events',`1:${String(revision+1).padStart(12,'0')}`),undefined);
  assert.equal(db.inspect('checkpoints','1:latest').revision,revision);
  assert.equal((await teacher.submitAnswer({attemptId:before.activeAttemptId,response:'B'})).committed,true);
  await teacher.close();
});

test('실패한 교사 최종 판정 거래는 회수/복습 기록·감사 로그 모두 롤백',async()=>{
  let time=T+12000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>time});
  const teacher=new TeacherEngineSession(store,{clock:()=>time,newId:uid,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'judge-failure'});
  await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});await teacher.dispatch('TIMER_STARTED');
  const s=teacher.getState(),q=qe.getOriginal(s.attempts[s.activeAttemptId].questionId);
  const candidate=wrongFor(q);
  await teacher.submitAnswer({attemptId:s.activeAttemptId,response:candidate});
  const before=teacher.getState(),revision=before.meta.revision;
  db.failNextWrite=true;
  await assert.rejects(teacher.judgeAnswer({attemptId:s.activeAttemptId,decision:'INCORRECT',teacherConfirmed:true,teacherReason:'교사 확인 오답'}),e=>e.name==='QuotaExceededError');
  assert.deepEqual(teacher.getState(),before);
  assert.equal(db.inspect('slots',1).state.questions.recoveryOnlyIds.length,0);
  assert.equal(db.inspect('slots',1).state.recovery.pending.length,0);
  assert.equal(db.inspect('checkpoints','1:latest').revision,revision);
  const ok=await teacher.judgeAnswer({attemptId:s.activeAttemptId,decision:'INCORRECT',teacherConfirmed:true,teacherReason:'교사 확인 오답'});
  assert.equal(ok.state.recovery.pending.length,1);await teacher.close();
});

test('답변 접수 후 백업·새 DB 복원은 원문·응답·잠정 판정과 안전 정지를 보존',async()=>{
  let time=T+20000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>time});
  const teacher=new TeacherEngineSession(store,{clock:()=>time,newId:uid,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'backup-session'});
  const res=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  await teacher.dispatch('TIMER_STARTED');
  await teacher.submitAnswer({attemptId:res.attemptId,response:'B'});
  const exported=await teacher.exportJSON();const verified=await verifyBackup(exported);
  assert.equal(verified.state.attempts[res.attemptId].answer.response,'B');await teacher.close();
  const nextStore=new IndexedDbExpeditionStore(new FakeDatabase(),{clock:()=>time+10000});
  const reopened=new TeacherEngineSession(nextStore,{clock:()=>time+10000,newId:uid,heartbeatMs:0});
  const state=await reopened.restoreJSONToEmptySlot(1,exported);
  assert.equal(state.sessions[0].phase,'PAUSED');
  assert.equal(state.attempts[res.attemptId].timer.phase,'PAUSED');
  assert.equal(state.attempts[res.attemptId].answer.response,'B');
  await reopened.close();
});

test('개인 오답·판정은 학생 공개 화면이 아닌 교사 전용 상태/감사에만 저장',()=>{
  let s=started(boot());s=submitted(s,'C');s=judged(s,'INCORRECT');
  assert.equal(s.audit.at(-1).type,'ANSWER_JUDGED');
  assert.equal(s.eventLog.at(-1).type,'ANSWER_JUDGED');
  assert.equal(JSON.stringify(publicProjection(s,s.meta.updatedAt)).includes('INCORRECT'),false);
});

test('교사 판정 확정 후 시간의 모래·답변 재접수는 불가능',()=>{
  let s=judged(submitted(started(boot()),'B'),'CORRECT');
  expectCode(()=>submitted(s,'C'),'ANSWER_ALREADY_SUBMITTED');
  expectCode(()=>act(s,'TIME_SAND_USED'),'ANSWER_ALREADY_SUBMITTED');
});

test('신규 60문항 소진 후 REVIEW 정답을 오답으로 판정하면 회수 전용으로만 이동',()=>{
  let s=boot();let first;
  for(const [i,id] of qe.ids().entries()){
    s=draw(s,id);
    if(i===0){first=id;s=act(s,'TIMER_STARTED');s=submitted(s,correctFor(qe.getOriginal(id)));s=judged(s,'CORRECT');}
    else s=act(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'검사에서 사용하지 않는 출제 사례 종료'});
  }
  assert.equal(s.questions.issuedIds.length,60);assert.deepEqual(s.questions.reviewEligibleIds,[first]);
  const at=s.meta.updatedAt+1,attemptId=uid();
  const review={attemptId,questionId:first,teamId:'TEAM_01',regionId:'T1-R1',mode:'REVIEW',firstIssue:false,
    questionSnapshot:qe.snapshot({questionId:first,attemptId,issuedAt:at})};
  s=act(s,'QUESTION_DRAWN',review);
  assert.equal(attempt(s).drawMode,'REVIEW');s=act(s,'TIMER_STARTED');
  s=submitted(s,wrongFor(qe.getOriginal(first)));s=judged(s,'INCORRECT');
  assert.equal(s.questions.issuedIds.length,60);
  assert.equal(s.questions.reviewEligibleIds.includes(first),false);
  assert.equal(s.questions.recoveryOnlyIds.includes(first),true);
  assert.equal(s.recovery.pending.length,1);
  assert.equal(s.rewards.starlight,1); // 최초 정답으로 받은 1개 유지, 복습 오답은 차감/증가 없음
});

test('복습 재정답은 추가 보상 지급 없이 복습 자격 유지',()=>{
  let s=boot();let first;
  for(const [i,id] of qe.ids().entries()){
    s=draw(s,id);
    if(i===0){first=id;s=act(s,'TIMER_STARTED');s=submitted(s,correctFor(qe.getOriginal(id)));s=judged(s,'CORRECT');}
    else s=act(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'검사 목적의 무효화'});
  }
  const at=s.meta.updatedAt+1,attemptId=uid();
  s=act(s,'QUESTION_DRAWN',{attemptId,questionId:first,regionId:'T1-R1',teamId:'TEAM_01',mode:'REVIEW',firstIssue:false,
    questionSnapshot:qe.snapshot({questionId:first,attemptId,issuedAt:at})});
  s=act(s,'TIMER_STARTED');s=submitted(s,correctFor(qe.getOriginal(first)));s=judged(s,'CORRECT');
  assert.deepEqual(s.questions.reviewEligibleIds,[first]);
  assert.deepEqual(s.questions.recoveryOnlyIds,[]);
  assert.equal(s.rewards.ledger.length,1); // 최초 정답 1회만, REVIEW 추가 보상 없음
});

test('부분 연결 답변은 제출은 유지하되 교사 검토 필요 상태로 유지',()=>{
  const q=raw.questions.find(x=>x.type==='matching');let s=started(boot(),q.id);
  s=submitted(s,[q.answer.pairs[0]]);
  assert.equal(attempt(s).answer.suggestion.reason,'INCOMPLETE_MATCHING');
  assert.equal(attempt(s).judgement,undefined);
  expectCode(()=>judged(s,'CORRECT'),'JUDGEMENT_REASON_REQUIRED');
  s=judged(s,'CORRECT',{teacherReason:'기존 평가 기준에 따른 부분 성공 여부를 교사가 확인함'});
  assert.equal(s.questions.reviewEligibleIds.includes(q.id),true);
});

test('타이머 만료 1초 전 제출은 남은 1000ms를 확정하고 멈춤',()=>{
  const s=started(boot());const out=act(s,'ANSWER_SUBMITTED',{attemptId:s.activeAttemptId,response:'B'},59000);
  assert.equal(attempt(out).timer.remainingMs,1000);
  assert.equal(attempt(out).timer.runningSince,null);
  assert.equal(attempt(out).timer.phase,'PAUSED');
});

test('차시 일시정지 중 신규 제출 금지 및 회복 후 교사 승인하에 접수',()=>{
  let s=started(boot());s=act(s,'SESSION_PAUSED');
  expectCode(()=>submitted(s,'B',{teacherConfirmed:true}),'SESSION_NOT_ACTIVE');
  s=act(s,'SESSION_RESUMED');s=submitted(s,'B',{teacherConfirmed:true});
  assert.equal(attempt(s).timer.phase,'PAUSED');
});

test('잘못된 원문 스냅샷을 가진 제출은 교사 판정 전 차단',()=>{
  const s=started(boot());const altered=structuredClone(s);altered.attempts[altered.activeAttemptId].questionSnapshot.issuedSnapshot.answer=null;
  expectCode(()=>submitted(altered,'B'),'QUESTION_SNAPSHOT_MISSING');
});

test('교사 판정 대상 attemptId 변조·잘못된 상태는 장부를 변경하지 않음',()=>{
  const s=submitted(started(boot()),'B');
  expectCode(()=>act(s,'ANSWER_JUDGED',{attemptId:'OTHER',decision:'CORRECT',teacherConfirmed:true}),'ATTEMPT_MISMATCH');
  expectCode(()=>judged(s,'ANY'),'JUDGEMENT_INVALID');
  assert.equal(s.questions.reviewEligibleIds.length,0);
});

test('상태 임의 변조로 교사 판정 이벤트만 제거하면 정합성 검사에서 거부',()=>{
  const s=judged(submitted(started(boot()),'B'),'CORRECT');
  const changed=structuredClone(s);changed.attempts[changed.activeAttemptId].judgement.eventId='NOT_A_REAL_EVENT';
  expectCode(()=>checkState(changed),'JUDGEMENT_HISTORY_INVALID');
});

test('학생 답변 자동판정 이벤트를 제거하면 불일치로 판정',()=>{
  const s=submitted(started(boot()),'B');
  const changed=structuredClone(s);changed.attempts[changed.activeAttemptId].answer.receivedEventId='MISSING';
  expectCode(()=>checkState(changed),'ANSWER_HISTORY_INVALID');
});

test('동시 제출 중 첫 번째만 거래 확정되고 두 번째는 저장 변경 없이 거부',async()=>{
  let now=T+45000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>now});
  const teacher=new TeacherEngineSession(store,{clock:()=>now,newId:uid,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'concurrent-receipt'});
  const res=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});await teacher.dispatch('TIMER_STARTED');
  const outcomes=await Promise.allSettled([
    teacher.submitAnswer({attemptId:res.attemptId,response:'B'}),
    teacher.submitAnswer({attemptId:res.attemptId,response:'C'})]);
  assert.deepEqual(outcomes.map(x=>x.status),['fulfilled','rejected']);
  assert.equal(outcomes[1].reason.code,'ANSWER_ALREADY_SUBMITTED');
  assert.equal(teacher.getState().eventLog.filter(e=>e.type==='ANSWER_SUBMITTED').length,1);
  await teacher.close();
});
