// Presentation only. This module never opens a store or changes game state.
const byId=id=>document.getElementById(id);
const shortLabels=new Map([
 ['다음 · 탐험 설정','다음 단계'],['탐험 보관함 열기','보관함'],
 ['이 탐험을 보관하고 슬롯 비우기','탐험 보관'],['취소 · 보관함으로','취소'],
 ['선택한 슬롯의 탐험 보관','선택 탐험 보관'],['새로운 탐험 시작하기','새 탐험 선택'],
 ['규칙·문제팩 다시 선택','규칙 다시 선택'],['슬롯이 모두 찼습니다 · 보관함 열기','보관함 열기'],
 ['선택한 탐험 이어하기','이어하기'],['선택 슬롯 JSON 백업','JSON 백업'],
 ['빈 슬롯에 JSON 복원','JSON 복원'],['선택한 기록 보기','기록 보기'],
 ['탐험 일지 CSV 내려받기','CSV 내려받기'],['이 보관 기록 JSON 백업','JSON 백업']
]);
let opener;
export function decorateButton(button,label,variant='secondary'){
 button.classList.add('popup-button');button.dataset.variant=variant;
 button.textContent=shortLabels.get(label)??label;
 button.setAttribute('aria-label',label);button.title=label;
 return button;
}
export function beginPanel(trigger){
 const panel=byId('panel');
 if(!panel.open)opener=trigger??document.activeElement;
 byId('panel-actions').replaceChildren();byId('panel-message').textContent='';
 byId('panel-body').replaceChildren();byId('panel-body').scrollTop=0;
 byId('panel-scroll').scrollTop=0;
}
export function finishPanel(group){
 const body=byId('panel-body'),actions=byId('panel-actions');
 // Configuration fields belong to the scrollable body, not the fixed action row.
 for(const child of [...group.children])if(child.tagName!=='BUTTON')body.append(child);
 const buttons=[...group.querySelectorAll(':scope > button')];
 if(buttons.length<3&&!buttons.some(b=>b.dataset.variant==='cancel')){
  const close=document.createElement('button');close.type='button';
  decorateButton(close,'닫기','cancel');
  close.addEventListener('click',()=>{if(!byId('panel').hasAttribute('aria-busy'))byId('panel').close();});
  buttons.unshift(close);
 }
 const rank={cancel:0,secondary:1,primary:2};
 buttons.sort((a,b)=>rank[a.dataset.variant]-rank[b.dataset.variant]);
 actions.append(...buttons);group.remove();
 byId('panel-title').focus({preventScroll:true});
}
export function setupPopup(){
 const panel=byId('panel');
 panel.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});
 // Keep desktop logical coordinates, but never shrink controls below 1x on small screens.
 const resize=()=>{
  const v=window.visualViewport;
  const width=v?.width??innerWidth,height=v?.height??innerHeight;
  const compact=width<960||height<540;
  panel.classList.toggle('compact',compact);
  panel.classList.toggle('short',compact&&height<500);
  panel.style.setProperty('--visible-height',`${height}px`);
 };
 addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);resize();
 // Warm state images so the first hover/press does not flash an empty button.
 for(const role of ['primary','secondary','cancel'])for(const state of ['normal','hover','pressed','disabled']){
  const image=new Image();image.src=`../assets/home/popup-v2/${role}-${state}.png`;
 }
}
