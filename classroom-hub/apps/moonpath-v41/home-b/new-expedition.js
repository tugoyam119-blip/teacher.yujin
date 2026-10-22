import {validateQuestionPack} from '../src/questions/engine.js';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export async function renderPreparation({body,slots,button,onStart,onArchive,isCurrent}){
 const grid=node('div'),left=node('section'),right=node('section');grid.className='preparation-grid';left.className='preparation-settings';right.className='preparation-summary';grid.append(left,right);body.append(grid);
 const heading=node('h2','새로운 탐험');heading.append(node('small','설정 더 보기 ↓'));left.append(heading);right.append(node('h2','이번 탐험'));
 const fields={};
 function select(parent,id,label,options,value){const row=node('label',label),e=node('select');e.id=id;for(const [v,t]of options){const o=node('option',t);o.value=v;o.selected=String(v)===String(value);e.append(o);}row.append(e);parent.append(row);fields[id]=e;return e;}
 function input(parent,id,label,value,type='text'){const row=node('label',label),e=node('input');e.id=id;e.type=type;e.value=value;row.append(e);parent.append(row);fields[id]=e;return e;}
 function choices(id,title,options,value){const field=node('fieldset');field.append(node('legend',title));const group=node('div');group.className='preparation-options';for(const [v,t]of options){const label=node('label'),radio=node('input');radio.type='radio';radio.name=id;radio.value=v;radio.checked=v===value;label.append(radio,node('span',t));group.append(label);}field.append(group);left.append(field);}
 const top=node('div');top.className='preparation-pair';
 const name=input(top,'expedition-name','탐험 이름','새로운 탐험');name.maxLength=80;
 const empty=slots.findIndex(x=>!x.state)+1;
 const slot=select(top,'setup-slot','빈 슬롯',slots.map((s,i)=>[i+1,`슬롯 ${['I','II','III'][i]} · ${s.state?'사용 중':'비어 있음'}`]),empty||1);[...slot.options].forEach((o,i)=>o.disabled=!!slots[i].state);
 if(!empty){left.append(node('p','슬롯이 모두 찼습니다. 보관함에서 기존 탐험을 보관해 주세요.'));button(left,'탐험 보관함 열기',onArchive);}
 const pack=select(left,'setup-pack','문제팩',[['builtin','통합사회2 · 인권 보장과 헌법'],['file','JSON 문제팩 불러오기']],'builtin');
 const file=input(left,'setup-pack-file','문제팩 JSON 파일','','file');file.accept='.json,application/json';file.parentElement.hidden=true;
 const status=node('p','문제팩 확인 중…');status.id='setup-pack-status';status.setAttribute('role','status');left.append(status);
 choices('lesson-minutes','탐험 시간',[['25','QUICK · 25분'],['45','STANDARD · 45분'],['60','LONG · 60분']],'45');
 choices('confirmation','진행 확인',[['CAREFUL','꼼꼼 확인'],['STANDARD','기본 확인'],['QUICK','간편 진행']],'STANDARD');
 choices('participation','학생 참여',[['ROTATION','순환 + 가로채기'],['COOPERATIVE','완전 협동']],'ROTATION');
 const people=node('div');people.className='preparation-pair';left.append(people);
 select(people,'team-count','모둠 수',Array.from({length:7},(_,i)=>[i+2,`${i+2}모둠`]),6);
 select(people,'members-per-team','모둠당 인원',Array.from({length:10},(_,i)=>[i+1,`${i+1}명`]),4);
 const seed=input(left,'expedition-seed','Seed','','text');seed.maxLength=64;seed.placeholder='비워두면 자동 생성';
 const more=node('details');more.append(node('summary','슬롯 · 탐험 이름 · 문제 시간'),top);left.append(more);
 select(more,'timer-seconds','문제 제한 시간',[45,60,90,120,0].map(n=>[n,n?`${n}초`:'끔']),60);
 more.append(node('p','활동 시간만 계산하며 일시정지 시간은 제외합니다. 시간이 되면 교사가 이번 문항 후 마무리를 선택합니다. 공동 체력 ♥8, 지역 최초 완료 열쇠 +1(비소모). 기존 탐험에는 새 규칙을 적용하지 않습니다.'));
 const explanation=node('p'),tiles=node('div'),repeat=node('p');tiles.className='preparation-tiles';tiles.id='preparation-summary';tiles.setAttribute('aria-live','polite');right.append(explanation,tiles,repeat);
 let chosen=null,token=0;
 const value=id=>body.querySelector(`input[name="${id}"]:checked`).value;
 function update(){const minutes=value('lesson-minutes'),mode=value('participation');explanation.textContent={CAREFUL:'지역 진입·수업 시작·문제 타이머를 각각 확인합니다.',STANDARD:'지역 진입과 수업 시작을 함께 확인합니다. 문제 타이머는 따로 시작합니다.',QUICK:'교사의 지역·첫 문제 시작 한 번으로 수업과 첫 타이머를 함께 시작합니다.'}[value('confirmation')];tiles.replaceChildren();for(const [label,text]of [['탐험 시간',`${minutes}분`],['공동 체력','♥ 8'],['학생 참여',mode==='COOPERATIVE'?'완전 협동':'순환 + 가로채기'],['참여 인원',`${fields['team-count'].value}모둠 × ${fields['members-per-team'].value}명`]]){const tile=node('div');tile.append(node('small',label),node('strong',text));tiles.append(tile);}repeat.textContent=`${mode==='COOPERATIVE'?'가로채기 없이 대표를 순환하며 오답을 회수합니다.':'대표를 순환하며 가로채기와 오답 회수를 사용합니다.'} 같은 Seed·문제팩·규칙·선택이면 같은 문항 순서를 재현합니다.`;}
 grid.addEventListener('change',update);update();
 async function load(){const current=++token;chosen=null;file.parentElement.hidden=pack.value!=='file';try{let raw;if(pack.value==='builtin'){const r=await fetch('../data/YQBank_60_v1.0.0_source.json');if(!r.ok)throw new Error('기본 문제팩을 읽지 못했습니다.');raw=await r.json();}else{const f=file.files[0];if(!f){status.textContent='JSON 파일을 선택하세요.';return;}if(f.size>2*1024*1024)throw new Error('파일은 2MiB 이하여야 합니다.');raw=JSON.parse(await f.text());}const info=validateQuestionPack(raw);if(current!==token||!isCurrent())return;chosen=raw;status.textContent=`${raw.pack.title||info.packId} · v${info.packVersion} · ${info.count}문항 · 검증 완료`;}catch(e){if(current===token&&isCurrent())status.textContent=`문제팩 확인 실패: ${e.message}`;}}
 pack.addEventListener('change',load);file.addEventListener('change',load);
 const controls=node('div');button(controls,'돌아가기',()=>document.getElementById('panel').close(),'cancel');
 button(controls,'탐험 시작',async()=>{if(!empty||slots[Number(slot.value)-1].state)throw new Error('빈 슬롯을 선택하세요.');if(!chosen)throw new Error('검증된 문제팩을 선택하세요.');if(!name.value.trim())throw new Error('탐험 이름을 입력하세요.');await onStart({slot:Number(slot.value),expeditionName:name.value.trim(),teamCount:Number(fields['team-count'].value),timerSeconds:Number(fields['timer-seconds'].value),sourcePack:chosen,preparation:{version:1,lessonMinutes:Number(value('lesson-minutes')),confirmation:value('confirmation'),participation:value('participation'),membersPerTeam:Number(fields['members-per-team'].value),seed:seed.value}});},'primary');
 await load();return controls;
}
