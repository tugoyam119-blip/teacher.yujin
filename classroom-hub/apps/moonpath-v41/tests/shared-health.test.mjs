import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {planQuestionDraw} from '../src/questions/draw.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url))),pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url))),qe=createQuestionEngine(pack);let counter=0;const id=()=>`hp-${++counter}`;
const run=(s,type,payload={},eventId=id())=>reduceCommand(s,{type,payload,eventId,at:s.meta.updatedAt+1}).state;
function boot(healthEnabled=true){let s=newExpedition({slot:1,expeditionId:id(),createdAt:1000,world,teamCount:2,healthEnabled});s=run(s,'EXPEDITION_CREATED');return run(s,'SESSION_STARTED',{sessionId:id()});}
function answer(q){switch(q.type){case 'single_choice':return q.answer.correct[0];case 'true_false':return q.answer.correct;case 'matching':return q.answer.pairs;case 'ordering':return q.answer.order;case 'categorization':return q.answer.assignments;case 'short_text':return q.answer.accepted[0];default:return '교사 기능 시험 답변';}}
function bad(s){const at=s.meta.updatedAt+1,p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at,random:()=>0});s=run(s,'QUESTION_DRAWN',p);s=run(s,'TIMER_STARTED');const a=s.attempts[s.activeAttemptId];s=run(s,'ANSWER_SUBMITTED',{attemptId:a.id,response:answer(a.questionSnapshot.issuedSnapshot)});return run(s,'ANSWER_JUDGED',{attemptId:a.id,decision:'INCORRECT',teacherConfirmed:true,teacherReason:'공동 체력 기능 검증'});}
function recover(s){const row=s.recovery.pending.find(r=>r.status==='PENDING'),runId=id(),recoveryId=row.id;s=run(s,'RECOVERY_CALLED',{recoveryId,runId,teamId:'TEAM_01',regionId:'T1-R1',mode:'FORCED',reason:'학습 결손 보완',teacherConfirmed:true});s=run(s,'RECOVERY_TIMER_STARTED',{recoveryId,runId,teacherConfirmed:true});s=run(s,'RECOVERY_ANSWER_SUBMITTED',{recoveryId,runId,response:answer(s.attempts[row.sourceAttemptId].questionSnapshot.issuedSnapshot),teacherConfirmed:true});return run(s,'RECOVERY_JUDGED',{recoveryId,runId,decision:'CORRECT',teacherConfirmed:true});}
const correct=(s,scope,targetId,decision)=>run(s,'JUDGEMENT_CORRECTED',{scope,targetId,decision,reason:'교사 판정 재검토 결과',teacherConfirmed:true});

