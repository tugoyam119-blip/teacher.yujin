const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
function fixture(){
 let saved=null,writes=0,finalized=0;
 const ctx={CONTROL_FILE:'control',nowIso:()=>new Date().toISOString(),readJson:()=>saved?structuredClone(saved):null,writeJson:(f,v)=>{saved=structuredClone(v);writes++},finalizeCurrentSession:()=>finalized++,saveControlElapsedToClass:()=>{}};
 vm.createContext(ctx);
 for(const [start,end] of [['function controlDefaults()','function classTimeDefaults('],['function controlElapsedSeconds(','function saveControlElapsedToClass('],['function maybeAutoPause(','function getStudentClassNo(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),ctx);
 return {ctx,get writes(){return writes},get finalized(){return finalized},get saved(){return saved},put:v=>{saved=v}};
}
test('unchanged status reads do not write control settings; legacy migration writes once',()=>{
 const f=fixture();f.ctx.getControl();const baseline=f.writes;
 for(let i=0;i<180;i++)f.ctx.getControl();assert.equal(f.writes-baseline,0);
 f.put({is_open:1,admission_open:1,timer_running:false});f.ctx.getControl();assert.equal(f.writes,baseline+1);assert.equal(f.saved.server_open,1);
 f.ctx.getControl();assert.equal(f.writes,baseline+1);
});
test('automatic pause still persists at the limit and does not finalize twice',()=>{
 const f=fixture();f.put({...f.ctx.controlDefaults(),server_open:1,is_open:1,timer_running:true,run_started_at:new Date(Date.now()-2800000).toISOString(),session_id:'test',phase:'running'});
 const c=f.ctx.getControl();assert.equal(c.timer_running,false);assert.equal(c.auto_paused,true);assert.equal(c.elapsed_seconds,2700);assert.equal(f.finalized,1);
 const baseline=f.writes;f.ctx.getControl();assert.equal(f.writes,baseline);assert.equal(f.finalized,1);
});
