import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {createQuestionEngine} from '../src/questions/engine.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url))),pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
async function fixture(){let at=1000,id=0;const db=new FakeDatabase(),clock=()=>++at,store=new IndexedDbExpeditionStore(db,{clock});const t=new TeacherEngineSession(store,{clock,newId:()=>`arc-${++id}`,heartbeatMs:0});await t.create({slot:1,world,sourcePack:pack,expeditionName:'보관 시험'});await t.dispatch('SESSION_STARTED',{sessionId:'lesson'});await t.enterRegion('T1-R1');await t.drawQuestion(createQuestionEngine(pack),{regionId:'T1-R1',teamId:'TEAM_01'});await t.dispatch('TIMER_STARTED');await t.dispatch('SESSION_PAUSED');return {db,store,t};}
async function archive(f,key='archive-1'){return f.store.archiveSlot(1,{archiveId:key,expectedRevision:f.t.getState().meta.revision,lease:f.t.lease});}
test('archive frees slot atomically and restores exact state, events, checkpoints and selected pack',async()=>{
 const f=await fixture(),before=await f.store.readConsistentForBackup(1),cp=f.db.inspect('checkpoints','1:previous');await archive(f);assert.equal((await f.store.read(1)).state,null);assert.equal(f.db.inspect('events','1:1'),undefined);assert.equal((await f.store.listArchives()).length,1);await f.store.restoreArchive('archive-1',{lease:f.t.lease});assert.deepEqual(await f.store.readConsistentForBackup(1),before);assert.deepEqual(f.db.inspect('checkpoints','1:previous'),cp);assert.equal((await f.store.listArchives())[0].restoredAt!==null,true);assert.equal(before.state.sessions[0].phase,'PAUSED');await f.t.close();
});
test('archive failure leaves original slot and logs intact, without a partial archive',async()=>{
 const f=await fixture(),before=await f.store.readConsistentForBackup(1);f.db.failNextWrite=true;await assert.rejects(archive(f));assert.deepEqual(await f.store.readConsistentForBackup(1),before);assert.deepEqual(await f.store.listArchives(),[]);await f.t.close();
});
test('restore failure preserves the archive and leaves slot empty',async()=>{
 const f=await fixture();await archive(f);f.db.failNextWrite=true;await assert.rejects(f.store.restoreArchive('archive-1',{lease:f.t.lease}));assert.equal((await f.store.read(1)).state,null);assert.equal((await f.store.listArchives())[0].restoredAt,null);await f.t.close();
});
test('occupied slot rejects restoration without changing new expedition or archived data',async()=>{
 const f=await fixture();await archive(f);await f.t.close();const next=new TeacherEngineSession(f.store,{heartbeatMs:0});await next.create({slot:1,world});const before=next.getState();await assert.rejects(f.store.restoreArchive('archive-1',{lease:next.lease}),{code:'SLOT_OCCUPIED'});assert.deepEqual((await f.store.read(1)).state,before);assert.equal((await f.store.listArchives())[0].restoredAt,null);await next.close();
});
test('wrong writer, stale revision and duplicate archive ID never clear a slot',async()=>{
 const f=await fixture(),before=await f.store.readConsistentForBackup(1);await assert.rejects(f.store.archiveSlot(1,{archiveId:'x',expectedRevision:before.state.meta.revision,lease:{writerId:'other',epoch:1}}),{code:'WRITER_NOT_OWNED'});await assert.rejects(f.store.archiveSlot(1,{archiveId:'x',expectedRevision:0,lease:f.t.lease}),{code:'REVISION_CONFLICT'});assert.deepEqual(await f.store.readConsistentForBackup(1),before);await archive(f);await f.store.restoreArchive('archive-1',{lease:f.t.lease});await assert.rejects(archive(f));assert.deepEqual(await f.store.readConsistentForBackup(1),before);await f.t.close();
});
