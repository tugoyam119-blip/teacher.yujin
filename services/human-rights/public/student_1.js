const VERSION='v11.2';
const root=document.getElementById('root');
function fatalStudentScreen(message='학생 화면을 불러오지 못했습니다.'){
  if(!root)return;
  root.innerHTML=`<div class="wrap"><section class="card"><div class="kicker">학생용 화면</div><h2>${message}</h2><p>새로고침한 뒤 다시 접속해 주세요. 계속되면 선생님께 알려주세요.</p><button class="btn" onclick="location.reload()">다시 불러오기</button></section></div>`;
}
window.addEventListener('error',e=>{console.error(e.error||e.message);fatalStudentScreen();});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason||e);});
const API_MODE=location.protocol==='http:'||location.protocol==='https:';
const qs=new URLSearchParams(location.search);
const teacherMode=qs.get('teacher')==='1';
const testMode=qs.get('test')==='1';
if(teacherMode){location.replace('/teacher');}
function storageOrNull(which){try{const st=window[which];const k='__hr_probe_'+Date.now();st.setItem(k,'1');st.removeItem(k);return st}catch(e){console.warn(which+' unavailable',e);return null}}
const LS=storageOrNull('localStorage');
const SS=storageOrNull('sessionStorage');
try{if('serviceWorker' in navigator&&navigator.serviceWorker?.getRegistrations)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});if(window.caches?.keys)window.caches.keys().then(keys=>keys.filter(k=>/^hr-v/i.test(k)).forEach(k=>window.caches.delete(k))).catch(()=>{})}catch(e){}
function safeParse(v,fallback=null){try{return v?JSON.parse(v):fallback}catch(e){return fallback}}
function safeGet(store,key,fallback=''){try{return store?store.getItem(key)??fallback:fallback}catch(e){return fallback}}
function safeSet(store,key,value){try{if(store)store.setItem(key,String(value));return true}catch(e){return false}}
function safeRemove(store,key){try{if(store)store.removeItem(key);return true}catch(e){return false}}
const RESOURCE_IMAGES={
  "structure":"resource_01_structure.webp",
  "usage":"resource_02_usage.webp",
  "map":"resource_03_map.webp",
  "voices":"resource_04_voices.webp",
  "budget":"resource_05_budget.webp"
};
function resourceImage(id){let src=RESOURCE_IMAGES[id];let title=RESOURCES.find(x=>x.id===id)?.title||'정책 자료';return src?`<button class="resourceZoomButton" type="button" onclick="openZoom('${src}')" aria-label="${esc(title)} 이미지 크게 보기"><img class="resourceLegacyImage" src="${src}" alt="${esc(title)} 시각 자료"><span class="resourceZoomHint">🔍 이미지를 눌러 크게 보기</span></button>`:''}

