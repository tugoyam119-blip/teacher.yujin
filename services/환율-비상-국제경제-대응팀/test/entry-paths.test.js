const assert=require('node:assert/strict');
const http=require('node:http');
const {after,before,test}=require('node:test');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');

const PORT=41000+Math.floor(Math.random()*1000);
const SERVICE_DIR=path.resolve(__dirname,'..');
const DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'exchange-crisis-'));
let server;

function request(pathname,{method='GET',body=''}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:PORT,path:pathname,method,headers:body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{}},res=>{
   let data='';res.setEncoding('utf8');res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));
  });req.on('error',reject);if(body)req.write(body);req.end();
 });
}
async function post(pathname,obj){return request(pathname,{method:'POST',body:JSON.stringify(obj)})}

before(async()=>{
 server=spawn(process.execPath,['server.js'],{cwd:SERVICE_DIR,env:{...process.env,PORT:String(PORT),DATA_DIR,TEACHER_PIN:'123456'},stdio:['ignore','pipe','pipe']});
 for(let i=0;i<50;i++){try{const r=await request('/health');if(r.status===200)return}catch{}await new Promise(r=>setTimeout(r,20))}
 throw new Error('테스트 서버가 시작되지 않았습니다.');
});
after(()=>{if(server&&!server.killed)server.kill();fs.rmSync(DATA_DIR,{recursive:true,force:true})});

test('독립 실행 페이지와 health가 열린다',async()=>{
 const h=await request('/health');assert.equal(h.status,200);assert.equal(JSON.parse(h.body).mode,'standalone');
 const s=await request('/student');assert.equal(s.status,200);assert.match(s.body,/환율 비상!/);
 const t=await request('/teacher');assert.equal(t.status,200);assert.match(t.body,/교사 관리실/);
});

test('명단 검증·반 운영·학생 제출·채점 흐름이 이어진다',async()=>{
 const v=await post('/api/roster/validate',{csvText:'반,학번,이름\n1,30101,홍길동'});assert.equal(v.status,200);
 let r=await post('/api/admin',{code:'123456',action:'import_roster',csvText:'반,학번,이름\n1,30101,홍길동'});assert.equal(r.status,200);
 r=await post('/api/exam',{action:'login',studentId:'30101',name:'홍길동'});assert.equal(r.status,423);
 r=await post('/api/admin',{code:'123456',action:'open_class',className:'3학년 1반'});assert.equal(r.status,200);
 r=await post('/api/exam',{action:'login',studentId:'30101',name:'홍길동'});assert.equal(r.status,200);assert.equal(JSON.parse(r.body).attempt.status,'waiting');
 r=await post('/api/admin',{code:'123456',action:'start_class',className:'3학년 1반'});assert.equal(r.status,200);
 r=await post('/api/exam',{action:'save',studentId:'30101',currentStep:5,answers:{won:'하락',dollar:'상승',cost:'증가',exportReason:'수출 대금의 원화 환산액이 늘 수 있습니다.',importReason:'수입 대금에 더 많은 원화가 필요합니다.',policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:'환율 급등과 기업 자금 부담을 완화합니다.',policyRisk:'외환보유액 감소와 대출 부실 위험이 있습니다.',report:'환율 급등으로 원화 가치가 하락하고 수입 비용이 증가했습니다. 외환시장에 달러를 공급하고 수입기업 긴급대출을 제공해 단기 충격을 줄이되 외환보유액 감소와 부채 증가 위험을 함께 관리해야 합니다.'}});assert.equal(r.status,200);
 r=await post('/api/exam',{action:'submit',studentId:'30101',currentStep:5,submissionType:'manual'});assert.equal(r.status,200);
 r=await post('/api/admin',{code:'123456',action:'ai_grade',studentId:'30101'});assert.equal(r.status,200);const grade=JSON.parse(r.body).grade;assert.equal(typeof grade.total,'number');assert.equal(grade.time,6);
 r=await post('/api/admin',{code:'123456',action:'grade',studentId:'30101',rubric:{economy:25,policy:25,organization:20,cooperation:20,completion:4,time:6},feedback:'확인'});assert.equal(r.status,200);assert.equal(JSON.parse(r.body).score,100);
 const d=await request('/api/admin?code=123456&studentId=30101');assert.equal(d.status,200);assert.equal(JSON.parse(d.body).attempt.teacher_score,100);
});

test('추가시간은 원본 규칙대로 시간점수에 반영된다',async()=>{
 await post('/api/admin',{code:'123456',action:'open_class',className:'모의반'});
 await post('/api/admin',{code:'123456',action:'start_class',className:'모의반'});
 await post('/api/exam',{action:'login',studentId:'DEMO001',name:'김환율'});
 await post('/api/extra',{action:'request',studentId:'DEMO001'});
 let r=await post('/api/extra',{code:'123456',action:'approve',studentId:'DEMO001',minutes:5,exempt:false});assert.equal(r.status,200);
 r=await post('/api/admin',{code:'123456',action:'ai_grade',studentId:'DEMO001'});assert.equal(JSON.parse(r.body).grade.time,4);
});
