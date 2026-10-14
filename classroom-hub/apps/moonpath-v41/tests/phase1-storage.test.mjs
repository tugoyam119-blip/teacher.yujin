import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition} from '../src/engine/model.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {makeBackup,verifyBackup} from '../src/storage/backup.js';
import {FakeDatabase} from './support-fake-idb.mjs';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
let at=1800000000000,n=0;
const nextId=()=>`id-${++n}`;
const env=()=>{const db=new FakeDatabase();const store=new IndexedDbExpeditionStore(db,{clock:()=>at});return {db,store}};
const setup=async(slot=1)=>{const e=env();const engine=new TeacherEngineSession(e.store,{clock:()=>at,newId:nextId});await engine.create({slot,world});return {...e,engine};};
const event=(type,payload={})=>({type,payload,eventId:nextId(),at});
const assertCode=async(p,code)=>assert.rejects(p,e=>e.code===code);

test('신규 슬롯 생성은 저장/이벤트/체크포인트까지 같은 거래를 사용',async()=>{
 const {db,engine,store}=await setup();
 assert.equal(db.inspect('slots',1).state.meta.revision,1);
 assert.equal(db.inspect('events','1:000000000001').event.type,'EXPEDITION_CREATED');
 assert.equal(db.inspect('checkpoints','1:latest').revision,1);
 assert.equal(db.inspect('checkpoints','1:previous'),undefined);
 await engine.dispatch('SESSION_STARTED',{sessionId:'lesson-a'});
 assert.equal(db.inspect('slots',1).state.meta.revision,2);
 assert.equal(db.inspect('checkpoints','1:previous').revision,1);
 assert.equal(db.inspect('checkpoints','1:latest').revision,2);
 await engine.close();
});

test('쓰기 실패/용량 초과는 이벤트·상태·체크포인트를 절대 부분 확정하지 않는다',async()=>{
 const {db,engine}=await setup();
 const before=engine.getState();
 db.failNextWrite=true;
 await assert.rejects(engine.dispatch('SESSION_STARTED',{sessionId:'lesson-X'}),e=>e.name==='QuotaExceededError');
 assert.deepEqual(engine.getState(),before);
 assert.equal(db.inspect('slots',1).state.meta.revision,1);
 assert.equal(db.inspect('events','1:000000000002'),undefined);
 assert.equal(db.inspect('checkpoints','1:latest').revision,1);
 const success=await engine.dispatch('SESSION_STARTED',{sessionId:'lesson-X'});
 assert.equal(success.committed,true);assert.equal(engine.getState().meta.revision,2);
 await engine.close();
});

test('저장 실패 후에는 같은 이벤트 ID 재시도 가능하며 중복 보상 방지',async()=>{
 const {db,engine}=await setup();
 const eventId=nextId();db.failNextWrite=true;
 await assert.rejects(engine.dispatch('SESSION_STARTED',{sessionId:'lesson-R'},eventId));
 let result=await engine.dispatch('SESSION_STARTED',{sessionId:'lesson-R'},eventId);
 assert.equal(result.state.meta.revision,2);
 result=await engine.dispatch('SESSION_STARTED',{sessionId:'lesson-R'},eventId);
 assert.equal(result.duplicate,true);assert.equal(result.committed,false);
 assert.equal(db.inspect('events','1:000000000003'),undefined);
 await engine.close();
});

test('작성자 한 명만 같은 슬롯에서 쓸 수 있다. 다른 창은 별도 슬롯에서 사용 가능',async()=>{
 const {store,engine}=await setup();
 await assertCode(store.acquireWriter(1,'other-teacher'),'WRITER_BUSY');
 const lease2=await store.acquireWriter(2,'other-teacher');
 assert.equal(lease2.key,2);
 await engine.close();
 const lease1=await store.acquireWriter(1,'other-teacher');
 assert.equal(lease1.key,1);
});

