const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawn}=require('node:child_process'),{once}=require('node:events');
const A=require('../lib/attention');
const running={is_open:1,timer_running:true,active_mode:'regular',session_id:'session',classroom_elapsed_seconds:0};
test('away threshold, pause exclusion, stale signals, return history and acknowledgement',()=>{
 const t=1000000,a=A.signal(null,{away:true,sent_at:t},running,false,t);
 assert.equal(A.view(a,{...running,classroom_elapsed_seconds:59},false,t+59000).alert,false);
 assert.equal(A.view(a,{...running,classroom_elapsed_seconds:60},false,t+60000).alert,true);
 assert.equal(A.view(a,{...running,classroom_elapsed_seconds:20},false,t+120000).alert,false);
 assert.equal(A.view(a,{...running,timer_running:false,is_open:0,classroom_elapsed_seconds:70},false,t+70000).alert,false);
 assert.equal(A.view(a,{...running,session_id:'other'},false,t+70000).alert,false);
 assert.equal(A.view(a,{...running,classroom_elapsed_seconds:70},true,t+70000).alert,false);
 const back=A.signal(a,{away:false,sent_at:t+70000},{...running,classroom_elapsed_seconds:70},false,t+70000);
 assert.equal(A.view(back,running,false,t+71000).alert,true);assert.equal(A.view(back,running,false,t+71000).away,false);
 const next=A.signal(back,{away:true,sent_at:t+71000},{...running,classroom_elapsed_seconds:71},false,t+71000);
 assert.equal(A.view(next,{...running,classroom_elapsed_seconds:72},false,t+72000).id,a.id);
 const stale=A.signal(next,{away:false,sent_at:t+1000},running,false,t+72000);assert.equal(stale.away,true);
 const short=A.signal(null,{away:true,sent_at:t},{...running,is_open:0},false,t);assert(!short.away);
 assert(!A.signal(null,{away:true,sent_at:t},running,true,t).away);
});
test('remaining time follows earliest limit and paste/drop blocking leaves typing and teachers intact',()=>{
 const listeners={},ctx={student:{student_id:'10101'},observerMode:false,API_MODE:true,isTeacherTest:()=>false,state:{submitted:false},session:{...running,auto_pause_limit_seconds:2700,classroom_elapsed_seconds:2600,segment_remaining_seconds:500,remaining_seconds:3200},document:{addEventListener:(n,f)=>listeners[n]=f,getElementById:()=>({textContent:'',remove(){}})},window:{addEventListener(){}},setInterval(){},setTimeout(){},clearTimeout(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/student-focus.js'),'utf8'),ctx);
 assert(ctx.remainingTimeText().includes('1分')===false);assert(ctx.remainingTimeText().includes('1분 40초'));
 ctx.session.timer_running=false;assert.equal(ctx.remainingTimeText(),'수행시간 일시정지');
 ctx.session.personal_extra_active=true;ctx.session.personal_extra_remaining_seconds=125;assert(ctx.remainingTimeText().includes('2분 05초'));
 ctx.state.submitted=true;assert(ctx.remainingTimeText().includes('시간 제한 없음'));
 let blocked=0;const e={type:'paste',target:{id:'answer1',matches:()=>true},preventDefault(){blocked++}};
 listeners.paste(e);assert.equal(blocked,1);listeners.drop({...e,type:'drop'});assert.equal(blocked,2);
 listeners.beforeinput({...e,type:'beforeinput',inputType:'insertCompositionText'});assert.equal(blocked,2);
 ctx.observerMode=true;listeners.paste(e);assert.equal(blocked,2);
});
test('attention endpoint persists alerts privately without changing answers or used time',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-attention-'));
 const put=(f,v)=>{const p=path.join(dir,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v))};
 put('roster.json',{enabled:true,rows:[{student_id:'10101',name:'시험학생',class_no:1}]});
 put('control.json',{server_open:1,is_open:1,class_no:1,period_type:'1',session_id:'session',timer_running:true,phase:'running',run_started_at:new Date(Date.now()-120000).toISOString(),elapsed_seconds:0});
 put('progress/10101.json',{payload:{schemaVersion:10,answer1:'기존 답안'},submitted:false});
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'3429',DATA_DIR:dir,TEACHER_PIN:'test-only',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,rej)=>setTimeout(()=>rej(Error('startup timeout')),10000).unref())]);
  const base='http://127.0.0.1:3429',post=(route,b)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
  assert.equal((await post('/api/attention',{student_id:'10101',name:'다른이름',away:true,sent_at:Date.now()})).status,403);
  assert.equal((await post('/api/attention',{student_id:'10101',name:'시험학생',away:true,sent_at:Date.now()})).status,200);
  const pr=JSON.parse(fs.readFileSync(path.join(dir,'presence/10101.json')));pr.attention.started_ms-=61000;pr.attention.started_elapsed-=61;put('presence/10101.json',pr);
  const dashboard=await(await fetch(base+'/api/teacher/dashboard?pin=test-only')).json();assert.equal(dashboard.students[0].attention.alert,true);
  assert.equal((await post('/api/teacher/attention-ack',{student_id:'10101',event_id:pr.attention.id})).status,403);
  assert.equal((await post('/api/teacher/attention-ack',{pin:'test-only',student_id:'10101',event_id:pr.attention.id})).status,200);
  const again=await(await fetch(base+'/api/teacher/dashboard?pin=test-only')).json();assert.equal(again.students[0].attention.alert,false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'progress/10101.json'))).payload.answer1,'기존 답안');
  assert.equal(again.students[0].active_seconds,0);
 }finally{const exited=once(child,'exit');child.kill();await exited;fs.rmSync(dir,{recursive:true,force:true})}
});