let currentZoom=1,zoomBaseScale=1,zoomDragging=false,zoomDragX=0,zoomDragY=0,zoomScrollX=0,zoomScrollY=0;
function applyZoomScale(){const img=document.getElementById('imgZoomTarget'),inner=document.getElementById('imgZoomInner'),stage=document.getElementById('imgZoomStage');if(!img||!inner||!stage||!img.naturalWidth)return;const scale=zoomBaseScale*currentZoom;img.style.transform='scale('+scale+')';inner.style.width=(img.naturalWidth*scale)+'px';inner.style.height=(img.naturalHeight*scale)+'px';inner.style.margin=(img.naturalWidth*scale<stage.clientWidth-28)?'0 auto':'0'}
function openZoom(src){const box=document.getElementById('imgZoom'),img=document.getElementById('imgZoomTarget'),stage=document.getElementById('imgZoomStage');if(!box||!img||!stage)return;currentZoom=window.innerWidth<=480?1.5:1;img.onload=function(){const availableW=Math.max(280,stage.clientWidth-28),availableH=Math.max(280,stage.clientHeight-28);zoomBaseScale=Math.min(availableW/img.naturalWidth,availableH/img.naturalHeight,1);applyZoomScale();stage.scrollLeft=0;stage.scrollTop=0};img.src=src;box.classList.add('show');box.setAttribute('aria-hidden','false');document.body.classList.add('zoomOpen')}
function closeZoom(){const box=document.getElementById('imgZoom');if(!box)return;box.classList.remove('show');box.setAttribute('aria-hidden','true');document.body.classList.remove('zoomOpen')}
function zoomIn(){currentZoom=Math.min(5,Math.round((currentZoom+.25)*100)/100);applyZoomScale()}
function zoomOut(){currentZoom=Math.max(.5,Math.round((currentZoom-.25)*100)/100);applyZoomScale()}
function zoomReset(){currentZoom=1;applyZoomScale();const stage=document.getElementById('imgZoomStage');if(stage){stage.scrollLeft=0;stage.scrollTop=0}}
function initZoomPan(){const stage=document.getElementById('imgZoomStage'),box=document.getElementById('imgZoom');if(!stage||stage.dataset.panReady)return;stage.dataset.panReady='1';stage.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;zoomDragging=true;zoomDragX=e.clientX;zoomDragY=e.clientY;zoomScrollX=stage.scrollLeft;zoomScrollY=stage.scrollTop;stage.classList.add('dragging');stage.setPointerCapture?.(e.pointerId);e.preventDefault()});stage.addEventListener('pointermove',e=>{if(!zoomDragging||e.pointerType!=='mouse')return;stage.scrollLeft=zoomScrollX-(e.clientX-zoomDragX);stage.scrollTop=zoomScrollY-(e.clientY-zoomDragY);e.preventDefault()});const stop=e=>{if(!zoomDragging)return;zoomDragging=false;stage.classList.remove('dragging');try{stage.releasePointerCapture?.(e.pointerId)}catch(_){}};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);stage.addEventListener('pointerleave',e=>{if(e.buttons===0)stop(e)});stage.addEventListener('dblclick',()=>{currentZoom=currentZoom>1?1:2;applyZoomScale()});box?.addEventListener('click',e=>{if(e.target===box)closeZoom()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&box?.classList.contains('show'))closeZoom()})}
initZoomPan();