test('lease 만료·다른 epoch·revision 충돌 시 쓰기 차단',async()=>{
 const {store,engine}=await setup();
 const lease=engine.lease;
 await assertCode(store.commit(1,event('SESSION_STARTED',{sessionId:'C'}),{expectedRevision:99,lease}),'REVISION_CONFLICT');
 await assertCode(store.commit(1,event('SESSION_STARTED',{sessionId:'C'}),{expectedRevision:1,lease:{writerId:lease.writerId,epoch:lease.epoch+1}}),'WRITER_NOT_OWNED');
 at+=31000;
 await assertCode(store.commit(1,event('SESSION_STARTED',{sessionId:'C'}),{expectedRevision:1,lease}),'WRITER_NOT_OWNED');
 await engine.close();
});

test('세 슬롯의 이벤트와 체크포인트가 서로 오염되지 않음',async()=>{
 const {db,store}=env(),arr=[];
 for(const slot of [1,2,3]){
  const engine=new TeacherEngineSession(store,{clock:()=>at,newId:nextId});
  await engine.create({slot,world});arr.push(engine);
 }
 await arr[0].dispatch('SESSION_STARTED',{sessionId:'only-first'});
 assert.equal(db.inspect('slots',1).state.meta.revision,2);
 assert.equal(db.inspect('slots',2).state.meta.revision,1);
 assert.equal(db.inspect('slots',3).state.meta.revision,1);
 for(const e of arr)await e.close();
});

test('브라우저 재접속 모사 시 복원 직후 RUNNING 타이머 자동 재개 금지',async()=>{
 const {store,engine}=await setup();
 at+=100;await engine.dispatch('SESSION_STARTED',{sessionId:'class-1'});
 at+=100;await engine.dispatch('ATTEMPT_PREPARED',{attemptId:'A1',questionId:'IS2-U01-A01',teamId:'TEAM_01'});
 at+=100;await engine.dispatch('TIMER_STARTED');
 await engine.close();
 at+=4000;const reopened=new TeacherEngineSession(store,{clock:()=>at,newId:nextId});
 const got=await reopened.open(1);
 assert.equal(got.attempts.A1.timer.phase,'PAUSED');
 assert.equal(got.sessions[0].phase,'PAUSED');
 assert.equal(got.attempts.A1.timer.remainingMs,60000);
 assert.equal(got.eventLog.at(-1).type,'RECOVER_INTERRUPTED');
 await reopened.close();
});

test('JSON 백업은 동일 스냅샷과 로그로 생성, 빈 슬롯에만 안전 복구',async()=>{
 const {store,engine}=await setup();
 await engine.dispatch('SESSION_STARTED',{sessionId:'one'});
 await engine.dispatch('SESSION_PAUSED');
 const str=await engine.exportJSON();let parsed=JSON.parse(str);
 assert.equal((await verifyBackup(parsed)).state.meta.revision,3);
 await engine.close();
 await assertCode((new TeacherEngineSession(store,{clock:()=>at,newId:nextId})).restoreJSONToEmptySlot(1,str),'SLOT_OCCUPIED');
 const {db:otherDb,store:otherStore}=env();
 const newClient=new TeacherEngineSession(otherStore,{clock:()=>at,newId:nextId});
 const restored=await newClient.restoreJSONToEmptySlot(1,str);
 assert.equal(restored.meta.revision,3);
 assert.equal(otherDb.inspect('events','1:000000000003').event.type,'SESSION_PAUSED');
 assert.equal(otherDb.inspect('slots',1).state.meta.expeditionId,parsed.expeditionId);
 await newClient.close();
});

test('체크포인트 유효성: 최신 상태 손상 시 직전 정상본 감지하되 자동 덮어쓰기 방지',async()=>{
 const {db,store,engine}=await setup();
 await engine.dispatch('SESSION_STARTED',{sessionId:'progress'});
 await engine.close();
 const row=db.inspect('slots',1);row.state.meta.schemaVersion=99;db.alter('slots',1,row);
 const found=await store.read(1);
 assert.equal(found.needsRepair,true);assert.equal(found.source,'latest');
 const client=new TeacherEngineSession(store,{clock:()=>at,newId:nextId});
 await assertCode(client.open(1),'CHECKPOINT_REPAIR_REQUIRED');
 assert.equal(db.inspect('slots',1).state.meta.schemaVersion,99); // not silently repaired
});

