import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {themeUnlocked,regionOptions} from '../src/world/navigation.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {verifyBackup} from '../src/storage/backup.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url))),pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
function harness(){let at=10000,id=0;const options={clock:()=>++at,newId:()=>`journey-test-${++id}`,heartbeatMs:0};const store=new IndexedDbExpeditionStore(new FakeDatabase(),{clock:options.clock});return {store,options,teacher:new TeacherEngineSession(store,options)};}
async function start(){const h=harness();await h.teacher.create({slot:1,world,teamCount:2,expeditionName:'책장 복원 시험'});await h.teacher.dispatch('WORLD_VIEW_OPENED',{view:'BOOKSHELF'});return h;}
function answer(q){switch(q.type){case 'single_choice':return q.answer.correct[0];case 'true_false':return q.answer.correct;case 'matching':return q.answer.pairs;case 'ordering':return q.answer.order;case 'categorization':return q.answer.assignments;case 'short_text':return q.answer.accepted[0];case 'manual':return '공동체의 협력과 인권 보장을 위한 구체적인 근거입니다.';default:throw Error(q.type);}}

test('new expedition saves bookshelf without auto-starting a lesson or entering a region',async()=>{
 const h=await start(),s=h.teacher.getState();assert.equal(s.screen,'BOOKSHELF');assert.equal(s.sessions.length,0);assert.equal(s.world.currentRegionId,null);
 assert.equal(themeUnlocked(s,'T1'),true);assert.equal(themeUnlocked(s,'T2'),false);assert.deepEqual(regionOptions(s,'T1').map(o=>o.allowed),[true,false,false,false,false]);await h.teacher.close();
});
test('fork theme and bookshelf restore through close/open and JSON verification',async()=>{
 const h=await start();await h.teacher.dispatch('WORLD_VIEW_OPENED',{view:'FORK',themeId:'T1'});await h.teacher.close();const next=new TeacherEngineSession(h.store,h.options);await next.open(1);assert.equal(next.getState().screen,'FORK');assert.equal(next.getState().world.navigation.themeId,'T1');const saved=await verifyBackup(await next.exportJSON());assert.equal(saved.state.world.navigation.view,'FORK');await next.close();
});
test('locked theme selection is rejected without a new event or changed state',async()=>{
 const h=await start(),before=h.teacher.getState();await assert.rejects(h.teacher.dispatch('WORLD_VIEW_OPENED',{view:'FORK',themeId:'T2'}),{code:'THEME_LOCKED'});assert.deepEqual(h.teacher.getState(),before);await h.teacher.close();
});
test('a live question cannot be diverted into bookshelf or fork',async()=>{
 const h=await start(),t=h.teacher;await t.dispatch('SESSION_STARTED',{sessionId:'lesson-1'});await t.enterRegion('T1-R1');await t.drawQuestion(createQuestionEngine(pack),{regionId:'T1-R1',teamId:'TEAM_01'});const before=t.getState();await assert.rejects(t.dispatch('WORLD_VIEW_OPENED',{view:'BOOKSHELF'}),{code:'ATTEMPT_ACTIVE'});assert.deepEqual(t.getState(),before);await t.close();
});
test('first region completion unlocks two branches; RIGHT choice and current region survive backup restore',async()=>{
 const h=await start(),t=h.teacher,qe=createQuestionEngine(pack);await t.dispatch('WORLD_VIEW_OPENED',{view:'FORK',themeId:'T1'});await t.dispatch('SESSION_STARTED',{sessionId:'lesson-1'});await t.enterRegion('T1-R1');
 for(let i=0;i<2;i++){await t.drawQuestion(qe,{regionId:'T1-R1',teamId:`TEAM_0${i+1}`});const a=t.getState().attempts[t.getState().activeAttemptId];await t.dispatch('TIMER_STARTED');await t.submitAnswer({attemptId:a.id,response:answer(a.questionSnapshot.issuedSnapshot)});await t.judgeAnswer({attemptId:a.id,decision:'CORRECT',teacherConfirmed:true,teacherReason:'교사 확인 정답'});}
 await t.completeRegion('T1-R1');await t.dispatch('WORLD_VIEW_OPENED',{view:'FORK',themeId:'T1'});assert.deepEqual(regionOptions(t.getState(),'T1').map(o=>o.allowed),[false,true,true,false,false]);await t.enterRegion('T1-R3');assert.equal(t.getState().world.mainRouteChoice.T1,'RIGHT');assert.equal(t.getState().world.regions['T1-R2'].status,'LOCKED');const json=await t.exportJSON();await t.close();
 const fresh=harness();await fresh.teacher.restoreJSONToEmptySlot(1,json);const restored=fresh.teacher.getState();assert.equal(restored.world.mainRouteChoice.T1,'RIGHT');assert.equal(restored.world.currentRegionId,'T1-R3');assert.equal(restored.rewards.keys,1);assert.equal(restored.sessions[0].phase,'PAUSED');await fresh.teacher.close();
});
