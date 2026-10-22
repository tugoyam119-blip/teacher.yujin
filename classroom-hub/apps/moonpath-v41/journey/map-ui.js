// Presentation only: the map uses the engine's existing theme/region permissions.
const artRoot='../assets/journey/pixel-v1/';
function art(parent,file,className,alt=''){const image=document.createElement('img');image.src=artRoot+file;image.alt=alt;image.className=className;image.draggable=false;parent.append(image);return image;}
export function drawWorldMap({scene,world,state,progress,unlocked,button,node,view,info}){
 const intro=node('p','지도를 따라 달의 심장까지 여행합니다. 빛나는 목적지를 눌러 마법 책장을 펼쳐 보세요.');intro.className='map-guide';scene.append(intro);
 const map=node('div');map.className='world-map';map.setAttribute('aria-label','여섯 테마의 탐험 지도');
 const illustration=node('div');illustration.className='map-illustration';map.append(illustration);art(illustration,'world-map.png','world-map-art');
 const positions=[[15,40],[50,40],[85,40],[85,88],[50,88],[15,88]];
 let currentIndex=world.themes.findIndex(t=>t.regions.some(r=>r.id===state.world.currentRegionId));
 if(currentIndex<0)currentIndex=world.themes.findIndex(t=>unlocked(state,t.id)&&!progress.themes.find(p=>p.themeId===t.id)?.mainFinished);
 if(currentIndex<0)currentIndex=world.themes.length-1;
 const player=art(illustration,'mage-back.png','journey-mage map-mage','현재 위치의 마도사 뒷모습');player.style.left=positions[currentIndex][0]+'%';player.style.top=(positions[currentIndex][1]-17)+'%';
 world.themes.forEach((t,i)=>{const cell=node('div');cell.className='map-stop';cell.style.left=positions[i][0]+'%';cell.style.top=positions[i][1]+'%';map.append(cell);const p=progress.themes[i],open=unlocked(state,t.id),current=state.world.currentRegionId?.startsWith(t.id+'-');
  const b=button(cell,'',()=>view('FORK',t.id),{disabled:!open});b.className='map-destination';b.style.setProperty('--theme-color',['#5dcced','#ef8977','#ffda77','#c5a1ff','#9de6b3','#deefff'][i]);
  b.append(node('strong',`${i+1}. ${t.name}`),node('span',!open?'🔒 앞 테마 완료 후':current?'◆ 현재 탐험 중':p.mainFinished?`✓ 주경로 완료 · ${p.completedRegions}/5`:i===0&&p.completedRegions===0?'✦ 처음 시작 · 책장 열기':`진입 가능 · ${p.completedRegions}/5`));
  b.setAttribute('aria-label',`${t.name} ${i===0&&p.completedRegions===0?'처음 시작':open?'마법 책장 열기':'잠김'}`);
  const detail=button(cell,'길 미리보기',()=>info(t.id));detail.className='map-info';
 });scene.append(map);scene.append(node('p','✦ 진입 가능   ◆ 현재 위치   ✓ 주경로 완료   🔒 잠긴 길 · 미방문 분기는 주경로 완료 후 추가 탐험')); 
}
export function decorateFork(routes,state){
 routes.classList.add('book-fork');
 art(routes,'library-crossroads.png','crossroads-art');
 const player=art(routes,'mage-back.png','journey-mage fork-mage','갈림길을 바라보는 마도사 뒷모습');
 const available=[...routes.querySelectorAll('button.region')].findIndex(b=>!b.disabled);
 player.dataset.position=Math.max(0,available);
 if(state?.world.currentRegionId){const current=[...routes.querySelectorAll('button.region')].findIndex(b=>b.dataset.regionId===state.world.currentRegionId);if(current>=0)player.dataset.position=current;}
 const names=['입구의 책장','왼쪽 길의 책장','오른쪽 길의 책장','합류의 책장','마지막 책장'];
 routes.querySelectorAll('button.region').forEach((b,i)=>{b.dataset.position=i;b.prepend(Object.assign(document.createElement('small'),{textContent:names[i]}));
  const image=art(b,'magic-book.png','book-art');b.prepend(image);
 });
}
export function setupGuide(state){
 const dialog=document.getElementById('journey-guide'),open=document.getElementById('guide-open'),key=`moonpath-map-guide:${state.meta.expeditionId}`;
 const show=()=>{if(!dialog.open)dialog.showModal();};open.onclick=show;
 document.getElementById('guide-map').onclick=()=>dialog.close();
 document.getElementById('guide-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{sessionStorage.setItem(key,'seen');document.getElementById('title').focus();});
 // An existing region/question is never hidden behind a new onboarding gate.
 if(state.screen==='BOOKSHELF'&&!state.world.currentRegionId&&!sessionStorage.getItem(key))show();
}
