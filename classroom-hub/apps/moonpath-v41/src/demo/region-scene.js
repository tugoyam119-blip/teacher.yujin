// Visual adaptation only. Original command nodes/callbacks and saved state stay intact.
const byId=id=>document.getElementById(id);
const setText=(e,text)=>{if(e&&e.textContent!==text)e.textContent=text;};
export function setupRegionScene(){
 const canvas=byId('canvas');
 const move=(id,target)=>{const e=byId(id),t=byId(target);if(e&&t&&e.parentElement!==t)t.append(e);};
 const update=()=>{
  move('open-routes','scene-navigation');move('health-return','scene-health-controls');move('lesson-budget','scene-budget');
  for(const b of canvas.querySelectorAll('button')){b.classList.add('scene-button');b.dataset.sceneVariant=['draw-question','complete-region','lesson-start'].includes(b.id)?'primary':['lesson-end'].includes(b.id)?'cancel':'secondary';
   const short={ 'lesson-end':'수업 마무리','health-return':'책장 복귀·회복' }[b.id];if(short&&b.textContent!==short){b.title=b.textContent;b.setAttribute('aria-label',b.textContent);setText(b,short);}
  }
  for(const row of byId('status-data').children){row.dataset.stat=row.querySelector('span')?.textContent??'';const value=row.querySelector('strong');if(value)value.title=value.textContent;}
  const phase=byId('lesson-phase').textContent;setText(byId('scene-phase-label'),{ACTIVE:'수업 진행 중',PAUSED:'수업 일시정지',ENDED:'수업 종료'}[phase]??'수업 시작 대기');
  setText(byId('scene-progress-label'),byId('region-progress').textContent.replaceAll('IN_PROGRESS','탐험 중').replaceAll('COMPLETED','완료').replaceAll('AVAILABLE','진입 가능').replaceAll('LOCKED','잠김'));
  const h=canvas.querySelector('h1');h.title=h.textContent;
 };
 new MutationObserver(update).observe(canvas,{subtree:true,childList:true});update();
}
