import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Actual route code, real SQLite transactions, synthetic students and a stub AI provider.
const db=new DatabaseSync(':memory:');
function prepare(sql,args=[]){
 const execute=()=>{const results=db.prepare(sql).all(...args);return {results,meta:{changes:db.prepare('SELECT changes() c').get().c}}};
 return {bind(...values){return prepare(sql,values)},execute,async first(){return execute().results[0]||null},async all(){return execute()},async run(){return execute()}};
}
globalThis.__batchEnv={TEACHER_CODE:'test-code',DB:{prepare,async batch(items){db.exec('BEGIN');try{const r=items.map(x=>x.execute());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const urls=new Map();
function moduleUrl(file){
 if(urls.has(file))return urls.get(file);
 let source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 source=source.replace(/import\s*\{\s*env\s*\}\s*from\s*["']cloudflare:workers["'];?/g,'const env=globalThis.__batchEnv;');
 source=source.replace(/from\s+(["'])(\.\.?\/[^"']+)\1/g,(_,q,name)=>`from ${JSON.stringify(moduleUrl(path.resolve(path.dirname(file),name+'.ts')))}`);
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(file,url);return url;
}
const schema=await import(moduleUrl(path.resolve('app/api/schema.ts')));await schema.ensureRuntimeSchema();
db.exec("CREATE TABLE teacher_settings(id INTEGER PRIMARY KEY,openai_api_key TEXT,model TEXT,updated_at INTEGER); INSERT INTO teacher_settings VALUES(1,'synthetic-test-key','test-model',0)");
const admin=await import(moduleUrl(path.resolve('app/api/admin/route.ts')));
const participation=await import(moduleUrl(path.resolve('app/api/participation.ts')));
const batch=await import(moduleUrl(path.resolve('app/api/batch-grading.ts')));
const calibration=await import(moduleUrl(path.resolve('app/api/grading-calibration.ts')));
const answers={won:'하락',dollar:'상승',cost:'증가',groups:{exporter:'유리',importer:'불리'},exportReason:'원화 약세로 수출 가격 경쟁력이 높아진다.',importReason:'달러 결제로 수입 원자재 비용이 증가한다.',effects:['수입물가 상승','외채 부담'],policies:['달러 공급','생필품 지원'],policyEffect:'환율 안정을 통해 수입 물가 충격을 완화한다.',policyRisk:'외환보유액과 재정 부담이 생긴다.',report:'IMF 긴급 금융 지원과 정책 자문을 요청하고 통화스와프와 공동성명을 추진한다.'};
function student(id,cls='A',options={}){
 db.prepare('INSERT INTO roster VALUES(?,?,?)').run(id,'가상 학생',cls);
 db.prepare("INSERT INTO attempts(student_id,name,class_name,answers,status,started_at,submitted_at,updated_at,current_step,teacher_score,extra_penalty,extra_penalty_exempt,extra_granted_minutes) VALUES(?,?,?,?,'submitted',?,?,?,5,?,?,?,?)").run(id,'가상 학생',cls,JSON.stringify(answers),Date.now()-1800000,Date.now(),Date.now(),options.teacher??null,options.penalty||0,options.exempt||0,options.extra||0);
}
let calls=0,fail=false,beforeResponse=null,gate=null;
globalThis.fetch=async()=>{calls++;if(gate)await gate;if(beforeResponse)await beforeResponse();if(fail)return new Response('{}',{status:429});return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({economy:25,policy:25,organization:20,cooperation:20,completion:4,economyEvidence:'원화 약세',policyEvidence:'환율 안정',organizationEvidence:'IMF',cooperationEvidence:'통화스와프',completionEvidence:'최종 보고서',confidence:'high',reviewRequired:false,reviewReason:'',feedback:'근거 확인',strength:'충실함',improvement:'구체화'})}]}]})};
async function send(operation,extra={}){return admin.POST(new Request('https://test/api/admin',{method:'POST',body:JSON.stringify({code:'test-code',action:'batch_grade',operation,...extra})}))}
async function call(operation,extra={}){const res=await send(operation,extra);assert.equal(res.status,200);return (await res.json()).job}

test('no idle, heartbeat, pause or long-gap participation credit; real changes are bounded',()=>{
 const row={answers:JSON.stringify(answers),last_writing_at:1000,paused_seconds:0};
 assert.equal(participation.participationDelta(row,answers,61000).seconds,0);
 assert.equal(participation.participationDelta(row,{...answers,report:answers.report+' 협력'},61000).seconds,60);
 assert.equal(participation.participationDelta({...row,paused_at:1000},{...answers,report:'변경된 답안'},61000).changes,0);
 assert.equal(participation.participationDelta({...row,paused_seconds:30},{...answers,report:'변경된 답안'},61000).seconds,0);
 assert.equal(participation.participationDelta(row,{...answers,report:'변경된 답안'},601000).seconds,0);
 assert.equal(participation.participationReview({started_at:1000,submitted_at:2701000},{},1).completion,1);
 assert.equal(participation.participationReview({},answers,3).completion,3);
 const review=participation.participationReview({writing_changes:3,writing_seconds:45,current_step:5},answers,3);assert.equal(review.completion,4);
});
test('authenticated batch snapshots selected class, protects confirmed and absent students, prevents double start',async()=>{
 student('a1');student('a2');student('a-final','A',{teacher:91});student('b1','B');
 db.prepare("INSERT INTO roster VALUES('absent','결석 가상','A')").run();
 const bad=await admin.POST(new Request('https://test/api/admin',{method:'POST',body:JSON.stringify({code:'bad',action:'batch_grade',operation:'start',className:'전체'})}));assert.equal(bad.status,401);
 const job=await call('start',{className:'A'});assert.equal(job.total,2);
 assert.equal((await call('start',{className:'B'})).token,job.token);
 fail=true;let next=await call('step',{token:job.token});assert.equal(next.failed,1);
 fail=false;next=await call('step',{token:job.token});assert.equal(next.status,'completed');assert.equal(next.failed,1);
 assert.equal(db.prepare("SELECT ai_score FROM attempts WHERE student_id='b1'").get().ai_score,null);
 assert.equal(db.prepare("SELECT teacher_score FROM attempts WHERE student_id='a-final'").get().teacher_score,91);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM attempts WHERE student_id='absent'").get().c,0);
 const retry=await call('retry',{token:job.token});assert.equal(retry.items.filter(x=>x.status==='pending').length,1);
 const done=await call('step',{token:job.token});assert.equal(done.failed,0);assert.equal(done.status,'completed');
 const meta=JSON.parse(db.prepare("SELECT ai_breakdown FROM attempts WHERE student_id='a1'").get().ai_breakdown);assert.ok(meta.reviewRequired);assert.ok(meta.reviewFlags.some(x=>x.includes('履歴')||x.includes('이력 없음')));
});
test('same snapshot is cached; grading version and timing changes invalidate cache',async()=>{
 const count=calls;const first=await batch.gradeOne('a1');assert.equal(first.status,'cached');assert.equal(calls,count);
 db.prepare("UPDATE attempts SET extra_penalty=2,extra_granted_minutes=5 WHERE student_id='a1'").run();
 const second=await batch.gradeOne('a1');assert.equal(second.ai.time,4);assert.equal(calls,count+1);
 db.prepare("UPDATE attempts SET extra_penalty_exempt=1 WHERE student_id='a1'").run();
 assert.equal((await batch.gradeOne('a1')).ai.time,6);
});
test('global lease rejects concurrent single requests and resumes interrupted batch',async()=>{
 let release;gate=new Promise(r=>release=r);const one=batch.gradeOne('b1');
 while(!calls||!db.prepare('SELECT expires_at FROM grading_lock WHERE id=1').get().expires_at)await new Promise(r=>setImmediate(r));
 await assert.rejects(batch.gradeOne('b1'),/처리 중/);release();await one;gate=null;
 const job=await call('start',{className:'B'});
 db.prepare("UPDATE grading_items SET status='running' WHERE job_token=?").run(job.token);
 const resumed=await call('step',{token:job.token});assert.equal(resumed.status,'completed');assert.equal(resumed.items[0].status,'cached');
});
test('concurrent teacher confirmation or reopen prevents stale AI writes',async()=>{
 student('race');beforeResponse=async()=>{db.prepare("UPDATE attempts SET teacher_score=88 WHERE student_id='race'").run()};
 await assert.rejects(batch.gradeOne('race'),/변경되었습니다/);beforeResponse=null;
 const row=db.prepare("SELECT * FROM attempts WHERE student_id='race'").get();assert.equal(row.teacher_score,88);assert.equal(row.ai_score,null);
 student('reopen');beforeResponse=async()=>{db.prepare("UPDATE attempts SET status='progress' WHERE student_id='reopen'").run()};
 await assert.rejects(batch.gradeOne('reopen'),/변경되었습니다/);beforeResponse=null;
 assert.equal(db.prepare("SELECT ai_score FROM attempts WHERE student_id='reopen'").get().ai_score,null);
});
test('open class is blocked on server, not only UI',async()=>{
 db.prepare("INSERT INTO class_sessions(class_name,status,updated_at) VALUES('B','open',0)").run();
 assert.equal((await send('start',{className:'B'})).status,409);
 await assert.rejects(batch.gradeOne('b1'),/마감/);
});
test('completion credits concise full work but never fills an empty answer to reach 90',()=>{
 const concise={...answers,exportReason:'가격 경쟁력 향상',importReason:'원화 비용 증가',policyEffect:'환율과 물가 안정',policyRisk:'재정 부담 증가',report:'IMF 자문과 통화스와프 협력'};
 assert.equal(calibration.calibratedBands(concise).completion,4);
 const empty=calibration.calibratedBands({});assert.equal(empty.completion,1);
 assert.ok(Object.values(empty).reduce((a,b)=>a+b,6)<90);
 assert.equal(calibration.calibratedBands({...concise,_processQuality:'weak'}).completion,4);
});
test('expired lease prevents a stale result from being saved',async()=>{
 student('stale');beforeResponse=async()=>{db.prepare('UPDATE grading_lock SET expires_at=0 WHERE id=1').run()};
 await assert.rejects(batch.gradeOne('stale'),/변경되었습니다/);beforeResponse=null;
 assert.equal(db.prepare("SELECT ai_score FROM attempts WHERE student_id='stale'").get().ai_score,null);
});
test('export loads full answers, review flags and teacher history only for chosen scope',async()=>{
 db.prepare("INSERT INTO grade_history(student_id,teacher_score,created_at) VALUES('a-final',91,1)").run();
 const response=await admin.GET(new Request('https://test/api/admin?code=test-code&export=1&className=A'));
 assert.equal(response.status,200);const exported=await response.json();
 assert.ok(exported.attempts.every(x=>x.class_name==='A'));
 assert.equal(exported.attempts.find(x=>x.student_id==='a1').answers.report,answers.report);
 assert.equal(exported.attempts.find(x=>x.student_id==='a-final').grade_history[0].teacher_score,91);
 const meta=JSON.parse(exported.attempts.find(x=>x.student_id==='a1').ai_breakdown);assert.ok(meta.reviewFlags.length);
});
