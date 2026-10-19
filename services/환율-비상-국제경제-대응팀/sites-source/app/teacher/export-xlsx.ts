/* eslint-disable @typescript-eslint/no-explicit-any */
import {strToU8,zipSync} from "fflate";
import {V2_AREAS,scoreStatistics} from "../rubric-v2";

type Sheet={name:string;headers:string[];rows:unknown[][];widths:number[]};

const xml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[c]!));
const column=(n:number)=>{let out="";for(;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out};
const cell=(value:unknown,ref:string,style=0)=>typeof value==="number"&&Number.isFinite(value)
 ?`<c r="${ref}" s="${style}"><v>${value}</v></c>`
 :`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;

function worksheet(sheet:Sheet){
 const rows=[sheet.headers,...sheet.rows],last=column(sheet.headers.length),body=rows.map((row,r)=>`<row r="${r+1}"${r===0?' ht="28" customHeight="1"':''}>${row.map((v,c)=>cell(v,`${column(c+1)}${r+1}`,r===0?1:0)).join("")}</row>`).join("");
 const cols=sheet.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("");
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${last}${Math.max(1,rows.length)}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function workbookBytes(sheets:Sheet[]){
 const files:Record<string,Uint8Array>={
  "[Content_Types].xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
  "_rels/.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
  "xl/workbook.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`),
  "xl/_rels/workbook.xml.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  "xl/styles.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF166534"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`),
 };
 sheets.forEach((s,i)=>files[`xl/worksheets/sheet${i+1}.xml`]=strToU8(worksheet(s)));
 return zipSync(files,{level:6});
}

const time=(value:unknown)=>value?new Date(Number(value)).toLocaleString("ko-KR"):"";
const list=(value:unknown)=>Array.isArray(value)?value.join(", "):"";
const breakdown=(x:any)=>{try{return typeof x.ai_breakdown==="string"?JSON.parse(x.ai_breakdown):x.ai_breakdown||{}}catch{return{}}};

export function downloadResultsXlsx(data:any,filter:string,version='legacy'){
 const attempts=(data.attempts||[]).filter((x:any)=>filter==="전체"||x.class_name===filter);
 const visit=(x:any)=>(data.visits||[]).find((v:any)=>v.student_id===x.student_id)||{};
 const adjusted=(x:any)=>x.ai_score==null?"":Number(x.ai_score);
 const summary:Sheet={name:"결과 요약",headers:["반","학번","이름","상태","현재 단계","기존 기준 가채점(100)","교사 최종점수","제출 방식","제출 시각","첫 접속","최근 접속","로그인 횟수","추가시간(분)","시간 점수","가채점 피드백","교사 피드백","최종 보고서","교사 확인 필요","교사 확인 사항"],rows:attempts.map((x:any)=>{const v=visit(x),b=breakdown(x);return[x.class_name,String(x.student_id),x.name,x.status,Number(x.current_step||0),adjusted(x),x.teacher_score==null?"":Number(x.teacher_score),x.submission_type||"",time(x.submitted_at),time(v.first_seen_at),time(v.last_seen_at),Number(v.login_count||0),Number(x.extra_granted_minutes||0),b.time??"",x.ai_feedback||"",x.feedback||"",x.answers?.report||"",b.reviewRequired?"예":"아니오",(b.reviewFlags||[b.reviewReason]).filter(Boolean).join(" / ")] }),widths:[14,13,10,12,10,15,16,12,20,20,20,12,13,12,40,40,55,16,70]};
 const answers:Sheet={name:"전체 답안",headers:["반","학번","이름","원화 판단","달러 판단","구매비용 판단","집단별 영향","수출기업 이유","수입기업 이유","경제적 영향","선택 정책","기대 효과","부작용","최종 보고서","전체 답안(JSON)"],rows:attempts.map((x:any)=>{const a=x.answers||{};return[x.class_name,String(x.student_id),x.name,a.won||"",a.dollar||"",a.cost||"",Object.entries(a.groups||{}).map(([k,v])=>`${k}: ${v}`).join(" / "),a.exportReason||"",a.importReason||"",list(a.effects),list(a.policies),a.policyEffect||"",a.policyRisk||"",a.report||"",JSON.stringify(a)]}),widths:[14,13,10,14,14,16,35,45,45,35,35,45,45,55,60]};
 const gradeRows=attempts.flatMap((x:any)=>{const b=breakdown(x),base=[x.class_name,String(x.student_id),x.name,b.economy??"",b.policy??"",b.organization??"",b.cooperation??"",b.completion??"",b.time??"",adjusted(x),x.teacher_score==null?"":Number(x.teacher_score),b.strength||"",b.improvement||"",x.ai_feedback||"",x.feedback||""];return x.grade_history?.length?x.grade_history.map((g:any)=>[...base,time(g.created_at),g.teacher_score==null?"":Number(g.teacher_score),g.feedback||""]):[[...base,"","",""]]});
 const grading:Sheet={name:"채점 상세",headers:["반","학번","이름","경제 상황·환율 영향(25)","정부 대응정책(25)","국제기구 역할(20)","국제협력·해결방안(20)","활동·완성도(4)","시간 준수(6)","가채점(100)","현재 교사점수","잘한 점","보완할 점","가채점 피드백","현재 교사 피드백","채점 이력 시각","이력 교사점수","이력 피드백"],rows:gradeRows,widths:[14,13,10,22,20,18,22,17,14,15,16,35,35,40,40,20,16,40]};
 const v2Breakdown=(x:any)=>{try{return JSON.parse(x.ai_v2_breakdown||'{}')}catch{return {}}};
 const v2:Sheet={name:'PDF v2.0 비교',headers:['반','학번','이름',...V2_AREAS.map(a=>a.label+'('+a.max+')'),'PDF v2.0 합계','기존 가채점','교사 확정점수','영역별 판단·감점 사유','직접 근거','교사 확인 사항'],rows:attempts.map((x:any)=>{const b=v2Breakdown(x);return[x.class_name,String(x.student_id),x.name,...V2_AREAS.map(a=>b[a.key]??''),x.ai_v2_score??'',x.ai_score??'',x.teacher_score??'',V2_AREAS.map(a=>a.label+': '+(b.areas?.[a.key]?.reason||'')+' / 감점: '+(b.areas?.[a.key]?.deduction||'')).join(' | '),V2_AREAS.map(a=>a.label+': '+(b.areas?.[a.key]?.evidence||[]).join(' / ')).join(' | '),(b.reviewFlags||[]).join(' / ')]}),widths:[14,13,10,18,18,18,18,24,18,18,18,90,90,90]};
 const stats=scoreStatistics(attempts.map((x:any)=>version==='v2.0'?x.ai_v2_score:x.ai_score));
 const statistics:Sheet={name:'선택 기준 통계',headers:['기준','채점 인원','평균','중앙값','90점 이상 비율(%)','최저','최고'],rows:[[version==='v2.0'?'PDF v2.0':'기존 기준',stats.count,stats.mean??'',stats.median??'',stats.atLeast90Percent??'',stats.min??'',stats.max??'']],widths:[20,15,15,15,24,15,15]};
 const bytes=workbookBytes([summary,answers,grading,v2,statistics]),url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),a=document.createElement("a");
 a.href=url;a.download=`환율비상_${filter==="전체"?"전체":filter}_수행평가_${version==='v2.0'?'PDFv2':'기존기준'}_가채점결과.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
