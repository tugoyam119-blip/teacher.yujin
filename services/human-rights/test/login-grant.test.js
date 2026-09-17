const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
test('personal compensation starts on explicit same-day login only, lasts 15 minutes once and does not change class time or penalty',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-grant-'));const put=(f,v)=>{const p=path.join(dir,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v))},read=f=>JSON.parse(fs.readFileSync(path.join(dir,f)));
 put('roster.json',{enabled:true,rows:[{student_id:'10101',name:'시험학생',class_no:1},{student_id:'10102',name:'다른학생',class_no:1}]});
 put('time/10101.json',{student_id:'10101',period1_used:2700,period2_used:2700,extra_used:0});
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'3425',DATA_DIR:dir,TEACHER_PIN:'test-only',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('startup timeout')),10000).unref())]);const base='http://127.0.0.1:3425',post=(url,b)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),get=async()=> (await fetch(base+'/api/bootstrap?student_id=10101')).json(),who={student_id:'10101',name:'시험학생'},today=new Date(Date.now()+9*3600000).toISOString().slice(0,10),grant={...who,pin:'test-only',action:'grant',minutes:15,login_date:today,request_id:'test-grant-request'};
 const control=fs.readFileSync(path.join(dir,'control.json'),'utf8');
 assert.equal((await post('/api/teacher/login-grant',{...grant,pin:'wrong'})).status,403);
 assert.equal((await post('/api/teacher/login-grant',grant)).status,200);
 await post('/api/heartbeat',{student_id:'10101'});await get();await post('/api/login',{...who,resume:true});assert.equal(read('time/10101.json').login_grant.started_at,null);
 assert.equal((await post('/api/login',{...who,name:'틀린이름'})).status,403);assert.equal(read('time/10101.json').login_grant.started_at,null);
 const login=await (await post('/api/login',who)).json();assert.equal(login.session.compensation_remaining_seconds,900);assert.equal(login.session.is_open,1);
 const ends=read('time/10101.json').login_grant.ends_at;await post('/api/login',who);await post('/api/teacher/login-grant',grant);assert.equal(read('time/10101.json').login_grant.ends_at,ends);
 assert.equal((await post('/api/login',{student_id:'10102',name:'다른학생'})).status,403);
 const payload={schemaVersion:10,step:4,answer1:'저장 중인 답안'};assert.equal((await post('/api/save',{...who,payload})).status,200);assert.equal((await post('/api/manual-save',{...who,payload})).status,200);
 await post('/api/heartbeat',{student_id:'10101',active:true});const t=read('time/10101.json');assert.equal(t.extra_used,0);assert.equal(t.period2_used,2700);assert.equal((await get()).session.time_penalty,0);assert.equal(fs.readFileSync(path.join(dir,'control.json'),'utf8'),control);
 t.login_grant.ends_at=new Date(Date.now()-1000).toISOString();put('time/10101.json',t);assert.equal((await post('/api/save',{...who,payload})).status,403);await post('/api/login',who);assert.equal((await get()).session.compensation_active,false);
 t.login_grant={...t.login_grant,login_date:'2000-01-01',started_at:null,ends_at:null};put('time/10101.json',t);assert.equal((await post('/api/login',who)).status,403);assert.equal(read('time/10101.json').login_grant.started_at,null);
 }finally{child.kill();await once(child,'exit');fs.rmSync(dir,{recursive:true,force:true})}
});
