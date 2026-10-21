import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {createQuestionEngine} from '../src/questions/engine.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url))),pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
function session(){let id=0,at=10000;const options={clock:()=>++at,newId:()=>`setup-${++id}`,heartbeatMs:0};const store=new IndexedDbExpeditionStore(new FakeDatabase(),{clock:options.clock});return new TeacherEngineSession(store,options);}
test('selected pack is isolated from later caller edits and used by actual question draw',async()=>{
 const custom=structuredClone(pack);custom.pack.id='CLASS-SELECTED';custom.pack.pack_version='1.0.1';custom.questions[0].question='선택한 팩의 문항';
 const t=session();await t.create({slot:1,world,sourcePack:custom});custom.questions[0].question='외부 변경';const s=t.getState();assert.equal(s.meta.packId,'CLASS-SELECTED');assert.equal(s.meta.packVersion,'1.0.1');assert.equal(s.questions.sourcePack.questions[0].question,'선택한 팩의 문항');
 await t.dispatch('SESSION_STARTED',{sessionId:'lesson'});await t.enterRegion('T1-R1');await assert.rejects(t.drawQuestion(createQuestionEngine(pack),{regionId:'T1-R1',teamId:'TEAM_01'}),{code:'PACK_MISMATCH'});await t.drawQuestion(createQuestionEngine(s.questions.sourcePack),{regionId:'T1-R1',teamId:'TEAM_01'});assert.equal(t.getState().attempts[t.getState().activeAttemptId].questionSnapshot.packId,'CLASS-SELECTED');await t.close();
});
test('selected pack persists through JSON restoration with its title and version',async()=>{
 const t=session(),custom=structuredClone(pack);custom.pack.id='CLASS-BACKUP';custom.pack.title='우리 반 문제팩';await t.create({slot:2,world,sourcePack:custom});const json=await t.exportJSON();await t.close();const restored=session();await restored.restoreJSONToEmptySlot(2,json);const s=restored.getState();assert.equal(s.questions.sourcePack.pack.title,'우리 반 문제팩');assert.equal(createQuestionEngine(s.questions.sourcePack).info().packId,'CLASS-BACKUP');await restored.close();
});
test('invalid pack rejects creation before saving an expedition',async()=>{
 const t=session(),bad=structuredClone(pack);bad.questions.pop();await assert.rejects(t.create({slot:1,world,sourcePack:bad}),{code:'PACK_COUNT'});assert.equal((await t.store.read(1)).state,null);await t.close();
});
test('legacy expeditions without an embedded pack retain the official default',async()=>{
 const t=session();await t.create({slot:3,world});const json=await t.exportJSON();await t.close();const restored=session();await restored.restoreJSONToEmptySlot(3,json);assert.equal(restored.getState().questions.sourcePack,undefined);assert.equal(restored.getState().meta.packId,pack.pack.id);await restored.close();
});
