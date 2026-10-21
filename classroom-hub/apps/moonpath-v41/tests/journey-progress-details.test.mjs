import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {createQuestionEngine} from '../src/questions/engine.js';
import {regionOptions,themeUnlocked,themeRouteGuide,extraResumeTarget} from '../src/world/navigation.js';
import {worldProgress} from '../src/world/regions.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url))),pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
async function setup(){let at=1000,id=0;const clock=()=>++at,store=new IndexedDbExpeditionStore(new FakeDatabase(),{clock});const t=new TeacherEngineSession(store,{clock,newId:()=>`progress-${++id}`,heartbeatMs:0});await t.create({slot:1,world,teamCount:2});await t.dispatch('SESSION_STARTED',{sessionId:'lesson'});return t;}
const qe=createQuestionEngine(pack);
function response(q){switch(q.type){case 'single_choice':return q.answer.correct[0];case 'true_false':return q.answer.correct;case 'matching':return q.answer.pairs;case 'ordering':return q.answer.order;case 'categorization':return q.answer.assignments;case 'short_text':return q.answer.accepted[0];default:return '기능 시험 답변';}}
async function submit(t){const a=t.getState().attempts[t.getState().activeAttemptId];await t.submitAnswer({attemptId:a.id,response:response(a.questionSnapshot.issuedSnapshot)});}
async function finish(t,regionId,wrong=false){await t.enterRegion(regionId);for(let i=0;i<2;i++){await t.drawQuestion(qe,{regionId,teamId:`TEAM_0${i+1}`});await t.dispatch('TIMER_STARTED');await submit(t);const attemptId=t.getState().activeAttemptId;await t.judgeAnswer({attemptId,decision:wrong&&i===0?'INCORRECT':'CORRECT',teacherConfirmed:true,teacherReason:'교사 기능 시험 확인',missingResponseConfirmed:true});}await t.completeRegion(regionId);}
async function main(t,wrong=false){for(const id of ['T1-R1','T1-R2','T1-R4','T1-R5'])await finish(t,id,wrong&&id==='T1-R1');}
test('completed results remain viewable and route inspection never changes state or rewards',async()=>{
 const t=await setup();await finish(t,'T1-R1');const before=t.getState(),opts=regionOptions(before,'T1');assert.equal(opts[0].canViewResult,true);assert.equal(opts[0].allowed,false);assert.equal(opts[1].visited,false);assert.equal(opts[1].allowed,true);assert.match(opts[3].reason,/선행/);t.getRegionResult('T1-R1',{publicOnly:true});assert.deepEqual(t.getState(),before);await t.close();
});
test('main completion, full exploration and pending recovery remain independent achievements',async()=>{
 const t=await setup();await main(t,true);const p=worldProgress(t.getState()).themes[0];assert.equal(p.mainFinished,true);assert.equal(p.fullExploration,false);assert.equal(p.learningComplete,false);assert.equal(p.unresolvedRecovery,1);assert.equal(p.completedRegions,4);assert.equal(themeUnlocked(t.getState(),'T2'),true);const other=regionOptions(t.getState(),'T1')[2];assert.equal(other.mode,'EXTRA');assert.equal(other.allowed,true);await t.close();
});
test('additional exploration blocks other routes and restores the saved original region after completion and JSON reload',async()=>{
 const t=await setup();await main(t);await finish(t,'T2-R1');await t.dispatch('WORLD_VIEW_OPENED',{view:'BOOKSHELF'});await t.dispatch('EXTRA_EXPLORATION_STARTED',{regionId:'T1-R3',teacherConfirmed:true});assert.equal(regionOptions(t.getState(),'T2')[1].allowed,false);assert.match(regionOptions(t.getState(),'T2')[1].reason,/복귀/);await t.enterRegion('T1-R3',{mode:'EXTRA'});
 for(let i=0;i<2;i++){await t.drawQuestion(qe,{regionId:'T1-R3',teamId:`TEAM_0${i+1}`});await t.dispatch('TIMER_STARTED');await submit(t);await t.judgeAnswer({attemptId:t.getState().activeAttemptId,decision:'CORRECT',teacherConfirmed:true,teacherReason:'기능 시험 확인',missingResponseConfirmed:true});}await t.completeRegion('T1-R3');const json=await t.exportJSON();await t.close();let n=10000;const store=new IndexedDbExpeditionStore(new FakeDatabase(),{clock:()=>++n});const restored=new TeacherEngineSession(store,{clock:()=>++n,newId:()=>`restored-${++n}`,heartbeatMs:0});await restored.restoreJSONToEmptySlot(1,json);assert.equal(restored.getState().world.additionalExplorationReturn.fromRegionId,'T2-R1');await restored.dispatch('SESSION_RESUMED');await restored.dispatch('EXTRA_EXPLORATION_RETURNED',{teacherConfirmed:true});await restored.dispatch('SESSION_PAUSED');assert.equal(restored.getState().world.currentRegionId,'T2-R1');assert.equal(restored.getState().world.mainRouteChoice.T1,'LEFT');assert.equal(restored.getState().world.additionalExplorationReturn,null);assert.equal(worldProgress(restored.getState()).themes[0].fullExploration,true);assert.equal(regionOptions(restored.getState(),'T2')[1].allowed,true);await restored.close();
});


