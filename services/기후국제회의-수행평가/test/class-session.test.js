const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climate-class-session-'));
const port = 4400 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const teacherHeaders = {'x-teacher-key':'test-pin'};
const legacyStartedAt = new Date(Date.now() - 600_000).toISOString();

fs.writeFileSync(path.join(dataDir, 'runtime.json'), JSON.stringify({serverOpen:true,timerPaused:false,pauseStartedAt:null,totalPausedMs:0,updatedAt:null}, null, 2));
fs.writeFileSync(path.join(dataDir, 'events.jsonl'), JSON.stringify({type:'start',sessionId:'legacy-1',studentId:'10101',name:'기존학생',className:'1반',country:'hanbit',pauseBaseMs:0,ts:legacyStartedAt})+'\n');
fs.writeFileSync(path.join(dataDir, 'roster.json'), JSON.stringify({updatedAt:null,students:[]}, null, 2));

const child = spawn(process.execPath, ['server.js'], {cwd:root, env:{...process.env,DATA_DIR:dataDir,PORT:String(port),TEACHER_PASSWORD:'test-pin'}, stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(method,url,body,headers={}){const r=await fetch(base+url,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text(),data=(()=>{try{return JSON.parse(text)}catch{return text}})();if(!r.ok){const e=new Error(data.error||`${method} ${url} ${r.status}`);e.status=r.status;e.data=data;throw e;}return data;}
const get=(url,headers)=>request('GET',url,null,headers),post=(url,body,headers)=>request('POST',url,body,headers);
async function waitForServer(){for(let i=0;i<50;i++){try{await get('/health');return}catch{await sleep(100)}}throw new Error('server did not start\n'+logs)}
async function editClass(classNo,mutate){const file=path.join(dataDir,'class-runtime.json'),j=JSON.parse(await fsp.readFile(file,'utf8')),id=j.classes[String(classNo)],rec=j.sessions[id];mutate(rec);j.sessions[id]=rec;await fsp.writeFile(file,JSON.stringify(j,null,2));return rec;}

(async()=>{try{
  await waitForServer();
  const legacy=await get('/api/timer/legacy-1');
  const legacyExpected=Math.max(0,2700-Math.floor((Date.now()-Date.parse(legacyStartedAt))/1000));
  assert.ok(Math.abs(legacy.remainingSeconds-legacyExpected)<=1,'legacy remaining time changed');
  assert.equal(legacy.timerMode,undefined);

  await post('/api/teacher/roster',{students:[
    {studentId:'10102',name:'신규일반',className:'1반'},
    {studentId:'10201',name:'신규이반',className:'2반'},
    {studentId:'10301',name:'신규삼반',className:'3반'}
  ]},teacherHeaders);
  await post('/api/teacher/server',{action:'open'},teacherHeaders);
  await post('/api/teacher/class-runtime',{action:'open_admission',classNo:1,mode:'regular'},teacherHeaders);
  const ready=await post('/api/start',{studentId:'10102',name:'신규일반'});
  assert.equal(ready.session.timerMode,'class_session_v1');
  assert.equal(ready.timer.remainingSeconds,2700);
  assert.equal(ready.timer.phase,'ready');
  await sleep(250);
  assert.equal((await get(`/api/timer/${ready.session.sessionId}`)).remainingSeconds,2700,'waiting consumed class time');

  await post('/api/teacher/class-runtime',{action:'start',classNo:1,mode:'regular'},teacherHeaders);
  assert.equal((await get(`/api/timer/${ready.session.sessionId}`)).phase,'running','teacher start did not begin the class timer');
  await editClass(1,r=>{r.elapsedSeconds=2399;r.runStartedAt=new Date(Date.now()-2000).toISOString();r.phase='running';r.checkpointSeconds=2700});
  const finished=await get(`/api/timer/${ready.session.sessionId}`);
  assert.equal(finished.phase,'finished');
  assert.equal(finished.remainingSeconds,0);
  await post('/api/submit',{sessionId:ready.session.sessionId,data:{finalDeclaration:'보존 답안'}});

  await post('/api/teacher/class-runtime',{action:'open_admission',classNo:2,mode:'regular'},teacherHeaders);
  const class2=await post('/api/start',{studentId:'10201',name:'신규이반'});
  await post('/api/teacher/class-runtime',{action:'start',classNo:2,mode:'regular'},teacherHeaders);
  await editClass(2,r=>{r.elapsedSeconds=300;r.runStartedAt=null;r.phase='paused'});
  const class1After=(await get('/api/teacher/class-runtime',teacherHeaders)).classes.find(x=>x.classNo===1);
  const class2After=(await get('/api/teacher/class-runtime',teacherHeaders)).classes.find(x=>x.classNo===2);
  assert.equal(class1After.elapsedSeconds,2700,'class 2 changed class 1');
  assert.equal(class2After.elapsedSeconds,300);
  assert.equal((await get(`/api/timer/${class2.session.sessionId}`)).remainingSeconds,2100);

  await post('/api/teacher/class-runtime',{action:'open_admission',classNo:3,mode:'makeup'},teacherHeaders);
  const makeup=await post('/api/start',{studentId:'10301',name:'신규삼반'});
  assert.equal(makeup.timer.mode,'makeup');
  assert.notEqual(makeup.session.classSessionId,ready.session.classSessionId);

  await post('/api/teacher/reopen',{sessionId:ready.session.sessionId},teacherHeaders);
  await post('/api/teacher/score',{sessionId:ready.session.sessionId,score:{countryUnderstanding:20,policyChoice:20,compromise:20,reflection:20},teacherNote:'첫 점수'},teacherHeaders);
  await post('/api/teacher/score',{sessionId:ready.session.sessionId,score:{countryUnderstanding:25,policyChoice:25,compromise:25,reflection:25},teacherNote:'최종 점수'},teacherHeaders);
  await post('/api/start',{studentId:'10102',name:'신규일반'});
  const dashboard=await get('/api/teacher/submissions',teacherHeaders),saved=dashboard.sessions.find(x=>x.sessionId===ready.session.sessionId),presence=dashboard.presence.find(x=>x.studentId==='10102');
  assert.equal(saved.data.finalDeclaration,'보존 답안');
  assert.equal(saved.reopenCount,1);
  assert.equal(saved.scoreHistory.length,2);
  assert.equal(saved.score.total,100);
  assert.equal(presence.loginCount,2,'reconnect count was not retained');
  assert.ok(fs.existsSync(path.join(dataDir,'events.jsonl'))&&fs.existsSync(path.join(dataDir,'runtime.json'))&&fs.existsSync(path.join(dataDir,'class-runtime.json')));
  console.log('PASS 40m timer, class isolation, makeup, reopen/history, four-area scoring');
}finally{child.kill();await sleep(100);await fsp.rm(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);child.kill();process.exitCode=1});
