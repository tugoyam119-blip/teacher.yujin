import {openEngineDatabase} from '../src/storage/indexeddb.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {makeBackup} from '../src/storage/backup.js';

const $=id=>document.getElementById(id);
const ASSET='../assets/home/assembly/';
const TEST_DB='moonpath-v411-phase29-smoke-db-v1';
const roman=['I','II','III'];
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
let database,slots=[],busy=false;

// Display-only crops: originals stay byte-identical; the scale is uniform on both axes.
function crop(target,src,[x,y,w,h],width,height){
 const scale=Math.min(width/w,height/h),img=new Image();img.src=src;img.alt='';
 Object.assign(img.style,{width:`${scale*Number(target.dataset.sourceWidth)}px`,height:'auto',left:`${(width-w*scale)/2-x*scale}px`,top:`${(height-h*scale)/2-y*scale}px`});
 target.append(img);
}
function cropped(src,rect,size,sourceWidth){const e=node('span');e.className='crop';e.dataset.sourceWidth=sourceWidth;crop(e,src,rect,...size);return e;}
$('character').dataset.sourceWidth=1672;crop($('character'),ASSET+'character-original.png',[43,264,760,650],311,263);
$('slogan').dataset.sourceWidth=2172;crop($('slogan'),'../assets/home/logo/logo_slogan.png',[130,282,1913,152],232,24);
const actions=[
 {id:'new',title:'새로운 탐험',description:'새로운 이야기를 시작해요',rect:[733,125,208,66],icon:[1204,221,115,113]},
 {id:'continue',title:'이어하기',description:'이어진 여정을 계속해요',rect:[733,203,208,65],icon:[1214,378,103,84]},
 {id:'journal',title:'탐험 일지',description:'함께한 여정을 살펴봐요',rect:[733,280,208,65],icon:[1212,637,100,100]},
 {id:'settings',title:'설정',description:'저장 기록을 안전하게 관리해요',rect:[733,357,208,65],icon:[1214,510,100,87]},
 {id:'records',title:'기록',rect:[749,440,48,55],icon:[1214,800,60,58]},
 {id:'help',title:'도움말',rect:[812,440,48,55],icon:[1373,804,65,50]},
 {id:'exit',title:'나가기',rect:[877,440,48,55],icon:[1543,805,65,52]}
];
for(const a of actions){
 const [x,y,w,h]=a.rect,sub=!a.description,b=node('button');b.type='button';b.id=`menu-${a.id}`;b.className=`menu-button${sub?' sub':''}`;b.setAttribute('aria-label',a.title);
 Object.assign(b.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
 const frame=cropped(ASSET+(sub?'sub-frame-original.png':'main-frame-original.png'),sub?[81,167,1009,967]:[38,109,2098,498],[w,h],sub?1173:2172);frame.classList.add('frame');b.append(frame);
 const icon=cropped(ASSET+'ui-source-original.png',a.icon,sub?[24,24]:[40,40],1672);icon.classList.add('icon');b.append(icon,node('strong',a.title));
 if(a.description)b.append(node('small',a.description));
 b.addEventListener('click',()=>openPanel(a.id).catch(report));$(sub?'submenus':'menus').append(b);
}
function resize(){const scale=Math.min(innerWidth/960,innerHeight/540);$('stage').style.transform=`translate(-50%,-50%) scale(${scale})`;}
addEventListener('resize',resize);resize();
function report(e){const text=`처리하지 못했습니다: ${e.code??''} ${e.message??e}`;($('panel-message')??$('message')).textContent=text;}
async function refresh(){
 if(!database)database=await openEngineDatabase({open(_name,version){return indexedDB.open(TEST_DB,version);}});
 slots=await Promise.all([1,2,3].map(slot=>database.read(slot)));
}
function selected(){return Number(document.querySelector('input[name="slot"]:checked')?.value??1);}
function slotPicker(body){
 const field=node('fieldset'),legend=node('legend','탐험 슬롯');field.append(legend);const list=node('div');list.className='slots';
 slots.forEach((item,i)=>{const label=node('label');label.className='slot';const input=node('input');input.type='radio';input.name='slot';input.value=i+1;input.checked=i===0;
 label.append(input,node('strong',`슬롯 ${roman[i]}`));const s=item.state;
 label.append(node('small',s?`${s.teams.length}모둠 · 별빛 ${s.rewards.starlight} · 열쇠 ${s.rewards.keys}`:'비어 있음'));
 if(s)label.append(node('small',`저장 ${new Date(s.meta.updatedAt).toLocaleString('ko-KR')}${item.needsRepair?' · 복구 점검 필요':''}`));
 list.append(label);});field.append(list);body.append(field);
}
function button(parent,text,fn){const b=node('button',text);b.type='button';b.addEventListener('click',async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();}catch(e){report(e);}finally{busy=false;b.disabled=false;}});parent.append(b);return b;}
function game(slot){const target=new URL('../dist/phase2-9-one-region-smoke.html',location.href);target.searchParams.set('home','b');target.searchParams.set('slot',slot);location.assign(target.href);}
async function openPanel(kind){
 const panel=$('panel'),body=$('panel-body');body.replaceChildren();$('panel-title').textContent=actions.find(a=>a.id===kind)?.title??'HOME B 조립 상태';
 if(!panel.open)panel.showModal();
 if(['new','continue','journal','settings','records'].includes(kind)){
  body.append(node('p','v4.1.1 개발용 탐험입니다. 기존 HOME 저장 기록과 분리되어 있습니다.'));
  await refresh();slotPicker(body);
 }
 const controls=node('div');controls.className='actions';
 if(kind==='new'){
  const label=node('label','모둠 수 '),select=node('select');select.id='team-count';for(let n=2;n<=8;n++){const o=node('option',`${n}모둠`);o.value=n;o.selected=n===4;select.append(o);}label.append(select);controls.append(label);
  button(controls,'새 탐험 시작',async()=>{
   const slot=selected();if(slots[slot-1].state)throw new Error('기존 탐험이 있는 슬롯입니다. 빈 슬롯을 골라 주세요.');
   const response=await fetch('../config/world.json');if(!response.ok)throw new Error('세계 설정을 읽지 못했습니다.');const world=await response.json();
   const teacher=new TeacherEngineSession(database);
   try{await teacher.create({slot,world,teamCount:Number(select.value)});await teacher.dispatch('SESSION_STARTED',{sessionId:crypto.randomUUID()});await teacher.enterRegion('T1-R1');}finally{await teacher.close();}
   game(slot);
  });body.append(node('p','확인하면 새 탐험을 저장한 뒤, 현재 구현된 지역 시험 화면으로 이동합니다.'));
 }else if(kind==='continue'){
  button(controls,'선택한 탐험 이어하기',async()=>{const slot=selected();if(!slots[slot-1].state)throw new Error('저장된 탐험이 없는 슬롯입니다.');game(slot);});
  body.append(node('p','저장된 문항과 남은 시간을 복원합니다. 수업과 타이머는 교사가 직접 재개합니다.'));
 }else if(kind==='settings'){
  button(controls,'선택 슬롯 JSON 백업',async()=>{
   const data=await database.readConsistentForBackup(selected()),backup=await makeBackup(data,{exportedAt:Date.now()});
   const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=`moonpath-v411-slot-${selected()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);$('panel-message').textContent='JSON 백업 파일을 만들었습니다.';
  });
  const label=node('label','복원할 JSON '),input=node('input');input.type='file';input.accept='.json,application/json';input.id='backup-file';label.append(input);body.append(label);
  button(controls,'빈 슬롯에 JSON 복원',async()=>{
   const file=input.files[0];if(!file)throw new Error('복원할 JSON 파일을 먼저 골라 주세요.');
   const slot=selected();if(slots[slot-1].state)throw new Error('기존 탐험이 있는 슬롯은 덮어쓰지 않습니다.');
   const teacher=new TeacherEngineSession(database);try{await teacher.restoreJSONToEmptySlot(slot,await file.text());}finally{await teacher.close();}
   await openPanel('settings');$('panel-message').textContent='백업을 복원했습니다. 자동으로 수업을 재개하지 않습니다.';
  });
  body.append(node('p','백업과 같은 번호의 빈 슬롯에만 복원합니다. 기존 탐험은 삭제하거나 덮어쓰지 않습니다.'));
 }else if(kind==='journal'||kind==='records'){
  button(controls,'선택한 기록 보기',()=>{
   const s=slots[selected()-1].state;if(!s)throw new Error('저장된 탐험이 없는 슬롯입니다.');
   $('panel-message').textContent=`슬롯 ${roman[selected()-1]}\n출제 ${s.questions.draws.length}문항 · 별빛 ${s.rewards.starlight} · 열쇠 ${s.rewards.keys}\n회수 완료 ${s.recovery.resolved.length}건\n${s.teams.map(t=>t.name).join(' · ')}`;
  });body.append(node('p','현재는 저장된 탐험 요약을 제공합니다. 상세 탐험 일지와 PDF·CSV 출력은 후속 구현 항목입니다.'));
 }else if(kind==='help'){
  body.append(node('p','새로운 탐험에서 빈 슬롯과 모둠 수를 고르세요. 이어하기에서는 저장한 슬롯을 엽니다. 설정에서 JSON을 백업하고 복원할 수 있습니다.'));
  body.append(node('p','지역 시험 화면에서 수업 재개와 타이머 재개는 각각 교사가 직접 실행합니다.'));
 }else if(kind==='exit'){
  body.append(node('p','보존된 이전 HOME을 엽니다. 저장 기록은 유지합니다.'));button(controls,'이전 HOME 열기',()=>location.assign('../../moonpath-dev/index.html'));
 }else{
  body.append(node('p','이전 대화에서 회수한 PNG를 독립 레이어로 조립했습니다. 승인 로고·슬로건 원본은 유지했습니다.'));
  body.append(node('p','배경·캐릭터·프레임·아이콘은 제작 후보를 연결한 검토용 조립 상태입니다. 최종 화면 승인, 전체 게임, 오프라인 출시는 완료되지 않았습니다.'));
 }
 body.append(controls);const message=node('p');message.id='panel-message';message.setAttribute('role','status');body.append(message);
}
$('close-panel').addEventListener('click',()=>{if(!busy)$('panel').close();});
$('panel').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('review-note').addEventListener('click',()=>openPanel('review').catch(report));
addEventListener('pageshow',()=>{busy=false;});
