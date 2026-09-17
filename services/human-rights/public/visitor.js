'use strict';
let visitorFeedback=null,visitorBusy=false;
if(visitorMode){document.title='인권도시 일반 체험';document.body.classList.add('visitorExperience')}
function visitorBanner(){return `<div class="teacherTestBanner"><b>일반 체험${student?' · '+esc(student.name):''}</b><span>시간 제한 없이 참여합니다. 결과와 후기는 학생·참관 교사 기록과 별도로 보관됩니다.</span>${student?'<button class="btn secondary sm" onclick="visitorFeedbackView()">후기 남기기</button><button class="btn secondary sm" onclick="leaveVisitor()">나가기</button>':''}</div>`}
function visitorLoginView(){
 document.title='인권도시 일반 체험 로그인';
 root.innerHTML=appTop()+`<main class="wrap"><section class="card hero"><div class="kicker">일반 체험자 전용</div><h1>새봄시의 시장이 되어 보세요.</h1><p>시민의 이동권과 예산을 생각하며 정책을 결정하고, 체험 후 느낀 점을 들려주세요.</p></section><section class="card"><h2>일반 체험 로그인</h2><p>학번이나 교사 등록 없이 이름·별명으로 참여할 수 있습니다.</p><form onsubmit="event.preventDefault();loginVisitor()"><label for="visitorName">이름 또는 별명</label><input id="visitorName" maxlength="40" required placeholder="사용할 별명을 입력하세요" autocomplete="off"><p class="muted">작성한 답안과 후기는 수업 개선을 위해 담당 교사만 확인하며 학생·참관 교사 기록과 별도로 보관합니다. 연락처 등 개인정보는 적지 않아도 됩니다.</p><button class="btn" id="visitorLogin">체험 시작하기</button><div id="visitorLoginMsg" role="status"></div></form><p class="small muted">같은 브라우저에서 다시 접속하면 이어서 참여합니다. 나가기를 누르거나 브라우저 저장 내용을 지우면 다음 입장은 새로운 참여로 기록됩니다.</p></section></main>`;
}
async function loginVisitor(){
 if(visitorBusy)return;visitorBusy=true;const msg=document.getElementById('visitorLoginMsg'),button=document.getElementById('visitorLogin');button.disabled=true;
 try{const x=await api('/api/visitor/login',{method:'POST',body:JSON.stringify({name:document.getElementById('visitorName').value.trim()})},true);
 student={student_id:x.student_id,name:x.name,token:x.token,role:'visitor'};state=normalizeState({});selfEvaluation=null;visitorFeedback=null;manualSavedForCurrent=false;session=x.session;safeSet(LS,'HR10_STUDENT',JSON.stringify(student));saveLocal();startHeartbeat();render();
 }catch(e){msg.textContent=e.message}finally{visitorBusy=false;button.disabled=false}
}
function visitorFeedbackView(){
 const f=visitorFeedback||{};
 root.innerHTML=shell(`<section class="card hero"><h1>체험 후기를 들려주세요.</h1><p>좋았던 점, 어려웠던 부분, 개선 의견을 자유롭게 적어 주세요. 체험을 마치기 전에도 남길 수 있습니다.</p></section><section class="card"><label for="visitorRating">만족도 (선택)</label><select id="visitorRating"><option value="">선택하지 않음</option>${[5,4,3,2,1].map(n=>`<option value="${n}" ${Number(f.rating)===n?'selected':''}>${n}점</option>`).join('')}</select><label for="visitorText">후기 (최대 3,000자)</label><textarea id="visitorText" rows="8" maxlength="3000">${esc(f.text||'')}</textarea><p id="visitorFeedbackMsg" role="status">${f.saved_at?'이전에 남긴 후기가 있습니다. 수정해서 다시 저장할 수 있습니다.':''}</p><button class="btn green" id="visitorFeedbackSave" onclick="saveVisitorFeedback()">후기 저장</button> <button class="btn secondary" onclick="${state.submitted?'goVisitorReport()':'render()'}">${state.submitted?'제출한 정책 보기':'체험으로 돌아가기'}</button></section>`,{bottom:''});
 document.querySelector('.drawerBtn')?.remove();document.querySelector('.saveState')?.remove();
}
function goVisitorReport(){root.innerHTML=shell(reportHtml(),{bottom:''})}
async function saveVisitorFeedback(){
 const button=document.getElementById('visitorFeedbackSave'),msg=document.getElementById('visitorFeedbackMsg');button.disabled=true;
 try{const x=await api('/api/feedback',{method:'POST',body:JSON.stringify({student_id:student.student_id,text:document.getElementById('visitorText').value,rating:document.getElementById('visitorRating').value})});visitorFeedback=x.feedback;msg.textContent='후기를 저장했습니다. 의견을 남겨 주셔서 감사합니다.'}catch(e){msg.textContent=e.message}finally{button.disabled=false}
}
async function leaveVisitor(){
 if(!confirm('체험을 종료할까요? 저장된 결과와 후기는 보관되며, 다음 입장은 새로운 참여로 시작합니다.'))return;
 clearTimeout(saveTimer);if(!state.submitted)await saveRemote();safeRemove(LS,'HR10_STUDENT');location.assign('/experience');
}
