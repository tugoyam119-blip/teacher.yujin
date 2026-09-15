'use strict';
const M = ResultsModel, $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records = [], pin = '', view = new URLSearchParams(location.search).get('view') === 'grades' ? 'grades' : 'answers';
let loading = false, generation = 0;
try { pin = sessionStorage.getItem('HR102_TPIN') || ''; } catch {}
function options() { return {class_no:$('classFilter').value,status:$('statusFilter').value,q:$('search').value}; }
function message(text, error=false) { $('message').textContent=text; $('message').hidden=!text; $('message').className='message'+(error?' error':''); }
function lock() { generation++; records=[]; pin=''; $('results').replaceChildren(); $('workspace').hidden=true; $('login').hidden=false; $('logout').hidden=true; try { sessionStorage.removeItem('HR102_TPIN');sessionStorage.removeItem('HR115_OP_PIN'); } catch {} }
async function loadRecords() {
  if (loading) return;
  if (!pin) { $('login').hidden=false;message('교사 PIN으로 로그인해 주세요.');return; }
  loading=true; const requestGeneration=generation;
  $('refresh').disabled=true; $('download').disabled=true;message('학생 답안과 채점 결과를 불러오는 중입니다…');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),30000);
  try {
    const response=await fetch('/api/teacher/results?pin='+encodeURIComponent(pin),{cache:'no-store',signal:controller.signal});
    const result=await response.json();
    if (requestGeneration!==generation) return;
    if (response.status===403) { lock();throw Error(result.error || '교사 PIN을 확인해 주세요.'); }
    if (!response.ok) throw Error(result.error || '기록을 불러오지 못했습니다.');
    records=result.rows; $('login').hidden=true; $('workspace').hidden=false; $('logout').hidden=false;
    try { sessionStorage.setItem('HR102_TPIN',pin); } catch {}
    $('updated').textContent='불러온 시각 '+new Date().toLocaleTimeString('ko-KR');
    message('');render();
  } catch(e) { message(e.name==='AbortError'?'응답이 지연됩니다. 새로고침으로 다시 시도해 주세요.':e.message,true); }
  finally { clearTimeout(timer); loading=false; $('refresh').disabled=false; $('download').disabled=!M.filter(records,options()).length; }
}
function head(r) { return `<div class="student-head"><h2>${esc(r.class_no)}반 · ${esc(r.student_id)} ${esc(r.name)}</h2><span class="badge">${M.status(r)}</span>${M.review(r)?'<span class="badge warn">교사 확인 권장</span>':''}<span class="muted">AI ${esc(r.ai_grade?.total ?? '미가채점')} · 교사 ${esc(r.teacher_grade?.total ?? '미채점')} · 시간감점 ${esc(r.time_penalty ?? 0)}</span></div>`; }
function answerCard(r) {
  const entries=M.answers(r), p=r.payload || {};
  const extra=entries.filter(([name])=>!['정책 선택 이유','정책 영향·보완','최종 판단'].includes(name));
  return `<article class="panel">${head(r)}<div class="choices">1차 정책: ${esc(M.list(p.policyStations)||'미선택')} → 최종 정책: ${esc(M.list(p.finalStations)||'미선택')}</div><div class="answers">${[['정책 선택 이유',p.answer1],['정책 영향·보완',p.answer2],['최종 판단',p.answer3]].map(([title,text])=>`<section><h3>${title}</h3><div class="answer-text">${esc(text || '아직 작성하지 않았습니다.')}</div></section>`).join('')}</div><details><summary>선택 항목·자기평가서 모두 보기</summary>${extra.map(([title,text])=>`<p class="answer-text"><b>${title}</b> · ${esc(text||'미작성')}</p>`).join('')}</details></article>`;
}
function gradeCard(r) {
  const a=r.ai_grade;
  if(!a) return `<article class="panel">${head(r)}<p class="muted">아직 AI 가채점 결과가 없습니다.</p></article>`;
  return `<article class="panel">${head(r)}<p><b>AI 잠정총점 ${esc(a.total ?? '-')} / 100</b> · 신뢰도 ${M.confidence(a.confidence)}</p><p class="feedback">${esc(a.overall || a.summary || '종합판단 없음')}</p><div class="area-grid">${M.areas.map(([key,title,max])=>{const v=a.areas?.[key] || {};return `<section class="area"><h3>${title} ${esc(v.score ?? a[key] ?? '-')} / ${max}</h3><p>${esc(v.reason || '채점 이유 없음')}</p><p class="muted">${(v.evidence || []).map(x=>'“'+esc(x)+'”').join('<br>')}</p></section>`;}).join('')}</div><div class="feedback-grid"><section><h3>잘한 점</h3><p class="feedback">${esc(a.strength||'-')}</p></section><section><h3>보완할 점</h3><p class="feedback">${esc(a.improvement||'-')}</p></section></div><p class="feedback"><b>교사용 피드백</b> · ${esc(a.feedback||'-')}</p>${a.reviewFlags?.length?`<p class="message warn feedback">${esc(a.reviewFlags.join('\n'))}</p>`:''}<p class="feedback"><b>교사 피드백</b> · ${esc(r.teacher_comment||'미작성')}</p></article>`;
}
function scoreTable(rows) {
  return `<div class="tablewrap"><table><caption>조회 학생 영역별 AI 잠정점수 및 교사 최종점수</caption><thead><tr><th scope="col">반·학번</th><th scope="col">이름</th><th scope="col">제출</th>${M.areas.map(([,title,max])=>`<th scope="col">${title} /${max}</th>`).join('')}<th scope="col">AI 총점</th><th scope="col">신뢰도</th><th scope="col">교사 확인</th><th scope="col">교사 최종점수</th><th scope="col">시간감점</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.class_no)}반 ${esc(r.student_id)}</td><td>${esc(r.name)}</td><td>${M.status(r)}</td>${M.areas.map(([key])=>`<td>${esc(r.ai_grade?.areas?.[key]?.score ?? r.ai_grade?.[key] ?? '-')}</td>`).join('')}<td>${esc(r.ai_grade?.total ?? '미가채점')}</td><td>${r.ai_grade?M.confidence(r.ai_grade.confidence):'-'}</td><td>${M.review(r)?'확인 권장':'-'}</td><td>${esc(r.teacher_grade?.total ?? '미채점')}</td><td>${esc(r.time_penalty ?? 0)}</td></tr>`).join('')}</tbody></table></div>`;
}
function render() {
  const rows=M.filter(records,options());
  $('answersTab').setAttribute('aria-pressed',String(view==='answers'));$('gradesTab').setAttribute('aria-pressed',String(view==='grades'));
  $('summary').textContent=`조회 ${rows.length}명 / 전체 ${records.length}명 · 제출 ${rows.filter(r=>r.submitted).length}명 · AI 가채점 ${rows.filter(r=>r.ai_grade).length}명 · 교사 채점 ${rows.filter(r=>r.teacher_grade).length}명`;
  $('download').disabled=loading || !rows.length;
  $('results').innerHTML=rows.length?(view==='answers'?rows.map(answerCard).join(''):scoreTable(rows)+rows.map(gradeCard).join('')):'<div class="panel empty">조건에 맞는 학생이 없습니다. 반·상태·검색 조건을 확인해 주세요.</div>';
}
async function download() {
  const query=new URLSearchParams({...options(),pin}); $('download').disabled=true;
  try {
    const response=await fetch('/api/teacher/export.xlsx?'+query,{cache:'no-store'});
    if(response.status===403) { lock();throw Error('인증이 만료되었습니다. 다시 로그인해 주세요.'); }
    if(!response.ok) throw Error('Excel 다운로드에 실패했습니다. 다시 시도해 주세요.');
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`인권도시_${Number(query.get('class_no'))?query.get('class_no')+'반':'전체반'}_답안_AI가채점_교사채점_${new Date().toISOString().slice(0,10)}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    message('Excel 다운로드를 시작했습니다. 브라우저 다운로드 목록에서 확인하세요.');
  } catch(e) { message(e.message,true); } finally { $('download').disabled=!M.filter(records,options()).length; }
}
$('loginForm').addEventListener('submit',e=>{e.preventDefault();pin=$('pin').value.trim();loadRecords();});
$('logout').addEventListener('click',()=>{lock();message('로그아웃했습니다.');});
$('refresh').addEventListener('click',loadRecords);$('download').addEventListener('click',download);
for(const id of ['classFilter','statusFilter']) $(id).addEventListener('change',render);
$('search').addEventListener('input',render);
for(const [id,mode] of [['answersTab','answers'],['gradesTab','grades']]) $(id).addEventListener('click',()=>{view=mode;render();});
const initialClass=new URLSearchParams(location.search).get('class_no');if(/^[0-7]$/.test(initialClass || '')) $('classFilter').value=initialClass;
loadRecords();
