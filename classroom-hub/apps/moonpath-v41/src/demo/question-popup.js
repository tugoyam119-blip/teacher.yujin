// Presentation only: reuses existing nodes and callbacks; never writes game state.
const byId=id=>document.getElementById(id);
export function setupQuestionPopup(){
 const pane=byId('question-pane');let key=null,opener=null;
 const role={ 'submit-answer':'primary','judge-right':'primary','judge-wrong':'cancel' };
 for(const id of ['timer-start','timer-pause','timer-resume','session-resume','submit-answer','judge-right','judge-wrong']){
  const b=byId(id);b.classList.add('question-button');b.dataset.variant=role[id]??'secondary';
 }
 const attachControls=()=>{
  const lesson=byId('session-resume'),lessonTarget=pane.hidden?(byId('scene-runtime-controls')??byId('toolbar')):byId('question-timers');if(lesson.parentElement!==lessonTarget)lessonTarget.append(lesson);
  const home=byId('return-home'),homeTarget=pane.hidden?(byId('scene-navigation')??byId('toolbar')):byId('question-navigation');if(home){
   home.textContent=pane.hidden?'HOME으로':'↶';home.setAttribute('aria-label','HOME으로 · 수업과 타이머 일시정지');home.title='HOME으로 · 수업과 타이머 일시정지';if(home.parentElement!==homeTarget)homeTarget.prepend(home);
  }
 };
 attachControls();new MutationObserver(attachControls).observe(byId('toolbar'),{childList:true});
 const mirror=()=>{const message=byId('message'),target=byId('question-status');target.textContent=message.textContent;target.dataset.kind=message.dataset.kind??'info';};
 new MutationObserver(mirror).observe(byId('message'),{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-kind']});mirror();
 const resize=()=>{const v=window.visualViewport,w=Math.min(innerWidth,v?.width??innerWidth),h=Math.min(innerHeight,v?.height??innerHeight);pane.style.setProperty('--question-scale',String(Math.min(w/960,h/540)));pane.style.setProperty('--question-visible-height',h+'px');pane.classList.toggle('compact',w<960||h<540);pane.classList.toggle('short',h<680);};
 addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);resize();
 return {
  hide(){attachControls();if(key!==null){if(pane.contains(document.activeElement))(opener?.isConnected?opener:byId('draw-question')).focus({preventScroll:true});key=null;}},
  show({flow,timer,renderKey,type}){
   byId('question-popup-title').textContent={MAIN:'달빛 문제',INTERCEPTION:'가로채기 도전',RECOVERY:'오답 회수'}[flow];
   byId('response-form').dataset.type=type;
   const phase={PREPARED:'시작 대기',RUNNING:'진행 중',PAUSED:'일시정지',EXPIRED_AWAITING_TEACHER:'시간 만료 · 교사 확인 대기',RESOLVED:'판정 완료'}[timer.phase]??timer.phase;
   byId('question-clock-label').textContent=`${phase} · ${Math.ceil(timer.remainingMs/1000)}초 (저장 기준)`;
   if(key!==renderKey){opener=document.activeElement;key=renderKey;byId('question-content').scrollTop=0;byId('question-stem').focus({preventScroll:true});}
   attachControls();
  }
 };
}
