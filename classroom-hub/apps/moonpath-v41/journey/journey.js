import {openEngineDatabase} from '../src/storage/indexeddb.js?v=2-archive';
import {TeacherEngineSession} from '../src/engine/session.js';
import {themeUnlocked,regionOptions,hasLiveMission} from '../src/world/navigation.js';
import {worldProgress} from '../src/world/regions.js';
const $=id=>document.getElementById(id),node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const slot=Number(new URLSearchParams(location.search).get('slot'));let teacher,db,world,busy=false;
const colors=['#2d97c4','#d54d41','#d8ac35','#9a6fce','#60b77d','#aad8eb'];
const statusLabel={LOCKED:'잠김',AVAILABLE:'진입 가능',IN_PROGRESS:'진행 중',COMPLETED:'완료'};
function resize(){const k=Math.min(innerWidth/960,innerHeight/540);$('stage').style.transform=`translate(-50%,-50%) scale(${k})`;}addEventListener('resize',resize);resize();
const report=e=>{$('message').textContent=`${e.code??'오류'} · ${e.message}`;};
async function run(fn){if(busy)return;busy=true;const controls=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);controls.forEach(([b])=>{b.disabled=true;});try{await fn();if(teacher?.state)render();}catch(e){report(e);}finally{busy=false;controls.forEach(([b,d])=>{if(b.isConnected)b.disabled=d;});}}
function button(parent,text,fn,{disabled=false}={}){const b=node('button',text);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>run(fn));parent.append(b);return b;}
async function view(view,themeId){await teacher.dispatch('WORLD_VIEW_OPENED',{view,themeId});$('message').textContent='';}
async function home(){if(teacher?.state){const s=teacher.getState();if(s.sessions.some(x=>x.id===s.activeSessionId&&x.phase==='ACTIVE'))await teacher.dispatch('SESSION_PAUSED');await teacher.close();}db?.close();location.assign('../home-b/');}
async function region(){const s=teacher.getState();if(s.screen!=='REGION'&&!hasLiveMission(s))await teacher.dispatch('SCREEN_CHANGED',{screen:'REGION'});await teacher.close();db.close();location.assign(`../dist/phase2-9-one-region-smoke.html?home=b&journey=1&slot=${slot}`);}
async function activeLesson(){const s=teacher.getState(),lesson=s.sessions.find(x=>x.id===s.activeSessionId);if(!lesson||lesson.phase==='ENDED')await teacher.dispatch('SESSION_STARTED',{sessionId:crypto.randomUUID()});else if(lesson.phase==='PAUSED')await teacher.dispatch('SESSION_RESUMED');}
async function enter(option){
 if(option.continuing){await region();return;}
 await activeLesson();
 if(option.mode==='EXTRA'&&!teacher.getState().world.additionalExplorationReturn){await view('BOOKSHELF');await teacher.dispatch('EXTRA_EXPLORATION_STARTED',{regionId:option.id,teacherConfirmed:true});}
 await teacher.enterRegion(option.id,{mode:option.mode});await region();
}
function render(){
 const s=teacher.getState(),scene=$('scene');scene.replaceChildren();$('save-status').textContent=`${s.meta.expeditionName||`슬롯 ${slot} 탐험`} · 슬롯 ${slot} · 저장 버전 ${s.meta.revision} · 복원 후 수업/타이머는 자동 재개하지 않습니다.`;
 $('bookshelf').disabled=hasLiveMission(s);
 if(hasLiveMission(s)){
  $('title').textContent='진행 중인 탐험';const box=node('div');box.className='notice';box.append(node('h2','진행 중인 문항을 이어갑니다'),node('p','문항·남은 시간·가로채기·회수 상태를 보존했습니다. 이 상태에서는 책장이나 다른 경로로 이동할 수 없습니다.'));
  button(box,'저장된 지역 계속하기',region);scene.append(box);return;
 }
 if(['REGION','REGION_RESULT'].includes(s.screen)&&s.world.currentRegionId){
  const theme=world.themes.find(t=>t.regions.some(r=>r.id===s.world.currentRegionId)),r=theme.regions.find(r=>r.id===s.world.currentRegionId),saved=s.world.regions[r.id];
  $('title').textContent=s.screen==='REGION_RESULT'?'저장된 지역 결과':'저장된 지역';const box=node('div');box.className='notice';box.append(node('h2',r.name),node('p',`${statusLabel[saved.status]} · 별빛 ${s.rewards.starlight} · 열쇠 ${s.rewards.keys}`));
  if(saved.status==='IN_PROGRESS')button(box,'저장된 지역 계속하기',region);
  button(box,'이 테마의 갈림길 보기',()=>view('FORK',theme.id));scene.append(box);return;
 }
 const savedTheme=s.world.navigation?.themeId;
 if(s.screen==='FORK'&&savedTheme){
  const theme=world.themes.find(t=>t.id===savedTheme);$('title').textContent=`${theme.name} · 갈림길`;
  const routes=node('div');routes.className='routes';const options=regionOptions(s,savedTheme);
  options.forEach((o,i)=>{const r=theme.regions[i];const b=button(routes,'',()=>enter(o),{disabled:!o.allowed});b.className=`region ${r.role}`;
   b.append(node('strong',`${['① 진입','② 왼쪽','③ 오른쪽','④ 합류','⑤ 마지막'][i]} · ${r.name}`),node('span',`${o.allowed&&o.status==='LOCKED'?'진입 가능':statusLabel[o.status]}${o.continuing?' · 계속하기':o.mode==='EXTRA'?' · 추가 탐험':''}`));
  });scene.append(routes);
  const extra=s.world.additionalExplorationReturn;if(extra&&s.world.regions[extra.regionId].status==='COMPLETED')button(scene,'추가 탐험을 마치고 책장으로 복귀',async()=>{await activeLesson();await teacher.dispatch('EXTRA_EXPLORATION_RETURNED',{teacherConfirmed:true});await view('BOOKSHELF');});
  return;
 }
 $('title').textContent='마법 책장';const books=node('div');books.className='books';const progress=worldProgress(s);
 [0,3,1,4,2,5].forEach(i=>{const theme=world.themes[i],unlocked=themeUnlocked(s,theme.id),p=progress.themes[i];const b=button(books,'',()=>view('FORK',theme.id),{disabled:!unlocked});b.className='book';b.style.setProperty('--color',colors[i]);
  b.append(node('strong',theme.name),node('span',unlocked?`${p.completedRegions}/5 지역 완료${p.mainFinished?' · 주경로 완료':''}`:'앞 테마의 마지막 지역 완료 후 열립니다'),node('span',theme.bookshelfColor));});scene.append(books);
 if(s.world.currentRegionId&&s.world.regions[s.world.currentRegionId].status==='IN_PROGRESS')button(scene,'진행 중인 지역 계속하기',region);
}
$('home').addEventListener('click',()=>run(home));$('bookshelf').addEventListener('click',()=>run(()=>view('BOOKSHELF')));
addEventListener('pagehide',()=>{teacher?.close().catch(()=>{});});
try{
 if(!Number.isInteger(slot)||slot<1||slot>3)throw new Error('HOME에서 슬롯 I~III을 선택해 주세요.');
 const response=await fetch('../config/world.json');if(!response.ok)throw new Error('공식 세계 설정을 불러오지 못했습니다.');world=await response.json();
 db=await openEngineDatabase({open(_name,version){return indexedDB.open('moonpath-v411-phase29-smoke-db-v1',version);}});teacher=new TeacherEngineSession(db);await teacher.open(slot);render();
}catch(e){$('bookshelf').disabled=true;report(e);$('save-status').textContent='탐험을 열지 못했습니다. 저장 데이터는 자동 교체하지 않습니다.';if(e.code==='WRITER_BUSY'){const box=node('div');box.className='notice';box.append(node('p','다른 탐험 창을 닫아 주세요. 새로고침 직후라면 최대 30초 뒤 다시 열 수 있습니다.'));button(box,'저장된 탐험 다시 열기',()=>location.reload());$('scene').append(box);}}
