import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,publicProjection} from '../src/engine/model.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {inspectDrawPool,planQuestionDraw,validateDrawCommand,listRecoveryCandidates} from '../src/questions/draw.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {verifyBackup} from '../src/storage/backup.js';

const raw=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const qe=createQuestionEngine(raw),ids=qe.ids();
const start=180_000_000_0000;let next=0;
const id=()=>`qdraw-${++next}`;
const seeded=seed=>{let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2**32;};};
const cmd=(type,at,payload={})=>({eventId:id(),type,at,payload});
const event=(s,type,payload={},delta=1)=>reduceCommand(s,cmd(type,s.meta.updatedAt+delta,payload)).state;
function init({slot=1,teamCount=4}={}){
  let s=newExpedition({slot,expeditionId:`exp-${slot}`,createdAt:start,world,teamCount});
  s=event(s,'EXPEDITION_CREATED');s=event(s,'SESSION_STARTED',{sessionId:'lesson-1'});
  return s;
}
function issue(state,{regionId='T1-R1',teamId='TEAM_01',random=seeded(13)}={}){
  const at=state.meta.updatedAt+1,attemptId=id();
  const payload=planQuestionDraw(state,qe,{regionId,teamId,at,attemptId,random});
  const res=reduceCommand(state,cmd('QUESTION_DRAWN',at,payload));
  return {state:res.state,payload,event:res.event};
}
function resolve(state){return event(state,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'2-2 출제 순서 검사용 교사 무효 처리'});}
function exhausted({regionId='T1-R1',rng=seeded(19)}={}){
  let s=init();
  for(let i=0;i<60;i++){s=issue(s,{regionId,random:rng}).state;s=resolve(s);}
  return s;
}
const checkReject=(fn,code)=>assert.throws(fn,e=>e.code===code);
const checkAsync=async(p,code)=>assert.rejects(p,e=>e.code===code);

test('공식 전체 60문항을 지역별 고정팩 없이 공유, 처음에는 미출제 60개',()=>{
  const s=init(),pool=inspectDrawPool(s,qe);
  assert.equal(pool.mode,'NEW');assert.equal(pool.total,60);
  assert.equal(pool.unseenIds.length,60);assert.equal(pool.reviewIds.length,0);
  assert.equal(pool.recoveryOnlyIds.length,0);
  assert.deepEqual(new Set(pool.unseenIds),new Set(ids));
});

test('한 번 발행된 질문은 NEW 후보에서 사라짐, 이력/스냅샷은 동시 저장',()=>{
  const s=init(),{state:nextState,payload}=issue(s);
  assert.equal(nextState.questions.issuedIds.length,1);
  assert.equal(nextState.questions.draws.length,1);
  assert.equal(nextState.questions.issuedIds[0],payload.questionId);
  assert.equal(nextState.attempts[payload.attemptId].timer.phase,'PREPARED');
  assert.equal(nextState.attempts[payload.attemptId].questionSnapshot.questionId,payload.questionId);
  assert.equal(nextState.attempts[payload.attemptId].questionRevision,payload.questionSnapshot.questionRevision);
  assert.equal(nextState.eventLog.at(-1).type,'QUESTION_DRAWN');
  assert.equal(nextState.rewards.keys,0);assert.equal(nextState.rewards.starlight,0);
});

test('기존 시도가 남아 있으면 중복 출제 차단',()=>{
  const s=issue(init()).state;
  checkReject(()=>planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:'new',at:s.meta.updatedAt+1}), 'ATTEMPT_ACTIVE');
});

test('시도 교사 종료 뒤에만 새 문항 준비 허용; 자동 보상 지급 없음',()=>{
  let s=issue(init()).state;
  s=resolve(s);
  assert.equal(s.rewards.starlight,0);
  const another=issue(s);
  assert.equal(another.state.questions.issuedIds.length,2);
  assert.equal(another.state.rewards.ledger.length,0);
});

test('60회 발행해도 처음 60회는 고유 ID 60개, 전부 NEW',()=>{
  const s=exhausted();
  assert.equal(s.questions.issuedIds.length,60);
  assert.equal(new Set(s.questions.issuedIds).size,60);
  assert.equal(s.questions.draws.length,60);
  assert.ok(s.questions.draws.every(x=>x.mode==='NEW'));
  assert.equal(s.eventLog.filter(x=>x.type==='QUESTION_DRAWN').length,60);
  assert.equal(s.rewards.starlight,0);
  assert.equal(inspectDrawPool(s,qe).mode,'BLOCKED');
});

