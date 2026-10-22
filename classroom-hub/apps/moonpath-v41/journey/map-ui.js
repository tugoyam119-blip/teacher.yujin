// Presentation only: the map uses the engine's existing theme/region permissions.
const svgNS='http://www.w3.org/2000/svg';
function svg(parent,viewBox,path){const s=document.createElementNS(svgNS,'svg');s.setAttribute('viewBox',viewBox);s.setAttribute('preserveAspectRatio','none');s.setAttribute('aria-hidden','true');s.innerHTML=path;parent.append(s);return s;}
export function drawWorldMap({scene,world,state,progress,unlocked,button,node,view,info}){
 const intro=node('p','지도를 따라 달의 심장까지 여행합니다. 빛나는 목적지를 눌러 마법 책장을 펼쳐 보세요.');intro.className='map-guide';scene.append(intro);
 const map=node('div');map.className='world-map';map.setAttribute('aria-label','여섯 테마의 탐험 지도');
 svg(map,'0 0 880 270','<path class="map-road" d="M120 72 Q250 0 440 72 T760 72 Q865 140 760 205 Q600 270 440 205 T120 205"/><path class="map-river" d="M0 150 Q200 100 350 160 T880 150"/>');
 const positions=[[14,25],[50,25],[86,25],[86,76],[50,76],[14,76]];
 world.themes.forEach((t,i)=>{const cell=node('div');cell.className='map-stop';cell.style.left=positions[i][0]+'%';cell.style.top=positions[i][1]+'%';map.append(cell);const p=progress.themes[i],open=unlocked(state,t.id),current=state.world.currentRegionId?.startsWith(t.id+'-');
  const b=button(cell,'',()=>view('FORK',t.id),{disabled:!open});b.className='map-destination';b.style.setProperty('--theme-color',['#5dcced','#ef8977','#ffda77','#c5a1ff','#9de6b3','#deefff'][i]);
  b.append(node('strong',`${i+1}. ${t.name}`),node('span',!open?'🔒 앞 테마의 마지막 지역 완료 후':current?'◆ 현재 탐험 중':p.mainFinished?`✓ 주경로 완료 · ${p.completedRegions}/5`:i===0&&p.completedRegions===0?'✦ 처음 시작 · 클릭하여 책장 열기':`진입 가능 · ${p.completedRegions}/5`));
  b.setAttribute('aria-label',`${t.name} ${i===0&&p.completedRegions===0?'처음 시작':open?'마법 책장 열기':'잠김'}`);
  const detail=button(cell,'길 미리보기',()=>info(t.id));detail.className='map-info';
 });scene.append(map);scene.append(node('p','✦ 진입 가능   ◆ 현재 위치   ✓ 주경로 완료   🔒 잠긴 길 · 미방문 분기는 주경로 완료 후 추가 탐험')); 
}
export function decorateFork(routes){
 routes.classList.add('book-fork');
 svg(routes,'0 0 880 520','<path class="fork-road" d="M440 55 L440 120 M440 120 Q340 150 210 200 M440 120 Q540 150 670 200 M210 200 Q290 280 440 350 M670 200 Q590 280 440 350 M440 350 L440 460"/>');
 const names=['입구의 책장','왼쪽 길의 책장','오른쪽 길의 책장','합류의 책장','마지막 책장'];
 routes.querySelectorAll('button.region').forEach((b,i)=>{b.dataset.position=i;b.prepend(Object.assign(document.createElement('small'),{textContent:names[i]}));
  const s=document.createElementNS(svgNS,'svg');s.setAttribute('viewBox','0 0 280 100');s.setAttribute('aria-hidden','true');s.classList.add('book-art');s.innerHTML='<path fill="#302045" stroke="#d3ac63" stroke-width="3" d="M5 15 Q70 0 140 17 Q210 0 275 15 L275 91 Q210 77 140 95 Q70 77 5 91 Z"/><path fill="#e8d5b2" stroke="#a98050" stroke-width="2" d="M13 11 Q73 1 140 20 Q207 1 267 11 L267 82 Q205 70 140 88 Q75 70 13 82 Z"/><path stroke="#b69568" fill="none" d="M140 20 V88 M25 23 Q75 17 125 30 M155 30 Q205 17 255 23"/>';
  s.setAttribute('preserveAspectRatio','none');b.prepend(s);
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
