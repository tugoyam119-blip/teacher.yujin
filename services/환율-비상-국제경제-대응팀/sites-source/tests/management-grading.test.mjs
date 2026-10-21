import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const api=readFileSync(new URL("../app/api/admin/route.ts",import.meta.url),"utf8");
const grading=readFileSync(new URL("../app/api/grading.ts",import.meta.url),"utf8");
const teacher=readFileSync(new URL("../app/teacher/page.tsx",import.meta.url),"utf8");

test("management panel includes every requested operation",()=>{
 for(const text of ["학생 명단 CSV 업로드","가채점 결과 Excel 내려받기","모의 명단으로 화면 확인","API 키 저장","연결 확인","저장 키 삭제","가채점 시험용 모의 제출 만들기","시험용 모의 제출 삭제","전체 학생 일괄 가채점","실패 건만 재시도","선택 반 기록 초기화","전체 기록 초기화"])assert.ok(teacher.includes(text),text);
});

test("grading only accepts the published score bands",()=>{
 for(const band of ["economy:[25,20,15,10]","policy:[25,20,15,10]","organization:[20,16,12,8]","cooperation:[20,16,12,8]","completion:[4,3,2,1]","time:[6,4,2,0]"])assert.ok(api.includes(band),band);
 assert.match(grading,/참여 의지와 과제에 답하려는 시도가 확인되면 가능한 한 상위 수준/);
});

test("mock records and API key are isolated from student exports",()=>{
 assert.match(api,/student_id LIKE 'DEMO%'/);
 assert.match(api,/class_name='모의반'/);
 assert.match(api,/teacher_settings/);
 assert.doesNotMatch(teacher,/data\.aiConfig\?\.apiKey/);
});

test("teacher loading notice clears on success and after ten seconds",()=>{
 assert.match(teacher,/setTimeout\(\(\)=>setMsg\(''\),10000\)/);
 assert.match(teacher,/setAuth\(true\);setMsg\(''\)/);
});