test('60개 소진 후 정답으로 확인된 문항이 없으면 무단 재출제하지 않음',()=>{
  const s=exhausted();const pool=inspectDrawPool(s,qe);
  assert.equal(pool.teacherActionRequired,true);
  assert.equal(pool.blockedReason,'NO_ELIGIBLE_NORMAL_QUESTIONS');
  checkReject(()=>planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at:s.meta.updatedAt+1}),'DRAW_POOL_EXHAUSTED');
});

test('60문항 소진 후 기존 정답 문제만 REVIEW 후보, 리뷰는 최초 보상 대상 아님',()=>{
  const s=exhausted();const correctIds=s.questions.issuedIds.slice(0,5);
  s.questions.reviewEligibleIds.push(...correctIds);
  const pool=inspectDrawPool(s,qe);
  assert.equal(pool.mode,'REVIEW');
  assert.deepEqual(new Set(pool.regularIds),new Set(correctIds));
  const {state:review,payload}=issue(s);
  assert.equal(payload.mode,'REVIEW');assert.equal(payload.firstIssue,false);
  assert.ok(correctIds.includes(payload.questionId));
  assert.equal(review.questions.issuedIds.length,60);
  assert.equal(review.questions.draws.length,61);
  assert.equal(review.rewards.starlight,0);
});

test('미출제 1문항이라도 남아 있으면 기존 정답 복습보다 NEW 우선',()=>{
  let s=init();for(let i=0;i<59;i++){s=resolve(issue(s).state);} // 59 used
  s.questions.reviewEligibleIds.push(s.questions.issuedIds[0]);
  const pool=inspectDrawPool(s,qe);
  assert.equal(pool.mode,'NEW');assert.equal(pool.regularIds.length,1);
  assert.notEqual(pool.regularIds[0],s.questions.reviewEligibleIds[0]);
});

test('기존 오답은 미회수 상태에서 일반 신규/복습 후보 제외',()=>{
  const s=exhausted(),bad=s.questions.issuedIds[0],good=s.questions.issuedIds[1];
  s.questions.recoveryOnlyIds.push(bad);s.questions.reviewEligibleIds.push(good);
  const p=inspectDrawPool(s,qe);assert.equal(p.mode,'REVIEW');
  assert.deepEqual(p.regularIds,[good]);
  assert.deepEqual(p.recoveryOnlyIds,[bad]);
  const got=issue(s).payload;assert.equal(got.questionId,good);
});

test('미회수/복습이 같은 ID를 공유하는 잘못된 상태는 차단',()=>{
  const s=exhausted(),bad=s.questions.issuedIds[0];
  s.questions.recoveryOnlyIds.push(bad);s.questions.reviewEligibleIds.push(bad);
  checkReject(()=>inspectDrawPool(s,qe),'DRAW_HISTORY_INVALID');
});

test('원본 문제은행의 ID를 변조하거나 빈 집합을 넘기면 출제 중단',()=>{
  const s=resolve(issue(init()).state);s.questions.issuedIds[0]='NOT_IN_SOURCE';
  checkReject(()=>inspectDrawPool(s,qe),'DRAW_HISTORY_INVALID');
});

test('문제팩 ID/버전이 다른 원정에 기존 문항 무단 출제 금지',()=>{
  const s=init();s.meta.packVersion='999';
  checkReject(()=>inspectDrawPool(s,qe),'PACK_MISMATCH');
});

test('난수 주입값 NaN/음수/1/문자열을 모두 거부',()=>{
  for(const value of [NaN,-.1,1,'0.5',Infinity,undefined]){
    const s=init();checkReject(()=>planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at:s.meta.updatedAt+1,random:()=>value}),'RANDOM_INVALID');
  }
});

test('동일 시드면 발행 ID 시퀀스가 같고 시드를 바꾸면 달라짐',()=>{
  const seq=seed=>{const random=seeded(seed);let s=init(),out=[];for(let i=0;i<15;i++){let res=issue(s,{random});s=resolve(res.state);out.push(res.payload.questionId);}return out;};
  assert.deepEqual(seq(99),seq(99));
  assert.notDeepEqual(seq(99),seq(101));
});

test('유형/난도 비율 균형: 60회 전부 출제하면 정확히 원본 유형 비율',()=>{
  const s=exhausted(),count={};for(const questionId of s.questions.issuedIds){const q=qe.getNormalized(questionId);count[q.type]=(count[q.type]??0)+1;}
  assert.deepEqual(count,qe.info().counts);
  for(const difficulty of [1,2,3,4,5]){
    assert.equal(s.questions.issuedIds.filter(id=>qe.getNormalized(id).difficulty===difficulty).length,
      raw.questions.filter(q=>q.difficulty===difficulty).length);
  }
});