const RESOURCES=[
 {id:'structure',icon:'🛗',title:'역사 구조와 무단차 이동',summary:'역 구조에 따라 필요한 대수와 비용이 달라집니다.',facts:['새봄중앙역: 추가 3대 · 24억 원','복지센터역: 추가 2대 · 18억 원','대학병원역: 공용 대합실까지 1대, 분리된 상·하행 승강장에 각각 1대가 필요해 총 3대 · 39억 원','전통시장역: 추가 2대 · 20억 원','푸른공원역: 추가 2대 · 18억 원','새봄고역: 기존 대합실↔승강장 엘리베이터를 활용해 지상↔대합실 1대만 추가 · 8억 원'],quiz:{q:'무단차 이동 경로가 완성된 경우는?',c:['역 안에 엘리베이터가 한 대라도 있을 때','지상 출입구부터 승강장까지 계단 없이 연결될 때','승강장에만 엘리베이터가 있을 때'],a:1}},
 {id:'usage',icon:'📊',title:'후보역 이용 현황',summary:'6개 역의 이용 현황을 비교합니다.',facts:['새봄중앙역: 하루 18,400명 / 교통약자 1,850명','복지센터역: 하루 8,900명 / 교통약자 1,620명','대학병원역: 하루 15,700명 / 교통약자 2,140명','전통시장역: 하루 11,200명 / 교통약자 1,480명','푸른공원역: 하루 7,200명 / 교통약자 780명','새봄고역: 하루 9,600명 / 교통약자 510명'],quiz:{q:'교통약자 추정 이용객 수가 가장 많은 역은?',c:['새봄중앙역','복지센터역','대학병원역','전통시장역'],a:2}},
 {id:'map',icon:'🗺️',title:'주변 시설과 이동 목적',summary:'역 주변 주요 시설과 이동 목적을 살펴봅니다.',facts:['새봄중앙역: 새봄시청 320m·환승버스센터 80m','복지센터역: 장애인종합복지관 180m·시립복지지원센터 260m','대학병원역: 새봄대학교병원 220m·응급의료센터','전통시장역: 새봄전통시장 90m·노인복지관 350m','푸른공원역: 푸른공원 120m·생활체육센터 240m','새봄고역: 새봄고등학교 140m·특수학급 통학로'],quiz:{q:'진료·치료 목적 이동과 가장 직접적으로 연결되는 역은?',c:['푸른공원역','전통시장역','대학병원역','새봄고역'],a:2}},
 {id:'voices',icon:'💬',title:'시민의 목소리',summary:'6명의 시민이 겪는 이동 상황을 살펴봅니다.',facts:['휠체어 이용 시민: “복지센터 수업이 있는 날에는 계단을 피하려고 두 정거장 전에 내려 택시를 탑니다. 이동시간과 교통비가 매번 더 듭니다.”','대학병원 이용 보호자: “재활치료가 끝난 뒤에는 환자가 더 지쳐 있습니다. 그 상태에서 계단을 오르내리게 하는 것이 가장 걱정됩니다.”','전통시장 상인: “장보기 짐을 든 고령 손님이 계단 앞에서 돌아가는 경우가 있습니다. 시장뿐 아니라 노인복지관 이동도 함께 봐주면 좋겠습니다.”','새봄중앙역 통근 시민: “매일 많은 사람이 환승하는 역도 중요합니다. 다만 이용객 수만으로 정하지 말고 더 절박한 이동이 어디인지도 비교해야 합니다.”','새봄고 학생: “특수학급 친구가 등하교할 때 다른 사람의 도움 없이 학교까지 이어서 이동할 수 있었으면 좋겠습니다.”','유모차 이용 보호자: “공원에 갈 때 아이와 짐을 함께 들고 계단을 이용하기 어렵습니다. 가족 이동도 생활 속 접근성 문제라고 생각합니다.”'],quiz:{q:'시민 의견을 정책 판단에 활용하는 가장 적절한 방법은?',c:['한 시민의 요구를 그대로 정답으로 삼는다','각 시민의 필요를 수치·거리·예산 자료와 함께 비교한다','가장 강하게 말한 의견만 따른다'],a:1}},
 {id:'budget',icon:'💰',title:'올해 사용할 수 있는 예산',summary:'이번 정책에서 사용할 수 있는 예산과 선택 규칙을 확인합니다.',facts:['이동편의시설 전체 예산 120억 원','이미 정해진 저상버스·보도정비 사업 70억 원','이번 정책에 사용할 수 있는 예산 50억 원'],quiz:{q:'이번 정책에 사용할 수 있는 최대 예산은?',c:['40억 원','50억 원','70억 원'],a:1}}
];
const STATIONS=[
 {id:'central',name:'새봄중앙역',cost:24,riders:18400,mobility:1850,facility:'환승센터·시청',need:'전체 이용객이 가장 많고 환승 수요가 큽니다.',stars:['이용객 ★★★★★','교통약자 ★★★★☆','공공시설 ★★★★☆']},
 {id:'welfare',name:'복지센터역',cost:18,riders:8900,mobility:1620,facility:'장애인종합복지관 180m',need:'교통약자 이용 비율이 가장 높은 후보역입니다.',stars:['이용객 ★★★☆☆','교통약자 ★★★★★','복지 접근 ★★★★★']},
 {id:'hospital',name:'대학병원역',cost:39,riders:15700,mobility:2140,facility:'대학병원 220m',need:'교통약자 추정 인원이 가장 많고 필수 의료 이동과 연결됩니다.',stars:['이용객 ★★★★☆','교통약자 ★★★★★','필수시설 ★★★★★']},
 {id:'market',name:'전통시장역',cost:20,riders:11200,mobility:1480,facility:'시장 90m·노인복지관 350m',need:'고령층의 반복적인 생활 이동과 연결됩니다.',stars:['이용객 ★★★★☆','교통약자 ★★★★☆','생활이동 ★★★★☆']},
 {id:'park',name:'푸른공원역',cost:18,riders:7200,mobility:780,facility:'대형공원 120m',need:'가족·유모차 이용이 많고 주말 이용 수요가 큽니다.',stars:['이용객 ★★☆☆☆','교통약자 ★★☆☆☆','가족이동 ★★★★☆']},
 {id:'school',name:'새봄고역',cost:8,riders:9600,mobility:510,facility:'고등학교 140m·특수학급 통학로',need:'기존 시설을 활용해 적은 비용으로 무단차 경로를 완성할 수 있습니다.',stars:['이용객 ★★★☆☆','교통약자 ★★☆☆☆','예산효율 ★★★★★']}
];
const CRITERIA=[['mobility','♿','교통약자 보호','이동이 어려운 시민의 필요를 우선'],['essential','🏥','필수시설 접근','병원·복지·교육시설 접근을 중요하게 판단'],['many','👥','많은 시민에게 혜택','정책 혜택을 받는 시민 수를 고려'],['efficiency','💰','예산 효율','같은 예산으로 더 큰 개선 효과를 추구'],['balance','🗺️','지역 간 형평성','특정 지역에 혜택이 지나치게 몰리지 않도록 고려'],['urgent','🚨','문제의 긴급성','지금 해결하지 않으면 위험이나 불편이 큰 문제를 우선']];
const RIGHTS=[['mobility_right','♿','이동권','장애나 신체 조건과 관계없이 필요한 장소로 실제로 이동할 수 있어야 합니다.'],['equality','⚖️','평등권','장애나 나이 때문에 시설 이용 기회에서 부당하게 배제되지 않아야 합니다.'],['life','🏠','인간다운 생활을 할 권리','의료·복지·교육 등 기본 생활에 필요한 서비스에 접근할 수 있어야 합니다.'],['dignity','👤','인간의 존엄과 가치','모든 시민을 동등한 사회 구성원으로 존중해야 합니다.']];
const CITIZENS=[['wheel','♿','휠체어 이용 시민'],['elder','👵','고령 시민'],['hospital_user','🏥','병원 이용 시민'],['student','🎒','학생'],['worker','🧑‍💼','통근 시민'],['market_user','🏪','전통시장 상인·이용객'],['resident','👨‍👩‍👧','다른 역 인근 주민'],['parent','🧑‍🍼','유모차 이용 보호자']];
const LIMITS=[['region','특정 지역에 혜택이 집중될 수 있다.'],['wait','다른 역 이용자가 더 오래 기다려야 한다.'],['cost','예산의 많은 부분을 한정된 지역에 사용한다.'],['coverage','혜택을 받는 시민 범위가 좁을 수 있다.'],['future','다음 연도에도 추가 사업이 필요하다.'],['other','기타: 내가 생각한 다른 걱정거리']];
const REMEDIES=[['next','다음 사업에서 이번에 밀린 역을 우선 검토한다.'],['support','설치 전까지 임시 이동지원 서비스를 운영한다.'],['budget','추가 예산과 외부 지원을 확보한다.'],['voice','다음 설치 순위를 시민 의견과 함께 결정한다.'],['plan','단계별 설치 계획과 순서를 공개한다.'],['other','기타: 내가 제안하는 다른 보완 방법']];
const NEW_INFO={
 title:'새로운 정책 정보가 도착했습니다.',
 items:[
  {icon:'♿',title:'복지센터역 이용 수요 증가',text:'복지센터역 인근에 장애인 직업훈련센터가 다음 학기에 문을 엽니다. 교통약자 이용이 하루 약 350명 늘어날 것으로 예상됩니다.'},
  {icon:'🏥',title:'대학병원역 공사 지원',text:'대학병원이 공사 공간 일부를 제공하기로 하여 대학병원역 예상 사업비가 39억 원에서 35억 원으로 낮아졌습니다.'}
 ], impacts:[['budget','예산'],['need','이용 필요성'],['urgent','긴급성'],['balance','지역 형평성'],['none','기존 판단에 큰 영향 없음']]
};
const FINAL_COST={...Object.fromEntries(STATIONS.map(s=>[s.id,s.cost])),hospital:35};
const EVIDENCE=[
 ['ev_hospital_mob','대학병원역 교통약자 추정 이용객 2,140명','usage'],['ev_central_all','새봄중앙역 하루 이용객 18,400명','usage'],['ev_welfare_ratio','복지센터역은 교통약자 이용 비율이 가장 높음','usage'],['ev_welfare_center','복지센터역에서 장애인종합복지관까지 180m','map'],['ev_hospital_access','대학병원역은 진료·치료 목적 이동과 직접 연결','map'],['ev_market_elder','전통시장역은 시장·노인복지관 생활 이동과 연결','map'],['ev_school_route','새봄고역은 특수학급 통학로와 연결','map'],['ev_school_cost','새봄고역은 기존 시설 활용으로 8억 원','structure'],['ev_path','엘리베이터 수보다 지상~승강장의 끊김 없는 연결이 중요','structure'],['ev_wheel_voice','복지센터역 계단 때문에 우회·택시를 이용하는 시민 사례','voices'],['ev_hospital_voice','진료 뒤 계단 이동이 위험하다는 보호자 사례','voices'],['ev_budget50','이번 사업에서 사용할 수 있는 예산은 최대 50억 원','budget']
];
const ALLOWED_EVIDENCE=new Set(EVIDENCE.map(x=>x[0]));

