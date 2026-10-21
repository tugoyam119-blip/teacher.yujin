import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {unzipSync,strFromU8} from 'fflate';

const urls=new Map();
function moduleUrl(file){
 if(urls.has(file))return urls.get(file);
 let source=fs.readFileSync(file,'utf8');
 if(/teacher[\\/]page\.tsx$/.test(file)){
  source=source.replace(/import \{useTeacherConfirmation\} from "\.\/confirmation";/,'const useTeacherConfirmation=()=>({});').replace(/import \{startPolling\} from "\.\.\/polling.mjs";/,'const startPolling=()=>({stop(){}});').replace(/import \{downloadResultsXlsx\} from "\.\/export-xlsx";/,'const downloadResultsXlsx=()=>{};');
  source+='\nexport {Detail,ScoreStats};';
 }
 source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 source=source.replace(/from\s+(["'])([^"']+)\1/g,(_,q,name)=>{
  if(name.startsWith('.')){let target=path.resolve(path.dirname(file),name);if(!path.extname(target))target+=fs.existsSync(target+'.ts')?'.ts':'.tsx';return 'from '+JSON.stringify(moduleUrl(target))}
  return 'from '+JSON.stringify(import.meta.resolve(name));
 });
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(file,url);return url;
}
const {Detail,ScoreStats}=await import(moduleUrl(path.resolve('app/teacher/page.tsx')));
const {downloadResultsXlsx}=await import(moduleUrl(path.resolve('app/teacher/export-xlsx.ts')));
const scores={situation:13,policyChoice:18,reasoning:22,impact:18,diligence:19};
const row={student_id:'TESTPDF',name:'가상 학생',class_name:'가상반',status:'submitted',answers:{report:'학생이 작성한 최종 보고서'},ai_score:77,ai_v2_score:90,ai_v2_breakdown:JSON.stringify({...scores,score:90,areas:{reasoning:{reason:'판단 이유 확인',deduction:'구체성 부족',evidence:['학생이 작성한 최종 보고서']}},reviewFlags:['평가계획 확인'],reviewRequired:true}),extra_penalty:4};
test('actual v2 detail renders PDF fields and values, both scores, deductions and blocked finalization',()=>{
 const html=renderToStaticMarkup(React.createElement(Detail,{x:row,mode:'v2.0',ask:async()=>true,close(){},act(){},aiBlocked:false}));
 for(const text of ['환율 상황 이해 / 15','정책 선택 / 20','선택 이유 설명 / 25','경제적 영향 예측 / 20','수행 완성도 및 성실성 / 20','77/100','90/100','구체성 부족','사전 공지된 평가계획'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/type="number"/g)||[]).length,5);assert.doesNotMatch(html,/NaN/);
 assert.match(html,/<button class="primary" disabled="">90점·이력 저장/);
});
test('existing confirmed legacy rubric remains the editor basis during v2 comparison',()=>{
 const x={...row,teacher_score:91,teacher_breakdown:JSON.stringify({economy:25,policy:20,organization:20,cooperation:16,completion:4,time:6})};
 const html=renderToStaticMarkup(React.createElement(Detail,{x,mode:'v2.0',ask:async()=>true,close(){},act(){},aiBlocked:false}));
 assert.ok(html.includes('91/100'));assert.ok(html.includes('기존 기준 선택 점수'));assert.ok(html.includes('국제기구의 역할 이해 및 적용'));assert.ok(!html.includes('type="number"'));
});
test('v2 summary statistics render actual numbers with ungraded values excluded',()=>{
 const html=renderToStaticMarkup(React.createElement(ScoreStats,{values:[90,100,0,null],label:'PDF v2.0'}));
 assert.ok(html.includes('63.33'));assert.ok(html.includes('66.7'));assert.ok(!html.includes('NaN'));
});
test('actual Excel package retains legacy data and adds correct PDF scores, evidence and statistics',async()=>{
 const originalDocument=globalThis.document,originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;let blob,download;
 globalThis.document={createElement(){return {set download(value){download=value},click(){}}}};
 URL.createObjectURL=value=>{blob=value;return 'blob:test'};URL.revokeObjectURL=()=>{};
 try{
  downloadResultsXlsx({attempts:[row],visits:[]},'가상반','v2.0');
  const files=unzipSync(new Uint8Array(await blob.arrayBuffer())),workbook=strFromU8(files['xl/workbook.xml']);
  assert.ok(workbook.includes('PDF v2.0 비교'));assert.ok(workbook.includes('선택 기준 통계'));
  const legacy=strFromU8(files['xl/worksheets/sheet1.xml']),v2=strFromU8(files['xl/worksheets/sheet4.xml']),stats=strFromU8(files['xl/worksheets/sheet5.xml']);
  assert.ok(legacy.includes('<v>77</v>'));assert.ok(v2.includes('<v>90</v>'));assert.ok(v2.includes('선택 이유 설명(25)'));assert.ok(v2.includes('구체성 부족'));assert.ok(v2.includes('학생이 작성한 최종 보고서'));assert.ok(stats.includes('<v>90</v>'));assert.ok(download.includes('PDFv2'));
 }finally{globalThis.document=originalDocument;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke}
});
