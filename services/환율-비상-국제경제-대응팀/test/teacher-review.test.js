const assert=require('node:assert/strict');
const {after,before,test}=require('node:test');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {scoreRubric}=require('../lib/grading');

const SERVICE_DIR=path.resolve(__dirname,'..');
const DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'exchange-review-'));
const STORE_FILE=path.join(DATA_DIR,'exchange-crisis.json');
const PORT=45000+Math.floor(Math.random()*1000),PIN='review-test';
const base='http://127.0.0.1:'+PORT;
const flag='극단적 정책 선택: 교사 확인 권장';
const rubric={economy:10,policy:8,organization:0,cooperation:0,completion:0,time:6,total:24};
function attempt(id,extra={}){
  return {student_id:id,name:'테스트 '+id,class_name:'3학년 1반',status:'submitted',answers:{report:'테스트 보고서'},ai_score:24,teacher_score:null,...extra};
}
const fixtures=[
  attempt('30101',{ai_breakdown:{...rubric,reviewRequired:true,reviewFlags:[flag,'보고서 반복 표현 과다']},teacher_breakdown:{economy:25,policy:25,organization:12,cooperation:10,completion:2,time:6,total:80},teacher_score:80}),
  attempt('30102',{ai_breakdown:{...rubric,reviewRequired:false,reviewFlags:[]}}),
  attempt('30103',{ai_breakdown:rubric}),
  attempt('30104',{ai_breakdown:null,ai_score:null}),
  attempt('30105',{ai_breakdown:{...rubric,reviewFlags:['환율 방향 선택과 개념 설명 확인 필요']}}),
  attempt('30106',{ai_breakdown:{...rubric,reviewRequired:true}}),
  attempt('30107',{ai_breakdown:JSON.stringify({...rubric,reviewRequired:true,reviewFlags:[flag]})}),
  attempt('30108',{ai_breakdown:'{broken json'}),
  attempt('30109',{ai_breakdown:{...rubric,reviewRequired:false,reviewFlags:[flag,flag,' ',null,42,{}]}}),
  attempt('30110',{ai_breakdown:{...rubric,reviewFlags:'not an array'},ai_score:0,teacher_score:0}),
  attempt('30111',{ai_breakdown:{...rubric,reviewRequired:true,reviewFlags:['<img src=x onerror="alert(1)">&\'경고']}}),
  attempt('30112')
];
const initialStore=JSON.stringify({attempts:Object.fromEntries(fixtures.map(a=>[a.student_id,a])),helps:[],gradeHistory:[{student_id:'30101',teacher_score:80,feedback:'기존 이력'}]});
let server,html,script;

before(async()=>{
  fs.writeFileSync(STORE_FILE,initialStore);
  server=spawn(process.execPath,['server.js'],{cwd:SERVICE_DIR,env:{...process.env,PORT:String(PORT),DATA_DIR,TEACHER_PIN:PIN},stdio:['ignore','pipe','pipe']});
  for(let i=0;i<100;i++){
    try{const r=await fetch(base+'/teacher');if(r.ok){html=await r.text();script=html.match(/<script>([\s\S]*?)<\/script>/)[1];return}}catch{}
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('테스트 서버 시작 실패');
});
after(()=>{server?.kill();fs.rmSync(DATA_DIR,{recursive:true,force:true})});

// Execute the exact script served to teachers. Network reads use the real API;
// minimal DOM elements keep this regression suite dependency-free.
async function screen(){
  const elements=new Map(),requests=[];
  function element(id){
    if(!elements.has(id))elements.set(id,{value:'',checked:false,innerHTML:'',textContent:'',classList:{add(){},remove(){}},showModal(){this.open=true},close(){this.open=false}});
    return elements.get(id);
  }
  element('classSel').value='3학년 1반';element('code').value=PIN;
  const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},setInterval:()=>0,alert(){},fetch:async(url,options)=>{requests.push({url,method:options?.method||'GET'});return fetch(new URL(url,base),options)}});
  context.window=context;
  vm.runInContext(script,context);
  await element('tform').onsubmit({preventDefault(){}});
  assert.equal(element('tmsg').textContent,'');
  return {context,element,requests,run:source=>vm.runInContext(source,context)};
}
const rowIds=ui=>[...ui.element('rows').innerHTML.matchAll(/data-detail-id="([^"]+)"/g)].map(x=>x[1]);

test('served teacher script parses and exposes the review filter',async()=>{
  new vm.Script(script);
  assert.match(html,/id="reviewOnly"/);assert.match(html,/<th>가채점 확인<\/th>/);
  const ui=await screen();assert.equal(rowIds(ui).length,12);
  assert.equal((ui.element('rows').innerHTML.match(/class="pill warn"/g)||[]).length,6);
  assert.equal(ui.element('reviewSummary').textContent,'확인 권장 6명 · 표시 12명 / 전체 12명');
});

test('filter includes only flagged records and preserves its state across reloads',async()=>{
  const ui=await screen();ui.element('reviewOnly').checked=true;ui.element('reviewOnly').onchange();
  assert.deepEqual(rowIds(ui),['30101','30105','30106','30107','30109','30111']);
  assert.equal(ui.element('reviewSummary').textContent,'확인 권장 6명 · 표시 6명 / 전체 12명');
  await ui.run('load()');assert.equal(rowIds(ui).length,6);assert.equal(ui.element('reviewOnly').checked,true);
  ui.element('reviewOnly').checked=false;ui.element('reviewOnly').onchange();assert.equal(rowIds(ui).length,12);
});

