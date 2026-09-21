const test=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function harness(){const els=new Map(),storage=new Map(),timers=new Map();let sequence=0;
 const el=k=>{if(!els.has(k))els.set(k,{value:'',dataset:{},style:{},events:{},disabled:false,classList:{contains:()=>false,add(){},remove(){},toggle(){}},addEventListener(name,fn){this.events[name]=fn},remove(){},closest:()=>null,setAttribute(){},getAttribute:()=>null});return els.get(k)};
 const area=el('#agreementReason'),budget=el('budget');budget.dataset={budget:'renewable',delta:'-10'};
 const c=vm.createContext({console,AbortController,AbortSignal,Date,document:{querySelector:el,querySelectorAll:s=>s==='textarea'?[area]:s==='[data-budget]'?[budget]:[]},setTimeout:fn=>{timers.set(++sequence,fn);return sequence},clearTimeout:n=>timers.delete(n),setInterval:()=>0,clearInterval(){},fetch:async()=>({ok:true,json:async()=>({})}),alert(){},confirm:()=>true,window:{scrollTo(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 vm.runInContext(src.slice(0,src.indexOf("\n$('#startBtn').addEventListener")),c);
 vm.runInContext("session={sessionId:'sample',country:'hanbit',status:'in_progress'};step=renderedStep=1;state={agreement:'B',agreementReason:'기존 문장',budget:{renewable:20,disaster:20,tech:20,forest:20,transition:20}}; render=()=>{document.querySelector('#agreementReason').value=state.agreementReason;};bindStep();",c);
 el('input[name="agreement"]:checked').value='B';area.value='기존 문장';return {c,el,area,budget,storage,timers};}
test('typing then budget click preserves latest answer and local draft',async()=>{const h=harness();h.area.value='바로 입력한 새 답안';h.area.events.input();h.budget.events.click();assert.equal(h.area.value,'바로 입력한 새 답안');assert.equal(JSON.parse(h.storage.get('climateDraft:sample')).data.agreementReason,'바로 입력한 새 답안');await vm.runInContext('save(false)',h.c);assert.equal(h.storage.size,0)});
test('changing step before render does not overwrite unseen answers',()=>{const h=harness();vm.runInContext("state.compromise='보존할 절충안';step=2;collect()",h.c);assert.equal(vm.runInContext('state.compromise',h.c),'보존할 절충안')});
test('in-flight save cannot clear a newer unsaved local draft',async()=>{const h=harness();vm.runInContext('let release;fetch=()=>new Promise(r=>release=r)',h.c);const saving=vm.runInContext('save(false)',h.c);h.area.value='요청 중 추가로 쓴 내용';h.area.events.input();vm.runInContext('release({ok:true,json:async()=>({})})',h.c);await saving;assert.equal(vm.runInContext('unsavedChanges',h.c),true);assert.equal(JSON.parse(h.storage.get('climateDraft:sample')).data.agreementReason,'요청 중 추가로 쓴 내용')});
test('automatic submit unlocks after failure and retries after backoff',async()=>{const h=harness();vm.runInContext('let attempts=0;fetch=async()=>{attempts++;throw Error("offline")}',h.c);await vm.runInContext('autoSubmitOnTime()',h.c);assert.equal(vm.runInContext('autoSubmitting',h.c),false);vm.runInContext('autoRetryAfter=0',h.c);await vm.runInContext('autoSubmitOnTime()',h.c);assert.equal(vm.runInContext('attempts',h.c),2)});
test('step four requires actor roles and reflection before final review',()=>{const h=harness();vm.runInContext("step=renderedStep=3;state={actors:[],actorAssignments:{}}",h.c);assert.match(vm.runInContext('validate()',h.c),/협력 주체/);vm.runInContext("session={country:'hanbit',data:{}};initState();state.opposingCountry='saebom'",h.c);const html=vm.runInContext('renderFastReflection()',h.c);assert.match(html,/reflectionReason/);assert.match(html,/국제협력을 실행할 주체/)});

test('held gate request times out, explains connection error and permits a later retry',async()=>{
 const h=harness();vm.runInContext("session=null;fetch=(_url,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))",h.c);
 const waiting=vm.runInContext('syncServerGate()',h.c);for(const callback of [...h.timers.values()])callback();await waiting;
 assert.equal(vm.runInContext('serverGateBusy',h.c),false);assert.match(h.el('#gateTitle').textContent,/연결 상태/);
 vm.runInContext("fetch=async()=>({ok:true,status:200,json:async()=>({open:true})})",h.c);await vm.runInContext('syncServerGate()',h.c);assert.equal(vm.runInContext('serverOpen',h.c),true);
});
test('successful login renders without waiting for help status and duplicate clicks are ignored',async()=>{
 const h=harness();h.el('#studentId').value='30101';h.el('#studentName').value='학생30101';
 vm.runInContext("session=null;let starts=0,shown=false;fetch=async url=>{if(url==='/api/start'){starts++;return {ok:true,status:200,json:async()=>({session:{sessionId:'new',country:'hanbit',data:{countryRevealDone:true}},timer:{serverOpen:true,phase:'running',remainingSeconds:2700}})}}return new Promise(()=>{});};showAssessment=()=>{shown=true};startTimer=()=>{};render=()=>{}",h.c);
 await Promise.all([vm.runInContext('startAssessment()',h.c),vm.runInContext('startAssessment()',h.c)]);
 assert.equal(vm.runInContext('shown',h.c),true);assert.equal(vm.runInContext('starts',h.c),1);assert.equal(vm.runInContext('startBusy',h.c),false);
});
test('reset response freezes old session, retains draft and prevents further saves',async()=>{
 const h=harness();h.area.value='초기화 시 보관할 작성 중 답안';vm.runInContext("fetch=async()=>({ok:false,status:404,json:async()=>({error:'세션을 찾을 수 없습니다.'})})",h.c);await vm.runInContext('syncTimer()',h.c);
 assert.equal(vm.runInContext('sessionInvalidated',h.c),true);assert.equal(h.el('#nextBtn').disabled,true);assert.match(h.el('#recoveryDraft').value,/초기화 시 보관/);assert.ok(h.storage.has('climateDraft:sample'));assert.equal(await vm.runInContext('save(false)',h.c),false);
});
test('404 during save does not schedule a futile save retry',async()=>{
 const h=harness();vm.runInContext("fetch=async()=>({ok:false,status:404,json:async()=>({error:'reset'})})",h.c);assert.equal(await vm.runInContext('save(false)',h.c),false);assert.equal(vm.runInContext('sessionInvalidated',h.c),true);assert.equal(h.timers.size,0);
});
test('submitted screen clears pending-review title and pause notice',()=>{
 const h=harness();let hidden=false;h.el('#activityPauseNotice').classList.add=cls=>{if(cls==='hidden')hidden=true};vm.runInContext("finalReviewSummaryHtml=()=>'';showSubmittedSession({sessionId:'sample',status:'submitted',data:{},studentId:'30101',name:'검증'})",h.c);assert.equal(h.el('#lessonPill').textContent,'최종 제출 완료');assert.equal(hidden,true);
});
