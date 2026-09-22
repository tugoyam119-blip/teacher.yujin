'use strict';
function monitoredStudent(){return !!student&&!observerMode&&!isTeacherTest()&&API_MODE}
function remainingTimeText(){
 if(state.submitted)return '자기평가서 · 시간 제한 없음';
 if(session.compensation_active)return '오류 보충 남은 시간 '+clockTime(session.compensation_remaining_seconds);
 if(session.personal_extra_active)return '추가 수행 남은 시간 '+clockTime(session.personal_extra_remaining_seconds);
 if(!session.is_open||!session.timer_running)return session.phase==='class-wait'?'우리 반 수행 시작 대기':'수행시간 일시정지';
 const classRemaining=Math.max(0,Number(session.auto_pause_limit_seconds||2700)-Number(session.classroom_elapsed_seconds||0));
 const remaining=Math.min(classRemaining,Number(session.segment_remaining_seconds||0));
 return '이번 차시 남은 시간 '+clockTime(remaining)+' · 전체 잔여 '+clockTime(session.remaining_seconds);
}
function clockTime(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(seconds/60)+'분 '+String(seconds%60).padStart(2,'0')+'초'}
function studentTimePanel(){return monitoredStudent()?`<aside class="studentTimePanel"><strong id="assessmentTime">${remainingTimeText()}</strong><span>${state.submitted?'자기평가서를 작성하고 저장하세요.':'답안은 직접 입력하세요. 화면을 1분 이상 떠나면 선생님께 화면 이탈 알림이 전달됩니다.'}</span></aside>`:''}
function updateStudentTimePanel(){const el=document.getElementById('assessmentTime');if(el)el.textContent=remainingTimeText()}
let focusAway=null,lastFocusSent=0;
function reportFocus(forceAway=false){
 if(!monitoredStudent())return;
 const away=forceAway||document.visibilityState==='hidden'||!document.hasFocus();
 if(away&&(!session.is_open||state.submitted))return;
 if(away===focusAway)return;
 focusAway=away;lastFocusSent=Math.max(Date.now(),lastFocusSent+1);
 const body=JSON.stringify({student_id:student.student_id,name:student.name,away,sent_at:lastFocusSent});
 fetch('/api/attention',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).then(r=>{if(!r.ok)focusAway=null}).catch(()=>{focusAway=null});
}
document.addEventListener('visibilitychange',()=>reportFocus());
window.addEventListener('blur',()=>reportFocus(true));
window.addEventListener('focus',()=>reportFocus());
window.addEventListener('pagehide',()=>reportFocus(true));
window.addEventListener('pageshow',()=>reportFocus());
setInterval(()=>{updateStudentTimePanel();reportFocus()},1000);
function blockAnswerPaste(e){
 if(!monitoredStudent()||!e.target.matches('textarea,input[type="text"],input:not([type])')||!['answer1','answer2','answer3','limitationOther','remedyOther','selfEvalText'].includes(e.target.id))return;
 if(e.type==='beforeinput'&&!['insertFromPaste','insertFromDrop','insertFromPasteAsQuotation'].includes(e.inputType))return;
 e.preventDefault();let note=document.getElementById('pasteNotice');if(!note){note=document.createElement('div');note.id='pasteNotice';note.className='pasteNotice';note.setAttribute('role','alert');document.body.appendChild(note)}
 note.textContent='붙여넣기는 사용할 수 없습니다. 자신의 생각을 직접 입력해 주세요.';clearTimeout(blockAnswerPaste.timer);blockAnswerPaste.timer=setTimeout(()=>note.remove(),3500);
}
for(const type of ['paste','drop','beforeinput'])document.addEventListener(type,blockAnswerPaste,true);