test('detail shows saved AI reasons even when teacher scores exist',async()=>{
  const ui=await screen();await ui.context.openDetail('30101');
  assert.equal(ui.element('detail').open,true);
  assert.match(ui.element('detailBody').innerHTML,new RegExp(flag));
  assert.match(ui.element('detailBody').innerHTML,/보고서 반복 표현 과다/);
  assert.match(ui.element('detailBody').innerHTML,/추가 감점되지는 않습니다/);
  assert.match(ui.element('detailBody').innerHTML,/id="g_economy" value="25"/);
});

test('old, null, missing and malformed metadata render without a warning or error',async()=>{
  const ui=await screen();
  for(const id of ['30102','30103','30104','30108','30110','30112']){
    await ui.context.openDetail(id);
    assert.doesNotMatch(ui.element('detailBody').innerHTML,/aria-label="가채점 확인 권장"/);
  }
  for(const value of [undefined,null,[],42,true,'null','[]','false','bad',{reviewFlags:[null,{},1,' ']},{reviewRequired:'false'}]){
    const actual=ui.context.reviewInfo({ai_breakdown:value});assert.equal(actual.required,false);assert.equal(actual.flags.length,0);
  }
  assert.match(ui.element('rows').innerHTML,/<td>0<\/td><td>0<\/td>/);
});

test('boolean-only review metadata has a fallback reason',async()=>{
  const ui=await screen();await ui.context.openDetail('30106');
  assert.match(ui.element('detailBody').innerHTML,/구체적인 사유가 기록되지 않았습니다/);
});

test('stringified metadata and flags without a boolean use the saved reasons',async()=>{
  const ui=await screen();await ui.context.openDetail('30107');assert.match(ui.element('detailBody').innerHTML,new RegExp(flag));
  await ui.context.openDetail('30105');assert.match(ui.element('detailBody').innerHTML,/환율 방향 선택과 개념 설명 확인 필요/);
  await ui.context.openDetail('30109');assert.equal((ui.element('detailBody').innerHTML.match(new RegExp(flag,'g'))||[]).length,1);
});

test('review reasons are escaped as text and invalid entries are ignored',async()=>{
  const ui=await screen();await ui.context.openDetail('30111');
  assert.doesNotMatch(ui.element('detailBody').innerHTML,/<img/);
  assert.match(ui.element('detailBody').innerHTML,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;경고/);
});

test('empty filtered and entirely empty lists have useful empty states',async()=>{
  const ui=await screen();
  ui.run('data.attempts=data.attempts.filter(a=>!reviewInfo(a).required)');
  ui.element('reviewOnly').checked=true;ui.element('reviewOnly').onchange();
  assert.deepEqual(rowIds(ui),[]);assert.match(ui.element('rows').innerHTML,/확인 권장 학생이 없습니다/);
  ui.run('data.attempts=[];render()');assert.equal(ui.element('reviewSummary').textContent,'확인 권장 0명 · 표시 0명 / 전체 0명');
  ui.element('reviewOnly').checked=false;ui.element('reviewOnly').onchange();assert.match(ui.element('rows').innerHTML,/학생 기록이 없습니다/);
});

test('viewing and filtering leave stored answers, scores and grade history unchanged',async()=>{
  const ui=await screen();const before=ui.run('JSON.stringify(data)');
  ui.element('reviewOnly').checked=true;ui.element('reviewOnly').onchange();
  for(const id of rowIds(ui))await ui.context.openDetail(id);
  assert.equal(ui.run('JSON.stringify(data)'),before);
  assert.equal(fs.readFileSync(STORE_FILE,'utf8'),initialStore);
  assert.ok(ui.requests.every(r=>r.method==='GET'));
});

test('AI grading response flows through stored metadata to list, detail and active filter',async()=>{
  const ui=await screen();const fixture=fixtures.find(a=>a.student_id==='30103');
  const expected=scoreRubric(fixture);
  const post=await fetch(base+'/api/admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:PIN,action:'ai_grade',studentId:fixture.student_id})});
  assert.equal(post.status,200);assert.deepEqual((await post.json()).grade,expected);
  await ui.run('load()');
  const saved=JSON.parse(fs.readFileSync(STORE_FILE,'utf8')).attempts[fixture.student_id];
  assert.deepEqual(saved.ai_breakdown,expected);assert.equal(saved.ai_score,expected.total);assert.deepEqual(saved.answers,fixture.answers);
  // Change only the isolated fixture, then grade using the real engine/API.
  const store=JSON.parse(fs.readFileSync(STORE_FILE,'utf8'));
  store.attempts[fixture.student_id].answers={policies:['모든 수입품 수입 금지']};fs.writeFileSync(STORE_FILE,JSON.stringify(store));
  ui.element('reviewOnly').checked=true;ui.element('reviewOnly').onchange();assert.ok(!rowIds(ui).includes(fixture.student_id));
  await ui.context.aiGrade(fixture.student_id);
  assert.ok(rowIds(ui).includes(fixture.student_id));assert.match(ui.element('detailBody').innerHTML,new RegExp(flag));
  const cleared=JSON.parse(fs.readFileSync(STORE_FILE,'utf8'));
  cleared.attempts[fixture.student_id].answers={};fs.writeFileSync(STORE_FILE,JSON.stringify(cleared));
  await ui.context.aiGrade(fixture.student_id);
  assert.ok(!rowIds(ui).includes(fixture.student_id));
  assert.doesNotMatch(ui.element('detailBody').innerHTML,/aria-label="가채점 확인 권장"/);
  const final=JSON.parse(fs.readFileSync(STORE_FILE,'utf8'));
  assert.deepEqual(final.gradeHistory,JSON.parse(initialStore).gradeHistory);
  assert.equal(final.attempts['30101'].teacher_score,80);
});
