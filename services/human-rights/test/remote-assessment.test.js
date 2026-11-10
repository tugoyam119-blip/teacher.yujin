'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./remote-harness');
const who={student_id:'10211',name:'검증학생'},other={student_id:'10212',name:'다른학생'},client='test-client-001';
function setup(){
 const h=harness();h.put('roster.json',{enabled:true,rows:[{...who,class_no:2},{...other,class_no:2}]});
 h.post=(url,b={})=>h.request(url,{...who,...b});
 h.admin=b=>h.post('/api/teacher/remote-window',{pin:'test-only',...b});
 h.window=()=>({starts_at:new Date(h.clock.value-1000).toISOString(),ends_at:new Date(h.clock.value+86400000).toISOString()});
 h.set=()=>h.admin({action:'set',...h.window()});
 h.resume=(id=client)=>h.post('/api/remote/session',{action:'resume',client_id:id,step:1});
 h.beat=(b={})=>h.post('/api/heartbeat',{active:true,remote_active:true,remote_client_id:client,step:1,...b});
 h.session=async()=> (await h.request('/api/bootstrap?student_id='+who.student_id)).body.session;
 return h;
}
const text=Array.from({length:180},(_,i)=>String.fromCharCode(0xac00+i)).join('');
const payload={schemaVersion:10,step:7,seen:['structure','usage','map','voices','budget'],quizDone:{structure:true,usage:true,map:true,voices:true,budget:true},evidence:['ev_central_all','ev_school_cost','ev_budget50'],policyStations:['central','school'],criteria:['many','efficiency'],rights:['mobility_right'],answer1:text,answer2:text,answer3:text,beneficiaries:['wheel'],delayed:['elder'],limitation:'region',remedy:'plan',newImpacts:['budget'],impactStrength:'small',finalDecision:'keep',finalStations:['central','school'],submitted:false};
test('individual access: authorization, schedule bounds and no class/global changes',async()=>{
 const h=setup();try{
  const before=h.read('control.json');
  assert.equal((await h.admin({action:'set',...h.window(),pin:'wrong'})).status,403);
  assert.equal((await h.admin({action:'set',...h.window(),name:'wrong'})).status,404);
  assert.equal((await h.admin({action:'set',starts_at:'invalid',ends_at:'invalid'})).status,400);
  assert.equal((await h.set()).status,200);
  assert.equal((await h.post('/api/login')).status,200);
  assert.equal((await h.post('/api/login',other)).status,403);
  assert.equal((await h.session()).is_open,0);
  assert.equal((await h.resume()).status,200);
  assert.equal((await h.session()).is_open,1);
  assert.deepEqual(h.read('control.json'),before);
  const current=h.read('time/10211.json');current.remote_window.starts_at=new Date(h.clock.value+10000).toISOString();h.put('time/10211.json',current);
  assert.equal((await h.resume()).status,409);assert.equal((await h.session()).phase,'remote-scheduled');
  current.remote_window.starts_at=new Date(h.clock.value-20000).toISOString();current.remote_window.ends_at=new Date(h.clock.value).toISOString();h.put('time/10211.json',current);
  assert.equal((await h.session()).is_open,0);
  assert.equal((await h.post('/api/save',{payload,remote_client_id:client})).status,403);
 }finally{h.cleanup()}
});
test('active clock: pause, screen-away, offline gap, multiple windows and step totals',async()=>{
 const h=setup();try{
  await h.set();await h.resume();h.advance(15000);await h.beat({step:2});
  assert.equal((await h.session()).total_used_seconds,15);
  h.advance(5000);await h.beat({active:false,remote_active:false,step:2});
  h.advance(3600000);await h.beat();
  assert.equal((await h.session()).total_used_seconds,20);
  h.advance(10000);await h.beat();
  assert.equal((await h.session()).total_used_seconds,30);
  assert.equal((await h.resume('other-client-2')).status,409);
  h.advance(10000);await h.beat({remote_client_id:'other-client-2'});
  assert.equal((await h.session()).total_used_seconds,30);
  await h.post('/api/remote/session',{action:'pause',client_id:client});
  assert.equal((await h.session()).total_used_seconds,40);
  h.advance(864000);await h.beat();assert.equal((await h.session()).total_used_seconds,40);
  await h.resume();h.advance(5000);await h.beat({remote_idle:true});
  assert.equal((await h.session()).is_open,0);
  const r=h.read('time/10211.json').remote_window;
  assert.equal(r.active_seconds,45);assert.equal(r.step_seconds.reduce((a,b)=>a+b,0),45);
  await h.resume();h.advance(30000);await h.beat();assert.equal((await h.session()).total_used_seconds,45);
  assert.equal((await h.beat({name:'wrong'})).status,403);
 }finally{h.cleanup()}
});
test('save/resume/submit/reopen: durable answers, submitted snapshot and grading time',async()=>{
 const h=setup();try{
  h.put('time/10211.json',{student_id:who.student_id,period1_used:2700,period2_used:2690});
  await h.set();await h.resume();h.advance(15000);await h.beat();
  let sv=await h.session();assert.equal(sv.total_used_seconds,5405);assert.equal(sv.extra_seconds,5);assert.equal(sv.time_penalty,2);
  assert.equal((await h.post('/api/save',{payload})).status,409);
  assert.equal((await h.post('/api/save',{payload,remote_client_id:client})).status,200);
  assert.equal((await h.post('/api/submit',{payload,remote_client_id:client})).status,409);
  assert.equal((await h.post('/api/manual-save',{payload,remote_client_id:client})).status,200);
  const saved=await h.request('/api/progress?student_id=10211');assert.equal(saved.body.payload.answer1,text);
  assert.equal((await h.post('/api/submit',{payload,remote_client_id:client})).status,200);
  assert.equal(h.read('progress/10211.json').total_used_seconds_at_submit,5405);
  h.advance(15000);await h.beat({submitted:false});assert.equal((await h.session()).total_used_seconds,5405);
  assert.equal((await h.post('/api/self-eval',{text:'생각 중',draft:true})).status,200);
  assert.equal((await h.post('/api/reopen-submission')).status,200);
  assert.equal((await h.session()).is_open,0);assert.equal(h.read('progress/10211.json').previous_submission.payload.answer1,text);
  await h.resume();assert.equal((await h.post('/api/manual-save',{payload,remote_client_id:client})).status,200);
  h.advance(5000);assert.equal((await h.post('/api/submit',{payload,remote_client_id:client})).status,200);
  assert.equal(h.read('progress/10211.json').total_used_seconds_at_submit,5410);
 }finally{h.cleanup()}
});
test('teacher edits preserve cumulative data; deadline clipping and revocation',async()=>{
 const h=setup();try{
  await h.set();await h.resume();h.advance(5000);await h.beat();
  const t=h.read('time/10211.json');t.remote_window.ends_at=new Date(h.clock.value+5000).toISOString();h.put('time/10211.json',t);
  h.advance(10000);await h.beat();assert.equal((await h.session()).total_used_seconds,10);
  assert.equal((await h.session()).remote_available,false);
  await h.admin({action:'set',...h.window()});assert.equal((await h.session()).total_used_seconds,10);
  assert.equal((await h.session()).is_open,0);
  await h.admin({action:'revoke'});assert.equal((await h.session()).remote_configured,undefined);
  assert.equal((await h.session()).total_used_seconds,10);
  const record=h.read('time/10211.json');assert.equal(record.remote_window.active_seconds,10);
  const before=JSON.stringify(record);await h.admin({action:'set',starts_at:new Date(h.clock.value).toISOString(),ends_at:new Date(h.clock.value+100*86400000).toISOString()});
  assert.equal(JSON.stringify(h.read('time/10211.json')),before);
 }finally{h.cleanup()}
});
test('regression: ordinary class timer and unselected student are unchanged; teacher-only records',async()=>{
 const h=setup();try{
  h.put('control.json',{server_open:1,is_open:1,class_no:2,period_type:'1',session_id:'normal',timer_running:true,phase:'running',run_started_at:new Date(h.clock.value).toISOString(),elapsed_seconds:0});
  assert.equal((await h.set()).status,409);
  assert.equal((await h.post('/api/login',other)).status,200);
  const s=await h.request('/api/bootstrap?student_id=10212');assert.equal(s.body.session.active_mode,'regular');
  assert.equal((await h.post('/api/teacher/classroom/pause',{pin:'test-only'})).status,200);
  await h.set();
  assert.equal((await h.post('/api/teacher/remote-window',{action:'get'})).status,403);
  assert.equal((await h.admin({action:'get'})).body.student.name,who.name);
  const page=await h.request('/remote-assessment.html');assert.equal(page.status,200);assert(page.text.includes('datetime-local'));assert(!page.text.includes(who.name));
  const student=await h.request('/student.html');assert(student.text.includes('remote-student.js'));
  const result=await h.request('/api/teacher/results?pin=test-only');assert.equal(result.status,200);
 }finally{h.cleanup()}
});

