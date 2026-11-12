import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {startPolling} from '../app/polling.mjs';

const db=new DatabaseSync(':memory:');
let calls=0;
const sqlLog=[];
function prepared(sql,args=[]) {
  function execute(){sqlLog.push(sql);const stmt=db.prepare(sql);const results=stmt.all(...args);return {results,meta:{changes:db.prepare('SELECT changes() c').get().c}};}
  return {bind(...values){return prepared(sql,values)},execute,async all(){calls++;return execute()},async first(){calls++;return execute().results[0]||null},async run(){calls++;return execute()}};
}
globalThis.__performanceEnv={DB:{prepare:prepared,async batch(statements){calls++;db.exec('BEGIN');try{const out=statements.map(x=>x.execute());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}}};
const urls=new Map();
function moduleUrl(file) {
  if(urls.has(file))return urls.get(file);
  let source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  source=source.replace(/import\s*\{\s*env\s*\}\s*from\s*["']cloudflare:workers["'];?/g,'const env=globalThis.__performanceEnv;');
  source=source.replace(/from\s+(["'])(\.\.?\/[^"']+)\1/g,(_,q,name)=>`from ${JSON.stringify(moduleUrl(path.resolve(path.dirname(file),name+'.ts')))}`);
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(file,url);return url;
}
const schema=await import(moduleUrl(path.resolve('app/api/schema.ts')));
const exam=await import(moduleUrl(path.resolve('app/api/exam/route.ts')));
const help=await import(moduleUrl(path.resolve('app/api/help/route.ts')));
const req=(action,extra={})=>new Request('https://local/api/exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,studentId:'test1',name:'테스트',...extra})});
const now=Date.now();
test('schema setup is batched once and preserves existing data',async()=>{
  await schema.ensureRuntimeSchema();
  assert.equal(calls,2);
  db.prepare("INSERT INTO roster VALUES (?,?,?)").run('test1','테스트','테스트반');
  const before=calls;await schema.ensureRuntimeSchema();assert.equal(calls,before);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM roster').get().c,1);
});
test('registered student waits before start; login takes three DB round trips',async()=>{
  const before=calls;const res=await exam.POST(req('login'));assert.equal(res.status,200);
  assert.equal((await res.json()).attempt.status,'ready');assert.equal(calls-before,3);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM attempts').get().c,0);
  assert.equal((await exam.POST(req('start'))).status,403);
});
test('shared start, save, pause and reconnect preserve answers and timing',async()=>{
  db.prepare("INSERT INTO class_sessions (class_name,status,duration_minutes,exam_started_at,paused_seconds,updated_at) VALUES (?,'open',45,?,0,?)").run('테스트반',now,now);
  assert.equal((await exam.POST(req('start'))).status,200);
  const answer={report:'보존할 답안'};
  assert.equal((await exam.POST(req('save',{answers:answer,currentStep:2}))).status,200);
  db.prepare('UPDATE attempts SET paused_at=?,paused_seconds=30 WHERE student_id=?').run(now+1000,'test1');
  const before=calls;sqlLog.length=0;
  const res=await exam.GET(new Request('https://local/api/exam?studentId=test1'));const result=await res.json();
  assert.equal(calls-before,2);assert.equal(result.attempt.started_at,now);
  assert.deepEqual(result.attempt.answers,answer);assert.equal(result.attempt.paused_seconds,30);
  assert.ok(sqlLog.every(sql=>!/^CREATE|^ALTER|^PRAGMA/.test(sql)));
});
test('student lookup expires only that student; paused attempts do not expire',async()=>{
  db.prepare("INSERT INTO attempts (student_id,name,class_name,started_at,duration_minutes,updated_at) VALUES ('expired','만료','테스트반',?,1,?)").run(now-120000,now);
  await exam.GET(new Request('https://local/api/exam?studentId=test1'));
  assert.equal(db.prepare("SELECT status FROM attempts WHERE student_id='expired'").get().status,'progress');
  const expired=await (await exam.GET(new Request('https://local/api/exam?studentId=expired'))).json();
  assert.equal(expired.attempt.status,'submitted');assert.equal(expired.attempt.submission_type,'timeout');
  assert.equal(db.prepare("SELECT status FROM attempts WHERE student_id='test1'").get().status,'progress');
});
test('help polling has one read and hides completed students without writes',async()=>{
  db.prepare("INSERT INTO help_requests(student_id,name,class_name,message,status,requested_at) VALUES ('expired','만료','테스트반','도움','open',?)").run(now);
  const before=calls;sqlLog.length=0;const res=await help.GET(new Request('https://local/api/help?studentId=expired'));
  assert.equal((await res.json()).help,null);assert.equal(calls-before,1);assert.ok(sqlLog.every(sql=>sql.startsWith('SELECT')));
});
test('submitted answers cannot be overwritten by a late autosave',async()=>{
  const res=await exam.POST(req('submit',{submissionType:'timeout',answers:{report:'최종 답안'},currentStep:5}));assert.equal(res.status,200);
  assert.equal((await exam.POST(req('save',{answers:{report:'오래된 답안'}}))).status,409);
  assert.equal(JSON.parse(db.prepare("SELECT answers FROM attempts WHERE student_id='test1'").get().answers).report,'최종 답안');
});
test('slow polling never overlaps; stop cancels; failures back off',async()=>{
  const scheduled=new Map();let next=0,resolve,started=0,signal;
  const schedule=(fn,ms)=>{const key=++next;scheduled.set(key,{fn,ms});return key};const cancel=id=>scheduled.delete(id);
  const poll=startPolling(async s=>{started++;signal=s;await new Promise(r=>{resolve=r})},{delay:3000,schedule,cancel});
  poll.refresh();poll.refresh();assert.equal(started,1);
  resolve();await new Promise(r=>setImmediate(r));assert.ok([...scheduled.values()].some(x=>x.ms===3000));
  poll.stop();assert.equal(scheduled.size,0);assert.equal(signal.aborted,true);
  const failed=startPolling(async()=>{throw new Error('offline')},{delay:3000,schedule,cancel});
  await new Promise(r=>setImmediate(r));assert.ok([...scheduled.values()].some(x=>x.ms===6000));failed.stop();
});

test('teacher reset clears only the chosen student and restarts 45 minutes on entry',async()=>{
  const admin=await import(moduleUrl(path.resolve('app/api/admin/route.ts')));
  const other=JSON.stringify(db.prepare("SELECT * FROM attempts WHERE student_id='expired'").get());
  const result=await admin.POST(req('reset',{code:'000000',restartTimer:true}));
  assert.equal(result.status,200);
  const ready=db.prepare("SELECT * FROM attempts WHERE student_id='test1'").get();
  assert.equal(ready.started_at,0);assert.equal(ready.status,'ready');assert.equal(ready.duration_minutes,45);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM student_visits WHERE student_id='test1'").get().c,0);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM attempts WHERE student_id='expired'").get()),other);
  const login=await (await exam.POST(req('login'))).json();assert.equal(login.attempt.started_at,0);
  const before=Date.now();const started=await (await exam.POST(req('start'))).json();
  assert.ok(started.attempt.started_at>=before);assert.equal(started.attempt.duration_minutes,45);
  const again=await (await exam.POST(req('start'))).json();assert.equal(again.attempt.started_at,started.attempt.started_at);
  assert.equal(started.setting.deadline-started.attempt.started_at,45*60000);
});

test('presence storage failure does not block login or answer saving',async()=>{
  const original=globalThis.__performanceEnv.DB.prepare;
  globalThis.__performanceEnv.DB.prepare=(sql)=>sql.startsWith('INSERT INTO student_visits')?{bind(){return {async run(){throw new Error('simulated presence failure')}}}}:original(sql);
  try {
    assert.equal((await exam.POST(req('login'))).status,200);
    assert.equal((await exam.POST(req('save',{answers:{report:'네트워크 오류 중 보존'}}))).status,200);
    assert.equal(JSON.parse(db.prepare("SELECT answers FROM attempts WHERE student_id='test1'").get().answers).report,'네트워크 오류 중 보존');
  } finally {globalThis.__performanceEnv.DB.prepare=original;}
});

test('teacher class controls preserve the clock on retries and isolate other classes',async()=>{
  const admin=await import(moduleUrl(path.resolve('app/api/admin/route.ts')));
  const send=(action,extra={})=>admin.POST(req(action,{code:'000000',className:'휴대폰 테스트반',...extra}));
  const session=()=>db.prepare("SELECT * FROM class_sessions WHERE class_name='휴대폰 테스트반'").get();
  const other=JSON.stringify(db.prepare("SELECT * FROM class_sessions WHERE class_name='테스트반'").get());
  assert.equal((await send('start_class')).status,409);
  assert.equal((await send('control',{command:'open',duration:40})).status,200);
  assert.equal(session().exam_started_at,null);
  const first=await (await send('start_class')).json();
  assert.equal(first.deadline-first.startedAt,40*60000);
  await send('control',{command:'open',duration:90});
  assert.equal(session().exam_started_at,first.startedAt);
  assert.equal(session().duration_minutes,40);
  const retry=await (await send('start_class')).json();assert.equal(retry.startedAt,first.startedAt);
  await send('control',{command:'pause'});assert.equal(session().status,'paused');
  await send('control',{command:'open'});assert.equal(session().status,'paused');
  await send('control',{command:'resume'});assert.equal(session().status,'open');
  assert.equal(session().exam_started_at,first.startedAt);
  await send('control',{command:'close'});assert.equal(session().status,'closed');
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM class_sessions WHERE class_name='테스트반'").get()),other);
  assert.equal((await send('control',{command:'open',code:'wrong'})).status,401);
});

test('all-class start stores deadlines and does not restart running classes',async()=>{
  const admin=await import(moduleUrl(path.resolve('app/api/admin/route.ts')));
  db.prepare("INSERT INTO class_sessions(class_name,status,duration_minutes,updated_at) VALUES ('동시시작 테스트반','open',35,?)").run(Date.now());
  const before=db.prepare("SELECT exam_started_at FROM class_sessions WHERE class_name='테스트반'").get().exam_started_at;
  assert.equal((await admin.POST(req('start_all',{code:'000000'}))).status,200);
  const started=db.prepare("SELECT * FROM class_sessions WHERE class_name='동시시작 테스트반'").get();
  assert.equal(started.deadline-started.exam_started_at,35*60000);
  assert.equal(started.started_at,started.exam_started_at);
  assert.equal(db.prepare("SELECT exam_started_at FROM class_sessions WHERE class_name='테스트반'").get().exam_started_at,before);
});