test('45분 수업 중 장시간 무입력 이후에도 원 소유자가 재인증 후 저장 가능',async()=>{
  const {store,engine}=await setup();
  at+=60_000; // 30초 TTL보다 길어도 같은 owner ID는 재확보 가능
  const result=await engine.dispatch('SESSION_STARTED',{sessionId:'after-idle'});
  assert.equal(result.committed,true);
  await engine.close();
});

test('소유권을 다른 창이 가져갔으면 기존 창은 저장 실패 (메모리 불변)',async()=>{
  const {store,engine}=await setup();
  at+=60_000;
  const rival=await store.acquireWriter(1,'rival-window');
  const before=engine.getState();
  await assertCode(engine.dispatch('SESSION_STARTED',{sessionId:'not-allowed'}),'WRITER_BUSY');
  assert.deepEqual(engine.getState(),before);
  await store.releaseWriter(1,rival);await engine.close();
});

test('손상된 슬롯은 교사가 명시적으로 확인한 뒤만 체크포인트에서 복구하며 원본을 격리 보존',async()=>{
 const {db,store,engine}=await setup();
 await engine.dispatch('SESSION_STARTED',{sessionId:'before-damage'});
 await engine.dispatch('SESSION_PAUSED');
 await engine.close();
 const broken=db.inspect('slots',1);broken.state.meta.schemaVersion=999;db.alter('slots',1,broken);
 const failed=new TeacherEngineSession(store,{clock:()=>at,newId:nextId});
 await assertCode(failed.open(1),'CHECKPOINT_REPAIR_REQUIRED');
 await assertCode(failed.recoverCheckpoint(1,{confirmation:'WRONG'}),'TEACHER_REQUIRED');
 const recovered=await failed.recoverCheckpoint(1,{source:'latest',confirmation:'RECOVER_SLOT_1'});
 assert.equal(recovered.eventLog.at(-1).type,'CHECKPOINT_REPAIRED');
 assert.equal(recovered.meta.revision,4);
 assert.equal(db.inspect('checkpoints','1:latest').revision,4);
 assert.equal(db.inspect('checkpoints','1:previous').revision,3);
 assert.equal(db.inspect('quarantine',`1:damaged:4:${recovered.eventLog.at(-1).eventId}`).original.state.meta.schemaVersion,999);
 await failed.close();
});

test('손상 체크포인트와 로그 순번이 다르면 임의 삭제/복구하지 않고 차단',async()=>{
 const {db,store,engine}=await setup();
 await engine.dispatch('SESSION_STARTED',{sessionId:'1'});
 await engine.dispatch('SESSION_PAUSED');
 await engine.close();
 const broken=db.inspect('slots',1);broken.state.meta.schemaVersion=99;db.alter('slots',1,broken);
 const client=new TeacherEngineSession(store,{clock:()=>at,newId:nextId});
 await assertCode(client.recoverCheckpoint(1,{source:'previous',confirmation:'RECOVER_SLOT_1'}),'FORENSIC_REVIEW_REQUIRED');
 assert.equal(db.inspect('slots',1).state.meta.schemaVersion,99);
});

test('RUNNING 시도에서 내보낸 JSON을 다른 DB에 복원하면 교사 재개 전 PAUSED',async()=>{
 const {store,engine}=await setup();
 await engine.dispatch('SESSION_STARTED',{sessionId:'running-export'});
 await engine.dispatch('ATTEMPT_PREPARED',{attemptId:'exp-run',questionId:'IS2-U01-A01',teamId:'TEAM_01'});
 await engine.dispatch('TIMER_STARTED');
 const backup=await engine.exportJSON();
 await engine.close();
 const db2=env(),second=new TeacherEngineSession(db2.store,{clock:()=>at,newId:nextId});
 const loaded=await second.restoreJSONToEmptySlot(1,backup);
 assert.equal(loaded.attempts['exp-run'].timer.phase,'PAUSED');
 assert.equal(loaded.sessions[0].phase,'PAUSED');
 assert.equal(loaded.eventLog.at(-1).type,'RECOVER_INTERRUPTED');
 await second.close();
});
