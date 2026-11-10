'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../public/remote-student.js'),'utf8');
function client(){
 const context={crypto:{randomUUID:()=> 'test-client-001'},performance:{now:()=>context.now},now:0,Date,Number,String,
  session:{remote_configured:true,is_open:1,remote_available:true,total_used_seconds:12,remote_window:{starts_at:'2026-11-11T00:00:00+09:00',ends_at:'2026-11-22T00:00:00+09:00',client_id:'testclient001',active_seconds:12}},
  student:{student_id:'10211',name:'검증학생'},state:{step:1,submitted:false},esc:s=>String(s),saveTimer:null,clearTimeout(){},saveLocal(){},setSave(){},startHeartbeat(){},saveRemote:async()=>{},render(){},document:{visibilityState:'visible',hasFocus:()=>true,addEventListener(){},getElementById:()=>null,querySelectorAll:()=>[]},window:{addEventListener(){}},setInterval(){},heartbeatNow(){context.beats++},beats:0,fetch(){},calls:[],api:async(url,opt)=>{context.calls.push([url,JSON.parse(opt.body)]);return {session:context.session}}};
 vm.createContext(context);vm.runInContext(code,context);return context;
}
test('client signals exclude away/idle time and explicit keep-working renews reading time',()=>{
 const c=client(),run=s=>vm.runInContext(s,c);
 assert.equal(run('remoteHeartbeatFields().remote_active'),true);
 c.document.hasFocus=()=>false;assert.equal(run('remoteHeartbeatFields().remote_active'),false);
 c.document.hasFocus=()=>true;c.now=300000;assert.equal(run('remoteHeartbeatFields().remote_idle'),true);
 run('remoteKeepWorking()');assert.equal(run('remoteHeartbeatFields().remote_idle'),false);assert.equal(c.beats,1);
});
test('pause saves first and leaves the clock running if the save fails',async()=>{
 const c=client();await vm.runInContext("remoteAction('pause')",c);
 assert.deepEqual(c.calls.map(x=>x[0]),['/api/save','/api/remote/session']);
 assert.equal(c.calls[0][1].remote_client_id,'testclient001');
 const failed=client();failed.api=async url=>{failed.calls.push([url]);throw Error('offline')};
 await vm.runInContext("remoteAction('pause')",failed);assert.deepEqual(failed.calls.map(x=>x[0]),['/api/save']);
});
test('reload and other-window ownership display resume, while submitted work stays read-only',()=>{
 const c=client(),run=s=>vm.runInContext(s,c);
 assert(run('remotePanel()').includes('저장하고 쉬기'));
 c.session.remote_window.client_id='different-window';assert(!run('remotePanel()').includes('저장하고 쉬기'));
 assert(run('remotePanel()').includes('수행 시작 / 이어 하기'));
 c.state.submitted=true;assert(!run('remotePanel()').includes('수행 시작 / 이어 하기'));
 const source=fs.readFileSync(path.join(__dirname,'../public/student_3.js'),'utf8'),render=source.split('\n').find(l=>l.startsWith('function render(){'));
 c.state.submitted=false;c.drawerOpen=false;c.API_MODE=true;c.waitView=()=> 'paused';c.loginView=()=> 'login';
 vm.runInContext(render,c);assert.equal(vm.runInContext('render()',c),'paused');
});
