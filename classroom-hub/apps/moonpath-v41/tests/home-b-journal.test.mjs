import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState} from '../src/engine/model.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {verifyBackup} from '../src/storage/backup.js';
import {expeditionJournal,journalCsv,csvCell} from '../src/world/journal.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const blank=(options={})=>newExpedition({slot:1,expeditionId:'home-journal-test',createdAt:1000,world,...options});

test('new expedition name is trimmed, limited, and optional in legacy saves',()=>{
 const s=blank({expeditionName:'  우리 반 탐험  ',timerSeconds:90});assert.equal(s.meta.expeditionName,'우리 반 탐험');assert.equal(s.settings.timerSeconds,90);
 assert.throws(()=>blank({expeditionName:'가'.repeat(81)}),{code:'INVALID_EXPEDITION_NAME'});
 delete s.meta.expeditionName;assert.doesNotThrow(()=>checkState(s));assert.equal(expeditionJournal(s).name,'슬롯 1 탐험');
});
test('name and timer persist through real facade save, reopen and backup validation',async()=>{
 let id=0;const store=new IndexedDbExpeditionStore(new FakeDatabase(),{clock:()=>1000});const options={clock:()=>1000,newId:()=>`home-test-${++id}`,heartbeatMs:0};
 const first=new TeacherEngineSession(store,options);await first.create({slot:1,world,expeditionName:'이름 저장 시험',timerSeconds:45});await first.close();
 const second=new TeacherEngineSession(store,options);await second.open(1);const backup=await verifyBackup(await second.exportJSON());assert.equal(backup.state.meta.expeditionName,'이름 저장 시험');assert.equal(backup.state.settings.timerSeconds,45);await second.close();
});
function journalFixture(){
 const s=blank();s.sessions=[{id:'s1',phase:'ENDED',activeMs:60000},{id:'s2',phase:'PAUSED',activeMs:120000}];
 const attempt=(id,sessionId,judgement)=>({id,questionId:`q-${id}`,sessionId,teamId:'TEAM_01',regionId:'T1-R1',preparedAt:id==='a'?1001:1002,timer:{phase:'PAUSED'},judgement});
 s.attempts={a:attempt('a','s1',{teacherConfirmed:true,decision:'CORRECT'}),b:attempt('b','s2',null)};
 s.attempts.b.answer={suggestion:{isCorrect:true}};s.corrections.records=[{key:'ANSWER:a',decision:'INCORRECT'}];s.teams[1].contribution=5;return s;
}
test('journal uses corrected teacher judgements and never counts auto suggestions as final',()=>{
 const s=journalFixture(),before=structuredClone(s),j=expeditionJournal(s);
 assert.deepEqual(j.totals,{issued:2,correct:0,incorrect:1,pending:1});assert.equal(j.sessions[0].incorrect,1);assert.equal(j.sessions[1].pending,1);
 assert.deepEqual(j.teams.map(t=>t.id),s.teams.map(t=>t.id));assert.deepEqual(s,before);
});
test('CSV keeps commas, quotes and newlines inside cells and neutralizes formulas',()=>{
 for(const value of ['=1+1','+1','-1','@SUM(A1)','\t=2','  =2'])assert.ok(csvCell(value).startsWith('"\''));
 assert.equal(csvCell('가,"나"\n다'),'"가,""나""\n다"');
 const s=journalFixture();s.meta.expeditionName='=HYPERLINK("bad")';const csv=journalCsv(expeditionJournal(s));assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('교사 판정 대기'));
});
test('journal excludes invalidated recovery records without changing saved history',()=>{
 const s=blank();s.recovery.pending=[{status:'PENDING'},{status:'INVALIDATED'}];s.recovery.resolved=[{status:'RESOLVED'},{status:'INVALIDATED'}];
 const j=expeditionJournal(s);assert.equal(j.recoveryPending,1);assert.equal(j.recoveryResolved,1);assert.equal(s.recovery.resolved.length,2);
});
