const VERSION='v10.8';
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
function resourceImage(id){let src=RESOURCE_IMAGES[id];let title=RESOURCES.find(x=>x.id===id)?.title||'정책 자료';return src?`<img class="resourceLegacyImage" src="${src}" alt="${esc(title)} 시각 자료"><div class="resourceLegacyCaption">이 시각 자료와 아래의 설명·표를 함께 살펴보고, 서로 일치하거나 보완되는 정보를 비교하세요.</div>`:''}
const RESOURCES=[
 {id:'structure',icon:'🛗',title:'역사 구조와 무단차 이동',summary:'엘리베이터는 “몇 대가 있는가”보다 지상에서 승강장까지 계단 없이 이어지는지가 중요합니다.',facts:['새봄고역은 기존 시설을 활용해 1대만 추가하면 됩니다.','대학병원역은 양쪽 승강장을 연결해야 해 3대가 필요합니다.'],quiz:{q:'무단차 이동 경로가 완성된 경우는?',c:['역 안에 엘리베이터가 한 대라도 있을 때','지상 출입구부터 승강장까지 계단 없이 연결될 때','승강장에만 엘리베이터가 있을 때'],a:1}},
 {id:'usage',icon:'📊',title:'후보역 이용 현황',summary:'전체 이용객 수와 교통약자 이용 규모는 서로 다른 판단 기준이 될 수 있습니다.',facts:['새봄중앙역: 하루 18,400명 / 교통약자 1,850명','복지센터역: 하루 8,900명 / 교통약자 1,620명','대학병원역: 하루 15,700명 / 교통약자 2,140명','전통시장역: 하루 11,200명 / 교통약자 1,480명','푸른공원역: 하루 7,200명 / 교통약자 780명','새봄고역: 하루 9,600명 / 교통약자 510명'],quiz:{q:'교통약자 추정 이용객 수가 가장 많은 역은?',c:['새봄중앙역','복지센터역','대학병원역','전통시장역'],a:2}},
 {id:'map',icon:'🗺️',title:'주변 시설과 이동 목적',summary:'같은 한 번의 이동이라도 병원 진료, 복지서비스, 통학처럼 목적의 필요성이 다를 수 있습니다.',facts:['복지센터역: 장애인종합복지관 180m','대학병원역: 대학병원 220m','전통시장역: 전통시장 90m·노인복지관 350m','새봄고역: 고등학교 140m·특수학급 통학로'],quiz:{q:'진료·치료 목적 이동과 가장 직접적으로 연결되는 역은?',c:['푸른공원역','전통시장역','대학병원역','새봄고역'],a:2}},
 {id:'voices',icon:'💬',title:'시민의 목소리',summary:'같은 정책을 두고도 시민마다 중요하게 보는 기준이 다릅니다.',facts:['휠체어 이용 시민: “복지센터역 계단 때문에 다른 역에서 내려 택시를 이용합니다.”','대학병원 이용 보호자: “진료 뒤 환자를 부축해 계단을 오르는 일이 위험합니다.”','전통시장 상인: “노인 손님이 많지만 다른 지역의 사정도 함께 봐야 합니다.”','일반 시민: “가장 필요한 곳과 효과가 큰 곳을 함께 고려해야 합니다.”'],quiz:{q:'일반 시민이 강조한 판단에 가장 가까운 것은?',c:['한 역에 예산을 모두 사용한다','필요성과 정책 효과를 함께 본다','이용객 수만 본다'],a:1}},
 {id:'budget',icon:'💰',title:'올해 사용할 수 있는 예산',summary:'올해 엘리베이터 우선 설치 사업에 사용할 수 있는 예산은 최대 50억 원입니다.',facts:['이동편의시설 전체 예산 120억 원','이미 정해진 저상버스·보도정비 사업 70억 원','이번 정책에 사용할 수 있는 예산 50억 원'],quiz:{q:'이번 정책에 사용할 수 있는 최대 예산은?',c:['40억 원','50억 원','70억 원'],a:1}}
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
 if(id==='structure')return `<div class="resourceVisual"><h3>🏗️ 후보역 구조·설치 조건 비교</h3><p class="small muted">같은 엘리베이터 사업이라도 역 구조에 따라 필요한 대수와 비용이 달라집니다.</p><div class="tablewrap"><table><thead><tr><th>역</th><th>현재 이동 경로</th><th>계단 구간</th><th>필요 E/V</th><th>예상비</th></tr></thead><tbody><tr><td>새봄중앙역</td><td>개찰구→지하 2층 승강장</td><td>긴 계단 2구간</td><td>3대</td><td>24억</td></tr><tr><td>복지센터역</td><td>중간층을 거쳐 승강장 이동</td><td>긴 계단 2구간</td><td>2대</td><td>18억</td></tr><tr><td>대학병원역</td><td>양방향 승강장 분기 구조</td><td>계단 3구간</td><td>3대</td><td>39억</td></tr><tr><td>전통시장역</td><td>개찰구→지하 1층 승강장</td><td>계단 1구간</td><td>2대</td><td>20억</td></tr><tr><td>푸른공원역</td><td>개찰구→지하 1층 승강장</td><td>계단 1구간</td><td>2대</td><td>18억</td></tr><tr><td>새봄고역</td><td>기존 승강장 E/V 활용 가능</td><td>출입구 계단 1구간</td><td>1대</td><td>8억</td></tr></tbody></table></div><div class="visualRoute"><div>🌳 지상 출입구</div><div>⬇️ 개찰구</div><div>🪜 계단 구간</div><div>🚇 승강장</div></div><p class="help">정책 목표는 엘리베이터 ‘대수’ 자체가 아니라 <b>지상에서 승강장까지 계단 없이 이어지는 무단차 이동 경로</b>를 만드는 것입니다.</p></div>`;
 if(id==='usage')return `<div class="resourceVisual"><h3>📊 후보역 하루 이용 현황</h3><div class="tablewrap"><table><thead><tr><th>역</th><th>전체 이용객</th><th>교통약자 추정</th><th>교통약자 비율</th><th>자료에서 보이는 특징</th></tr></thead><tbody><tr><td>새봄중앙역</td><td>18,400명</td><td>1,850명</td><td>10.1%</td><td>전체 이용객·환승 수요 가장 큼</td></tr><tr><td>복지센터역</td><td>8,900명</td><td>1,620명</td><td>18.2%</td><td>교통약자 비율 가장 높음</td></tr><tr><td>대학병원역</td><td>15,700명</td><td>2,140명</td><td>13.6%</td><td>교통약자 추정 인원 가장 많음</td></tr><tr><td>전통시장역</td><td>11,200명</td><td>1,480명</td><td>13.2%</td><td>고령층·생활형 이동 수요</td></tr><tr><td>푸른공원역</td><td>7,200명</td><td>780명</td><td>10.8%</td><td>현 단계에서 비교적 낮은 수요</td></tr><tr><td>새봄고역</td><td>9,600명</td><td>510명</td><td>5.3%</td><td>교통약자 규모는 작지만 낮은 비용</td></tr></tbody></table></div><p class="help">‘전체 이용객 수가 많은 역’과 ‘교통약자의 필요가 큰 역’이 반드시 같지는 않습니다. 어떤 기준을 더 중요하게 볼지 생각해 보세요.</p></div>`;
 if(id==='map')return `<div class="resourceVisual"><h3>🗺️ 역 주변 주요 시설과 이동 목적</h3><div class="facilityGrid"><div class="facilityCard"><b>🏢 새봄중앙역</b><p>시청 320m<br>환승버스센터 80m</p></div><div class="facilityCard"><b>♿ 복지센터역</b><p>장애인종합복지관 180m</p></div><div class="facilityCard"><b>🏥 대학병원역</b><p>대학병원 220m</p></div><div class="facilityCard"><b>🏪 전통시장역</b><p>전통시장 90m<br>노인복지관 350m</p></div><div class="facilityCard"><b>🌳 푸른공원역</b><p>대형공원 120m</p></div><div class="facilityCard"><b>🏫 새봄고역</b><p>고등학교 140m<br>특수학급 통학로</p></div></div><p class="help">같은 1명의 이동이라도 <b>진료·복지·통학·환승·여가</b>처럼 목적의 필수성이 다를 수 있습니다.</p></div>`;
 if(id==='voices')return `<div class="resourceVisual"><h3>💬 시민·이용자 의견</h3><div class="voiceGrid"><div class="voiceCard"><b>♿ 휠체어 이용 시민</b>“복지센터역 계단 때문에 다른 역에서 내려 택시를 이용합니다.”</div><div class="voiceCard"><b>🏥 대학병원 이용 보호자</b>“진료 뒤 환자를 부축해 계단을 오르는 일이 위험합니다.”</div><div class="voiceCard"><b>🧑‍💼 새봄중앙역 통근 시민</b>“많은 사람이 이용하는 역도 중요하지만 더 절박한 곳이 있을 수 있습니다.”</div><div class="voiceCard"><b>🏪 전통시장 상인</b>“노인 손님이 많습니다. 다만 다른 지역 사정도 함께 봐야 합니다.”</div></div><p class="help">시민 의견은 ‘정답’을 알려주는 자료가 아니라, 정책에 따라 <b>누가 더 큰 혜택을 받고 누가 뒤로 밀리는지</b> 생각하게 하는 자료입니다.</p></div>`;
 if(id==='budget')return `<div class="resourceVisual"><h3>⚖️ 권리·정책 방향과 예산 제약</h3><div class="notice"><b>정책 방향</b><br>지하철과 같은 공공시설은 누구나 이용할 수 있어야 하며, 장애인·고령자 등 교통약자가 신체 조건 때문에 실질적으로 배제되지 않도록 접근 가능한 이동환경을 마련해야 합니다.</div><div class="budgetVisual"><div class="budgetUsed"><small>이미 정해진 사업</small><h3>70억</h3><div>저상버스 40억<br>보도정비 30억</div></div><div class="budgetFree"><small>이번 정책에 사용 가능</small><h3>50억</h3><div>엘리베이터 우선 설치 사업</div></div></div><p><b>이동편의시설 전체 예산: 120억 원</b></p><p class="help">필요한 곳이 많아도 모든 역을 한 번에 개선할 수 없습니다. 권리 보장과 함께 긴급성, 교통약자 규모, 필수시설 접근, 지역 형평성, 예산 효율을 비교해야 합니다.</p></div>`;
 return '';
}
