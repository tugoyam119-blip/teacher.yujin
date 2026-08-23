const $=s=>document.querySelector(s);
let teacherKey='';
let sessions=[];
let refreshHandle=null;
const TOTAL=90*60;
const TIMER_KEY='climateOperateTimerV224';
const STEP_MODE_KEY='climateOperateStepModeV224';
const ANNOUNCE_KEY='climateOperateAnnouncementV224';

const steps={
  0:{phase:'시작 안내 · 국가 배정',title:'4개 가상국가를 살펴보고 룰렛으로 대표 국가를 배정받습니다',desc:'학번과 이름을 입력한 뒤 한빛국·새봄국·푸른섬국·태양국의 배경을 먼저 읽고 국가 배정 룰렛을 돌립니다.',notice:'나라 이름을 외우는 활동이 아닙니다. <b>각 나라가 왜 서로 다른 이해관계를 갖는지</b> 배경을 먼저 확인하세요.'},
  1:{phase:'1차시 · 국가 입장 설계',title:'자료를 읽고 우리 국가의 조건을 파악하세요',desc:'배출 책임·기후피해·에너지 전환 자료를 비교하고 정책 판단에 중요한 자료 2개를 고릅니다.',notice:'수치가 높고 낮다는 사실만 쓰지 말고, <b>우리 국가의 정책 판단과 연결되는 사실</b>을 찾으세요.'},
  2:{phase:'1차시 · 국가 입장 설계',title:'우리 국가의 우선순위를 정하세요',desc:'경제 성장, 온실가스 감축, 에너지 안정, 기후피해 감소, 국제적 책임 중 1·2순위를 정합니다.',notice:'정답은 없습니다. <b>앞에서 본 자료와 국가 조건</b>이 선택 이유에 들어가면 됩니다.'},
  3:{phase:'1차시 · 국가 입장 설계',title:'국제기후기금 100억 원을 배분하세요',desc:'모든 사업에 기본 10억 원이 있습니다. 남은 50억 원을 5억 원 단위로 추가 배분하세요.',notice:'총액은 반드시 100억 원입니다. <b>최소 한 사업 30억 이상, 한 사업은 10억 유지</b> 조건을 확인하세요.'},
  4:{phase:'1차시 · 국가 입장 설계',title:'예산 선택의 TRADE-OFF를 확인하세요',desc:'무엇을 가장 우선했는지, 예산이 70억 원으로 줄면 무엇을 먼저 줄일지 판단합니다.',notice:'TRADE-OFF는 모든 것을 다 가질 수 없을 때 <b>무엇을 더 중요하게 보고 무엇을 포기하는지</b> 확인하는 과정입니다.'},
  5:{phase:'1차시 완료 · 협상 준비',title:'협상 전 우리 국가의 1차 입장을 확정하세요',desc:'우리 국가의 가장 중요한 목표와 국제사회에 요구할 방향을 2~3문장으로 정리합니다.',notice:'이 입장은 2차시 마지막에 다시 비교합니다. <b>협상 전 생각을 분명하게</b> 남겨두세요.'},
  6:{phase:'2차시 · 국제협상',title:'새로운 국제기후협약을 선택하세요',desc:'A 동일책임안, B 차등책임안, C 자율감축안 중 우리 국가가 지지할 국제규칙을 선택합니다.',notice:'우리 국가에 유리한지만 보지 말고, <b>다른 국가들과 함께 적용할 수 있는지</b>도 생각하세요.'},
  7:{phase:'2차시 · 국제협상',title:'누가 왜 반대할지 분석하세요',desc:'다른 국가의 조건을 다시 확인하고 우리 정책과 가장 크게 충돌할 국가를 찾습니다.',notice:'기억으로 찍지 말고 <b>상대 국가 카드의 산업·에너지·피해 조건</b>을 근거로 판단하세요.'},
  8:{phase:'2차시 · 국제협상',title:'갈등을 줄일 절충안을 만드세요',desc:'우리 국가와 상대 국가가 모두 일부 수용할 수 있도록 감축률·재정·시기·기술 등의 조건을 조정합니다.',notice:'한쪽만 양보하는 답보다 <b>양쪽이 무엇을 얻고 무엇을 양보하는지</b> 드러나는 절충안이 좋습니다.'},
  9:{phase:'2차시 · 국제협상',title:'국제협력 주체의 역할을 나누세요',desc:'국가·UN·국제환경기구·기업·NGO·시민 중 2개 주체를 골라 서로 다른 역할을 맡깁니다.',notice:'주체의 이름보다 <b>그 주체가 실제로 할 수 있는 역할인지</b> 확인하세요.'},
 10:{phase:'2차시 · 최종 재판단',title:'협상 후 최종 합의를 완성하세요',desc:'협상 전 입장을 다시 보고, 유지할지 수정할지 판단한 뒤 최종 정책 합의를 작성합니다.',notice:'앞 답안을 그대로 반복하기보다 <b>협상 과정에서 새롭게 고려한 점</b>이 최종 판단에 드러나게 하세요.'}
};
const progressToStep=p=>{p=Number(p||0); if(p>=100)return 10;if(p>=90)return 9;if(p>=80)return 8;if(p>=70)return 7;if(p>=60)return 6;if(p>=50)return 5;if(p>=38)return 4;if(p>=27)return 3;if(p>=17)return 2;if(p>=8)return 1;return 0};