test('theme guide inspects locked and selected routes without starting lessons or mutating state',async()=>{
 const t=await setup();const before=t.getState();const locked=themeRouteGuide(before,'T2');assert.equal(locked.unlocked,false);assert.equal(locked.mainRoute,null);assert.equal(locked.regions.length,5);assert.deepEqual(t.getState(),before);
 await main(t);const done=t.getState(),guide=themeRouteGuide(done,'T1');assert.deepEqual(guide.mainRoute,['T1-R1','T1-R2','T1-R4','T1-R5']);assert.deepEqual(guide.extraRegionIds,['T1-R3']);assert.deepEqual(t.getState(),done);await t.close();
});

test('interrupted extra entry resumes its target after JSON restore instead of reopening the origin',async()=>{
 const t=await setup();await main(t);await finish(t,'T2-R1');await t.dispatch('WORLD_VIEW_OPENED',{view:'BOOKSHELF'});await t.dispatch('EXTRA_EXPLORATION_STARTED',{regionId:'T1-R3',teacherConfirmed:true});
 // Simulate exit/storage interruption after the committed start, before REGION_ENTERED.
 const json=await t.exportJSON(),original=t.getState();assert.deepEqual(extraResumeTarget(original),{regionId:'T1-R3',action:'ENTER'});await t.close();
 let n=50000;const restored=new TeacherEngineSession(new IndexedDbExpeditionStore(new FakeDatabase(),{clock:()=>++n}),{clock:()=>++n,newId:()=>`resume-${++n}`,heartbeatMs:0});await restored.restoreJSONToEmptySlot(1,json);
 const snapshot=restored.getState(),target=extraResumeTarget(snapshot);assert.equal(snapshot.world.currentRegionId,'T2-R1');assert.deepEqual(target,{regionId:'T1-R3',action:'ENTER'});assert.equal(snapshot.sessions[0].phase,'PAUSED');assert.deepEqual(restored.getState(),snapshot);
 await restored.dispatch('SESSION_RESUMED');await restored.enterRegion(target.regionId,{mode:'EXTRA'});const entered=restored.getState();assert.equal(entered.world.currentRegionId,'T1-R3');assert.equal(entered.world.additionalExplorationReturn.fromRegionId,'T2-R1');assert.deepEqual(entered.questions,snapshot.questions);assert.deepEqual(entered.rewards,snapshot.rewards);assert.deepEqual(entered.world.mainRouteChoice,snapshot.world.mainRouteChoice);assert.deepEqual(extraResumeTarget(entered),{regionId:'T1-R3',action:'CONTINUE'});await restored.close();
});