test('유형·난도 균형: 최초 20회는 원본 비율과 유사하게 분포',()=>{
  const s=exhausted(),first=s.questions.issuedIds.slice(0,20);
  for(const [type,n] of Object.entries(qe.info().counts)){
    const actual=first.filter(id=>qe.getNormalized(id).type===type).length;
    assert.ok(Math.abs(actual-n/3)<=2, `${type}: ${actual}, expected ${n/3}`);
  }
  for(const difficulty of [1,2,3,4,5]){
    const count=raw.questions.filter(q=>q.difficulty===difficulty).length;
    const actual=first.filter(id=>qe.getNormalized(id).difficulty===difficulty).length;
    assert.ok(Math.abs(actual-count/3)<=2, `difficulty ${difficulty}: ${actual}`);
  }
});

test('같은 지역·같은 문항의 REVIEW 반복을 다른 선택지가 있을 때 회피',()=>{
  const s=exhausted();const [a,b]=s.questions.issuedIds;
  s.questions.reviewEligibleIds.push(a,b);
  // Simulates two eligible solved questions with one never reviewed in this region.
  // Prior draws occurred before the current extra-region context (next stage manages transitions).
  for(const row of s.questions.draws) row.regionId='T1-R2';
  s.questions.draws[0].regionId='T1-R1';
  s.world.currentRegionId='T1-R1';
  const result=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at:s.meta.updatedAt+1,random:()=>0});
  assert.equal(result.questionId,b);
});

test('잘못된 지역·모둠·차시 상태에서는 출제를 허용하지 않음',()=>{
  const s=init();
  const base={regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at:s.meta.updatedAt+1};
  checkReject(()=>planQuestionDraw(s,qe,{...base,regionId:'NO_REGION'}),'REGION_INVALID');
  checkReject(()=>planQuestionDraw(s,qe,{...base,teamId:'TEAM_NOT_EXIST'}),'INVALID_TEAM');
  const stopped=event(s,'SESSION_PAUSED');
  checkReject(()=>planQuestionDraw(stopped,qe,{...base,at:stopped.meta.updatedAt+1}),'SESSION_NOT_ACTIVE');
});

test('문항 스냅샷 변조·팩 버전 불일치 이벤트는 기록 전 차단',()=>{
  const s=init(),at=s.meta.updatedAt+1;
  const plan=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at,random:()=>0});
  const invalid=structuredClone(plan);invalid.questionSnapshot.questionRevision=999;
  checkReject(()=>reduceCommand(s,cmd('QUESTION_DRAWN',at,invalid)),'DRAW_SNAPSHOT_INVALID');
  invalid.questionSnapshot=structuredClone(plan.questionSnapshot);invalid.questionSnapshot.packVersion='OTHER';
  checkReject(()=>reduceCommand(s,cmd('QUESTION_DRAWN',at,invalid)),'DRAW_SNAPSHOT_INVALID');
  assert.equal(s.questions.draws.length,0);
});

test('직접 조작한 REVIEW 이벤트는 60개 소진 전/복습 미승인 시 거부',()=>{
  const s=init(),at=s.meta.updatedAt+1;
  const plan=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at,random:()=>0});
  plan.mode='REVIEW';plan.firstIssue=false;
  checkReject(()=>reduceCommand(s,cmd('QUESTION_DRAWN',at,plan)),'REVIEW_NOT_ELIGIBLE');
});

test('같은 이벤트 ID 반복은 멱등 처리, 다른 payload는 충돌 차단',()=>{
  const s=init(),at=s.meta.updatedAt+1;
  const plan=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at,random:()=>0});
  const evt={type:'QUESTION_DRAWN',at,eventId:'DRAW_ID_1',payload:plan};
  const a=reduceCommand(s,evt).state;
  const dup=reduceCommand(a,evt);assert.equal(dup.duplicate,true);assert.equal(dup.event,null);
  assert.equal(a.questions.issuedIds.length,1);assert.equal(a.meta.revision,s.meta.revision+1);
  checkReject(()=>reduceCommand(a,{...evt,payload:{...evt.payload,questionId:'DIFFERENT'}}),'EVENT_ID_CONFLICT');
});