function timerState(){try{return JSON.parse(localStorage.getItem(TIMER_KEY)||'null')}catch{return null}}
function saveTimerState(s){localStorage.setItem(TIMER_KEY,JSON.stringify(s))}
function currentRemaining(){const s=timerState();if(!s)return TOTAL;if(s.status==='running')return Math.max(0,Math.round((s.endsAt-Date.now())/1000));return Math.max(0,Number(s.remaining??TOTAL))}
function renderTimer(){const sec=currentRemaining(),m=Math.floor(sec/60),ss=sec%60;$('#classTimer').textContent=`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;const card=$('#timerCard');card.classList.toggle('timer-warning',sec<=15*60&&sec>5*60);card.classList.toggle('timer-danger',sec<=5*60);const s=timerState();$('#timerHint').textContent=sec<=0?'수행평가 종료 시간입니다':s?.status==='running'?'수행평가 진행 중':s?.status==='paused'?'일시정지됨':'수업 시작과 함께 시작하세요';if(sec<=0&&s?.status==='running'){saveTimerState({status:'paused',remaining:0});}}
function timerStart(){const sec=currentRemaining();saveTimerState({status:'running',endsAt:Date.now()+sec*1000,remaining:sec});renderTimer()}
function timerPause(){saveTimerState({status:'paused',remaining:currentRemaining()});renderTimer()}
function timerReset(){if(!confirm('교실 공용 타이머를 90:00으로 초기화할까요?\n학생 개인 타이머에는 영향을 주지 않습니다.'))return;saveTimerState({status:'paused',remaining:TOTAL});renderTimer()}

function modeStep(){const mode=localStorage.getItem(STEP_MODE_KEY)||'auto';if(mode!=='auto')return Number(mode);const active=sessions.filter(s=>s.status==='in_progress');if(!active.length)return sessions.some(s=>s.status==='submitted')?10:0;const counts={};active.forEach(s=>{const st=progressToStep(s.progress);counts[st]=(counts[st]||0)+1});return Number(Object.entries(counts).sort((a,b)=>b[1]-a[1]||Number(a[0])-Number(b[0]))[0][0])}
function renderStep(){const mode=localStorage.getItem(STEP_MODE_KEY)||'auto',st=modeStep(),d=steps[st]||steps[0];$('#stepPhase').textContent=d.phase;$('#stepModeBadge').textContent=mode==='auto'?'자동 추적':'교사 지정';$('#stepModeBadge').classList.toggle('manual',mode!=='auto');$('#stepNumber').textContent=`STEP ${st}`;$('#stepTitle').textContent=d.title;$('#stepDesc').textContent=d.desc;$('#studentNotice').innerHTML=d.notice;$('#stepSelect').value=mode}
function renderOverview(){const all=sessions.length,submitted=sessions.filter(s=>s.status==='submitted').length,active=sessions.filter(s=>s.status==='in_progress'),phase1=active.filter(s=>Number(s.progress||0)<50).length,breaks=active.filter(s=>Number(s.progress||0)===50).length,phase2=active.filter(s=>Number(s.progress||0)>50).length;const avg=all?Math.round(sessions.reduce((a,s)=>a+Number(s.progress||0),0)/all):0;$('#oAll').textContent=all;$('#oSubmitted').textContent=submitted;$('#oPhase1').textContent=phase1+breaks;$('#oPhase2').textContent=phase2;$('#phase1Count').textContent=`${phase1}명`;$('#breakCount').textContent=`${breaks}명`;$('#phase2Count').textContent=`${phase2}명`;$('#submittedCount').textContent=`${submitted}명`;$('#avgProgress').textContent=`${avg}%`;$('#avgProgressBar').style.width=`${avg}%`;const activeCounts={};active.forEach(s=>{const st=progressToStep(s.progress);activeCounts[st]=(activeCounts[st]||0)+1});const top=Object.entries(activeCounts).sort((a,b)=>b[1]-a[1]||Number(a[0])-Number(b[0]))[0];$('#crowdedStep').textContent=top?`STEP ${top[0]} · ${top[1]}명`:(submitted?'모두 제출 완료':'아직 시작 전');renderStep()}
async function refreshOverview(){if(!teacherKey)return;try{const r=await fetch('/api/teacher/submissions',{headers:{'x-teacher-key':teacherKey},cache:'no-store'});if(!r.ok){if(r.status===401){sessionStorage.removeItem('climateOperateTeacherKey');location.reload();return}throw new Error()}const j=await r.json();sessions=j.sessions||[];renderOverview();$('#lastUpdated').textContent=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});$('#syncStatus').textContent='실시간 현황 연결됨';$('#syncStatus').classList.remove('sync-error')}catch{$('#syncStatus').textContent='현황 연결 재시도 중';$('#syncStatus').classList.add('sync-error')}}
function renderAnnouncement(){const text=localStorage.getItem(ANNOUNCE_KEY)||'앞 단계의 선택은 ‘나의 결정 전체보기’에서 다시 확인할 수 있습니다.';$('#announcementText').textContent=text;$('#announcementInput').value=text}
async function login(){const pw=$('#operatePassword').value.trim(),msg=$('#operateLoginMessage');msg.classList.add('hidden');if(!pw){msg.textContent='교사용 비밀번호를 입력하세요.';msg.classList.remove('hidden');return}try{const r=await fetch('/api/teacher/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});const j=await r.json().catch(()=>({}));if(!r.ok){msg.textContent=j.error||'비밀번호를 확인하세요.';msg.classList.remove('hidden');return}teacherKey=pw;sessionStorage.setItem('climateOperateTeacherKey',pw);openApp()}catch{msg.textContent='교사용 서버에 연결하지 못했습니다.';msg.classList.remove('hidden')}}
function openApp(){$('#operateLogin').classList.add('hidden');$('#operateApp').classList.remove('hidden');renderAnnouncement();renderTimer();refreshOverview();clearInterval(refreshHandle);refreshHandle=setInterval(refreshOverview,5000)}
function enterPresentation(){$('#operateControls').classList.add('hidden');$('#exitPresentation').classList.remove('hidden');document.body.classList.add('presentation-mode')}
function exitPresentation(){$('#operateControls').classList.remove('hidden');$('#exitPresentation').classList.add('hidden');document.body.classList.remove('presentation-mode');$('#operateControls').scrollIntoView({behavior:'smooth',block:'start'})}

$('#operateLoginBtn').onclick=login;$('#operatePassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('#timerStart').onclick=timerStart;$('#timerPause').onclick=timerPause;$('#timerReset').onclick=timerReset;
$('#stepSelect').onchange=e=>{localStorage.setItem(STEP_MODE_KEY,e.target.value);renderStep()};
$('#announcementApply').onclick=()=>{const t=$('#announcementInput').value.trim();if(!t)return;localStorage.setItem(ANNOUNCE_KEY,t);renderAnnouncement()};
$('#announcementDefault').onclick=()=>{localStorage.removeItem(ANNOUNCE_KEY);renderAnnouncement()};
$('#presentationBtn').onclick=enterPresentation;$('#exitPresentation').onclick=exitPresentation;
$('#fullScreenBtn').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}};
setInterval(renderTimer,500);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('presentation-mode'))exitPresentation()});
const saved=sessionStorage.getItem('climateOperateTeacherKey');if(saved){teacherKey=saved;openApp()}
