const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('regrading preserves history, rejects stale/reset writes, and exports current rubric',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'climate-teacher-fix-')),port=5200+Math.floor(Math.random()*100),base=`http://127.0.0.1:${port}`,id='grade-fixture';
 const score={countryAnalysis:15,fundAllocation:20,policyAgreement:20,conflictAnalysis:15,compromise:10,cooperationRoles:10,completion:4,timeCompliance:6};
 const aiGrade={total:100,confidence:'high',areas:Object.fromEntries(Object.entries(score).map(([k,v])=>[k,{score:v,reason:'fixture'}]))};
 const events=[{type:'start',sessionId:id,studentId:'30101',name:'Review',country:'hanbit',className:'1반'},{type:'submit',sessionId:id,data:{finalDeclaration:'old answer'},elapsedSeconds:100,timeComplianceScore:6},{type:'score',sessionId:id,score:{...score,total:100},teacherNote:'old note'},{type:'ai_grade',sessionId:id,aiGrade}].map((e,i)=>({...e,ts:new Date(Date.now()-10000+i).toISOString()}));
 fs.writeFileSync(path.join(data,'events.jsonl'),events.map(JSON.stringify).join('\n')+'\n');fs.writeFileSync(path.join(data,'runtime.json'),JSON.stringify({serverOpen:true,timerPaused:false}));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:data,TEACHER_PASSWORD:'regression-only',OPENAI_API_KEY:''},stdio:'ignore'});
 async function q(u,b,auth=true){const r=await fetch(base+u,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{'x-teacher-key':'regression-only'}:{})},body:b?JSON.stringify(b):undefined});return {http:r.status,...await r.json()}}
 async function current(){return (await q('/api/session/'+id)).session}
 async function grade(s,note='new note'){return q('/api/teacher/score',{sessionId:id,score,teacherNote:note,expectedUpdatedAt:s.updatedAt,expectedRevision:s.revision})}
 try{
  for(let n=0;n<100;n++){try{await q('/health');break}catch{await sleep(50)}}
  const original=await current();assert.equal(original.score.total,100);assert.equal(original.aiGrade.total,100);
  await q('/api/teacher/reopen',{sessionId:id});let s=await current();assert.equal(s.score,null);assert.equal(s.aiGrade,null);assert.equal(s.teacherNote,'');assert.equal(s.scoreHistory.length,1);assert.equal(s.aiGradeHistory.length,1);assert.equal(s.gradeReviewRequired,true);assert.equal((await grade(s)).http,409);
  await q('/api/submit',{sessionId:id,data:{finalDeclaration:'revised answer',actors:['state','un'],actorAssignments:{state:'implementation',un:'negotiation'},actorReason:'cooperation evidence',reflectionReason:'reflection evidence',compromiseChoice:'support'}});s=await current();assert.equal(s.score,null);assert.equal(s.aiGrade,null);assert.equal(s.gradeReviewRequired,true);assert.equal(s.timeComplianceScore,6);
  assert.equal((await grade(original)).http,409);assert.equal((await q('/api/teacher/score',{sessionId:id,score})).http,428);
  const csv=await (await fetch(base+'/api/teacher/export.csv',{headers:{'x-teacher-key':'regression-only'}})).text();assert(csv.includes('재채점 필요'));assert(csv.includes('revised answer'));assert(csv.includes('정책·기술의 실제 이행'));assert(csv.includes('더 감축하는 대신 돈·기술을 지원한다'));assert(!csv.includes('70억_'));assert(!csv.includes('불리한협약'));assert.equal((csv.split('\n')[0].match(/AI_[^,]*_점수/g)||[]).length,8);
  const competing=await Promise.all([grade(s,'first reviewer'),grade(s,'second reviewer')]);assert.deepEqual(competing.map(x=>x.http).sort(),[200,409]);s=await current();assert.equal(s.score.total,100);assert.equal(s.gradeReviewRequired,false);assert.equal(s.scoreHistory.length,2);
  await q('/api/teacher/reset',{sessionId:id});assert.equal((await grade(s)).http,404);assert.equal((await q('/api/teacher/score',{sessionId:'missing',score,expectedUpdatedAt:s.updatedAt,expectedRevision:s.revision})).http,404);
 }finally{await new Promise(r=>{child.once('exit',r);child.kill()});fs.rmSync(data,{recursive:true,force:true})}
});
