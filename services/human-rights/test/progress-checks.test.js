const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {reasons}=require('../public/progress-checks');
const source=fs.readFileSync(path.join(__dirname,'../public/student_2.js'),'utf8');
const qctx={};vm.createContext(qctx);vm.runInContext(source.slice(source.indexOf('function qualityError('),source.indexOf('function writingMeta(')),qctx);
const text=Array.from({length:160},(_,i)=>String.fromCharCode(0xac00+i)).join('');
const valid={seen:['structure','usage','map','voices','budget'],quizDone:{structure:true,usage:true,map:true,voices:true,budget:true},evidence:['a','b','c'],policyStations:['central','school'],criteria:['many','efficiency'],rights:['mobility_right'],answer1:text,answer2:text,answer3:text,beneficiaries:['wheel'],delayed:['wheel'],limitation:'region',remedy:'plan',newImpacts:['budget'],impactStrength:'small',finalDecision:'partial',finalStations:['central','school']};
const options={qualityError:qctx.qualityError,cost:ids=>ids.reduce((a,k)=>a+({central:24,school:8,hospital:39}[k]||0),0),manualSaved:true};
test('each stage lists missing conditions and valid choices pass including latest relaxed choices',()=>{
 for(let i=1;i<=7;i++)assert.deepEqual(reasons(valid,i,options),[]);
 assert(reasons({...valid,quizDone:{},evidence:[]},1,options).some(x=>x.includes('자료 1, 2, 3, 4, 5')));
 assert(reasons({...valid,evidence:[]},1,options).some(x=>x.includes('현재 0개')));
 assert.deepEqual(reasons({...valid,evidence:[]},1,{...options,observer:true}),[]);
 assert.equal(reasons({...valid,policyStations:['central','hospital'],criteria:[]},2,options).length,2);
 assert.equal(reasons({...valid,rights:[],answer1:'짧은 글'},3,options).length,2);
 assert(reasons({...valid,limitation:'other',limitationOther:''},4,options)[0].includes('5자'));
 assert.equal(reasons({...valid,newImpacts:[],impactStrength:''},5,options).length,2);
 assert.equal(reasons({...valid,finalDecision:'',finalStations:[],answer3:''},6,options).length,3);
 assert(reasons(valid,7,{...options,manualSaved:false})[0].includes('임시저장'));
});
test('step 4 overlap helper exists at runtime and completed answers advance',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/student_3.js'),'utf8');
 const ctx={state:{...valid},isTeacherTest:()=>false,qualityError:qctx.qualityError,goStep:n=>ctx.next=n};vm.createContext(ctx);vm.runInContext(s.slice(0,s.lastIndexOf('try{init()}')),ctx);
 assert.equal(typeof ctx.hasOverlap,'function');assert.equal(ctx.hasOverlap(),false);ctx.saveAnswer2();assert.equal(ctx.next,5);
});
test('next action opens reasons without advancing, then allows valid state',()=>{
 const ctx={state:{...valid,step:3,rights:[]},ProgressChecks:{reasons},observerMode:false,qualityError:qctx.qualityError,cost:options.cost,manualSavedForCurrent:true,isTeacherTest:()=>false,API_MODE:true,session:{is_open:1},alert:msg=>ctx.message=msg};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function advanceReasons()')),ctx);assert.equal(ctx.checkAdvance(),false);assert(ctx.message.includes('관련 권리'));ctx.state.rights=['mobility_right'];assert.equal(ctx.checkAdvance(),true);ctx.session={is_open:0,message:'수행 대기'};assert.equal(ctx.checkAdvance(),false);assert.equal(ctx.message,'수행 대기');
});

test('submitted students go directly to unfinished reflection even when the session is closed',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/student_3.js'),'utf8');
 const ctx={student:{student_id:'10101'},state:{submitted:true},selfEvaluation:{text:'저장한 초안',submitted_at:null},API_MODE:true,session:{is_open:0},updateReopenStatus:()=>{}};
 vm.createContext(ctx);vm.runInContext(s.slice(0,s.lastIndexOf('try{init()}')),ctx);
 ctx.updateReopenStatus=()=>{};ctx.selfEvalView=()=>{ctx.screen='reflection';ctx.draft=ctx.selfEvaluation.text};ctx.waitView=()=>{ctx.screen='wait'};
 ctx.render();assert.equal(ctx.screen,'reflection');assert.equal(ctx.draft,'저장한 초안');
 vm.runInContext(source.slice(source.indexOf('function timeLabel()'),source.indexOf('function appTop(')),ctx);
 assert(ctx.timeLabel().includes('자기평가서 시간 제한 없음'));
 ctx.state.submitted=false;ctx.render();assert.equal(ctx.screen,'wait');
});
