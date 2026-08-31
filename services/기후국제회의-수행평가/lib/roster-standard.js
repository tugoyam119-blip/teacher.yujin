'use strict';

const HEADER_ALIASES={
  classNo:['반','학급','class','classno','classname','class_no','class_name'],
  studentId:['학번','학생번호','studentid','student_id','studentnumber','student_number','id'],
  name:['이름','성명','학생이름','name','studentname','student_name']
};

function cleanHeader(value){return String(value??'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[\s.-]/g,'_')}
function compactHeader(value){return cleanHeader(value).replace(/_/g,'')}
function findHeader(headers,aliases){const normalized=headers.map(cleanHeader),compact=headers.map(compactHeader);return aliases.reduce((found,a)=>found>=0?found:Math.max(normalized.indexOf(cleanHeader(a)),compact.indexOf(compactHeader(a))),-1)}
function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  text=String(text??'').replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/,1)[0]||'',delimiter=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length?'\t':',';
  for(let i=0;i<text.length;i++){const c=text[i],next=text[i+1];if(c==='"'){if(quoted&&next==='"'){cell+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);row=[];cell=''}else cell+=c}
  row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);return rows;
}
function normalizeClass(value){const raw=String(value??'').trim();if(!raw)return null;const m=raw.match(/^(?:제\s*)?0*(\d{1,2})\s*(?:반|학급)?$/);if(!m)return null;const n=Number(m[1]);return n>=1&&n<=99?n:null}
function inferClass(studentId){const s=String(studentId??'').trim();if(/^\d{5}$/.test(s)){const n=Number(s.slice(1,3));return n>=1&&n<=99?n:null}return null}
function normalizeStudentId(value){return String(value??'').trim().replace(/^['"]|['"]$/g,'')}
function normalizeName(value){return String(value??'').trim().replace(/\s+/g,' ')}
function field(row,names){for(const n of names)if(row&&Object.prototype.hasOwnProperty.call(row,n))return row[n];return ''}
function parseRoster(input,options={}){
  const errors=[],warnings=[],accepted=[],sourceRows=[];let headers=null;
  if(typeof input==='string'){
    const table=parseCsv(input);if(!table.length)return{students:[],errors:[{row:1,code:'EMPTY',message:'명단이 비어 있습니다.'}],warnings:[],summary:{accepted:0,duplicates:0,errors:1,byClass:{}}};
    headers=table[0];const ci=findHeader(headers,HEADER_ALIASES.classNo),si=findHeader(headers,HEADER_ALIASES.studentId),ni=findHeader(headers,HEADER_ALIASES.name);
    if(si<0||ni<0)return{students:[],errors:[{row:1,code:'HEADERS',message:'첫 행에 「학번」과 「이름」 열이 필요합니다. 「반」 열도 권장합니다.'}],warnings:[],summary:{accepted:0,duplicates:0,errors:1,byClass:{}}};
    table.slice(1).forEach((r,i)=>sourceRows.push({row:i+2,classValue:ci>=0?r[ci]:'',studentId:r[si],name:r[ni]}));
  }else{
    const rows=Array.isArray(input)?input:[];rows.forEach((r,i)=>sourceRows.push({row:i+1,classValue:field(r,['classNo','class_no','className','class_name','class','반','학급']),studentId:field(r,['studentId','student_id','studentNumber','student_number','학번','학생번호']),name:field(r,['name','studentName','student_name','이름','성명'])}));
  }
  const seen=new Map();let duplicates=0;
  for(const raw of sourceRows){const studentId=normalizeStudentId(raw.studentId),name=normalizeName(raw.name),givenClass=normalizeClass(raw.classValue),inferred=inferClass(studentId);
    if(!studentId&&!name&&!String(raw.classValue??'').trim())continue;
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(studentId)){errors.push({row:raw.row,code:'STUDENT_ID',message:'학번은 영문·숫자·밑줄·하이픈 1~40자로 입력하세요.'});continue}
    if(!name){errors.push({row:raw.row,code:'NAME',studentId,message:'이름이 비어 있습니다.'});continue}
    if(String(raw.classValue??'').trim()&&!givenClass){errors.push({row:raw.row,code:'CLASS',studentId,message:'반은 1, 01, 1반처럼 입력하세요.'});continue}
    const classNo=givenClass||inferred;
    if(!classNo){errors.push({row:raw.row,code:'CLASS_MISSING',studentId,message:'반을 확인할 수 없습니다. 「반」 열을 입력하세요.'});continue}
    if(givenClass&&inferred&&givenClass!==inferred)warnings.push({row:raw.row,code:'CLASS_MISMATCH',studentId,message:`입력한 ${givenClass}반과 학번에서 추정한 ${inferred}반이 다릅니다. 입력한 반을 사용합니다.`});
    if(seen.has(studentId)){duplicates++;errors.push({row:raw.row,code:'DUPLICATE',studentId,message:`중복 학번입니다. 먼저 나온 ${seen.get(studentId)}행만 사용합니다.`});continue}
    seen.set(studentId,raw.row);accepted.push({classNo,studentId,name});
  }
  const byClass={};for(const s of accepted)byClass[String(s.classNo)]=(byClass[String(s.classNo)]||0)+1;
  return{students:accepted,errors,warnings,summary:{accepted:accepted.length,duplicates,errors:errors.length,byClass},headers};
}
function toHumanRightsRows(students){return students.map(s=>({student_id:s.studentId,name:s.name}))}
function toClimateRows(students){return students.map(s=>({studentId:s.studentId,name:s.name,className:`${s.classNo}반`}))}
module.exports={HEADER_ALIASES,parseCsv,parseRoster,normalizeClass,inferClass,toHumanRightsRows,toClimateRows};
