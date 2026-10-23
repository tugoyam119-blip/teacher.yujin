import {validateQuestionPack} from '../src/questions/engine.js';
import {paintPreparation} from './preparation-v4-art.js';
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const confirmationText={CAREFUL:'수업 시작·지역 진입·문제 타이머 시작을 각각 확인합니다.',STANDARD:'지역 진입에 수업 시작을 포함하고, 문제 타이머는 따로 시작합니다.',QUICK:'교사의 지역·첫 문제 시작 확인으로 수업·지역·첫 출제·첫 타이머를 연결합니다.'};
const confirmationLabel={CAREFUL:'꼼꼼 확인',STANDARD:'기본 확인',QUICK:'간편 진행'};
export async function renderPreparation({body,slots,button,onStart,onArchive,isCurrent}){
 const panel=body.closest('dialog');
 // Only this popup uses the new art; other popup presentation stays untouched.
 paintPreparation(panel.querySelector('.preparation-art')).catch(()=>{if(isCurrent())panel.classList.add('preparation-art-failed');});
 const grid=node('div',undefined,'preparation-grid'),left=node('section',undefined,'settings'),right=node('section',undefined,'summary');
 right.id='preparation-summary';right.setAttribute('aria-live','polite');
 const nav=node('nav',undefined,'group-nav');nav.setAttribute('aria-label','설정 위치 이동');
 const scroll=node('div',undefined,'settings-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','전체 설정, 아래로 스크롤');
 const note=node('div',undefined,'scroll-note'),noteText=node('span'),arrow=node('span');note.append(noteText,arrow);left.append(nav,scroll,note);grid.append(left,right);body.append(grid);
 const groups={},fields={};
 for(const [key,title] of [['class','수업 구성'],['method','진행 방법'],['save','저장 정보']]){
  const section=node('section',undefined,'group');section.id='group-'+key;section.append(node('h3',`${Object.keys(groups).length+1}`.padStart(2,'0')+' · '+title));const content=node('div',undefined,'fields');section.append(content);scroll.append(section);groups[key]={section,content};
  const b=node('button',title+' ↓');b.type='button';b.dataset.jump=key;b.addEventListener('click',()=>jump(section));nav.append(b);
 }
 function jump(element){scroll.scrollTop+=element.getBoundingClientRect().top-scroll.getBoundingClientRect().top;scrollNote();}
 function scrollNote(){const end=groups.save.section.getBoundingClientRect().bottom<=scroll.getBoundingClientRect().bottom+2;noteText.textContent=end?'설정 목록의 끝입니다':'아래로 이어지는 설정이 있습니다';arrow.textContent=end?'✓':'↓';let active='class';for(const key of Object.keys(groups))if(groups[key].section.getBoundingClientRect().top<=scroll.getBoundingClientRect().top+50)active=key;if(end)active='save';for(const b of nav.children)b.classList.toggle('active',b.dataset.jump===active);}
 scroll.addEventListener('scroll',scrollNote);
 function select(parent,id,title,options,value){const row=node('label',undefined,'field');row.append(node('span',title,'label'));const e=node('select');e.id=id;for(const [v,t] of options){const o=node('option',t);o.value=v;o.selected=String(v)===String(value);e.append(o);}row.append(e);parent.append(row);fields[id]=e;return e;}
 function input(parent,id,title,value,wide=false){const row=node('label',undefined,'field'+(wide?' wide':''));row.append(node('span',title,'label'));const e=node('input');e.id=id;e.value=value;row.append(e);parent.append(row);fields[id]=e;return e;}
 function choices(parent,id,title,options,value,helpId){const field=node('fieldset',undefined,'field wide');field.append(node('legend',title,'label'));const list=node('div',undefined,'options');for(const [v,t] of options){const label=node('label',undefined,'option'),radio=node('input');radio.type='radio';radio.name=id;radio.value=v;radio.checked=v===value;label.append(radio,node('span',t));list.append(label);}field.append(list);if(helpId){const help=node('p',undefined,'help');help.id=helpId;field.append(help);}parent.append(field);return field;}
 const packField=node('div',undefined,'field wide'),packCard=node('div',undefined,'pack-card'),packCopy=node('div',undefined,'pack-copy');
 // The native select also provides a way back to the built-in pack after a failed import.
 const pack=select(packCopy,'setup-pack','문제팩',[['builtin','통합사회2 · 인권 보장과 헌법'],['file','가져온 JSON 문제팩']],'builtin');pack.setAttribute('aria-label','문제팩');
 const packMeta=node('div','60문항','pack-meta');packCopy.append(packMeta);
 const loadButton=node('button','파일 불러오기','load-pack');loadButton.type='button';
 const file=node('input');file.type='file';file.id='setup-pack-file';file.accept='.json,application/json';file.hidden=true;file.setAttribute('aria-label','문제팩 JSON 파일');
 loadButton.addEventListener('click',()=>file.click());
 const packStatus=node('p','문제팩 확인 중…','pack-detail');packStatus.id='setup-pack-status';packStatus.tabIndex=-1;
 packCard.append(packCopy,loadButton);packField.append(packCard,file,packStatus);groups.class.content.append(packField);
 choices(groups.class.content,'lesson-minutes','탐험 활동 시간',[['25','25분'],['45','45분'],['60','60분']],'45').classList.add('duration-field');
 const teams=select(groups.class.content,'team-count','모둠 수',Array.from({length:7},(_,i)=>[i+2,`${i+2}모둠`]),6);
 const members=select(groups.class.content,'members-per-team','모둠당 인원',Array.from({length:10},(_,i)=>[i+1,`${i+1}명`]),4);
 groups.class.section.append(node('p','활동 시간과 문제 타이머는 별개입니다.\n시간이 되어도 자동 종료·자동 채점하지 않습니다.','help'));
 choices(groups.method.content,'confirmation','진행 확인',Object.entries(confirmationLabel),'STANDARD','confirm-help');
 choices(groups.method.content,'participation','학생 참여',[['ROTATION','순환 + 가로채기'],['COOPERATIVE','완전 협동']],'ROTATION','participate-help');
 const timer=select(groups.method.content,'timer-seconds','문제 타이머',[45,60,90,120,0].map(n=>[n,n?`${n}초`:'끔']),60);timer.parentElement.classList.add('timer-field');
 groups.method.content.append(node('p','문제마다 적용 · 시간 만료가 자동 오답은 아닙니다.','help timer-help'));
 const empty=slots.findIndex(s=>!s.state)+1;
 const slot=select(groups.save.content,'setup-slot','저장 슬롯',slots.map((s,i)=>[i+1,`슬롯 ${['I','II','III'][i]} · ${s.state?'사용 중':'비어 있음'}`]),empty||1);
 [...slot.options].forEach((o,i)=>{o.disabled=!!slots[i].state;});
 const name=input(groups.save.content,'expedition-name','탐험 이름','새로운 탐험');name.maxLength=80;
 const seed=input(groups.save.content,'expedition-seed','재현 코드(Seed) · 선택 입력','',true);seed.maxLength=64;seed.placeholder='비우면 자동 생성';
 groups.save.section.append(node('p','사용 중인 슬롯에는 덮어쓰지 않습니다.\n재현 코드만으로 같은 결과가 보장되지는 않습니다.','help'));
 if(!empty){groups.save.section.append(node('p','슬롯이 모두 찼습니다. 기존 탐험을 보관한 뒤 시작해 주세요.','help'));button(groups.save.section,'탐험 보관함 열기',onArchive);}
 right.append(node('h2','이번 탐험'));const summaryContent=node('div',undefined,'summary-content'),summaryPack=node('p',undefined,'summary-pack'),stats=node('p',undefined,'summary-stats'),list=node('dl');summaryContent.append(summaryPack,stats,list,node('p','기본 규칙 · 공동 체력 ♥ 8','health'));right.append(summaryContent);
 const status=document.getElementById('panel-message');status.replaceChildren();const statusText=node('span');statusText.id='status-text';const errorJump=node('button','확인 →');errorJump.id='error-jump';errorJump.type='button';status.append(statusText,errorJump);
 const value=id=>body.querySelector(`input[name="${id}"]:checked`).value;
 let chosen=null,token=0,loading=true,packError='',packTitle='통합사회2 · 인권 보장과 헌법',target=null,start;
 function validation(){if(loading)return {message:'문제팩 확인 중…'};if(!chosen)return {message:packError||'문제팩을 선택해 주세요.',element:packStatus};if(!empty||slots[Number(slot.value)-1]?.state)return {message:'빈 저장 슬롯을 선택해 주세요.',element:slot};if(!name.value.trim())return {message:'탐험 이름을 입력해 주세요.',element:name};return null;}
 function update(){
  body.querySelector('#confirm-help').textContent=confirmationText[value('confirmation')];body.querySelector('#participate-help').textContent=value('participation')==='COOPERATIVE'?'대표 순환·회수 유지 · 가로채기 없음':'모둠·대표 순환 · 가로채기·회수 사용';
  summaryPack.textContent=packTitle;summaryPack.title=packTitle;stats.textContent=`${value('lesson-minutes')}분 · ${teams.value}모둠 · ${Number(teams.value)*Number(members.value)}명`;
  list.replaceChildren();for(const [label,text] of [['진행 확인',confirmationLabel[value('confirmation')]],['학생 참여',value('participation')==='COOPERATIVE'?'완전 협동':'순환 + 가로채기'],['문제 타이머',Number(timer.value)?timer.value+'초':'끔'],['저장 위치',slot.selectedOptions[0].textContent.replace('슬롯 ','')]]){const row=node('div');row.append(node('dt',label),node('dd',text));list.append(row);}
  const problem=validation();statusText.textContent=problem?.message||'탐험을 시작할 준비가 되었습니다.';target=problem?.element;errorJump.hidden=!target;status.classList.toggle('has-error',!!target);name.setAttribute('aria-invalid',String(!name.value.trim()));if(start)start.disabled=loading;scrollNote();
 }
 errorJump.addEventListener('click',()=>{if(!target)return;jump(target.closest('.group'));target.focus({preventScroll:true});});
 grid.addEventListener('preparation-error',event=>{statusText.textContent=event.detail;errorJump.hidden=true;status.classList.add('has-error');});
 grid.addEventListener('change',update);grid.addEventListener('input',update);
 async function load(){const current=++token;chosen=null;loading=true;packError='';packStatus.textContent='문제팩 확인 중…';packStatus.classList.remove('has-error');update();try{let raw;if(pack.value==='builtin'){const r=await fetch('../data/YQBank_60_v1.0.0_source.json');if(!r.ok)throw Error('기본 문제팩을 읽지 못했습니다.');raw=await r.json();}else{const f=file.files[0];if(!f)throw Error('JSON 파일을 선택하세요.');if(f.size>2*1024*1024)throw Error('파일은 2MiB 이하여야 합니다.');raw=JSON.parse(await f.text());}const info=validateQuestionPack(raw);if(current!==token||!isCurrent())return;chosen=raw;packTitle=raw.pack.title||info.packId;pack.title=packTitle;pack.options[pack.selectedIndex].textContent=packTitle;packMeta.textContent=`${info.count}문항 · 검증 완료`;packStatus.textContent=`${packTitle} · v${info.packVersion} · ${info.count}문항 · 검증 완료`;packStatus.classList.add('valid');}catch(e){if(current!==token||!isCurrent())return;packError='문제팩을 확인해 주세요.';packTitle=pack.value==='file'?'JSON 문제팩 확인 필요':'기본 문제팩 확인 필요';packMeta.textContent='검증 필요';packStatus.textContent=`문제팩 확인 실패: ${e.message}`;packStatus.classList.remove('valid');packStatus.classList.add('has-error');}finally{if(current===token&&isCurrent()){loading=false;update();}}}
 pack.addEventListener('change',load);file.addEventListener('change',()=>{if(file.files.length){pack.value='file';load();}});
 const controls=node('div');button(controls,'돌아가기',()=>panel.close(),'cancel');
 start=button(controls,'탐험 시작',async()=>{const problem=validation();if(problem){update();if(problem.element){jump(problem.element.closest('.group'));problem.element.focus({preventScroll:true});}return;}await onStart({slot:Number(slot.value),expeditionName:name.value.trim(),teamCount:Number(teams.value),timerSeconds:Number(timer.value),sourcePack:chosen,preparation:{version:1,lessonMinutes:Number(value('lesson-minutes')),confirmation:value('confirmation'),participation:value('participation'),membersPerTeam:Number(members.value),seed:seed.value}});},'primary');
 update();await load();return controls;
}
