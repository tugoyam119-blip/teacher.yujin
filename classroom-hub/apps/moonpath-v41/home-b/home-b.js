import {renderPreparation} from './new-expedition.js';
import {openEngineDatabase} from '../src/storage/indexeddb.js?v=2-archive';
import {TeacherEngineSession} from '../src/engine/session.js';
import {makeBackup} from '../src/storage/backup.js';
import {expeditionJournal,journalCsv,decisionLabel} from '../src/world/journal.js';


import {setupPopup,beginPanel,finishPanel,decorateButton} from './popup-ui.js?v=20261022-popup-v2';

const $=id=>document.getElementById(id);
setupPopup();
const ASSET='../assets/home/assembly/';
const TEST_DB='moonpath-v411-phase29-smoke-db-v1';
const roman=['I','II','III'];
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
let database,slots=[],busy=false,selectedSlot=1,panelRequest=0;

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
 const icon=cropped(`../assets/home/icons-alpha-v1/${a.id}.png`,[0,0,a.icon[2],a.icon[3]],sub?[24,24]:[40,40],a.icon[2]);icon.classList.add('icon');b.append(icon,node('strong',a.title));
 if(a.description)b.append(node('small',a.description));
 b.addEventListener('click',()=>openPanel(a.id,null,b).catch(report));$(sub?'submenus':'menus').append(b);
}
function resize(){const scale=Math.min(innerWidth/960,innerHeight/540);$('stage').style.transform=`translate(-50%,-50%) scale(${scale})`;document.documentElement.style.setProperty('--popup-scale',String(scale));}
addEventListener('resize',resize);resize();
function report(e){const text=`처리하지 못했습니다: ${e.code??''} ${e.message??e}`;const target=$('panel').open?$('panel-message'):$('message');const preparation=$('panel').open&&$('panel').classList.contains('preparation')&&$('panel-body').querySelector('.preparation-grid');if(preparation)preparation.dispatchEvent(new CustomEvent('preparation-error',{detail:text}));else target.textContent=text;}
async function refresh(){
 if(!database)database=await openEngineDatabase({open(_name,version){return indexedDB.open(TEST_DB,version);}});
 slots=await Promise.all([1,2,3].map(slot=>database.read(slot)));
}
function selected(){return Number(document.querySelector('input[name="slot"]:checked')?.value??1);}
function slotPicker(body){
 const field=node('fieldset'),legend=node('legend','탐험 슬롯');field.append(legend);const list=node('div');list.className='slots';
 slots.forEach((item,i)=>{const label=node('label');label.className='slot';const input=node('input');input.type='radio';input.name='slot';input.value=i+1;input.checked=i+1===selectedSlot;input.addEventListener('change',()=>{selectedSlot=i+1;});
 label.append(input,node('strong',`슬롯 ${roman[i]}`));const s=item.state;
 label.append(node('small',s?`${s.teams.length}모둠 · 별빛 ${s.rewards.starlight} · 열쇠 ${s.rewards.keys}`:'비어 있음'));
 if(s?.meta.expeditionName)label.append(node('small',s.meta.expeditionName));
 if(s)label.append(node('small',`저장 ${new Date(s.meta.updatedAt).toLocaleString('ko-KR')}${item.needsRepair?' · 복구 점검 필요':''}`));
 list.append(label);});field.append(list);body.append(field);
}
function button(parent,text,fn,variant='secondary'){const b=node('button',text);b.type='button';decorateButton(b,text,variant);b.addEventListener('click',async()=>{if(busy)return;busy=true;$('panel').setAttribute('aria-busy','true');const controls=[...$('panel').querySelectorAll('button,input,select')].map(e=>[e,e.disabled]);controls.forEach(([e])=>{e.disabled=true;});try{await fn();}catch(e){report(e);}finally{busy=false;$('panel').removeAttribute('aria-busy');controls.forEach(([e,disabled])=>{if(e.isConnected)e.disabled=disabled;});}});parent.append(b);return b;}
function game(slot){const target=new URL('../journey/',location.href);target.searchParams.set('slot',slot);location.assign(target.href);}
function download(text,type,filename){const url=URL.createObjectURL(new Blob([text],{type}));const a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function table(parent,title,headers,rows){
 parent.append(node('h2',title));if(!rows.length){parent.append(node('p','아직 기록이 없습니다.'));return;}
 const wrap=node('div'),t=node('table'),head=node('thead'),tr=node('tr');wrap.className='journal-table';
 headers.forEach(h=>{const th=node('th',h);th.scope='col';tr.append(th);});head.append(tr);t.append(head);const body=node('tbody');
 rows.forEach(row=>{const tr=node('tr');row.forEach(v=>tr.append(node('td',String(v??''))));body.append(tr);});t.append(body);wrap.append(t);parent.append(wrap);
}
function showJournal(target,report){
 target.replaceChildren(node('h2',report.name),node('p',`출제 ${report.totals.issued} · 정답 ${report.totals.correct} · 오답 ${report.totals.incorrect} · 판정 대기 ${report.totals.pending}`),
  node('p',`별빛 ${report.starlight} · 열쇠 ${report.keys} · 회수 대기 ${report.recoveryPending} · 회수 완료 ${report.recoveryResolved}`));
 table(target,'차시별 기록',['차시','상태','활동 시간(분)','출제','정답','오답','대기'],report.sessions.map(s=>[s.number,s.phase,(s.activeMs/60000).toFixed(1),s.issued,s.correct,s.incorrect,s.pending]));
 target.append(node('p','활동 시간은 마지막 저장까지의 값입니다. 자동 채점 권고를 정답 확정으로 집계하지 않습니다.'));
 table(target,'모둠별 공헌도',['모둠','누적 공헌도'],report.teams.map(t=>[t.name,t.contribution]));
 target.append(node('p','모둠 순서는 원래 순서이며 순위가 아닙니다.'));
 table(target,'문항별 기록',['문항','지역','모둠','현재 교사 판정'],report.attempts.slice(-200).map(a=>[a.questionId,a.regionId,a.team,decisionLabel(a.decision)]));
 const details=node('details');details.append(node('summary',`교사용 변경 이력 · 판정 정정 ${report.corrections}건`));
 table(details,'저장된 감사 이력',['순번','유형','시각'],report.audit.slice(-100).map(a=>[a.seq,a.type,new Date(a.at).toLocaleString('ko-KR')]));target.append(details);
 target.append(node('p','화면에는 최근 문항 200개·감사 이력 100개까지 표시합니다. CSV에는 전체 기록을 포함합니다.'));
}
async function openPanel(kind,setup=null,trigger=null){
 const request=++panelRequest;
 const panel=$('panel'),body=$('panel-body');beginPanel(trigger);$('panel-title').textContent=actions.find(a=>a.id===kind)?.title??'HOME B 조립 상태';
 panel.classList.toggle('preparation',kind==='new');
 if(!panel.open)panel.showModal();
 if(kind==='new'){
  $('panel-title').textContent='새로운 탐험';await refresh();if(request!==panelRequest||!panel.open)return;
  const controls=await renderPreparation({body,slots,button,isCurrent:()=>request===panelRequest&&panel.open,onArchive:()=>openPanel('archive'),onStart:async config=>{
   const r=await fetch('../config/world.json');if(!r.ok)throw new Error('세계 설정을 읽지 못했습니다.');
   const world=await r.json(),teacher=new TeacherEngineSession(database);
   try{await teacher.create({...config,world,healthEnabled:true});await teacher.dispatch('WORLD_VIEW_OPENED',{view:'BOOKSHELF'});}finally{await teacher.close();}game(config.slot);
  }});if(request===panelRequest&&panel.open)finishPanel(controls);return;
 }
 if(['continue','journal','settings','records','archive'].includes(kind)){
  body.append(node('p','v4.1.1 개발용 탐험입니다. 기존 HOME 저장 기록과 분리되어 있습니다.'));
  await refresh();if(request!==panelRequest||!panel.open)return;slotPicker(body);
 }
 const controls=node('div');controls.className='actions';
 if(kind==='archive-confirm'){
  $('panel-title').textContent='탐험 보관 확인';
  body.append(node('p',`슬롯 ${roman[setup.slot-1]} · ${setup.name}을 보관함으로 옮깁니다. 문항·남은 시간·문제팩·이력은 보존하고 수업과 타이머를 일시정지합니다. 보관 저장이 완료된 뒤에만 슬롯이 비워집니다.`));
  button(controls,'이 탐험을 보관하고 슬롯 비우기',async()=>{
   await refresh();const found=slots[setup.slot-1].state;if(found?.meta.expeditionId!==setup.expeditionId||found.meta.revision!==setup.revision)throw new Error('탐험이 변경됐습니다. 보관함에서 다시 확인하세요.');
   const teacher=new TeacherEngineSession(database);try{await teacher.open(setup.slot);const s=teacher.getState();await database.archiveSlot(setup.slot,{archiveId:crypto.randomUUID(),expectedRevision:s.meta.revision,lease:teacher.lease});}finally{await teacher.close();}
   await openPanel('archive');$('panel-message').textContent='보관을 완료했습니다. 빈 슬롯에서 새로운 탐험을 시작할 수 있습니다.';
  },'primary');button(controls,'취소 · 보관함으로',()=>openPanel('archive'),'cancel');
 }else if(kind==='archive'){
  $('panel-title').textContent='탐험 보관함';
  body.append(node('p','보관하면 슬롯이 비워지고 기록은 이 브라우저에 남습니다. 복원은 기록의 원래 슬롯이 비어 있을 때 가능합니다. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에는 JSON도 백업하세요.'));
  const archiveActions=node('div');archiveActions.className='actions';body.append(archiveActions);
  button(archiveActions,'선택한 슬롯의 탐험 보관',async()=>{const slot=selected(),s=slots[slot-1].state;if(!s)throw new Error('선택한 슬롯은 이미 비어 있습니다.');await openPanel('archive-confirm',{slot,name:s.meta.expeditionName||`슬롯 ${roman[slot-1]} 탐험`,expeditionId:s.meta.expeditionId,revision:s.meta.revision});});
  button(archiveActions,'새로운 탐험 시작하기',()=>openPanel('new'));
  const entries=await database.listArchives();if(request!==panelRequest||!panel.open)return;
  const list=node('div');body.append(node('h2','보관한 탐험'),list);if(!entries.length)list.append(node('p','아직 보관한 탐험이 없습니다.'));
  for(const a of entries){const item=node('section');item.className='setup-advanced';const s=a.state;item.append(node('h3',s.meta.expeditionName||`슬롯 ${roman[a.slot-1]} 탐험`),node('p',`원래 슬롯 ${roman[a.slot-1]} · ${s.teams.length}모둠 · 별빛 ${s.rewards.starlight} · 열쇠 ${s.rewards.keys} · 보관 ${new Date(a.archivedAt).toLocaleString('ko-KR')}${a.restoredAt?' · 복원 완료':''}`));
   if(!a.restoredAt)button(item,`슬롯 ${roman[a.slot-1]}로 복원`,async()=>{const writerId=crypto.randomUUID(),lease=await database.acquireWriter(a.slot,writerId);try{await database.restoreArchive(a.key,{lease});}finally{await database.releaseWriter(a.slot,lease);}await openPanel('archive');$('panel-message').textContent='탐험을 복원했습니다. 이어하기에서 열어 주세요. 자동 재개하지 않습니다.';});
   button(item,'이 보관 기록 JSON 백업',async()=>{const backup=await makeBackup({state:s,events:a.events.map(x=>x.event).sort((x,y)=>x.seq-y.seq)},{exportedAt:Date.now()});download(JSON.stringify(backup,null,2),'application/json',`moonpath-archive-${a.key}.json`);$('panel-message').textContent='보관 기록 JSON 백업을 만들었습니다.';});list.append(item);
  }
 }else if(kind==='continue'){
  button(controls,'탐험 보관함 열기',()=>openPanel('archive'));
  button(controls,'선택한 탐험 이어하기',async()=>{const slot=selected();if(!slots[slot-1].state)throw new Error('저장된 탐험이 없는 슬롯입니다.');game(slot);},'primary');
  body.append(node('p','저장된 문항과 남은 시간을 복원합니다. 수업과 타이머는 교사가 직접 재개합니다.'));
 }else if(kind==='settings'){
  button(controls,'탐험 보관함 열기',()=>openPanel('archive'));
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
  const journal=node('section');journal.id='journal-report';
  const readReport=async()=>{const found=await database.read(selected());if(!found.state)throw new Error('저장된 탐험이 없는 슬롯입니다.');if(found.needsRepair)throw new Error('저장 기록 복구 점검이 먼저 필요합니다.');return expeditionJournal(found.state);};
  button(controls,'선택한 기록 보기',async()=>{const report=await readReport();showJournal(journal,report);$('panel-message').textContent=`슬롯 ${roman[selected()-1]} · 저장 버전 ${report.revision} 기준`;});
  button(controls,'탐험 일지 CSV 내려받기',async()=>{const report=await readReport();download(journalCsv(report),'text/csv;charset=utf-8',`moonpath-journal-slot-${selected()}.csv`);$('panel-message').textContent='교사용 탐험 일지 CSV를 만들었습니다.';});
  body.append(node('p','교사용 기록입니다. 현재 유효한 판정과 차시별 통계를 표시합니다. PDF 출력은 아직 지원하지 않습니다.'),journal);
 }else if(kind==='help'){
  body.append(node('p','새로운 탐험에서 빈 슬롯과 모둠 수를 고르세요. 이어하기에서는 저장한 슬롯을 엽니다. 설정에서 JSON을 백업하고 복원할 수 있습니다.'));
  body.append(node('p','지역 시험 화면에서 수업 재개와 타이머 재개는 각각 교사가 직접 실행합니다.'));
 }else if(kind==='exit'){
  body.append(node('p','보존된 이전 HOME을 엽니다. 저장 기록은 유지합니다.'));button(controls,'이전 HOME 열기',()=>location.assign('../../moonpath-dev/index.html'),'primary');
 }else{
  body.append(node('p','이전 대화에서 회수한 PNG를 독립 레이어로 조립했습니다. 승인 로고·슬로건 원본은 유지했습니다.'));
  body.append(node('p','배경·캐릭터·프레임·아이콘은 제작 후보를 연결한 검토용 조립 상태입니다. 최종 화면 승인, 전체 게임, 오프라인 출시는 완료되지 않았습니다.'));
 }
 finishPanel(controls);
}
$('close-panel').addEventListener('click',()=>{if(!busy)$('panel').close();});
$('panel').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('panel').addEventListener('close',()=>{panelRequest++;});
$('review-note').addEventListener('click',()=>openPanel('review',null,$('review-note')).catch(report));
addEventListener('pageshow',()=>{busy=false;});
