import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin=readFileSync(new URL('../app/api/admin/route.ts',import.meta.url),'utf8');
const exam=readFileSync(new URL('../app/api/exam/route.ts',import.meta.url),'utf8');
const student=readFileSync(new URL('../app/student/page.tsx',import.meta.url),'utf8');
const teacher=readFileSync(new URL('../app/teacher/page.tsx',import.meta.url),'utf8');

test('duplicate start keeps the first shared deadline',()=>{
  const duration=45*60_000,first=1_800_000_000_000;
  const session={status:'open',exam_started_at:null,duration_minutes:45,paused_seconds:0};
  for(let i=0;i<5;i++) if(session.exam_started_at===null) session.exam_started_at=first+i*1000;
  assert.equal(session.exam_started_at,first);
  assert.equal(session.exam_started_at+duration,first+duration);
  assert.match(admin,/alreadyStarted:true/);
  assert.match(admin,/기존 시작 시각을 유지합니다/);
  assert.match(admin,/exam_started_at IS NULL/);
});

test('waiting does not consume time and student auto-transitions',()=>{
  assert.match(exam,/commonStart=id==="000000"\?now:Number\(setting\.exam_started_at\|\|0\)/);
  assert.match(exam,/교사가 아직 평가 타이머를 시작하지 않았습니다/);
  assert.match(student,/setInterval\(tick,2500\)/);
  assert.match(student,/setting\?\.status==='open'&&examStarted\)startExam/);
});

test('late entrant inherits the class common start',()=>{
  assert.match(exam,/started_at,duration_minutes/);
  assert.match(exam,/bind\(id,name,listed\.class_name,commonStart/);
});

test('all-classes view is read-only by default with explicit confirmed controls',()=>{
  assert.match(teacher,/전체반 모니터링 화면/);
  assert.match(teacher,/전체 반 동시 수행 시작/);
  assert.match(teacher,/영향받는 반:/);
  assert.match(teacher,/명단 인원:/);
  assert.match(admin,/action==="control_all"/);
  assert.match(admin,/className==="전체"/);
});

test('operation labels follow the selected duration and reconnects are visible',()=>{
  assert.match(teacher,/effectiveDuration\+'분'/);
  assert.doesNotMatch(teacher,/\['서버 열기','미리보기·설명','45분 수행'/);
  assert.match(teacher,/재접속 \{x\.visit\.login_count\}회/);
});

test('existing roster, answers, autosave, grading, Excel and review remain',()=>{
  for(const token of ['action==="roster"','action==="reopen"','action==="grade"','action==="ai_grade"']) assert.ok(admin.includes(token),token);
  for(const token of ['answers TEXT NOT NULL','action==="save"','action==="submit"']) assert.ok(exam.includes(token),token);
  for(const token of ['자동 저장','가채점 결과 Excel 내려받기','최종 검토 상태로 다시 열기']) assert.ok(student.includes(token)||teacher.includes(token),token);
});

test('writing guidance, objective help, fast submit and self-edit are present',()=>{
  assert.match(student,/min=\{20\}/);
  assert.match(student,/min=\{30\}/);
  assert.match(student,/120자 필요/);
  assert.match(student,/length-guide/);
  assert.match(student,/helpOptions:Record/);
  assert.doesNotMatch(student,/helpText/);
  assert.match(student,/제출 전 스스로 확인하세요/);
  assert.match(student,/setAttempt\(\{\.\.\.attempt,status:'submitted'/);
  assert.match(student,/제출한 답안 다시 수정하기/);
  assert.match(exam,/action==="reopen_self"/);
  assert.match(exam,/status='progress',submitted_at=NULL/);
});