function resourceVisual(id){
 if(id==='voices')return `<div class="resourceVisual"><h3>💬 구체적인 시민·이용자 발언</h3><div class="voiceGrid"><div class="voiceCard"><b>♿ 휠체어 이용 시민 · 복지센터역</b>“복지센터 수업이 있는 날에는 계단을 피하려고 두 정거장 전에 내려 택시를 탑니다. 이동시간과 교통비가 매번 더 듭니다.”</div><div class="voiceCard"><b>🏥 대학병원 이용 보호자 · 대학병원역</b>“재활치료가 끝난 뒤에는 환자가 더 지쳐 있습니다. 그 상태에서 계단을 오르내리게 하는 것이 가장 걱정됩니다.”</div><div class="voiceCard"><b>🏪 전통시장 상인 · 전통시장역</b>“장보기 짐을 든 고령 손님이 계단 앞에서 돌아가는 경우가 있습니다. 시장뿐 아니라 노인복지관 이동도 함께 봐주면 좋겠습니다.”</div><div class="voiceCard"><b>🧑‍💼 통근 시민 · 새봄중앙역</b>“매일 많은 사람이 환승하는 역도 중요합니다. 다만 이용객 수만으로 정하지 말고 더 절박한 이동이 어디인지도 비교해야 합니다.”</div><div class="voiceCard"><b>🎒 새봄고 학생 · 새봄고역</b>“특수학급 친구가 등하교할 때 다른 사람의 도움 없이 학교까지 이어서 이동할 수 있었으면 좋겠습니다.”</div><div class="voiceCard"><b>🧑‍🍼 유모차 이용 보호자 · 푸른공원역</b>“아이와 짐을 함께 들고 계단을 이용하기 어렵습니다. 가족 이동도 생활 속 접근성 문제라고 생각합니다.”</div></div></div>`;
 return '';
}
