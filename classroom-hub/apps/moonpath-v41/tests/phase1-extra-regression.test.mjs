import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {makeBackup,verifyBackup,sha256} from '../src/storage/backup.js';
import {FakeDatabase} from './support-fake-idb.mjs';

const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const T=1_900_000_000_000;let index=0;
const uuid=()=> 'extra-'+(++index);
const cmd=(type,at=T,payload={},eventId=uuid())=>({type,eventId,at,payload});
const blank=(slot=1,seconds=60)=>newExpedition({slot,world,createdAt:T,expeditionId:uuid(),timerSeconds:seconds});
const boot=(slot=1,seconds=60)=>reduceCommand(blank(slot,seconds),cmd('EXPEDITION_CREATED')).state;
function env(){
  let time=T;const db=new FakeDatabase();
  const store=new IndexedDbExpeditionStore(db,{clock:()=>time});
  const client=()=>new TeacherEngineSession(store,{clock:()=>time,newId:uuid,heartbeatMs:0});
  return {db,store,client,setTime:t=>time=t};
}
const rejectCode=(p,code)=>assert.rejects(p,e=>e.code===code);

test('다른 명령 유형으로 eventId 재사용 시 충돌 처리',()=>{
  const id=uuid(),first=cmd('SESSION_STARTED',T+1,{sessionId:'A'},id);
  const state=reduceCommand(boot(),first).state;
  assert.throws(()=>reduceCommand(state,cmd('SESSION_PAUSED',T+2,{},id)),e=>e.code==='EVENT_ID_CONFLICT');
});
test('같은 유형이라도 내용이 다른 eventId 재사용 차단',()=>{
  const id=uuid(),state=reduceCommand(boot(),cmd('SESSION_STARTED',T+1,{sessionId:'A'},id)).state;
  assert.throws(()=>reduceCommand(state,cmd('SESSION_STARTED',T+2,{sessionId:'B'},id)),e=>e.code==='EVENT_ID_CONFLICT');
});
test('내용이 같은 재시도는 객체 키 순서와 시각에 관계없이 멱등',()=>{
  const id=uuid(),state=reduceCommand(boot(),cmd('SCREEN_CHANGED',T+1,{screen:'HOME',config:{a:1,b:2}},id)).state;
  const retried=reduceCommand(state,cmd('SCREEN_CHANGED',T+10,{config:{b:2,a:1},screen:'HOME'},id));
  assert.equal(retried.duplicate,true);assert.equal(retried.state.meta.revision,state.meta.revision);
});
test('타이머 끔에서 시간의 모래 차감 금지',()=>{
  let state=boot(1,0);
  state=reduceCommand(state,cmd('SESSION_STARTED',T+1,{sessionId:'L'})).state;
  state=reduceCommand(state,cmd('ATTEMPT_PREPARED',T+2,{attemptId:'A',questionId:'Q',teamId:'TEAM_01'})).state;
  state=reduceCommand(state,cmd('TIMER_STARTED',T+3)).state;
  state.magic.unlocked.push('TIME_SAND');state.rewards.starlight=4;
  assert.throws(()=>reduceCommand(state,cmd('TIME_SAND_USED',T+4)),e=>e.code==='TIMER_DISABLED');
  assert.equal(state.rewards.starlight,4);
});
test('저장 최종 시각과 이벤트 시각 충돌 감지',()=>{
  const state=boot();state.meta.updatedAt+=1;
  assert.throws(()=>checkState(state),e=>e.code==='EVENT_TIME_MISMATCH');
});
async function forged(field,value){
  let state=boot();state=reduceCommand(state,cmd('SESSION_STARTED',T+1,{sessionId:'REAL'})).state;
  const events=state.eventLog.map(e=>({...e}));
  const backup=await makeBackup({state,events});
  backup.events[1][field]=value;
  const {integrity,...payload}=backup;backup.integrity.hex=await sha256(JSON.stringify(payload));
  return verifyBackup(backup);
}
test('SHA 재계산으로 위장한 백업 이벤트 유형 변조 거부',async()=>{
  await rejectCode(forged('type','SESSION_ENDED'),'BROKEN_SEQUENCE');
});
test('SHA 재계산으로 위장한 백업 이벤트 시각 변조 거부',async()=>{
  await rejectCode(forged('at',T+999),'BROKEN_SEQUENCE');
});
test('SHA 재계산으로 위장한 백업 이벤트 payload 변조 거부',async()=>{
  await rejectCode(forged('payload',{sessionId:'FAKE'}),'BROKEN_SEQUENCE');
});
test('백업 생성 단계부터 원본과 다른 로그 차단',async()=>{
  const s=boot(),events=s.eventLog.map(e=>({...e}));events[0].type='FAKE';
  await rejectCode(makeBackup({state:s,events}),'BACKUP_EVENT_MISMATCH');
});
test('JSON 복원과 실행 중 타이머 정지는 같은 IDB 거래로 확정',async()=>{
  const source=env(),a=source.client();await a.create({slot:1,world});
  await a.dispatch('SESSION_STARTED',{sessionId:'L'});
  await a.dispatch('ATTEMPT_PREPARED',{attemptId:'A',questionId:'Q',teamId:'TEAM_01'});
  await a.dispatch('TIMER_STARTED');
  const str=await a.exportJSON();await a.close();
  const target=env(),b=target.client(),res=await b.restoreJSONToEmptySlot(1,str);
  assert.equal(res.attempts.A.timer.phase,'PAUSED');
  assert.equal(res.sessions[0].phase,'PAUSED');
  assert.equal(target.db.inspect('slots',1).state.attempts.A.timer.phase,'PAUSED');
  assert.equal(target.db.inspect('checkpoints','1:latest').revision,5);
  assert.equal(target.db.inspect('events','1:000000000005').event.type,'RECOVER_INTERRUPTED');
  await b.close();
});
test('강제된 복원 저장 오류가 모든 DB 저장 영역을 롤백',async()=>{
  const source=env(),a=source.client();await a.create({slot:1,world});
  const pack=await verifyBackup(await a.exportJSON());await a.close();
  const target=env(),lease=await target.store.acquireWriter(1,'author');
  target.db.failNextWrite=true;
  await assert.rejects(target.store.restoreToEmptySlot(1,pack,lease),e=>e.name==='QuotaExceededError');
  assert.equal(target.db.inspect('slots',1),undefined);
  assert.equal(target.db.inspect('checkpoints','1:latest'),undefined);
  assert.equal(target.db.inspect('events','1:000000000001'),undefined);
  await target.store.releaseWriter(1,lease);
});
test('기존 슬롯을 JSON 가져오기로 덮어쓰지 않음',async()=>{
  const e=env(),a=e.client();await a.create({slot:1,world});
  const backup=await a.exportJSON();await a.close();
  await rejectCode(e.client().restoreJSONToEmptySlot(1,backup),'SLOT_OCCUPIED');
});
test('PC 역행 시각의 교사 명령은 DB 변경 전에 거부',async()=>{
  const e=env(),a=e.client();await a.create({slot:1,world});
  e.setTime(T+100);await a.dispatch('SESSION_STARTED',{sessionId:'L'});
  const before=e.db.inspect('slots',1);
  e.setTime(T-1);await rejectCode(a.dispatch('SESSION_PAUSED'),'CLOCK_BACKWARD');
  assert.deepEqual(e.db.inspect('slots',1),before);
  e.setTime(T+101);await a.close();
});
test('동시에 누른 30개 변경 명령은 하나만 성공',async()=>{
  const e=env(),a=e.client();await a.create({slot:1,world});
  const results=await Promise.allSettled(Array.from({length:30},(_,i)=>a.dispatch('SESSION_STARTED',{sessionId:'L'+i})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(a.getState().meta.revision,2);await a.close();
});
test('100번 연속 상태 전이·이벤트·체크포인트 순번 일치',async()=>{
  const e=env(),a=e.client();await a.create({slot:1,world});
  for(let i=0;i<50;i++){
    await a.dispatch('SCREEN_CHANGED',{screen:'BOOKSHELF'});
    await a.dispatch('SCREEN_CHANGED',{screen:'HOME'});
  }
  const state=a.getState();assert.equal(state.meta.revision,101);
  assert.equal(e.db.inspect('checkpoints','1:latest').revision,101);
  assert.equal(e.db.inspect('checkpoints','1:previous').revision,100);
  const backup=await verifyBackup(await a.exportJSON());
  assert.equal(backup.events.length,101);await a.close();
});
test('3개 슬롯 저장·이벤트 이력이 서로 오염되지 않음',async()=>{
  const e=env(),clients=[e.client(),e.client(),e.client()];
  for(let i=0;i<3;i++)await clients[i].create({slot:i+1,world});
  await clients[0].dispatch('SESSION_STARTED',{sessionId:'only-one'});
  assert.equal(e.db.inspect('slots',1).state.meta.revision,2);
  assert.equal(e.db.inspect('slots',2).state.meta.revision,1);
  assert.equal(e.db.inspect('slots',3).state.meta.revision,1);
  for(const c of clients)await c.close();
});
test('손상된 슬롯은 정상 체크포인트로 자동 덮어쓰지 않음',async()=>{
  const e=env(),a=e.client();await a.create({slot:1,world});
  await a.dispatch('SESSION_STARTED',{sessionId:'L'});await a.close();
  const row=e.db.inspect('slots',1);row.state.meta.schemaVersion=999;e.db.alter('slots',1,row);
  const found=await e.store.read(1);
  assert.equal(found.needsRepair,true);assert.equal(e.db.inspect('slots',1).state.meta.schemaVersion,999);
});
