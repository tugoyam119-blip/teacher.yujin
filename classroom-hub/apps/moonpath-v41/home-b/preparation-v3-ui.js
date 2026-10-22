// New expedition v3 presentation only. No persistence or engine calls.
const make=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
export function mountPreparationV3({grid,left,right,fields}){
 const heading=left.querySelector('h2');
 if(!heading)throw Error('Preparation heading not found');
 heading.replaceChildren(document.createTextNode('마법 탐험 설정'));
 const layout=make('div','preparation-v3-fields');
 const byId=id=>fields[id]?.parentElement;
 const radio=name=>left.querySelector('input[name="'+name+'"]')?.closest('fieldset');
 function place(node,wide=false){
  if(!node)return;
  const item=make('div','preparation-v3-item'+(wide?' preparation-v3-wide':''));
  item.append(node);layout.append(item);
 }
 place(byId('setup-pack'));
 place(radio('lesson-minutes'));
 place(byId('team-count'));
 place(byId('members-per-team'));
 place(radio('confirmation'),true);
 place(radio('participation'),true);
 place(byId('timer-seconds'));
 place(byId('setup-slot'));
 place(byId('expedition-name'));
 place(byId('expedition-seed'));
 place(byId('setup-pack-file'),true);
 const status=left.querySelector('#setup-pack-status');
 // Keep preexisting empty-slot warning and archive action accessible.
 const leftovers=[...left.children].filter(e=>e!==heading&&e!==status&&e.tagName!=='DETAILS'&&e.className!=='preparation-pair');
 left.replaceChildren(heading,layout,...leftovers);
 if(status)left.append(status);
 grid.classList.add('preparation-v3');
 right.replaceChildren(make('h2',null,'탐험 준비 현황'));
 const list=make('dl','preparation-v3-summary');right.append(list);
 const note=make('p','preparation-v3-note','실제 문제팩 및 슬롯 상태를 확인한 후 시작할 수 있습니다.');right.append(note);
 const getChoice=name=>left.querySelector('input[name="'+name+'"]:checked')?.value;
 const add=(label,val)=>{const row=make('div','preparation-v3-summary-row');row.append(make('dt',null,label),make('dd',null,val));list.append(row);};
 const update=()=>{
  list.replaceChildren();
  const pack=fields['setup-pack']?.value==='file'?'가져온 JSON 문제팩':'기본 문제팩 · 60문항';
  const team=Number(fields['team-count']?.value||6),people=Number(fields['members-per-team']?.value||4);
  add('문제팩',pack);
  add('탐험 시간',(getChoice('lesson-minutes')||45)+'분');
  add('모둠',team+'모둠 · '+(team*people)+'명');
  add('진행 확인',({CAREFUL:'꼼꼼 확인',STANDARD:'기본 확인',QUICK:'간편 진행'})[getChoice('confirmation')]||'기본 확인');
  add('참여',getChoice('participation')==='COOPERATIVE'?'완전 협동':'순환 + 가로채기');
  add('문제 타이머',Number(fields['timer-seconds']?.value)===0?'끔':fields['timer-seconds']?.value+'초');
  add('공동 체력','♥ 8');
  add('저장 슬롯',fields['setup-slot']?.selectedOptions[0]?.textContent||'-');
 };
 grid.addEventListener('change',update);
 grid.addEventListener('input',update);
 update();
}
