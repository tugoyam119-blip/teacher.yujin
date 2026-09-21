const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('authoritative deadline, immutable submit, extension, reopening and atomic reset',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'climate-regression-')),port=4800+Math.floor(Math.random()*150),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:data,TEACHER_PASSWORD:'regression-only',OPENAI_API_KEY:''},stdio:'ignore'});
 async function req(url,body,auth=false){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'x-teacher-key':'regression-only'}:{})},body:body?JSON.stringify(body):undefined});return {http:r.status,...await r.json()}}
 async function action(action,classNo=1){return req('/api/teacher/class-runtime',{action,classNo},true)}
 async function start(id='30101',name='시험학생'){return req('/api/start',{studentId:id,name})}
 async function edit(mutator){const f=path.join(data,'class-runtime.json'),cr=JSON.parse(fs.readFileSync(f));mutator(cr.sessions[cr.classes['1']]);fs.writeFileSync(f,JSON.stringify(cr))}
 try{
  for(let n=0;n<80;n++){try{await req('/health');break}catch{await sleep(50)}}
  assert.equal((await req('/api/teacher/reset-records',{all:true})).http,401);
  await req('/api/teacher/roster',{students:[{studentId:'30101',name:'시험학생',className:'1반'},{studentId:'30201',name:'시험둘',className:'2반'}]},true);
  await req('/api/teacher/server',{action:'open_with_admission',classNos:[1,2]},true);
  const first=await start(),id=first.session.sessionId;
  assert.equal((await req('/api/save',{sessionId:id,data:{text:'not yet'}})).http,423);
  await action('start');assert.equal((await action('start')).http,409,'duplicate start must not reset elapsed time');
  await req('/api/save',{sessionId:id,data:{finalDeclaration:'확정할 답안'},progress:25});
  const [submitted,lateSave]=await Promise.all([req('/api/submit',{sessionId:id,data:{finalDeclaration:'확정 답안'}}),req('/api/save',{sessionId:id,data:{finalDeclaration:'바뀌면 안 됨'}})]);
  assert.equal(submitted.http,200);assert([200,409].includes(lateSave.http));assert.equal((await req('/api/session/'+id)).session.data.finalDeclaration,'확정 답안');assert.equal((await req('/api/save',{sessionId:id,data:{finalDeclaration:'추가 변경'}})).http,409);
  const again=await req('/api/submit',{sessionId:id,data:{finalDeclaration:'바뀌면 안 됨'}});assert.equal(again.alreadySubmitted,true);assert.equal(again.session.data.finalDeclaration,'확정 답안');
  assert.equal((await start()).session.status,'submitted','same student may read confirmed snapshot');
  assert.equal(again.session.timeComplianceScore,6);
  await req('/api/teacher/reset-records',{all:true},true);
  assert.equal((await req('/api/server-status')).open,false);assert.equal((await start()).http,423);
  const reset=await req('/api/teacher/class-runtime',null,true);assert(reset.classes.every(x=>x.phase==='ready'&&x.remainingSeconds===2700));
  assert.equal((await req('/api/teacher/submissions',null,true)).sessions.length,0);
  assert.equal((await req('/api/teacher/roster',null,true)).students.length,2);
  await req('/api/teacher/server',{action:'open'},true);await action('start');const second=await start(),id2=second.session.sessionId;
  await req('/api/save',{sessionId:id2,data:{finalDeclaration:'종료 전 보존'},progress:75});
  await edit(r=>{r.elapsedSeconds=2699;r.runStartedAt=new Date(Date.now()-3000).toISOString()});
  await sleep(1400);
  const events=fs.readFileSync(path.join(data,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(e=>e.sessionId===id2&&e.type==='submit').length,1,'deadline sweep runs without student request');
  const expired=await req('/api/session/'+id2);assert.equal(expired.session.status,'submitted');assert.equal(expired.session.submissionReason,'time_expired');
  const late=await req('/api/submit',{sessionId:id2,data:{finalDeclaration:'마감 후 변경'}});assert.equal(late.session.data.finalDeclaration,'종료 전 보존');
  await req('/api/teacher/reopen',{sessionId:id2},true);
  assert.equal((await req('/api/save',{sessionId:id2,data:{finalDeclaration:'허용된 수정'}})).http,200);
  assert.equal((await req('/api/submit',{sessionId:id2,data:{finalDeclaration:'허용된 수정'}})).session.timeComplianceScore,6);
  await req('/api/teacher/reset-records',{all:true},true);await req('/api/teacher/server',{action:'open'},true);await action('extend');await action('start');
  const extended=await start(),id3=extended.session.sessionId;await edit(r=>{r.elapsedSeconds=2800;r.runStartedAt=new Date().toISOString()});
  const timed=await req('/api/submit',{sessionId:id3,data:{finalDeclaration:'추가 시간 제출'}});assert.equal(timed.session.timeComplianceScore,4);
  await action('extend');assert.equal((await action('extend')).http,409);
  await req('/api/teacher/reset-records',{all:true},true);await req('/api/teacher/server',{action:'open'},true);await action('start');
  const last=await start(),id4=last.session.sessionId;await req('/api/save',{sessionId:id4,data:{finalDeclaration:'교사 마감 보존'},progress:25});await action('finish');
  const finished=await req('/api/session/'+id4);assert.equal(finished.session.status,'submitted');assert.equal(finished.session.submissionReason,'teacher_finish');
  const snapshot=await req('/api/teacher/submissions',null,true);assert.equal(snapshot.sessions.length,1);
  await req('/api/teacher/reset-records',{className:'1반'},true);const clean=await req('/api/teacher/submissions',null,true);assert.equal(clean.sessions.length,0);assert(clean.presence.every(x=>!x.everEntered));
 }finally{child.kill();await sleep(100);assert(data.startsWith(path.join(os.tmpdir(),'climate-regression-')));fs.rmSync(data,{recursive:true,force:true})}
});
