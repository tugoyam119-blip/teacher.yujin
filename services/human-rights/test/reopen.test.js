const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
test('submitted answers reopen only in active remaining regular time; preserve records and require resubmission',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-reopen-'));
 const put=(file,value)=>{const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value))};
 const read=file=>JSON.parse(fs.readFileSync(path.join(dir,file)));
 const text=Array.from({length:170},(_,i)=>String.fromCharCode(0xac00+i)).join('');
 const payload={schemaVersion:10,step:7,seen:['structure','usage','map','voices','budget'],quizDone:{structure:true,usage:true,map:true,voices:true,budget:true},evidence:['ev_central_all','ev_school_cost','ev_budget50'],policyStations:['central','school'],criteria:['many','efficiency'],rights:['mobility_right'],answer1:text,answer2:text,answer3:text,beneficiaries:['wheel'],delayed:['elder'],limitation:'region',remedy:'plan',newImpacts:['budget'],impactStrength:'small',finalDecision:'keep',finalStations:['central','school'],submitted:true};
 put('roster.json',{enabled:true,rows:[{student_id:'10101',name:'시험학생',class_no:1}]});
 const original={student_id:'10101',payload,submitted:true,submitted_at:'2026-09-15T00:00:00Z',first_submitted_at:'2026-09-15T00:00:00Z',submission_count:1,self_evaluation:{text:'기존 자기평가',submitted_at:'2026-09-15T00:00:00Z'}};
 put('progress/10101.json',original);put('grades/10101.json',{ai_grade:{total:80},teacher_grade:{total:85}});
 const baseControl={server_open:1,is_open:1,class_no:1,period_type:'1',session_id:'session1',timer_running:true,phase:'running',run_started_at:new Date().toISOString(),elapsed_seconds:0};
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'3419',DATA_DIR:dir,TEACHER_PIN:'test-only',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('startup timeout')),10000).unref())]);
  const post=(url,body={})=>fetch('http://127.0.0.1:3419'+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student_id:'10101',name:'시험학생',...body})});
  for(const change of [{class_no:2},{timer_running:false,phase:'paused'},{is_open:0,timer_running:false},{period_type:'makeup'}]){put('control.json',{...baseControl,...change});assert.equal((await post('/api/reopen-submission')).status,403);assert.equal(read('progress/10101.json').submitted,true)}
  put('control.json',baseControl);put('time/10101.json',{period1_used:2700,period2_used:0});assert.equal((await post('/api/reopen-submission')).status,403);
  put('control.json',{...baseControl,period_type:'2',session_id:'session2'});put('time/10101.json',{period1_used:2700,period2_used:2700});assert.equal((await post('/api/reopen-submission')).status,403);
  put('time/10101.json',{period1_used:2700,period2_used:30});
  assert.equal((await post('/api/reopen-submission',{name:'다른이름'})).status,403);
  const response=await post('/api/reopen-submission');assert.equal(response.status,200);const reopened=await response.json();
  assert.equal(reopened.payload.answer1,text);assert.equal(reopened.payload.submitted,false);assert.equal(reopened.session.period1_used,2700);assert.equal(reopened.session.period2_used,30);
  const record=read('progress/10101.json');assert.equal(record.previous_submission.grade.ai_grade.total,80);assert.equal(record.self_evaluation.text,'기존 자기평가');assert.equal(record.manual_save_hash,null);assert.equal(read('grades/10101.json').ai_grade,null);assert.equal(read('grades/10101.json').teacher_grade,null);
  assert.equal((await post('/api/submit',{payload:reopened.payload})).status,409);
  assert.equal((await post('/api/submit',{payload:{...reopened.payload,evidence:[]}})).status,400);
  const revised={...reopened.payload,answer1:text+' 근거 보완'};
  assert.equal((await post('/api/manual-save',{payload:revised})).status,200);
  put('control.json',{...baseControl,period_type:'2',session_id:'session2',timer_running:false,phase:'paused'});assert.equal((await post('/api/save',{payload:revised})).status,403);assert.equal((await post('/api/submit',{payload:revised})).status,403);
  put('control.json',{...baseControl,period_type:'2',session_id:'session2'});
  assert.equal((await post('/api/submit',{payload:revised})).status,200);
  const final=read('progress/10101.json');assert.equal(final.submission_count,2);assert.equal(final.first_submitted_at,original.first_submitted_at);assert.equal(final.payload.answer1,revised.answer1);assert.equal(final.previous_submission.payload.answer1,text);
  // A completed reflection cannot be downgraded by a stale draft request.
  assert.equal((await post('/api/self-eval',{text:'짧은 초안',draft:true})).status,409);
  put('progress/10101.json',{...final,self_evaluation:null});
  const timeBefore=fs.readFileSync(path.join(dir,'time/10101.json'),'utf8');
  const draftText='  아직 작성 중인 자기평가서입니다.\n다음에 이어 쓰겠습니다.  ';
  assert.equal((await post('/api/self-eval',{text:draftText,draft:true,name:'다른이름'})).status,403);
  assert.equal((await post('/api/self-eval',{text:draftText,draft:true})).status,200);
  const saved=await (await fetch('http://127.0.0.1:3419/api/progress?student_id=10101')).json();
  assert.equal(saved.self_evaluation.text,draftText);assert.equal(saved.self_evaluation.submitted_at,null);assert(saved.self_evaluation.saved_at);
  assert.equal((await post('/api/self-eval',{text:draftText})).status,400);
  assert.equal((await post('/api/self-eval',{text:'가'.repeat(1001),draft:true})).status,400);
  assert.equal((await post('/api/self-eval',{text:'',draft:true})).status,200);
  const complete=Array.from({length:400},(_,i)=>String.fromCharCode(0xac00+i)).join('');
  assert.equal((await post('/api/self-eval',{text:complete})).status,200);assert(read('progress/10101.json').self_evaluation.submitted_at);
  assert.equal(read('progress/10101.json').payload.answer1,revised.answer1);
  assert.equal(fs.readFileSync(path.join(dir,'time/10101.json'),'utf8'),timeBefore);
 }finally{const exited=once(child,'exit');child.kill();await exited;fs.rmSync(dir,{recursive:true,force:true})}
});
