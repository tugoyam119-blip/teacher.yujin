import {openEngineDatabase} from '../src/storage/indexeddb.js?v=2-archive';
import {TeacherEngineSession} from '../src/engine/session.js';
import {themeUnlocked,regionOptions,hasLiveMission,themeRouteGuide,extraResumeTarget} from '../src/world/navigation.js?v=20261021-route-guide';
import {worldProgress} from '../src/world/regions.js';
const $=id=>document.getElementById(id),node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const slot=Number(new URLSearchParams(location.search).get('slot'));let teacher,db,world,busy=false,preview=null,themePreview=null;
const colors=['#2d97c4','#d54d41','#d8ac35','#9a6fce','#60b77d','#aad8eb'];
const statusLabel={LOCKED:'잠김',AVAILABLE:'진입 가능',IN_PROGRESS:'진행 중',COMPLETED:'완료'};
function resize(){const k=Math.min(innerWidth/960,innerHeight/540);$('stage').style.transform=`translate(-50%,-50%) scale(${k})`;}addEventListener('resize',resize);resize();
const report=e=>{$('message').textContent=`${e.code??'오류'} · ${e.message}`;};
async function run(fn){if(busy)return;busy=true;const controls=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);controls.forEach(([b])=>{b.disabled=true;});try{await fn();if(teacher?.state)render();}catch(e){report(e);}finally{busy=false;controls.forEach(([b,d])=>{if(b.isConnected)b.disabled=d;});}}
function button(parent,text,fn,{disabled=false}={}){const b=node('button',text);b.type='button';b.disabled=disabled;b.addEventListener('click',()=>run(fn));parent.append(b);return b;}
async function view(view,themeId){await teacher.dispatch('WORLD_VIEW_OPENED',{view,themeId});preview=null;themePreview=null;$('message').textContent='';}
async function home(){if(teacher?.state){const s=teacher.getState();if(s.sessions.some(x=>x.id===s.activeSessionId&&x.phase==='ACTIVE'))await teacher.dispatch('SESSION_PAUSED');await teacher.close();}db?.close();location.assign('../home-b/');}
async function region(freshEntry=false){const s=teacher.getState();if(s.screen!=='REGION'&&!hasLiveMission(s))await teacher.dispatch('SCREEN_CHANGED',{screen:'REGION'});if(freshEntry){sessionStorage.setItem('moonpath-quick-handoff',JSON.stringify({slot,expeditionId:s.meta.expeditionId,revision:teacher.getState().meta.revision,at:Date.now()}));}await teacher.close();db.close();location.assign(`../dist/phase2-9-one-region-smoke.html?home=b&journey=1&slot=${slot}`);}
async function activeLesson(){const s=teacher.getState(),lesson=s.sessions.find(x=>x.id===s.activeSessionId);if(!lesson||lesson.phase==='ENDED')await teacher.dispatch('SESSION_STARTED',{sessionId:crypto.randomUUID()});else if(lesson.phase==='PAUSED')await teacher.dispatch('SESSION_RESUMED');}
async function enter(option){
 const theme=world.themes.find(t=>t.regions.some(r=>r.id===option.id));option=regionOptions(teacher.getState(),theme.id).find(o=>o.id===option.id);if(!option.allowed)throw new Error(option.reason);
 if(option.continuing){await region();return;}
 if(teacher.getState().settings.preparation?.confirmation==='CAREFUL'){
  const state=teacher.getState(),lesson=state.sessions.find(x=>x.id===state.activeSessionId);
  if(lesson?.phase!=='ACTIVE')throw new Error('먼저 수업 시작을 확인해 주세요.');
 }else await activeLesson();
 if(option.mode==='EXTRA'&&!teacher.getState().world.additionalExplorationReturn){await view('BOOKSHELF');await teacher.dispatch('EXTRA_EXPLORATION_STARTED',{regionId:option.id,teacherConfirmed:true});}
 await teacher.enterRegion(option.id,{mode:option.mode});await region(!!teacher.getState().settings.preparation);
}
function progressText(p){return `주경로 ${p.mainFinished?'완료':'미완료'} · 완전 탐색 ${p.fullExploration?'달성':`${p.completedRegions}/5`} · 학습 ${p.learningComplete?'달성':p.unresolvedRecovery?`회수 ${p.unresolvedRecovery}건 대기`:'주경로 완료 전'}`;}
function progressLine(parent,themeId){const p=worldProgress(teacher.getState()).themes.find(t=>t.themeId===themeId);const line=node('p',progressText(p));line.className='progress-line';parent.append(line);}
async function returnExtra(){await activeLesson();await teacher.dispatch('EXTRA_EXPLORATION_RETURNED',{teacherConfirmed:true});await teacher.dispatch('SESSION_PAUSED');await view('BOOKSHELF');}
async function continueExtra(){
 const target=extraResumeTarget(teacher.getState());if(!target)throw new Error('추가 탐험 복귀 기록이 없습니다.');
 if(target.action==='RETURN'){await returnExtra();return;}
 if(target.action==='ENTER'){await activeLesson();await teacher.enterRegion(target.regionId,{mode:'EXTRA'});}
 await region();
}
function showTheme(parent,themeId){
 const s=teacher.getState(),theme=world.themes.find(t=>t.id===themeId),guide=themeRouteGuide(s,themeId),box=node('div');box.className='notice theme-info';
 box.append(node('h2',`${theme.name} · 테마 정보`));progressLine(box,themeId);
 box.append(node('p',guide.unlocked?'해금된 테마입니다. 지역 정보 확인 후 교사가 진입을 확정합니다.':'잠김 · 앞 테마의 마지막 지역을 완료하면 열립니다.'),node('p',guide.choice?`선택한 주경로: ${guide.mainRoute.map(id=>theme.regions.find(r=>r.id===id).name).join(' → ')}`:'주경로: ① → ② 왼쪽 또는 ③ 오른쪽 → ④ → ⑤ · 아직 분기를 선택하지 않았습니다.'));
 const list=node('ol');for(const o of guide.regions){const r=theme.regions.find(r=>r.id===o.id);const li=node('li',`${r.name} · ${o.canViewResult?'완료':statusLabel[o.status]} · ${o.reason}`);list.append(li);}box.append(list);
 box.append(node('p','주경로 완료 뒤 미방문 분기를 추가 탐험할 수 있습니다. 5지역 완료는 완전 탐색이며, 오답 회수에 따른 학습 성취와 별도로 표시합니다.'));
 if(guide.unlocked)button(box,'이 테마의 갈림길 열기',()=>view('FORK',themeId));
 button(box,'정보 닫기',()=>{themePreview=null;});parent.append(box);
}
function showRegion(parent,id){
 const s=teacher.getState(),theme=world.themes.find(t=>t.regions.some(r=>r.id===id)),r=theme.regions.find(r=>r.id===id),option=regionOptions(s,theme.id).find(o=>o.id===id),box=node('div');box.className='notice';
 box.append(node('h2',r.name),node('p',option.reason));progressLine(box,theme.id);
 if(option.canViewResult){const result=teacher.getRegionResult(id,{publicOnly:true});box.append(node('p',`기본 문제 ${result.processed}/${result.baseQuota} · 정답 ${result.correct} · 오답 ${result.incorrect} · 회수 대기 ${result.unresolvedRecovery}`),node('p','최초 완료 열쇠 +1은 이미 반영됐습니다. 결과를 다시 보아도 보상은 추가 지급하지 않습니다.'));}
 else if(option.allowed){
  box.append(node('p',`기본 문제 ${s.world.regions[id].baseQuota??s.settings.teamCount}개 · 제한 시간 ${s.settings.timerSeconds?`${s.settings.timerSeconds}초`:'끔'} · ${option.mode==='EXTRA'?'추가 탐험':'주경로'}`));
  const branch=theme.regions.indexOf(r);if(option.mode==='MAIN'&&(branch===1||branch===2)&&!s.world.mainRouteChoice[theme.id])box.append(node('p','이 길을 선택하면 반대편 길은 주경로 완료 뒤 추가 탐험으로 열립니다. 아직 경로를 확정하지 않았습니다.'));
  const confirmation=s.settings.preparation?.confirmation;const lesson=s.sessions.find(x=>x.id===s.activeSessionId);if(confirmation==='CAREFUL'&&!option.continuing&&lesson?.phase!=='ACTIVE')button(box,'수업 시작 확인',activeLesson);
  button(box,option.continuing?'저장된 지역 계속하기':confirmation==='QUICK'?'지역·첫 문제 시작':option.mode==='EXTRA'?'추가 탐험 진입 확인':'이 지역 진입 확인',()=>enter(option));
 }
 button(box,'갈림길로 돌아가기',async()=>{if(s.screen!=='FORK')await view('FORK',theme.id);else preview=null;});parent.append(box);
}
function render(){
 const s=teacher.getState(),scene=$('scene');scene.replaceChildren();$('save-status').textContent=`${s.meta.expeditionName||`슬롯 ${slot} 탐험`} · 슬롯 ${slot} · 저장 버전 ${s.meta.revision}${s.health?` · 체력 ♥${s.health.current}/${s.health.max}`:''} · 열쇠 ${s.rewards.keys}(비소모) · 별빛 ${s.rewards.starlight} · 복원 후 수업/타이머는 자동 재개하지 않습니다.`;
 $('bookshelf').disabled=hasLiveMission(s);
 if(hasLiveMission(s)){
  $('title').textContent='진행 중인 탐험';const box=node('div');box.className='notice';box.append(node('h2','진행 중인 문항을 이어갑니다'),node('p','문항·남은 시간·가로채기·회수 상태를 보존했습니다. 이 상태에서는 책장이나 다른 경로로 이동할 수 없습니다.'));
  button(box,'저장된 지역 계속하기',region);scene.append(box);return;
 }
 if(s.health?.returnRequired){$('title').textContent='체력이 소진됐습니다';const box=node('div');box.className='notice';box.append(node('h2','책장으로 돌아가 체력을 회복하세요'),node('p','기존 지역 진행·문항·별빛·열쇠·추가 탐험 복귀 위치는 그대로 유지됩니다. 회복 후 남은 진행을 이어갑니다.'));button(box,'책장 복귀·체력 8로 회복 확인',async()=>{await teacher.dispatch('HEALTH_RETURNED',{teacherConfirmed:true});preview=null;themePreview=null;});scene.append(box);return;}
 const extra=s.world.additionalExplorationReturn;
 if(extra){const banner=node('div');banner.className='extra-banner';const r=world.themes.flatMap(t=>t.regions).find(r=>r.id===extra.regionId),back=world.themes.flatMap(t=>t.regions).find(r=>r.id===extra.fromRegionId);banner.append(node('span',`추가 탐험: ${r.name} · 복귀 위치: ${back?.name??'책장'}`));if(s.world.regions[extra.regionId].status==='COMPLETED')button(banner,'추가 탐험을 마치고 원래 위치로 복귀',returnExtra);else button(banner,s.world.regions[extra.regionId].status==='AVAILABLE'?'중단된 추가 탐험 진입 이어가기':'추가 탐험 계속하기',continueExtra);scene.append(banner);}
 if(themePreview){$('title').textContent='마법 책장 · 테마 안내';showTheme(scene,themePreview);return;}
 if(preview){$('title').textContent='지역 정보 · 선택 확인';showRegion(scene,preview);return;}
 if(['REGION','REGION_RESULT'].includes(s.screen)&&s.world.currentRegionId){
  const theme=world.themes.find(t=>t.regions.some(r=>r.id===s.world.currentRegionId)),r=theme.regions.find(r=>r.id===s.world.currentRegionId),saved=s.world.regions[r.id];
  $('title').textContent=s.screen==='REGION_RESULT'?'저장된 지역 결과':'저장된 지역';const box=node('div');box.className='notice';box.append(node('h2',r.name),node('p',`${statusLabel[saved.status]} · 별빛 ${s.rewards.starlight} · 열쇠 ${s.rewards.keys}`));
  if(saved.status==='IN_PROGRESS')button(box,'저장된 지역 계속하기',region);
  if(saved.status==='COMPLETED')button(box,'완료 결과 다시 보기',()=>{preview=r.id;});
  button(box,'이 테마의 갈림길 보기',()=>view('FORK',theme.id));scene.append(box);return;
 }
 const savedTheme=s.world.navigation?.themeId;
 if(s.screen==='FORK'&&savedTheme){
  const theme=world.themes.find(t=>t.id===savedTheme);$('title').textContent=`${theme.name} · 갈림길`;
  progressLine(scene,theme.id);const choice=s.world.mainRouteChoice[theme.id];const note=node('p',`① 진입 → ② 왼쪽 또는 ③ 오른쪽 → ④ 합류 → ⑤ 마지막${choice?` · 선택한 주경로: ${choice==='LEFT'?'왼쪽':'오른쪽'}`:' · 좌우 경로 미선택'}`);note.className='route-guide';scene.append(note);
  const routes=node('div');routes.className='routes';const options=regionOptions(s,savedTheme);
  options.forEach((o,i)=>{if([1,3,4].includes(i)){const link=node('div',i===1?'↙ 왼쪽 / 오른쪽 ↘':i===3?'↘ 합류 ↙':'↓');link.className='route-link';link.setAttribute('aria-hidden','true');routes.append(link);}const r=theme.regions[i];const b=button(routes,'',()=>{preview=o.id;},{disabled:!o.allowed&&!o.canViewResult});b.className=`region ${r.role}`;b.title=o.reason;
   b.append(node('strong',`${['① 진입','② 왼쪽','③ 오른쪽','④ 합류','⑤ 마지막'][i]} · ${r.name}`),node('span',`${o.canViewResult?'완료 · 결과 보기':o.allowed&&!o.visited?'미방문 · 진입 가능':statusLabel[o.status]}${o.continuing?' · 계속하기':o.mode==='EXTRA'?' · 추가 탐험':''}`));
  });scene.append(routes);
  const locked=node('details');locked.append(node('summary','잠긴 길의 조건 보기'));for(const o of options.filter(o=>!o.allowed&&!o.canViewResult))locked.append(node('p',`${theme.regions.find(r=>r.id===o.id).name}: ${o.reason}`));if(locked.childElementCount>1)scene.append(locked);
  return;
 }
 $('title').textContent='마법 책장';const books=node('div');books.className='books';const progress=worldProgress(s);
 [0,3,1,4,2,5].forEach(i=>{const theme=world.themes[i],unlocked=themeUnlocked(s,theme.id),p=progress.themes[i],cell=node('div');cell.className='book-cell';books.append(cell);const b=button(cell,'',()=>view('FORK',theme.id),{disabled:!unlocked});b.className='book';b.style.setProperty('--color',colors[i]);
  const visited=theme.regions.some(r=>(s.world.visitHistory??[]).some(v=>v.regionId===r.id)||s.world.currentRegionId===r.id);b.title=`${theme.bookshelfColor} · ${progressText(p)}`;b.setAttribute('aria-label',`${theme.name} · ${unlocked?progressText(p):'잠김 · 앞 테마의 마지막 지역 완료 필요'}`);
  b.append(node('strong',theme.name),node('span',unlocked?`${p.fullExploration?'완전 탐색':p.mainFinished?'주경로 완료':visited?'진행 중':'미방문'} · ${p.completedRegions}/5${p.unresolvedRecovery?` · 회수 ${p.unresolvedRecovery}건`:p.learningComplete?' · 학습 달성':''}`:'잠김 · 앞 테마 마지막 지역 완료 필요'));const info=button(cell,'테마 정보',()=>{themePreview=theme.id;});info.className='theme-info-button';info.setAttribute('aria-label',`${theme.name} 테마 정보`);});scene.append(books);
 if(s.world.currentRegionId&&s.world.regions[s.world.currentRegionId].status==='IN_PROGRESS')button(scene,'진행 중인 지역 계속하기',region);
}
$('home').addEventListener('click',()=>run(home));$('bookshelf').addEventListener('click',()=>run(()=>view('BOOKSHELF')));
addEventListener('pagehide',()=>{teacher?.close().catch(()=>{});});
try{
 if(!Number.isInteger(slot)||slot<1||slot>3)throw new Error('HOME에서 슬롯 I~III을 선택해 주세요.');
 const response=await fetch('../config/world.json');if(!response.ok)throw new Error('공식 세계 설정을 불러오지 못했습니다.');world=await response.json();
 db=await openEngineDatabase({open(_name,version){return indexedDB.open('moonpath-v411-phase29-smoke-db-v1',version);}});teacher=new TeacherEngineSession(db);await teacher.open(slot);render();
}catch(e){$('bookshelf').disabled=true;report(e);$('save-status').textContent='탐험을 열지 못했습니다. 저장 데이터는 자동 교체하지 않습니다.';if(e.code==='WRITER_BUSY'){const box=node('div');box.className='notice';box.append(node('p','다른 탐험 창을 닫아 주세요. 새로고침 직후라면 최대 30초 뒤 다시 열 수 있습니다.'));button(box,'저장된 탐험 다시 열기',()=>location.reload());$('scene').append(box);}}
finally{$('home').disabled=false;}
