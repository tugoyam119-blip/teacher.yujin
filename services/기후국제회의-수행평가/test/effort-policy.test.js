const test=require('node:test'),assert=require('node:assert/strict');
const {gradeByEffort,meaningful}=require('../lib/effort-policy');
const options={countryAnalysis:[15,12,9,0],fundAllocation:[20,16,12,0],policyAgreement:[20,16,12,0],conflictAnalysis:[15,12,9,0],compromise:[10,8,6,0],cooperationRoles:[10,8,6,0],completion:[4,3,2,0],timeCompliance:[6,4,2,0]};
const fields=['priorityReason','agreementReason','compromise','finalDeclaration'];
const mapping=Object.fromEntries(Object.keys(options).map(k=>[k,fields]));
test('all effort subsets and fixed times preserve floor, legal areas and exact sum',()=>{
 for(let mask=0;mask<16;mask++)for(const time of [6,4,2,0]){
  const answers=Object.fromEntries(fields.map((f,i)=>[f,mask&(1<<i)?'협력':'']));
  const g=gradeByEffort(answers,options,mapping,fields,[],{timeCompliance:time});
  assert.equal(g.scores.timeCompliance,time);
  assert.equal(g.total,Object.values(g.scores).reduce((a,b)=>a+b,0));
  for(const [k,v] of Object.entries(g.scores))assert(options[k].includes(v));
  if(mask)assert(g.total>=85&&g.total<=100);else {assert.equal(g.total,60);assert(g.profile.reviewRequired);}
  if(mask===15)assert.equal(g.total,100-(6-time));
 }
});
test('short attempts accepted, blank/symbol/repetition rejected, choice-only flagged',()=>{
 assert(meaningful('돈'));assert(meaningful('협력'));assert(!meaningful('ㅋㅋㅋㅋ'));assert(!meaningful('모름'));assert(!meaningful('abcabcabc'));assert(!meaningful('!!!'));
 const g=gradeByEffort({agreement:'cooperate'},options,mapping,fields,['agreement'],{timeCompliance:6});assert(g.total>=85);assert(g.profile.reviewRequired);
});
test('invalid fixed time fails closed',()=>{assert.throws(()=>gradeByEffort({},options,mapping,fields,[],{timeCompliance:5}));});

test('real climate adapter recognizes secondary writing and budget-only effort',()=>{
 const fs=require('fs'),path=require('path'),vm=require('vm');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const code=server.slice(server.indexOf('function applyGenerousClimateFloor('),server.indexOf('runAIGrade=async function(session)'));
 const apply=vm.runInNewContext(code+';applyGenerousClimateFloor',{gradeByEffort,scoreOptions:options,contentScoreKeys:Object.keys(options).filter(k=>k!=='timeCompliance'),POLICY_VERSION:'effort-85-20261019'});
 for(const data of [{actorReason:'협력'},{reflectionReason:'변경'},{oppositionReason:'돈'},{budget:{renewable:10}}]){
  const grade=apply({areas:Object.fromEntries(Object.keys(options).map(k=>[k,{score:0,evidence:[]}]))},{data,timeComplianceScore:6});
  assert(grade.contentTotal+6>=85);assert(grade.effortPolicy.attempted);
 }
});
