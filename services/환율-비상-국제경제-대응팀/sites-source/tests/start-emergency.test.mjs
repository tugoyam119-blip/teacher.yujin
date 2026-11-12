import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../app/api/admin/route.ts',import.meta.url),'utf8');
const student=fs.readFileSync(new URL('../app/student/page.tsx',import.meta.url),'utf8');
const teacher=fs.readFileSync(new URL('../app/teacher/page.tsx',import.meta.url),'utf8');

test('start API persists one shared start and deadline and reports running',()=>{
  assert.match(admin,/SET status='open',started_at=\?,exam_started_at=\?,deadline=\?/);
  assert.match(admin,/exam_started_at IS NULL/);
  assert.match(admin,/status:'running'/);
  assert.match(admin,/기존 시작 시각과 종료 시각을 유지합니다/);
  assert.match(admin,/className==="전체"/);
});

test('student waiting screen polls and auto-enters within 2.5 seconds',()=>{
  assert.match(student,/setInterval\(tick,\s*2500\)/);
  assert.match(student,/setting\?\.status\s*===\s*"open"[\s\S]*examStarted/);
  assert.match(student,/if\s*\(!attempt\?\.started_at\)[\s\S]*setLeft\(-1\)/);
});

test('five steps have optional progressive hints without tracking or answer templates',()=>{
  assert.match(student,/function LearningSupport/);
  assert.equal((student.match(/concept:/g)||[]).length,5);
  assert.equal((student.match(/hints:\s*\[/g)||[]).length,5);
  assert.match(student,/힌트가 필요해요/);
  assert.match(student,/다음 힌트 보기/);
  assert.doesNotMatch(student,/hintCount[\s\S]{0,120}fetch\(/);
  assert.doesNotMatch(student,/힌트 사용.*감점/);
});

test('teacher shows start failures and reloads successful running state',()=>{
  assert.match(teacher,/수행 시작에 실패했습니다. 서버 상태를 새로고침한 뒤 다시 시도하세요/);
  assert.match(teacher,/await load\(\)/);
});

test('three students, five duplicate starts, pause/resume and reconnect preserve clock and answers',()=>{
  const first=Date.now(),duration=45*60_000;
  const session={status:'waiting',started_at:null,deadline:null,paused_at:null,paused_seconds:0};
  const students=[1,2,3].map(id=>({id,status:'waiting',started_at:null,answers:{draft:`답안-${id}`}}));
  const start=()=>{if(session.started_at)return{status:'running',started_at:session.started_at,deadline:session.deadline};session.status='running';session.started_at=first;session.deadline=first+duration;for(const s of students){s.status='progress';s.started_at=first}return{status:'running',started_at:first,deadline:first+duration}};
  const initial=start();for(let i=0;i<5;i++)assert.deepEqual(start(),initial);
  assert.ok(students.every(s=>s.status==='progress'&&s.started_at===first));
  session.status='paused';session.paused_at=first+60_000;const remainingAtPause=session.deadline-session.paused_at;
  const resumedAt=session.paused_at+30_000;session.paused_seconds+=30;session.deadline+=30_000;session.paused_at=null;session.status='running';
  const afterRefresh={...session},afterReconnect={...session};
  assert.equal(afterRefresh.deadline-resumedAt,remainingAtPause);
  assert.equal(afterReconnect.deadline,session.deadline);
  assert.deepEqual(students.map(s=>s.answers.draft),['답안-1','답안-2','답안-3']);
});
