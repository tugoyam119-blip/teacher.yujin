'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
const M=require('../public/results-model');
const fixture=[
  {student_id:'10101',class_no:1,name:'시험가',submitted:true,ever_entered:true,payload:{answer1:'첫째 줄\n둘째 줄 <script>시험</script>',answer2:'=1+1',answer3:'최종 판단',policyStations:['welfare'],finalStations:['school'],limitation:'other',limitationOther:'직접 입력',remedy:'budget'},self_evaluation:{text:'자기평가'},ai_grade:{total:0,confidence:'low',reviewFlags:['확인 필요'],areas:{evidence_policy:{score:0,reason:'근거 부족',evidence:['첫째 줄']}}},teacher_grade:{total:0},teacher_comment:'교사 의견'},
  {student_id:'10201',class_no:2,name:'시험나',submitted:false,ever_entered:true,payload:{answer1:'작성 중'}},
  {student_id:'10102',class_no:1,name:'시험다',submitted:false,ever_entered:false},
  {student_id:'000000',class_no:0,name:'시범'}
];
test('filters preserve ungraded records, match class/search/status and omit demo',()=>{
  assert.equal(M.filter(fixture).length,3);
  assert.deepEqual(M.filter(fixture,{class_no:1,status:'graded',q:'시험가'}).map(r=>r.student_id),['10101']);
  assert.equal(M.filter(fixture,{status:'ungraded'}).length,2);
  assert.equal(M.filter(fixture,{status:'unsubmitted'}).length,2);
  assert.equal(M.filter(fixture,{status:'review'}).length,1);
  assert.equal(M.filter(fixture,{status:'final'}).length,1);
  assert.equal(M.filter(fixture,{q:'no-match'}).length,0);
});
test('export retains full answers, human labels, zero scores, missing scores and AI evidence',()=>{
  const {headers,rows}=M.exportTable(M.filter(fixture));
  const value=(row,key)=>rows[row][headers.indexOf(key)];
  assert(rows.every(r=>r.length===headers.length));
  assert.equal(value(0,'AI 잠정총점'),0);assert.equal(value(0,'교사 최종총점'),0);
  assert.equal(value(1,'AI 잠정총점'),'');assert.equal(value(0,'정책 선택 이유'),fixture[0].payload.answer1);
  assert.equal(value(0,'1차 정책'),'복지센터역');assert.equal(value(0,'보완 방법'),'추가 예산과 외부 지원 확보');
  assert.equal(value(0,'AI 자료·정책 인용 근거'),'첫째 줄');assert.equal(value(0,'자기평가서'),'자기평가');
});
test('authenticated results API and filtered XLSX contain matching students',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hr-results-test-'));
  for(const sub of ['progress','grades'])fs.mkdirSync(path.join(dir,sub));
  fs.writeFileSync(path.join(dir,'roster.json'),JSON.stringify({enabled:true,rows:fixture.map(r=>({student_id:r.student_id,name:r.name,class_no:r.class_no}))}));
  for(const r of fixture.filter(r=>r.payload)) {
    fs.writeFileSync(path.join(dir,'progress',r.student_id+'.json'),JSON.stringify({payload:r.payload,submitted:r.submitted,self_evaluation:r.self_evaluation}));
    fs.writeFileSync(path.join(dir,'grades',r.student_id+'.json'),JSON.stringify({ai_grade:r.ai_grade,teacher_grade:r.teacher_grade,teacher_comment:r.teacher_comment}));
  }
  const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'3418',TEACHER_PIN:'test-only',DATA_DIR:dir,OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('server startup timeout')),10000).unref())]);
    const base='http://127.0.0.1:3418';
    for(const endpoint of ['/api/teacher/results','/api/teacher/export.xlsx']) assert.equal((await fetch(base+endpoint+'?pin=wrong')).status,403);
    const response=await fetch(base+'/api/teacher/results?pin=test-only');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const result=await response.json();assert.equal(result.rows.length,3);assert.equal(result.rows[0].payload.answer1,fixture[0].payload.answer1);assert.equal(result.rows[0].ai_grade.areas.evidence_policy.reason,'근거 부족');
    const xlsx=await fetch(base+'/api/teacher/export.xlsx?pin=test-only&class_no=1&status=graded&q=시험가');assert.equal(xlsx.status,200);
    const buffer=Buffer.from(await xlsx.arrayBuffer());assert.equal(buffer.subarray(0,2).toString(),'PK');
    const xml=buffer.toString('utf8');assert(xml.includes('시험가'));assert(!xml.includes('시험나'));assert(!xml.includes('시험다'));assert(xml.includes('&lt;script&gt;'));assert(xml.includes('=1+1'));assert(!xml.includes('<f>'));assert(xml.includes('첫째 줄'));
    const empty=await fetch(base+'/api/teacher/export.xlsx?pin=test-only&q=no-match');assert.equal(empty.status,200);
    for(const file of ['teacher-results.html','teacher-results.js','results-model.js'])assert.equal((await fetch(base+'/'+file)).status,200);
    const manage=await (await fetch(base+'/manage')).text();assert(manage.includes('학생 답안 한번에 보기'));assert(manage.includes('AI 가채점 결과 한번에 보기'));
  } finally { const exited=once(child,'exit');child.kill();await exited;fs.rmSync(dir,{recursive:true,force:true}); }
});
