/** PHASE 2-9 end-to-end engine integration, NOT actual browser or actual IndexedDB. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness,QUESTIONS,PACK,WORLD} from './helpers/phase29.mjs';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore,LEASE_TTL_MS} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {verifyBackup} from '../src/storage/backup.js';
import {listRecoveryCandidates} from '../src/questions/draw.js';
import {renderRegionResultMarkup} from '../src/world/result-card.js';
import {checkState,publicProjection} from '../src/engine/model.js';

const expectedError=async(fn,code)=>assert.rejects(fn,e=>e.code===code,`Expected ${code}`);
test('공식 60문항 데이터·T1-R1 실제 지역 이름과 ID 유지',()=>{
 assert.equal(QUESTIONS.info().count,60);
 assert.equal(WORLD.themes[0].regions[0].name,'달빛 이끼길');
 assert.equal(WORLD.themes[0].regions[0].id,'T1-R1');
 assert.equal(new Set(PACK.questions.map(q=>q.id)).size,60);
});
test('교사용 하나의 세션으로 1지역: 2문항·오답 가로채기·지역 열쇠 원자적 완료',async()=>{
 const h=createHarness();await h.init();const {first,second,state,result}=await h.firstRegion();
 assert.equal(state.meta.slot,1);assert.notEqual(first.questionId,second.questionId);
 assert.deepEqual([result.processed,result.correct,result.incorrect,result.unresolvedRecovery],[2,1,1,1]);
 assert.deepEqual([state.rewards.keys,state.rewards.starlight], [1,2]);
 assert.equal(state.world.regions['T1-R1'].status,'COMPLETED');
 assert.equal(state.teams[0].contribution,2);assert.equal(state.teams[1].contribution,0);
 assert.equal(state.recovery.pending[0].originTeamId,'TEAM_02');
 assert.equal(state.interception.records[0].judgement.solverTeamId,'TEAM_01');
 assert.equal(state.rewards.ledger.filter(x=>x.type==='KEY_EARN').length,1);
 assert.equal(state.world.results.length,1);
 assert.equal(h.database.inspect('checkpoints','1:latest').revision,state.meta.revision);
 assert.equal(h.database.inspect('events',`1:${String(state.meta.revision).padStart(12,'0')}`).event.type,'REGION_COMPLETED');
 await h.session.close();
});
test('완료 상태에서 중복 완료 이벤트는 한 번만 열쇠 지급, 새 ID 재완료 금지',async()=>{
 const h=createHarness();await h.init();await h.firstRegion();
 const proof=h.session.getState().world.results[0];const count=h.session.getState().rewards.ledger.length;
 const retry=await h.do(()=>h.session.completeRegion('T1-R1',{eventId:proof.eventId}));
 assert.equal(retry.duplicate,true);
 assert.equal(h.session.getState().rewards.ledger.length,count);
 await expectedError(()=>h.do(()=>h.session.completeRegion('T1-R1')),'REGION_NOT_ACTIVE');
 await h.session.close();
});
test('지역 완료 전 미회수 오답은 계속 대기, 학생 공개 결과에 정답/PIN/감사 숨김',async()=>{
 const h=createHarness();await h.init();await h.firstRegion();
 const publicState=h.session.getStudentProjection();
 const serial=JSON.stringify(publicState);
 for(const secret of ['questionSnapshot','originalSnapshot','teacherReason','eventLog','audit','answerDisplay','rubric','memberIds','reconciliation'])
  assert.equal(serial.includes(`"${secret}"`),false,secret);
 assert.equal(publicState.regionResult.processed,2);
 const markup=renderRegionResultMarkup(h.session.getRegionResult('T1-R1',{publicOnly:true}),{
  regionName:'달빛 이끼길',themeName:'푸른 달빛의 숲'
 });
 assert.ok(markup.includes('달빛 이끼길'));
 assert.ok(markup.includes('지역 최초 완료 열쇠 +1'));
 assert.ok(!markup.includes('teacherReason'));
 await h.session.close();
});
test('완료된 첫 지역을 다음 지역에서 원모둠 자연 회수, 지역 키 불변·별빛 1추가',async()=>{
 const h=createHarness();await h.init();await h.firstRegion();
 assert.equal(listRecoveryCandidates(h.session.getState(),{inRegionId:'T1-R1'}).length,0);
 const recovered=await h.recoveryNextRegion();const state=h.session.getState();
 assert.equal(state.recovery.resolved.length,1);
 assert.equal(state.recovery.resolved[0].id,recovered);
 assert.equal(state.recovery.resolved[0].originTeamId,'TEAM_02');
 assert.equal(state.recovery.resolved[0].solverTeamId,'TEAM_02');
 assert.deepEqual([state.rewards.keys,state.rewards.starlight],[1,3]);
 assert.deepEqual(state.teams.slice(0,2).map(t=>t.contribution),[2,1]);
 assert.equal(state.world.results.length,1);assert.equal(h.session.getRegionResult('T1-R1').unresolvedRecovery,0);
 checkState(state);await h.session.close();
});
test('강제 종료 유사 재접속: 원활한 완료 상태 재개·원문제 이력 보존',async()=>{
 const h=createHarness();await h.init();const {second,state}=await h.firstRegion();const before=state.meta.revision;
 const backup=await h.do(()=>h.session.exportJSON());assert.equal((await verifyBackup(backup)).state.meta.revision,before);
 await h.session.close();
 const restored=new TeacherEngineSession(h.store,{clock:h.clock,newId:h.newId,heartbeatMs:0});
 await h.do(()=>restored.open(1));
 const got=restored.getState();assert.equal(got.sessions.at(-1).phase,'PAUSED');
 assert.equal(got.world.regions['T1-R1'].status,'COMPLETED');
 assert.equal(got.attempts[second.attemptId].judgement.decision,'INCORRECT');
 assert.equal(got.rewards.keys,1);assert.equal(got.rewards.starlight,2);
 await h.do(()=>restored.dispatch('SESSION_RESUMED'));
 await h.do(()=>restored.enterRegion('T1-R2'));
 assert.equal(listRecoveryCandidates(restored.getState(),{inRegionId:'T1-R2'}).length,1);
 await restored.close();
});
test('JSON 내보내기 → 별도 모의 DB 빈 슬롯 복원, 이전 지역 결과 보존',async()=>{
 const h=createHarness();await h.init();const {state}=await h.firstRegion();
 const json=await h.do(()=>h.session.exportJSON());await h.session.close();
 const db2=new FakeDatabase(),store2=new IndexedDbExpeditionStore(db2,{clock:h.clock});
 const t2=new TeacherEngineSession(store2,{clock:h.clock,newId:h.newId,heartbeatMs:0});
 await h.do(()=>t2.restoreJSONToEmptySlot(1,json));
 const s=t2.getState();checkState(s);
 assert.equal(s.rewards.keys,1);assert.equal(s.world.results.length,1);
 assert.equal(s.sessions.at(-1).phase,'PAUSED');
 assert.equal(s.eventLog.at(-1).type,'RECOVER_INTERRUPTED');
 assert.ok(s.meta.revision>state.meta.revision);
 await t2.close();
});
test('교사가 지역 완료 직전에 DB 저장 실패 시 결과·열쇠·체크포인트 모두 롤백',async()=>{
 const h=createHarness();await h.init();await h.answerCorrect('TEAM_01');await h.answerCorrect('TEAM_02');
 const before=h.session.getState(),latest=h.database.inspect('checkpoints','1:latest');
 h.database.failNextWrite=true;
 await assert.rejects(h.do(()=>h.session.completeRegion('T1-R1')),e=>e.name==='QuotaExceededError');
 assert.deepEqual(h.session.getState(),before);
 assert.deepEqual(h.database.inspect('slots',1).state,before);
 assert.equal(h.database.inspect('checkpoints','1:latest').revision,latest.revision);
 assert.equal(h.session.getState().rewards.keys,0);
 await h.do(()=>h.session.completeRegion('T1-R1'));
 assert.equal(h.session.getState().rewards.keys,1);await h.session.close();
});
test('브라우저 닫힘 유사 모형: 기록 중 RUNNING 타이머는 소유권 만료 이후 안전 정지',async()=>{
 const h=createHarness();await h.init();const d=await h.draw('TEAM_01');await h.start();
 assert.equal(h.session.getState().attempts[d.attemptId].timer.phase,'RUNNING');
 // Do not close the original facade: simulate a process that vanished without releasing its lease.
 h.advance(LEASE_TTL_MS+1000);
 const teacher2=new TeacherEngineSession(h.store,{clock:h.clock,newId:h.newId,heartbeatMs:0});
 await h.do(()=>teacher2.open(1));
 const s=teacher2.getState();assert.equal(s.attempts[d.attemptId].timer.phase,'PAUSED');
 assert.equal(s.sessions.at(-1).phase,'PAUSED');
 await expectedError(()=>h.do(()=>h.session.dispatch('TIMER_PAUSED')),'WRITER_BUSY');
 await teacher2.close();
});
test('정답 정정으로 보상 재계산 후 완료 기록은 유지, 소비 부족 시 정산 필요',async()=>{
 const h=createHarness();await h.init();const {first}=await h.firstRegion();
 await h.do(()=>h.session.correctJudgement({scope:'ANSWER',targetId:first.attemptId,decision:'INCORRECT',reason:'답안 재검토 결과 정답 근거 불충분'}));
 const s=h.session.getState();checkState(s);
 assert.equal(s.world.regions['T1-R1'].status,'COMPLETED');
 assert.equal(s.rewards.keys,1);
 assert.equal(s.world.results.length,1);
 assert.equal(s.teams[0].contribution,1); // interception remains, original credit revoked
 assert.equal(h.session.getRegionResult('T1-R1').incorrect,2);
 await h.session.close();
});
test('슬롯 1 완주 후 슬롯 2 새 탐험은 원본 진행·보상 간섭이 없음',async()=>{
 const db=new FakeDatabase(),h=createHarness({db,slot:1});await h.init();await h.firstRegion();
 const first=h.session.getState();await h.session.close();
 const other=createHarness({db,slot:2,initialTime:h.time+1000});await other.init();
 assert.equal(other.session.getState().rewards.keys,0);
 assert.equal(other.session.getState().world.results.length,0);
 assert.equal(db.inspect('slots',1).state.rewards.keys,1);
 assert.equal(db.inspect('slots',1).state.meta.revision,first.meta.revision);
 await other.session.close();
});
test('문제 진행 중 지역 완료 및 다음 지역 진입 거부',async()=>{
 const h=createHarness();await h.init();await h.draw('TEAM_01');
 await expectedError(()=>h.do(()=>h.session.completeRegion('T1-R1')),'ATTEMPT_ACTIVE');
 await expectedError(()=>h.do(()=>h.session.enterRegion('T1-R2')),'ATTEMPT_ACTIVE');
 assert.equal(h.session.getState().rewards.keys,0);await h.session.close();
});
test('교사 판정 완료 전에 지역 결과/열쇠 지급 불가',async()=>{
 const h=createHarness();await h.init();const d=await h.draw('TEAM_01');await h.start();await h.submitCorrect(d);
 await expectedError(()=>h.do(()=>h.session.completeRegion('T1-R1')),'ATTEMPT_ACTIVE');
 assert.equal(h.session.getState().rewards.keys,0);await h.session.close();
});

test('4모둠 한 지역 기본 4문제 완료, 별빛 4·열쇠 1 (저장된 교사 이벤트)',async()=>{
 const h=createHarness({teamCount:4});await h.init();
 for(let i=1;i<=4;i++)await h.answerCorrect(`TEAM_0${i}`);
 await h.do(()=>h.session.completeRegion('T1-R1'));
 const s=h.session.getState();checkState(s);
 assert.equal(s.world.regions['T1-R1'].baseQuota,4);
 assert.equal(s.questions.issuedIds.length,4);
 assert.equal(s.rewards.starlight,4);assert.equal(s.rewards.keys,1);
 assert.equal(h.session.getRegionResult('T1-R1').processed,4);
 await h.session.close();
});
test('8모둠 한 지역 기본 8문제 완료, 최초 별빛·키 중복 없음',async()=>{
 const h=createHarness({teamCount:8});await h.init();
 for(let i=1;i<=8;i++)await h.answerCorrect(`TEAM_0${i}`);
 await h.do(()=>h.session.completeRegion('T1-R1'));
 const s=h.session.getState();checkState(s);
 assert.equal(s.rewards.keys,1);assert.equal(s.rewards.starlight,8);
 assert.equal(s.world.regions['T1-R1'].baseQuota,8);
 assert.equal(new Set(s.questions.issuedIds).size,8);
 assert.equal(s.world.results.length,1);await h.session.close();
});
