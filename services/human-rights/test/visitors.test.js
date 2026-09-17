const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
test('public visitors have separate authenticated records, private feedback and teacher-only export',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-visitors-'));
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'3427',DATA_DIR:dir,TEACHER_PIN:'test-only',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('startup timeout')),10000).unref())]);
  const base='http://127.0.0.1:3427';let id,token;
  const post=(route,body={},auth=true)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(auth&&token?{'X-Visitor-Token':token}:{})},body:JSON.stringify({student_id:id,...body})});
  assert.equal((await fetch(base+'/experience')).status,200);
  assert.equal((await post('/api/visitor/login',{name:''})).status,400);
  const login=await(await post('/api/visitor/login',{name:'체험별명'})).json();id=login.student_id;token=login.token;
  assert.equal(login.role,'visitor');assert.equal(login.session.is_open,1);
  const second=await(await post('/api/visitor/login',{name:'체험별명'})).json();assert.notEqual(second.student_id,id);
  assert.equal((await fetch(base+'/api/visitor/progress?student_id='+id)).status,403);
  assert.equal((await post('/api/visitor/save',{payload:{schemaVersion:10}},false)).status,403);
  assert.equal((await post('/api/visitor/save',{student_id:second.student_id,payload:{schemaVersion:10}})).status,403);
  assert.equal((await post('/api/observer/save',{payload:{schemaVersion:10}})).status,403);
  const feedback='좋았던 점\n<script>후기</script> =1+1';
  assert.equal((await post('/api/visitor/feedback',{text:feedback,rating:6})).status,400);
  assert.equal((await post('/api/visitor/feedback',{text:feedback,rating:4})).status,200);
  assert.equal((await post('/api/visitor/manual-save',{payload:{schemaVersion:10,answer1:'저장한 초안'}})).status,200);
  const getProgress=()=>fetch(base+'/api/visitor/progress?student_id='+id,{headers:{'X-Visitor-Token':token}}).then(x=>x.json());
  const progress=await getProgress();assert.equal(progress.payload.answer1,'저장한 초안');assert.equal(progress.feedback.text,feedback);
  const text=Array.from({length:400},(_,i)=>String.fromCharCode(0xac00+i)).join('');
  const payload={schemaVersion:10,step:7,seen:['structure','usage','map','voices','budget'],quizDone:{structure:true,usage:true,map:true,voices:true,budget:true},evidence:[],policyStations:['central','school'],criteria:['many','efficiency'],rights:['mobility_right'],answer1:text,answer2:text,answer3:text,beneficiaries:['wheel'],delayed:['elder'],limitation:'region',remedy:'plan',newImpacts:['budget'],impactStrength:'small',finalDecision:'keep',finalStations:['central','school']};
  assert.equal((await post('/api/visitor/manual-save',{payload})).status,200);assert.equal((await post('/api/visitor/submit',{payload})).status,200);
  assert.equal((await post('/api/visitor/feedback',{text:'수정한 후기',rating:''})).status,200);
  assert.equal((await getProgress()).submitted,true);
  assert.equal((await post('/api/teacher/visitors',{action:'get'})).status,403);
  assert.equal((await post('/api/teacher/visitors',{action:'export',pin:token})).status,403);
  const admin=await(await post('/api/teacher/visitors',{action:'get',pin:'test-only'})).json();assert.equal(admin.rows.length,2);assert(!JSON.stringify(admin).includes(token));
  const exportResponse=await post('/api/teacher/visitors',{action:'export',pin:'test-only'});assert.equal(exportResponse.status,200);
  const xlsx=Buffer.from(await exportResponse.arrayBuffer());assert.equal(xlsx.subarray(0,2).toString(),'PK');assert(xlsx.toString().includes('수정한 후기'));assert(xlsx.toString().includes(text));assert(!xlsx.toString().includes(token));
  for(const folder of ['students','progress','presence','time','grades'])assert.deepEqual(fs.readdirSync(path.join(dir,folder)),[]);
  assert(!JSON.stringify(await(await fetch(base+'/api/teacher/results?pin=test-only')).json()).includes('체험별명'));
  assert.equal(fs.readdirSync(path.join(dir,'observers')).length,0);
  assert.equal((await post('/api/visitor/reopen-submission')).status,200);assert.equal((await getProgress()).feedback.text,'수정한 후기');
 }finally{const exited=once(child,'exit');child.kill();await exited;fs.rmSync(dir,{recursive:true,force:true})}
});
