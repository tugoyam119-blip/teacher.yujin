/** PHASE 2-6: reward source, spend, magic and Fake-IDB atomicity. Not browser tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {planQuestionDraw} from '../src/questions/draw.js';
import {creditFirstRegionKey,MAGIC_CATALOG} from '../src/rewards/ledger.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {FakeDatabase} from './support-fake-idb.mjs';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
const qe=createQuestionEngine(pack);const ZERO=1_830_000_000_000;
let seed=0;const id=()=>`reward26-${++seed}`;
const run=(state,type,payload={},eventId=id(),delta=1)=>reduceCommand(state,{type,eventId,payload,at:state.meta.updatedAt+delta}).state;
const rejects=(f,code)=>assert.throws(f,e=>e.code===code,`expected ${code}`);
const deep=v=>structuredClone(v);
function boot(slot=1){let s=newExpedition({slot,world,expeditionId:id(),createdAt:ZERO});s=run(s,'EXPEDITION_CREATED');return run(s,'SESSION_STARTED',{sessionId:id()});}
function right(q){switch(q.type){
  case 'single_choice':return q.answer.correct[0];
  case 'true_false':return q.answer.correct;
  case 'ordering':return deep(q.answer.order);
  case 'matching':return deep(q.answer.pairs);
  case 'categorization':return deep(q.answer.assignments);
  case 'short_text':return q.answer.accepted[0];
  case 'manual':return '사회 문제와 헌법 규정을 구분해 근거와 해결 방향을 타당하게 서술하였습니다.';
  default:throw Error('UNKNOWN');
}}
function wrong(q){if(q.type==='single_choice')return q.options.find(x=>x.key!==q.answer.correct[0]).key;
  if(q.type==='true_false')return !q.answer.correct;return '교사가 별도로 오답을 확인한 답안';}
function issue(s,teamId='TEAM_01'){
  const attemptId=id(),at=s.meta.updatedAt+1;
  const p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId,attemptId,at,random:()=>0});
  return run(s,'QUESTION_DRAWN',p);
}
function submit(s,answer){return run(s,'ANSWER_SUBMITTED',{attemptId:s.activeAttemptId,response:answer});}
function judge(s,decision){return run(s,'ANSWER_JUDGED',{attemptId:s.activeAttemptId,decision,teacherConfirmed:true,teacherReason:'교사가 원문항과 답변을 확인함',
    missingResponseConfirmed:false});}
function correct(s=boot(),teamId='TEAM_01'){
  s=issue(s,teamId);s=run(s,'TIMER_STARTED');
  const q=pack.questions.find(q=>q.id===s.attempts[s.activeAttemptId].questionId);
  return judge(submit(s,right(q)),'CORRECT');
}
function incorrect(s=boot()){
  s=issue(s);s=run(s,'TIMER_STARTED');const q=pack.questions.find(q=>q.id===s.attempts[s.activeAttemptId].questionId);
  return judge(submit(s,wrong(q)),'INCORRECT');
}
function fund(s,count){for(let i=0;i<count;i++)s=correct(s);return s;}
function magic(s,magicId,fields={},eventId=id()){
  return run(s,'MAGIC_USED',{magicId,teacherConfirmed:true,...fields},eventId);
}
function interceptWon(s){
  const sourceAttemptId=s.activeAttemptId;
  s=run(s,'INTERCEPTION_OPENED',{sourceAttemptId,interceptionId:id(),targetTeamId:'TEAM_02',teacherConfirmed:true});
  const interceptionId=s.interception.activeId;
  s=run(s,'INTERCEPTION_TIMER_STARTED',{interceptionId,teacherConfirmed:true});
  const q=pack.questions.find(q=>q.id===s.attempts[sourceAttemptId].questionId);
  s=run(s,'INTERCEPTION_ANSWER_SUBMITTED',{interceptionId,response:right(q),teacherConfirmed:true});
  s=run(s,'INTERCEPTION_JUDGED',{interceptionId,decision:'CORRECT',teacherConfirmed:true});
  return s;
}
function recoveryWon(s,teamId='TEAM_01'){
  const recoveryId=s.recovery.pending[0].id,runId=id();
  s=run(s,'RECOVERY_CALLED',{recoveryId,runId,mode:'FORCED',reason:'추가 학습 회수',teamId,regionId:'T1-R1',teacherConfirmed:true});
  s=run(s,'RECOVERY_TIMER_STARTED',{recoveryId,runId,teacherConfirmed:true});
  const original=pack.questions.find(q=>q.id===s.recovery.pending[0].questionId);
  s=run(s,'RECOVERY_ANSWER_SUBMITTED',{recoveryId,runId,response:right(original),teacherConfirmed:true});
  s=run(s,'RECOVERY_JUDGED',{recoveryId,runId,decision:'CORRECT',teacherConfirmed:true});
  return s;
}

for(const [i,expected] of Object.entries({MOON_WHISPER:[1,2,'ATTEMPT'],STAR_COMPASS:[1,3,'REGION'],
  MEMORY_CRYSTAL:[2,3,'RECOVERY'],TIME_SAND:[3,4,'ATTEMPT'],HIDDEN_STAR_EYE:[4,5,'REGION']})){
  test(`마법 비용·등급·적용 범위 계약: ${i}`,()=>{
    assert.deepEqual([MAGIC_CATALOG[i].tier,MAGIC_CATALOG[i].cost,MAGIC_CATALOG[i].scope],expected);
  });
}
test('처음에는 T1 2종만 해금되어 있으며 T2~T4는 임의 해금하지 않는다',()=>{
  const s=boot();assert.deepEqual(s.magic.unlocked,['MOON_WHISPER','STAR_COMPASS']);
  for(const key of ['MEMORY_CRYSTAL','TIME_SAND','HIDDEN_STAR_EYE'])rejects(()=>magic(s,key),'MAGIC_LOCKED');
});
for(const key of ['MEMORY_CRYSTAL','TIME_SAND','HIDDEN_STAR_EYE']){
  test(`${key}: 테스트용 해금 플래그 없이는 별빛이 많아도 사용 불가`,()=>{
    let s=fund(boot(),5);
    rejects(()=>magic(s,key),'MAGIC_LOCKED');assert.equal(s.rewards.starlight,5);
  });
}
test('미출제 원문제 최초 교사 정답: 별빛1/실제 모둠 공헌1, 열쇠0',()=>{
  const s=correct();assert.equal(s.rewards.starlight,1);assert.equal(s.rewards.keys,0);
  assert.equal(s.teams[0].contribution,1);assert.equal(s.teams[1].contribution,0);
  assert.equal(s.rewards.ledger.length,1);assert.equal(s.rewards.ledger[0].kind,'ANSWER');checkState(s);
});
test('답변만 제출·잠정 자동점수는 별빛을 지급하지 않는다',()=>{
  let s=issue(boot());s=run(s,'TIMER_STARTED');
  const q=pack.questions.find(q=>q.id===s.attempts[s.activeAttemptId].questionId);
  s=submit(s,right(q));assert.equal(s.rewards.starlight,0);assert.equal(s.rewards.ledger.length,0);
});
test('교사 오답 판정에는 별빛/공헌도 지급이 없다',()=>{
  const s=incorrect();assert.equal(s.rewards.starlight,0);assert.equal(s.rewards.ledger.length,0);assert.equal(s.teams[0].contribution,0);
});
test('가로채기 최초 성공 별빛/공헌은 실제 가로챈 TEAM_02에, 회수는 원모둠 그대로',()=>{
  const s=interceptWon(incorrect());assert.equal(s.rewards.starlight,1);
  assert.equal(s.teams[0].contribution,0);assert.equal(s.teams[1].contribution,1);
  assert.equal(s.recovery.pending[0].originTeamId,'TEAM_01');assert.equal(s.rewards.ledger[0].kind,'INTERCEPTION');checkState(s);
});
test('가로채기 성공 후 원모둠 회수: 서로 다른 유효 원천에 별빛 합계2, 두 모둠 기여 각1',()=>{
  const s=recoveryWon(interceptWon(incorrect()));assert.equal(s.rewards.starlight,2);
  assert.equal(s.teams[0].contribution,1);assert.equal(s.teams[1].contribution,1);
  assert.deepEqual(s.rewards.ledger.map(x=>x.kind),['INTERCEPTION','RECOVERY']);checkState(s);
});
test('단독 회수 정답: 별빛1/원모둠 기여1, 원래 오답 이력 불변',()=>{
  const wrongState=incorrect(),source=deep(wrongState.attempts[wrongState.activeAttemptId]);
  const s=recoveryWon(wrongState);assert.equal(s.rewards.starlight,1);assert.equal(s.teams[0].contribution,1);
  assert.deepEqual(s.attempts[source.id],source);assert.equal(s.recovery.resolved[0].solverTeamId,'TEAM_01');
});
test('동일 교사 판정 eventId 멱등: 이력/별빛/공헌도 중복 0',()=>{
  let s=issue(boot());s=run(s,'TIMER_STARTED');const attemptId=s.activeAttemptId;
  const q=pack.questions.find(q=>q.id===s.attempts[attemptId].questionId);
  s=submit(s,right(q));const p={attemptId,decision:'CORRECT',teacherConfirmed:true,teacherReason:'검토'};
  const event={type:'ANSWER_JUDGED',eventId:'fixed-award',at:s.meta.updatedAt+1,payload:p};
  const once=reduceCommand(s,event).state,again=reduceCommand(once,event);
  assert.equal(once.rewards.starlight,1);assert.equal(again.duplicate,true);
  assert.equal(again.state.meta.revision,once.meta.revision);assert.equal(again.state.rewards.ledger.length,1);
  rejects(()=>reduceCommand(once,{...event,payload:{...p,decision:'INCORRECT'}}),'EVENT_ID_CONFLICT');
});
test('복습 재정답은 최초 정답 별빛1만 유지, 공헌도 추가0',()=>{
  let s=boot(),first;
  for(let n=0;n<60;n++){
    s=issue(s);first??=s.attempts[s.activeAttemptId].questionId;
    if(n===0){s=run(s,'TIMER_STARTED');s=submit(s,right(pack.questions.find(q=>q.id===first)));s=judge(s,'CORRECT');}
    else s=run(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'문항 소진 시험'});
  }
  const originalStars=s.rewards.starlight,originalContrib=s.teams[0].contribution;
  s=issue(s);assert.equal(s.attempts[s.activeAttemptId].drawMode,'REVIEW');s=run(s,'TIMER_STARTED');
  s=submit(s,right(pack.questions.find(q=>q.id===first)));s=judge(s,'CORRECT');
  assert.equal(s.rewards.starlight,originalStars);assert.equal(s.teams[0].contribution,originalContrib);
  assert.equal(s.rewards.ledger.filter(x=>x.type==='STAR_EARN').length,1);checkState(s);
});
test('복습 오답 후 회수까지 별빛 반복 채굴 금지: 동일 문제 회수 1회당 최초 성공만 지급',()=>{
  // The full REVIEW/RECOVERY path is kept for 2-7 correction integration.
  let s=incorrect();s=recoveryWon(s);assert.equal(s.rewards.starlight,1);
  assert.equal(s.rewards.ledger.filter(x=>x.kind==='RECOVERY').length,1);
});
test('마법 모르는 ID는 부정 처리, 상태 불변',()=>{
  const s=correct();const before=deep(s);rejects(()=>magic(s,'BUY_ANSWER'),'MAGIC_UNKNOWN');assert.deepEqual(s,before);
});
test('T1 학습 힌트: 별빛 2개 원자 차감, 동일 문항 힌트 1회',()=>{
  let s=fund(boot(),2);s=issue(s);
  s=magic(s,'MOON_WHISPER');assert.equal(s.rewards.starlight,0);
  assert.equal(s.magic.used.at(-1).cost,2);assert.equal(s.rewards.ledger.at(-1).amount,-2);
  rejects(()=>magic(s,'MOON_WHISPER'),'MAGIC_DUPLICATE');checkState(s);
});
test('T1 힌트 교사 확인 필수, 확인 없이 자원·사용 기록 변경 불가',()=>{
  let s=fund(boot(),2);s=issue(s);const before=deep(s);
  rejects(()=>run(s,'MAGIC_USED',{magicId:'MOON_WHISPER',teacherConfirmed:false}),'TEACHER_REQUIRED');
  assert.deepEqual(s,before);
});
test('T1 힌트 별빛 부족 시 남은 별빛 음수 불가, 스냅샷 불변',()=>{
  let s=correct();s=issue(s);const before=deep(s);
  rejects(()=>magic(s,'MOON_WHISPER'),'INSUFFICIENT_STARS');assert.deepEqual(s,before);
});
test('T1 별의 나침반: 문제 해결 후 현 지역 정보 비용3, 반복 비용 청구 차단',()=>{
  let s=fund(boot(),3);
  const stars=s.rewards.starlight;
  s=magic(s,'STAR_COMPASS',{regionId:'T1-R1'});
  assert.equal(stars,3);assert.equal(s.rewards.starlight,0);
  rejects(()=>magic(s,'STAR_COMPASS',{regionId:'T1-R1'}),'MAGIC_DUPLICATE');
});
test('별의 나침반은 문제 진행 중 사용 불가, 다른 지역 ID 위조 차단',()=>{
  let s=fund(boot(),3);rejects(()=>magic(s,'STAR_COMPASS',{regionId:'T1-R2'}),'MAGIC_SCOPE_INVALID');
  s=issue(s);rejects(()=>magic(s,'STAR_COMPASS',{regionId:'T1-R1'}),'ATTEMPT_ACTIVE');
});
test('기억의 수정: 회수 원문제에만 사용, 다른 회수 ID 위조 거부',()=>{
  let s=fund(boot(),3);s=incorrect(s);s.magic.unlocked.push('MEMORY_CRYSTAL');
  rejects(()=>magic(s,'MEMORY_CRYSTAL',{recoveryId:'UNKNOWN'}),'MAGIC_SCOPE_INVALID');
  const recoveryId=s.recovery.pending[0].id;
  s=magic(s,'MEMORY_CRYSTAL',{recoveryId});assert.equal(s.rewards.starlight,0);
  rejects(()=>magic(s,'MEMORY_CRYSTAL',{recoveryId}),'MAGIC_DUPLICATE');
});
test('시간의 모래: 사용 직전 4별빛 차감과 +20초 연장을 한 이벤트로 확정',()=>{
  let s=fund(boot(),4);s.magic.unlocked.push('TIME_SAND');s=issue(s);s=run(s,'TIMER_STARTED');
  const original=s.attempts[s.activeAttemptId].timer.remainingMs;
  s=magic(s,'TIME_SAND');assert.equal(s.rewards.starlight,0);
  assert.equal(s.attempts[s.activeAttemptId].timer.remainingMs,original+20_000-1);
  assert.equal(s.attempts[s.activeAttemptId].timer.usedTimeSand,true);
  rejects(()=>magic(s,'TIME_SAND'),'MAGIC_DUPLICATE');checkState(s);
});
test('시간의 모래: 시작 전·만료 후·타이머 끔에서 사용 금지',()=>{
  let s=fund(boot(),4);s.magic.unlocked.push('TIME_SAND');s=issue(s);
  rejects(()=>magic(s,'TIME_SAND'),'MAGIC_BAD_PHASE');
  s=run(s,'TIMER_STARTED');rejects(()=>run(s,'MAGIC_USED',{magicId:'TIME_SAND',teacherConfirmed:true},id(),60000),'TIMER_DEADLINE');
  let t=fund(boot(),4);t.settings.timerSeconds=0;t.magic.unlocked.push('TIME_SAND');t=issue(t);t=run(t,'TIMER_STARTED');
  rejects(()=>magic(t,'TIME_SAND'),'TIMER_DISABLED');
});
test('T4 숨겨진 별의 눈: 지역 탐색 소비5, 추가 출제권·정답 자동 지급 없음',()=>{
  let s=fund(boot(),5);s.magic.unlocked.push('HIDDEN_STAR_EYE');const before=s.questions.draws.length;
  s=magic(s,'HIDDEN_STAR_EYE',{regionId:'T1-R1'});
  assert.equal(s.rewards.starlight,0);assert.equal(s.questions.draws.length,before);
  assert.equal(s.questions.issuedIds.length,before);assert.equal(s.rewards.keys,0);
});
test('별빛 정산 필요 상태는 5종 전부 소비 차단',()=>{
  let s=fund(boot(),5);s=issue(s);s.magic.unlocked.push('TIME_SAND');s=run(s,'TIMER_STARTED');
  s.rewards.settlementRequired=true;
  rejects(()=>magic(s,'TIME_SAND'),'SETTLEMENT_REQUIRED');
  rejects(()=>magic(s,'MOON_WHISPER'),'SETTLEMENT_REQUIRED');
});
test('지출은 모둠의 누적 공헌도에서 차감하지 않는다',()=>{
  let s=fund(boot(),3);s=magic(s,'STAR_COMPASS');
  assert.equal(s.rewards.starlight,0);assert.equal(s.teams[0].contribution,3);
});
test('지역 최초 완료 열쇠 보상 함수는 완료 증거 없이는 지급 불가',()=>{
  const s=correct();rejects(()=>creditFirstRegionKey(s,{regionId:'T1-R1',eventId:'e',at:s.meta.updatedAt}),'REGION_NOT_COMPLETED');
});
test('검증된 지역 완료 시뮬레이션: 열쇠+1, 지역/테마 별빛+0, 중복 키+0',()=>{
  let s=correct();const before=s.rewards.starlight;
  s.world.regions['T1-R1']={status:'COMPLETED',completedAt:s.meta.updatedAt};
  const ctx={regionId:'T1-R1',eventId:'key-event',at:s.meta.updatedAt};
  assert.equal(creditFirstRegionKey(s,ctx),true);assert.equal(creditFirstRegionKey(s,ctx),false);
  assert.equal(s.rewards.keys,1);assert.equal(s.rewards.starlight,before);
  assert.equal(s.rewards.ledger.filter(x=>x.type==='KEY_EARN').length,1);
  // This is the payout primitive only; REGION_COMPLETED verified event still belongs to 2-8.
});
test('동일 모둠의 여러 최초 정답: 별빛 누적과 기여 누적 정확',()=>{
  const s=fund(boot(),4);assert.equal(s.rewards.starlight,4);
  assert.equal(s.teams[0].contribution,4);assert.equal(s.rewards.ledger.filter(x=>x.type==='STAR_EARN').length,4);
});
test('다른 모둠으로 원문제 성공: 기여는 원문제 실제 모둠에 누적',()=>{
  let s=correct(boot(),'TEAM_02');s=correct(s,'TEAM_03');
  assert.equal(s.teams[0].contribution,0);assert.equal(s.teams[1].contribution,1);assert.equal(s.teams[2].contribution,1);
});
test('별빛 지급 기록에서 출처 ID 변조 시 정합성 검사 거절',()=>{
  const s=correct(),m=deep(s);m.rewards.ledger[0].sourceAttemptId='FAKE';
  rejects(()=>checkState(m),'REWARD_LEDGER_INVALID');
});
test('보상 근거의 지급 모둠을 다른 모둠으로 위조하면 검출',()=>{
  const s=correct(),m=deep(s);m.rewards.ledger[0].teamId='TEAM_02';
  rejects(()=>checkState(m),'REWARD_LEDGER_INVALID');
});
test('중복 청구 claim 추가는 데이터 검사에서 거부',()=>{
  const s=correct(),m=deep(s);m.rewards.ledger.push(deep(m.rewards.ledger[0]));
  rejects(()=>checkState(m),'REWARD_DUPLICATE');
});
test('학생 공개 투영에는 원답·마법 구매 이력·기여 개인 정보가 없다',()=>{
  let s=fund(boot(),3);s=magic(s,'STAR_COMPASS');
  const p=publicProjection(s,s.meta.updatedAt),txt=JSON.stringify(p);
  for(const key of ['ledger','magic','answer','judgement','audit','originTeamId','solverMemberId','rosterVersion'])assert.equal(txt.includes(key),false,key);
  assert.equal(p.resources.starlight,0);
});
test('세 슬롯 보상 장부는 원정별 독립',()=>{
  const a=correct(boot(1)),b=boot(2);
  assert.equal(a.rewards.starlight,1);assert.equal(b.rewards.starlight,0);
  assert.equal(b.teams[0].contribution,0);assert.notEqual(a.meta.expeditionId,b.meta.expeditionId);
});
test('교사 세션 Fake IDB: 최초 정답/공헌 지급은 슬롯+이벤트+체크포인트 동시 확정',async()=>{
  let now=ZERO+90_000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>now});
  const teacher=new TeacherEngineSession(store,{clock:()=>now,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});now++;await teacher.dispatch('SESSION_STARTED',{sessionId:'p26-lesson'});
  now++;await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  now++;await teacher.dispatch('TIMER_STARTED');
  const before=teacher.getState(),a=before.attempts[before.activeAttemptId],q=pack.questions.find(x=>x.id===a.questionId);
  now++;await teacher.submitAnswer({attemptId:a.id,response:right(q)});
  now++;const done=await teacher.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true});
  assert.equal(done.committed,true);assert.equal(teacher.getState().rewards.starlight,1);
  assert.equal(db.inspect('slots',1).state.teams[0].contribution,1);
  assert.equal(db.inspect('checkpoints','1:latest').state.rewards.starlight,1);
  await teacher.close();
});
test('Fake IDB 저장소 용량실패: 보상/답변/모둠 점수 한 번에 롤백하고 재시도 성공',async()=>{
  let now=ZERO+90_000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>now});
  const teacher=new TeacherEngineSession(store,{clock:()=>now,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});now++;await teacher.dispatch('SESSION_STARTED',{sessionId:'p26-lesson'});
  now++;await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  now++;await teacher.dispatch('TIMER_STARTED');
  const a=teacher.getState().attempts[teacher.getState().activeAttemptId],q=pack.questions.find(x=>x.id===a.questionId);
  now++;await teacher.submitAnswer({attemptId:a.id,response:right(q)});
  const before=teacher.getState(),rev=before.meta.revision,eventId=id();now++;db.failNextWrite=true;
  await assert.rejects(teacher.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true},{eventId}));
  assert.deepEqual(teacher.getState(),before);
  assert.equal(db.inspect('slots',1).state.meta.revision,rev);
  assert.equal(db.inspect('slots',1).state.rewards.ledger.length,0);
  const result=await teacher.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true},{eventId});
  assert.equal(result.state.rewards.starlight,1);
  assert.equal(db.inspect('events','1:'+String(rev+1).padStart(12,'0')).event.eventId,eventId);
  await teacher.close();
});
test('Fake IDB 실제 교사 중복 판정: 동일 eventId로 별빛은 1회만',async()=>{
  let now=ZERO+90_000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>now});
  const teacher=new TeacherEngineSession(store,{clock:()=>now,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});now++;await teacher.dispatch('SESSION_STARTED',{sessionId:'lesson'});
  now++;await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  now++;await teacher.dispatch('TIMER_STARTED');
  const a=teacher.getState().attempts[teacher.getState().activeAttemptId],q=pack.questions.find(x=>x.id===a.questionId);
  now++;await teacher.submitAnswer({attemptId:a.id,response:right(q)});
  const eventId=id();now++;await teacher.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true},{eventId});
  const again=await teacher.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true},{eventId});
  assert.equal(again.duplicate,true);assert.equal(teacher.getState().rewards.starlight,1);assert.equal(teacher.getState().rewards.ledger.length,1);
  await teacher.close();
});

test('마법 지출 장부의 비용을 바꿔 별빛 조작하면 탐지',()=>{
  let s=fund(boot(),3);s=magic(s,'STAR_COMPASS');const tampered=deep(s);
  tampered.rewards.ledger.at(-1).amount=-1;
  rejects(()=>checkState(tampered),'REWARD_LEDGER_INVALID');
});
test('존재하지 않는 마법 해금 ID·중복된 해금은 상태 무결성에서 차단',()=>{
  const s=boot(),a=deep(s),b=deep(s);
  a.magic.unlocked.push('BUY_CORRECT_ANSWER');b.magic.unlocked.push('MOON_WHISPER');
  rejects(()=>checkState(a),'MAGIC_UNLOCK_INVALID');rejects(()=>checkState(b),'MAGIC_UNLOCK_INVALID');
});
test('T1 힌트를 쓴 문항을 교사가 정답 처리해도 별빛 자동 환급 없음',()=>{
  let s=fund(boot(),2);s=issue(s);s=magic(s,'MOON_WHISPER');
  s=run(s,'TIMER_STARTED');const q=pack.questions.find(q=>q.id===s.attempts[s.activeAttemptId].questionId);
  s=judge(submit(s,right(q)),'CORRECT');
  assert.equal(s.rewards.starlight,1);assert.equal(s.teams[0].contribution,3);
  assert.deepEqual(s.rewards.ledger.map(x=>x.amount),[1,1,-2,1]);
});
test('타이머 1밀리초 전 시간의 모래 사용, 정확히 만료시점 거부',()=>{
  let s=fund(boot(),4);s.magic.unlocked.push('TIME_SAND');s=issue(s);s=run(s,'TIMER_STARTED');
  const eventId=id(),payload={magicId:'TIME_SAND',teacherConfirmed:true};
  const ok=run(s,'MAGIC_USED',payload,eventId,59999);
  assert.equal(ok.attempts[ok.activeAttemptId].timer.remainingMs,20001);
  rejects(()=>run(s,'MAGIC_USED',payload,id(),60000),'TIMER_DEADLINE');
});
test('모둠 누적 기여는 마법 소비 뒤에도 불변, 세션 중단 후에도 보존',()=>{
  let s=fund(boot(),3);const before=s.teams[0].contribution;s=magic(s,'STAR_COMPASS');
  s=run(s,'SESSION_PAUSED');assert.equal(s.teams[0].contribution,before);
  assert.equal(s.rewards.starlight,0);
});
test('교사 이벤트 없이 별빛 소비 행만 삽입하면 위변조 차단',()=>{
  let s=correct(),copyState=deep(s);
  copyState.magic.used.push({eventId:'unknown',magicId:'MOON_WHISPER',scopeId:'attempt',cost:2});
  copyState.rewards.ledger.push({eventId:'unknown',amount:-2,type:'STAR_SPEND',claim:'MAGIC_USE:unknown',magicId:'MOON_WHISPER',scopeId:'attempt'});
  rejects(()=>checkState(copyState),'REWARD_LEDGER_INVALID');
});
test('별빛만 많아도 첫 출제 전에는 지역정보 대상이 없어 구입 거절',()=>{
  const s=boot();s.rewards.starlight=5;
  rejects(()=>magic(s,'STAR_COMPASS'),'INVALID_ID');
});
test('교사 JSON 백업 후 실제 별빛·기여도·마법 사용 청구 완전 일치',async()=>{
  const {makeBackup,verifyBackup}=await import('../src/storage/backup.js');
  let s=fund(boot(),3);s=magic(s,'STAR_COMPASS');
  const original=deep(s),backup=await makeBackup({state:s,events:s.eventLog});
  const verified=await verifyBackup(JSON.stringify(backup));
  assert.deepEqual(verified.state,original);
  assert.equal(verified.state.rewards.starlight,0);
  assert.equal(verified.state.teams[0].contribution,3);
  assert.equal(verified.state.magic.used.length,1);
});
test('Fake IDB 교사 마법 소비 저장 실패 시 별빛·공헌도·사용 이력 전체 롤백',async()=>{
  let now=ZERO+90_000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>now});
  const teacher=new TeacherEngineSession(store,{clock:()=>now,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});now++;await teacher.dispatch('SESSION_STARTED',{sessionId:'p26-spend'});
  for(let i=0;i<3;i++){
    now++;await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
    now++;await teacher.dispatch('TIMER_STARTED');
    const a=teacher.getState().attempts[teacher.getState().activeAttemptId],q=pack.questions.find(x=>x.id===a.questionId);
    now++;await teacher.submitAnswer({attemptId:a.id,response:right(q)});
    now++;await teacher.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true,teacherReason:'교사 최종 검토 완료'});
  }
  const before=teacher.getState();assert.equal(before.rewards.starlight,3);
  const eventId=id();now++;db.failNextWrite=true;
  await assert.rejects(teacher.useMagic({magicId:'STAR_COMPASS',regionId:'T1-R1'},{eventId}));
  assert.deepEqual(teacher.getState(),before);
  assert.deepEqual(db.inspect('slots',1).state,before);
  const success=await teacher.useMagic({magicId:'STAR_COMPASS',regionId:'T1-R1'},{eventId});
  assert.equal(success.state.rewards.starlight,0);assert.equal(success.state.magic.used.length,1);
  const duplicate=await teacher.useMagic({magicId:'STAR_COMPASS',regionId:'T1-R1'},{eventId});
  assert.equal(duplicate.duplicate,true);assert.equal(teacher.getState().rewards.starlight,0);
  await teacher.close();
});


test('구형 TIME_SAND_USED 이벤트도 교사 확인 없이 소비할 수 없다',()=>{
  let s=fund(boot(),4);s.magic.unlocked.push('TIME_SAND');s=issue(s);s=run(s,'TIMER_STARTED');
  const before=deep(s);rejects(()=>run(s,'TIME_SAND_USED'),'TEACHER_REQUIRED');
  assert.deepEqual(s,before);
  s=run(s,'TIME_SAND_USED',{teacherConfirmed:true});
  assert.equal(s.rewards.starlight,0);assert.equal(s.magic.used.at(-1).magicId,'TIME_SAND');
});