test('deployment schedule is identity-checked, persistent and applied only once',async()=>{
 const config={request_id:'remote-test-20261111',...who,starts_at:'2026-11-11T00:00:00+09:00',ends_at:'2026-11-22T00:00:00+09:00'};
 const h=harness({seed:{'roster.json':{enabled:true,rows:[{...who,class_no:2}]}},env:{HR_REMOTE_WINDOW_ONCE:JSON.stringify(config)}});
 try{
  let s=(await h.request('/api/bootstrap?student_id=10211')).body.session;
  assert.equal(s.remote_window.starts_at,'2026-11-10T15:00:00.000Z');
  assert.equal(s.remote_window.ends_at,'2026-11-21T15:00:00.000Z');assert.equal(s.is_open,0);
  h.clock.value=Date.parse('2026-11-10T15:00:00Z');
  assert.equal((await h.request('/api/remote/session',{...who,action:'resume',client_id:client})).status,200);
  h.clock.value=Date.parse('2026-11-21T14:59:59Z');assert.equal((await h.request('/api/bootstrap?student_id=10211')).body.session.remote_available,true);
  h.clock.value=Date.parse('2026-11-21T15:00:00Z');assert.equal((await h.request('/api/bootstrap?student_id=10211')).body.session.remote_available,false);
  await h.request('/api/teacher/remote-window',{...who,pin:'test-only',action:'revoke'});
  const before=JSON.stringify(h.read('time/10211.json'));
  harness({dir:h.dir,env:{HR_REMOTE_WINDOW_ONCE:JSON.stringify(config)}});
  assert.equal(JSON.stringify(h.read('time/10211.json')),before);
  assert(h.read('remote_window_config_receipts.json')[config.request_id]);
 }finally{h.cleanup()}
 const bad=harness({seed:{'roster.json':{enabled:true,rows:[{...who,name:'다른이름',class_no:2}]}},env:{HR_REMOTE_WINDOW_ONCE:JSON.stringify(config)}});
 try{assert.equal((await bad.request('/api/bootstrap?student_id=10211')).body.session.remote_configured,undefined)}finally{bad.cleanup()}
});