test('출제 시도 스냅샷과 학생용 공개 projection에 정답·해설을 넣지 않음',()=>{
  const s=issue(init()).state;
  const student=publicProjection(s,s.meta.updatedAt+1);
  assert.equal(JSON.stringify(student).includes('correct'),false);
  assert.equal(JSON.stringify(student).includes('rubric'),false);
  assert.equal(JSON.stringify(student).includes('answer'),false);
  const attempt=s.attempts[s.activeAttemptId];
  assert.ok(attempt.questionSnapshot.issuedSnapshot.answer);
  assert.ok(attempt.questionSnapshot.originalSnapshot.answer);
});

test('회수 목록은 전용으로 유지, 다음 지역에 들어간 뒤에만 자연 등장',()=>{
  const s=resolve(issue(init()).state);const questionId=s.questions.issuedIds[0];s.questions.recoveryOnlyIds.push(questionId);
  s.recovery.pending.push({id:'REC-01',questionId,originTeamId:'TEAM_02',originRegionId:'T1-R1',status:'PENDING'});
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R1'}).length,0);
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R2'}).length,0); // 방문 순서 증거 없는 상황에서는 보수적으로 보류
  s.world.regionEntryOrder=['T1-R1','T1-R2'];
  const available=listRecoveryCandidates(s,{inRegionId:'T1-R2'});
  assert.equal(available.length,1);assert.equal(available[0].originTeamId,'TEAM_02');
  assert.equal(inspectDrawPool(s,qe).regularIds.includes(questionId),false);
});

test('회수 강제 호출에는 교사확인이 필요하고 HELD는 자연 등장하지 않음',()=>{
  const s=resolve(issue(init()).state);const questionId=s.questions.issuedIds[0];s.questions.recoveryOnlyIds.push(questionId);
  s.recovery.pending.push({id:'REC-2',questionId,originTeamId:'TEAM_02',originRegionId:'T1-R1',status:'HELD'});
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R2'}).length,0);
  checkReject(()=>listRecoveryCandidates(s,{inRegionId:'T1-R1',force:true}),'TEACHER_REQUIRED');
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R1',force:true,teacherConfirmed:true}).length,1);
});

test('출제 하나의 IDB 거래에 시도·문항 ID·이벤트·체크포인트를 기록',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>start+500});
  const teacher=new TeacherEngineSession(store,{clock:()=>start+500,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'lesson-stored'});
  const before=teacher.getState().meta.revision;
  const made=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:seeded(47)});
  assert.equal(made.committed,true);assert.equal(made.state.meta.revision,before+1);
  assert.equal(db.inspect('slots',1).state.questions.issuedIds.length,1);
  assert.equal(db.inspect('events',`1:${String(before+1).padStart(12,'0')}`).event.type,'QUESTION_DRAWN');
  assert.equal(db.inspect('checkpoints','1:previous').revision,before);
  assert.equal(db.inspect('checkpoints','1:latest').revision,before+1);
  await teacher.close();
});

test('IDB 쓰기 실패 시 출제 이력·시도·이벤트 전부 유지, 재시도 가능',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>start+800});
  const teacher=new TeacherEngineSession(store,{clock:()=>start+800,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'lesson-error'});
  const before=teacher.getState();
  db.failNextWrite=true;
  await assert.rejects(teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0}),e=>e.name==='QuotaExceededError');
  assert.deepEqual(teacher.getState(),before);
  assert.equal(db.inspect('slots',1).state.questions.issuedIds.length,0);
  assert.equal(db.inspect('events',`1:${String(before.meta.revision+1).padStart(12,'0')}`),undefined);
  const retry=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  assert.equal(retry.committed,true);assert.equal(teacher.getState().questions.issuedIds.length,1);
  await teacher.close();
});

test('同슬롯 동시 draw 호출은 직렬 실행되어 같은 문항을 중복 배정하지 않음',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>start+900});
  const teacher=new TeacherEngineSession(store,{clock:()=>start+900,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'lesson-concurrent'});
  const results=await Promise.allSettled([
    teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0}),
    teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_02',random:()=>0})
  ]);
  assert.deepEqual(results.map(x=>x.status),['fulfilled','rejected']);
  assert.equal(results[1].reason.code,'ATTEMPT_ACTIVE');
  assert.equal(teacher.getState().questions.issuedIds.length,1);
  await teacher.close();
});