test('health applies only to opted-in new expeditions, wrong judgement once and timeout alone never drains',()=>{
 let legacy=bad(boot(false));assert.equal(legacy.health,undefined);assert.equal(legacy.meta.schemaVersion,1);let s=bad(boot());assert.equal(s.meta.schemaVersion,2);assert.equal(s.health.current,7);const e=s.eventLog.at(-1);assert.equal(reduceCommand(s,{type:e.type,eventId:e.eventId,at:e.at,payload:e.payload}).duplicate,true);assert.equal(s.health.current,7);assert.equal(publicProjection(s,s.meta.updatedAt).resources.health,7);
 const p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at:s.meta.updatedAt+1,random:()=>0});s=run(s,'QUESTION_DRAWN',p);s=run(s,'TIMER_STARTED');s=reduceCommand(s,{type:'TIMER_EXPIRED',eventId:id(),at:s.meta.updatedAt+60000,payload:{}}).state;assert.equal(s.health.current,7);
});
test('valid recovery heals at most eight and correction recalculates both wrong loss and recovery gain',()=>{
 let s=bad(boot()),aid=s.activeAttemptId;s=recover(s);assert.equal(s.health.current,8);const row=s.recovery.resolved[0],runId=row.runs.at(-1).id;
 s=correct(s,'RECOVERY',runId,'INCORRECT');assert.equal(s.health.current,7);s=correct(s,'ANSWER',aid,'CORRECT');assert.equal(s.health.current,8);checkState(s);
});
test('eight wrongs block new questions and route entries; confirmed return heals and preserves progress',()=>{
 let s=boot();for(let i=0;i<8;i++)s=bad(s);assert.equal(s.health.current,0);assert.equal(s.health.returnRequired,true);
 const before=structuredClone(s),p=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId:id(),at:s.meta.updatedAt+1,random:()=>0});assert.throws(()=>run(s,'QUESTION_DRAWN',p),{code:'HEALTH_RETURN_REQUIRED'});assert.throws(()=>run(s,'REGION_ENTERED',{regionId:'T1-R1',mode:'MAIN',teacherConfirmed:true}),{code:'HEALTH_RETURN_REQUIRED'});assert.throws(()=>run(s,'HEALTH_RETURNED',{teacherConfirmed:false}),{code:'TEACHER_REQUIRED'});
 s=run(s,'HEALTH_RETURNED',{teacherConfirmed:true});assert.equal(s.screen,'BOOKSHELF');assert.equal(s.health.current,8);assert.equal(s.health.returnRequired,false);assert.equal(s.sessions[0].phase,'PAUSED');for(const key of ['questions','attempts','rewards','teams','world']){if(key!=='world')assert.deepEqual(s[key],before[key]);else{assert.deepEqual(s.world.regions,before.world.regions);assert.equal(s.world.currentRegionId,before.world.currentRegionId);}}
 assert.throws(()=>run(s,'HEALTH_RETURNED',{teacherConfirmed:true}),{code:'HEALTH_NOT_DEPLETED'});
});
test('correcting the draining wrong cancels the return requirement without erasing the judgement',()=>{
 let s=boot();for(let i=0;i<8;i++)s=bad(s);const old=structuredClone(s.attempts[s.activeAttemptId]);s=correct(s,'ANSWER',s.activeAttemptId,'CORRECT');assert.equal(s.health.current,1);assert.equal(s.health.returnRequired,false);assert.deepEqual(s.attempts[s.activeAttemptId],old);
});
test('health tampering is rejected and failed return writes do not heal; zero survives JSON restore',async()=>{
 let s=boot();for(let i=0;i<8;i++)s=bad(s);const damaged=structuredClone(s);damaged.health.current=8;assert.throws(()=>checkState(damaged),{code:'HEALTH_INVALID'});
 const {makeBackup}=await import('../src/storage/backup.js');const json=JSON.stringify(await makeBackup({state:s,events:s.eventLog},{exportedAt:s.meta.updatedAt}));let now=50000;const db=new FakeDatabase(),t=new TeacherEngineSession(new IndexedDbExpeditionStore(db,{clock:()=>++now}),{clock:()=>++now,newId:id,heartbeatMs:0});await t.restoreJSONToEmptySlot(1,json);assert.equal(t.getState().health.current,0);const before=t.getState();db.failNextWrite=true;await assert.rejects(t.dispatch('HEALTH_RETURNED',{teacherConfirmed:true}));assert.deepEqual(t.getState(),before);await t.dispatch('HEALTH_RETURNED',{teacherConfirmed:true});assert.equal(t.getState().health.current,8);await t.close();
});

test('side mission finishes before return, forfeiting interception never drains a second time',()=>{
 let s=boot();for(let i=0;i<8;i++)s=bad(s);const interceptionId=id();s=run(s,'INTERCEPTION_OPENED',{sourceAttemptId:s.activeAttemptId,interceptionId,targetTeamId:'TEAM_02',teacherConfirmed:true});assert.equal(s.health.current,0);assert.throws(()=>run(s,'HEALTH_RETURNED',{teacherConfirmed:true}),{code:'SIDE_MISSION_ACTIVE'});s=run(s,'INTERCEPTION_FORFEITED',{interceptionId,teacherConfirmed:true,reason:'교사 선택으로 미션 종료'});assert.equal(s.health.current,0);s=run(s,'HEALTH_RETURNED',{teacherConfirmed:true});assert.equal(s.health.current,8);
});
