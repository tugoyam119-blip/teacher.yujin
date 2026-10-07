const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const teacher=fs.readFileSync(path.join(root,'public','teacher.js'),'utf8');

test('grading policy keeps content 94 and time 6 separate',()=>{
  assert.match(server,/const contentScoreKeys=Object\.keys\(scoreOptions\)\.filter\(k=>k!==['"]timeCompliance['"]\)/);
  assert.match(server,/grade\.contentTotal=contentScoreKeys\.reduce/);
  assert.match(server,/grade\.timeComplianceScore=timeScoreValue/);
  assert.match(server,/grade\.total=grade\.contentTotal\+timeScoreValue/);
  assert.match(server,/내용 점수의 최대는 94점/);
  assert.match(server,/timeCompliance는 AI가 판단하지 말고 0을 임시 출력/);
});

test('nonperformance zero is available and protected from generous floor',()=>{
  for(const key of ['countryAnalysis','fundAllocation','policyAgreement','conflictAnalysis','compromise','cooperationRoles','completion']){
    assert.match(server,new RegExp(key+':\\[[^\\]]*0\\]'));
    assert.match(teacher,new RegExp(key+':\\{[^\\n]*options:\\[[^\\]]*0\\]'));
  }
  assert.match(server,/if\(current===0\)continue/);
  assert.match(teacher,/score===0\?['"]미수행['"]/);
  assert.match(server,/clean\.total<0\|\|clean\.total>100/);
});

test('individual extra time contributes to total elapsed and compliance',()=>{
  assert.match(server,/const totalElapsedSeconds=baseElapsedSeconds\+Math\.min/);
  assert.match(server,/const compliance=timeScore\(totalElapsedSeconds\)/);
  assert.match(server,/submissionReason='individual_time_manual'/);
  assert.match(server,/timeComplianceScore:compliance/);
});

test('grading workflow exposes audit filters and next-student navigation',()=>{
  assert.match(teacher,/gradingFilterValues=new Set\(\['unscored','ai_missing','ai_review','regrade','scored'\]\)/);
  assert.match(teacher,/function gradingQueue\(\)/);
  assert.match(teacher,/window\.openAdjacentUngraded/);
  assert.match(teacher,/저장 후 다음 미채점/);
  assert.match(teacher,/서버 자동/);
  assert.match(teacher,/수동 변경 · 서버/);
  assert.match(server,/timeComplianceManual=Number\.isInteger\(student\.timeComplianceScore\)/);
  assert.match(server,/시간점수_수동변경/);
});
