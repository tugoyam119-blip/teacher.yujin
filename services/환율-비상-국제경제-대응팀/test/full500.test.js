const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const PORT=44000+Math.floor(Math.random()*1000),PIN='123456',DIR=path.resolve(__dirname,'..'),DATA=fs.mkdtempSync(path.join(os.tmpdir(),'exchange-full500-'));
let child;
function req(pathname,{method='GET',body=null}={}){return new Promise((resolve,reject)=>{const raw=body?JSON.stringify(body):'';const r=http.request({hostname:'127.0.0.1',port:PORT,path:pathname,method,headers:raw?{'content-type':'application/json','content-length':Buffer.byteLength(raw)}:{}},res=>{let d='';res.setEncoding('utf8');res.on('data',x=>d+=x);res.on('end',()=>resolve({status:res.statusCode,body:d,json:()=>JSON.parse(d||'{}')}))});r.on('error',reject);if(raw)r.write(raw);r.end()})}
async function post(p,b){return req(p,{method:'POST',body:b})}
const goodEx='수출 대금을 원화로 환산할 때 금액이 늘어날 수 있어 수출기업에 유리합니다.';
const goodIm='수입 원자재 결제에 더 많은 원화가 필요해 수입 비용과 생산비 부담이 커집니다.';
const goodEff='외환시장에 달러를 공급하면 환율 급등을 완화하고 결제 부담을 줄일 수 있습니다.';
const goodRisk='외환보유액 감소와 부실대출, 재정 부담 위험이 있습니다.';
const goodReport='원화 가치 하락과 달러 가치 상승으로 수입 비용이 증가한다. 외환시장에 달러를 공급하고 수입기업 긴급대출을 병행해 충격을 완화하되 외환보유액 감소와 부실대출 위험을 관리해야 한다.';
const junk='ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ';
function answers(kind){
 if(kind==='good')return{won:'하락',dollar:'상승',cost:'증가',exportReason:goodEx,importReason:goodIm,policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:goodEff,policyRisk:goodRisk,report:goodReport};
 if(kind==='junk')return{won:'하락',dollar:'상승',cost:'증가',exportReason:junk,importReason:junk,policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:junk,policyRisk:junk,report:junk.repeat(8)};
 if(kind==='wrong')return{won:'상승',dollar:'하락',cost:'감소',exportReason:'원화 가치가 상승해 수출기업이 유리합니다.',importReason:'수입 비용이 감소합니다.',policies:['모든 수입품 수입 금지'],policyEffect:'무조건 좋다',policyRisk:'부작용 없음',report:'환율 상승은 원화 가치 상승이고 모든 수입을 금지하면 해결된다.'};
 return{won:'하락',dollar:'상승',cost:'',exportReason:goodEx,importReason:'',policies:['외환시장에 달러 공급'],policyEffect:'환율 안정에 도움이 된다',policyRisk:'',report:'환율 상승으로 수입비용이 증가해 대응이 필요하다.'};
}
test('500 end-to-end checks',async()=>{
 child=spawn(process.execPath,['server.js'],{cwd:DIR,env:{...process.env,PORT:String(PORT),DATA_DIR:DATA,TEACHER_PIN:PIN},stdio:['ignore','pipe','pipe']});
 for(let i=0;i<100;i++){try{if((await req('/health')).status===200)break}catch{}await new Promise(r=>setTimeout(r,20))}
 let checks=0;
 const roster=['반,학번,이름'];for(let i=1;i<=120;i++)roster.push('9,T'+String(i).padStart(3,'0')+',학생'+i);
 assert.equal((await post('/api/admin',{code:PIN,action:'import_roster',csvText:roster.join('\n')})).status,200);
 assert.equal((await post('/api/admin',{code:PIN,action:'open_class',className:'모의반'})).status,200);
 assert.equal((await post('/api/admin',{code:PIN,action:'start_class',className:'모의반'})).status,200);

 // 100 student lifecycle checks
 for(let i=1;i<=100;i++){
  const id='T'+String(i).padStart(3,'0'),name='학생'+i;
  let r=await post('/api/exam',{action:'login',studentId:id,name});assert.equal(r.status,200);
  r=await post('/api/exam',{action:'save',studentId:id,currentStep:5,answers:answers(i%4===0?'good':'partial')});assert.equal(r.status,200);
  r=await post('/api/exam',{action:'submit',studentId:id,currentStep:5,submissionType:'manual'});assert.equal(r.status,200);
  checks++;
 }

 // 100 grading checks
 for(let i=1;i<=100;i++){
  const id='T'+String(i).padStart(3,'0');
  let r=await post('/api/admin',{code:PIN,action:'ai_grade',studentId:id});assert.equal(r.status,200);const g=r.json().grade;assert.ok(g.total>=0&&g.total<=100);
  r=await post('/api/admin',{code:PIN,action:'grade',studentId:id,rubric:{economy:Math.min(25,g.economy),policy:Math.min(25,g.policy),organization:Math.min(20,g.organization),cooperation:Math.min(20,g.cooperation),completion:Math.min(4,g.completion),time:g.time},feedback:'검토'});assert.equal(r.status,200);
  checks++;
 }

 // 100 extra-time boundary checks using same attempt set
 const extraCases=[[5,false,4],[10,false,2],[20,false,0],[5,true,6]];
 for(let i=1;i<=100;i++){
  const id='T'+String(i).padStart(3,'0'),[m,ex,expected]=extraCases[i%extraCases.length];
  let r=await post('/api/extra',{action:'request',studentId:id});assert.equal(r.status,200);
  r=await post('/api/extra',{code:PIN,action:'approve',studentId:id,minutes:m,exempt:ex});assert.equal(r.status,200);
  r=await post('/api/admin',{code:PIN,action:'ai_grade',studentId:id});assert.equal(r.status,200);assert.equal(r.json().grade.time,expected);
  checks++;
 }

 // 100 adversarial grading checks on direct shared engine
 const {scoreRubric}=require('../lib/grading');
 for(let i=0;i<100;i++){
  const kind=['good','junk','wrong','partial'][i%4],g=scoreRubric({answers:answers(kind),extra_granted_minutes:0,extra_penalty_exempt:false});
  assert.ok(g.total>=0&&g.total<=100);
  if(kind==='junk')assert.ok(g.contentTotal<=10);
  if(kind==='wrong')assert.ok(g.contentTotal<=45);
  if(kind==='good')assert.ok(g.contentTotal>=80);
  checks++;
 }

 // 100 persistence/page/API checks
 for(let i=1;i<=100;i++){
  const id='T'+String(i).padStart(3,'0');
  const d=await req('/api/admin?code='+PIN+'&studentId='+id);assert.equal(d.status,200);assert.ok(d.json().attempt);
  if(i<=20){assert.equal((await req('/health')).status,200);assert.equal((await req('/student')).status,200);assert.equal((await req('/teacher')).status,200)}
  checks++;
 }
 console.log('FULL500 '+JSON.stringify({checks,storeExists:fs.existsSync(path.join(DATA,'exchange-crisis.json')),storeBytes:fs.statSync(path.join(DATA,'exchange-crisis.json')).size}));
 assert.equal(checks,500);
 child.kill();fs.rmSync(DATA,{recursive:true,force:true});
});