test('출제 후 JSON 백업과 독립 DB 복원에 원본/발행 스냅샷과 이력 유지',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>start+2000});
  const teacher=new TeacherEngineSession(store,{clock:()=>start+2000,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'lesson-backup'});
  const made=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  const original=made.state.attempts[made.attemptId].questionSnapshot;
  const exported=await teacher.exportJSON();
  assert.equal((await verifyBackup(exported)).state.questions.issuedIds.length,1);
  await teacher.close();
  const fresh=new FakeDatabase(),store2=new IndexedDbExpeditionStore(fresh,{clock:()=>start+2500});
  const t2=new TeacherEngineSession(store2,{clock:()=>start+2500,newId:id,heartbeatMs:0});
  const restored=await t2.restoreJSONToEmptySlot(1,exported);
  assert.equal(restored.questions.issuedIds.length,1);
  assert.deepEqual(restored.attempts[made.attemptId].questionSnapshot,original);
  assert.equal(restored.attempts[made.attemptId].timer.phase,'PREPARED');
  assert.equal(restored.sessions[0].phase,'PAUSED');
  await t2.close();
});

test('3슬롯 문제 출제 이력은 독립, 기존 운영 저장키 접근 없음',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>start+3000});
  const teachers=[];
  for(const slot of [1,2,3]){
    const t=new TeacherEngineSession(store,{clock:()=>start+3000,newId:id,heartbeatMs:0});
    await t.create({slot,world});await t.dispatch('SESSION_STARTED',{sessionId:`l-${slot}`});
    await t.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>.9});teachers.push(t);
  }
  const first=teachers[0].getState().questions.issuedIds[0];
  assert.equal(teachers[1].getState().questions.issuedIds[0],first);
  assert.equal(teachers[2].getState().questions.issuedIds[0],first);
  assert.ok(teachers.every(t=>t.getState().questions.draws.length===1));
  for(const t of teachers)await t.close();
});

test('동일한 새 문항을 REVIEW로 위장하거나 recoveryOnly를 신규로 위장하는 직접 명령 거부',()=>{
  let s=init();const res=issue(s);s=resolve(res.state);
  const snap=res.payload.questionSnapshot;
  const forged={...res.payload,attemptId:id(),mode:'NEW',firstIssue:true,questionSnapshot:{...structuredClone(snap),attemptId:'bogus'}};
  checkReject(()=>validateDrawCommand(s,forged,s.meta.updatedAt+1),'QUESTION_ALREADY_ISSUED');
});

test('교사 창 이벤트 ID 중복 클릭 시 추첨하지 않고 같은 출제 기록 반환',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>start+5000});
  const teacher=new TeacherEngineSession(store,{clock:()=>start+5000,newId:id,heartbeatMs:0});
  await teacher.create({slot:1,world});await teacher.dispatch('SESSION_STARTED',{sessionId:'retry'});
  const first=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',eventId:'idempotent-event',random:()=>0});
  const rev=teacher.getState().meta.revision;
  const retry=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',eventId:'idempotent-event',random:()=>0.9});
  assert.equal(retry.committed,false);assert.equal(retry.duplicate,true);
  assert.equal(retry.questionId,first.questionId);assert.equal(retry.attemptId,first.attemptId);
  assert.equal(teacher.getState().meta.revision,rev);assert.equal(teacher.getState().questions.draws.length,1);
  await checkAsync(teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_02',eventId:'idempotent-event'}),'EVENT_ID_CONFLICT');
  await teacher.close();
});

test('저장된 신규 발행 목록이 로그와 다르면 무결성 검사를 통과하지 못함',()=>{
  const s=issue(init()).state;
  s.questions.draws[0].questionId='FORGED';
  checkReject(()=>inspectDrawPool(s,qe),'DRAW_HISTORY_INVALID');
});

test('출제 이벤트의 issuedAt을 변경해 재전송하면 검증 거부',()=>{
  const s=init(),at=s.meta.updatedAt+1;
  const p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at,random:()=>0});
  p.questionSnapshot.issuedAt+=1;
  checkReject(()=>reduceCommand(s,cmd('QUESTION_DRAWN',at,p)),'DRAW_SNAPSHOT_INVALID');
});


test('방문 순서 증거 없이 다른 지역이라는 이유만으로 자연 회수를 내보내지 않음',()=>{
  const s=resolve(issue(init()).state),questionId=s.questions.issuedIds[0];
  s.questions.recoveryOnlyIds.push(questionId);
  s.recovery.pending.push({id:'REC-history',questionId,originTeamId:'TEAM_01',originRegionId:'T1-R2',status:'PENDING'});
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R1'}).length,0);
  s.world.regionEntryOrder=['T1-R2','T1-R3'];
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R1'}).length,0);
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R3'}).length,1);
  assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R2'}).length,0);
});
