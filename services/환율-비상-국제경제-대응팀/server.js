const http=require('http');
const fs=require('fs');
const path=require('path');
const {parseRoster}=require('./lib/roster-standard');

const PORT=Number(process.env.PORT||3000);
const TEACHER_PIN=String(process.env.TEACHER_PIN||'000000');
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
const STORE_FILE=path.join(DATA_DIR,'exchange-crisis.json');
fs.mkdirSync(DATA_DIR,{recursive:true});

const now=()=>Date.now();
const emptyStore=()=>({
  version:3,
  classes:{
    '3학년 1반':{status:'closed',duration_minutes:45,started_at:null,paused_at:null,paused_seconds:0,deadline:null},
    '3학년 2반':{status:'closed',duration_minutes:45,started_at:null,paused_at:null,paused_seconds:0,deadline:null},
    '3학년 3반':{status:'closed',duration_minutes:45,started_at:null,paused_at:null,paused_seconds:0,deadline:null},
    '모의반':{status:'closed',duration_minutes:45,started_at:null,paused_at:null,paused_seconds:0,deadline:null}
  },
  roster:[], attempts:{}, visits:{}, helps:[], gradeHistory:[], updated_at:now()
});
function readStore(){try{return {...emptyStore(),...JSON.parse(fs.readFileSync(STORE_FILE,'utf8'))}}catch{return emptyStore()}}
function writeStore(s){s.updated_at=now();fs.writeFileSync(STORE_FILE,JSON.stringify(s,null,2))}
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type.startsWith('application/json')?JSON.stringify(body):body)}
function bodyJson(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>2_000_000){req.destroy();reject(new Error('too large'))}});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}
function classNameFor(id){const s=String(id||'');if(/^301/.test(s))return '3학년 1반';if(/^302/.test(s))return '3학년 2반';if(/^303/.test(s))return '3학년 3반';return '모의반'}
function timePenalty(a){
  if(a.extra_penalty_exempt)return 0;
  const m=Number(a.extra_granted_minutes||0);
  if(m<=0)return 0;if(m<=5)return 2;if(m<=10)return 4;return 6;
}
function timeScore(a){const p=timePenalty(a);return p===0?6:p===2?4:p===4?2:0}
function attemptView(a){return a?{...a,extra_penalty:timePenalty(a)}:null}
function teacherOK(code){return String(code||'')===TEACHER_PIN}
function scoreRubric(a){
  const g=a.answers||{};
  const textLen=(g.exportReason||'').length+(g.importReason||'').length+(g.policyEffect||'').length+(g.policyRisk||'').length+(g.report||'').length;
  const economy=(g.won&&g.dollar&&g.cost&&g.exportReason&&g.importReason)?25:(g.won||g.dollar||g.cost?16:0);
  const policy=(Array.isArray(g.policies)&&g.policies.length>=2&&g.policyEffect&&g.policyRisk)?25:(Array.isArray(g.policies)&&g.policies.length?16:0);
  const organization=textLen>=140?20:textLen>=80?16:textLen?12:0;
  const cooperation=(g.report||'').length>=120?20:(g.report||'').length>=60?16:(g.report||'').length?12:0;
  const completion=(g.report||'').length>=120?4:(g.report||'').length>=60?3:(g.report||'').length?2:0;
  const time=timeScore(a);
  return {economy,policy,organization,cooperation,completion,time,total:economy+policy+organization+cooperation+completion+time};
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

const CSS=`<style>
:root{--navy:#102b46;--blue:#176f87;--mint:#eaf6f2;--line:#d8e4e5;--ink:#193545;--warn:#fff1d7}
*{box-sizing:border-box}body{margin:0;background:#f8faf7;color:var(--ink);font-family:Arial,"Noto Sans KR",sans-serif}
main{width:min(980px,calc(100% - 24px));margin:24px auto}.card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:22px;margin:14px 0;box-shadow:0 8px 26px #1730420d}
h1,h2,h3{color:var(--navy)}label{display:grid;gap:6px;margin:10px 0}input,textarea,select,button{font:inherit}input,textarea,select{width:100%;padding:12px;border:1px solid #cbdadd;border-radius:11px}textarea{min-height:110px}
button,.btn{border:0;border-radius:11px;padding:11px 15px;font-weight:800;cursor:pointer;background:var(--navy);color:#fff}.secondary{background:#fff;color:var(--navy);border:1px solid var(--line)}.danger{background:#a53b3b}.row{display:flex;gap:8px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.muted{color:#6f858d}.good{background:#e7f6ef;color:#17664f;padding:10px;border-radius:10px}.warn{background:var(--warn);color:#8a6113;padding:10px;border-radius:10px}.pill{display:inline-block;padding:5px 9px;border-radius:99px;background:#edf4f5;margin:2px;font-size:12px}.hidden{display:none}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.timer{font-size:28px;font-weight:900;color:var(--navy)}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--line);padding:9px;text-align:left;font-size:13px}
@media(max-width:700px){.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>`;

function studentHtml(){
return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>환율 비상! 국제경제 대응팀</title>${CSS}</head><body><main>
<section class="card" id="login"><div class="muted">학생용 · v3.0 복원본</div><h1>환율 비상!<br>국제경제 대응팀</h1><p>교사가 서버를 연 뒤 학번과 이름으로 입장하세요.</p><form id="loginForm"><label>학번<input id="sid" placeholder="예: 30101"></label><label>이름<input id="sname" placeholder="이름"></label><button>입장하고 대기하기</button></form><p id="msg"></p></section>
<section id="exam" class="hidden">
<div class="card top"><div><b id="who"></b><div class="muted" id="phase"></div></div><div class="timer" id="timer">45:00</div></div>
<div class="card"><h2>1단계 · 환율 변화 판단</h2><div class="grid">
<label>원화 가치<select id="won"><option value="">선택</option><option>하락</option><option>상승</option></select></label>
<label>달러 가치<select id="dollar"><option value="">선택</option><option>상승</option><option>하락</option></select></label>
<label>100달러 상품 구매 비용<select id="cost"><option value="">선택</option><option>증가</option><option>감소</option></select></label></div></div>
<div class="card"><h2>2단계 · 집단별 영향</h2><label>수출기업이 유리해질 수 있는 이유<textarea id="exportReason"></textarea></label><label>수입기업이 불리해질 수 있는 이유<textarea id="importReason"></textarea></label></div>
<div class="card"><h2>3단계 · 경제적 영향</h2><label>경제적 영향<textarea id="effects" placeholder="물가, 생산비, 부채 부담 등"></textarea></label></div>
<div class="card"><h2>4단계 · 정부 대응책 결정</h2><p>가장 필요하다고 판단한 정책을 2개 선택하세요.</p><div id="policies"></div><label>기대 효과<textarea id="policyEffect"></textarea></label><label>부작용<textarea id="policyRisk"></textarea></label></div>
<div class="card"><h2>5단계 · 최종 대응 보고서</h2><textarea id="report" placeholder="문제와 환율 변화, 정책 2개, 효과와 부작용을 포함해 작성하세요."></textarea><div class="row"><button id="helpBtn" class="secondary">도움 요청</button><button id="extraBtn" class="secondary">추가시간 요청</button><button id="submitBtn">최종 제출</button></div><p id="saveMsg" class="muted"></p></div>
</section>
<script>
const policyList=['외환시장에 달러 공급','기준금리 인상','수입 생필품 가격 지원','수출기업 지원 확대','수입기업 긴급대출','모든 수입품 수입 금지'];
let studentId='',studentName='',attempt=null,setting=null;
const $=id=>document.getElementById(id);
$('policies').innerHTML=policyList.map((p,i)=>'<label><input type="checkbox" name="pol" value="'+p+'"> '+p+'</label>').join('');
function answers(){return {won:$('won').value,dollar:$('dollar').value,cost:$('cost').value,exportReason:$('exportReason').value,importReason:$('importReason').value,effects:$('effects').value,policies:[...document.querySelectorAll('input[name=pol]:checked')].map(x=>x.value),policyEffect:$('policyEffect').value,policyRisk:$('policyRisk').value,report:$('report').value}}
function fill(a){const g=a?.answers||{};for(const k of ['won','dollar','cost','exportReason','importReason','effects','policyEffect','policyRisk','report'])if($(k))$(k).value=g[k]||'';document.querySelectorAll('input[name=pol]').forEach(x=>x.checked=(g.policies||[]).includes(x.value))}
async function post(url,b){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}),j=await r.json();if(!r.ok)throw Error(j.error||'요청 실패');return j}
$('loginForm').onsubmit=async e=>{e.preventDefault();studentId=$('sid').value.trim();studentName=$('sname').value.trim();try{let j=await post('/api/exam',{action:'login',studentId,name:studentName});attempt=j.attempt;setting=j.setting;$('login').classList.add('hidden');$('exam').classList.remove('hidden');$('who').textContent=studentId+' '+studentName;fill(attempt);tick();poll()}catch(err){$('msg').textContent=err.message}};
async function save(){if(!attempt||attempt.status==='submitted')return;try{let j=await post('/api/exam',{action:'save',studentId,answers:answers(),currentStep:5});attempt=j.attempt;$('saveMsg').textContent='저장 완료 '+new Date().toLocaleTimeString()}catch(e){$('saveMsg').textContent=e.message}}
document.addEventListener('input',()=>{clearTimeout(window._sv);window._sv=setTimeout(save,700)});
$('submitBtn').onclick=async()=>{if(!confirm('제출할까요?'))return;try{let j=await post('/api/exam',{action:'submit',studentId,answers:answers(),currentStep:5,submissionType:'manual'});attempt=j.attempt;alert('제출 완료');tick()}catch(e){alert(e.message)}};
$('helpBtn').onclick=async()=>{const m=prompt('어려운 내용을 간단히 적어 주세요.');if(m)try{alert((await post('/api/help',{action:'request',studentId,message:m})).message)}catch(e){alert(e.message)}};
$('extraBtn').onclick=async()=>{if(!confirm('추가시간을 실제로 사용하면 5분 이내 2점, 10분 이내 4점이 감점됩니다. 요청할까요?'))return;try{alert((await post('/api/extra',{action:'request',studentId})).message)}catch(e){alert(e.message)}};
function tick(){if(!setting)return;const cls=setting.class_name||'';$('phase').textContent=cls+' · '+(attempt?.status||'');let end=Number(setting.deadline||0);if(attempt?.extra_started_at&&attempt?.extra_granted_minutes)end=Number(attempt.extra_started_at)+Number(attempt.extra_granted_minutes)*60000;let s=end?Math.max(0,Math.floor((end-Date.now())/1000)):Number(setting.duration_minutes||45)*60;$('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');if(attempt?.status==='submitted')$('submitBtn').disabled=true}
setInterval(tick,1000);
async function poll(){try{const r=await fetch('/api/exam?studentId='+encodeURIComponent(studentId),{cache:'no-store'}),j=await r.json();if(r.ok){attempt=j.attempt||attempt;setting=j.setting||setting;fill(attempt);tick()}}catch{}setTimeout(poll,5000)}
</script></main></body></html>`}

function teacherHtml(){
return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>환율 비상! 교사 관리실</title>${CSS}</head><body><main>
<section id="tlogin" class="card"><div class="muted">교사용 관리 · v3.0 복원본</div><h1>교사 관리실</h1><form id="tform"><label>인증번호<input type="password" id="code"></label><button>관리 화면 입장</button></form><p id="tmsg"></p></section>
<section id="dash" class="hidden">
<div class="card top"><div><h1>환율 비상! 국제경제 대응팀</h1><div class="muted">서버·학생 기록·채점 관리</div></div><button id="refresh" class="secondary">새로고침</button></div>
<div class="card"><h2>반별 운영</h2><div class="row"><select id="classSel"><option>3학년 1반</option><option>3학년 2반</option><option>3학년 3반</option><option>모의반</option></select><button data-act="open_class">입장 열기</button><button data-act="start_class">수행 시작</button><button data-act="pause_class" class="secondary">일시정지</button><button data-act="resume_class" class="secondary">재개</button><button data-act="close_class" class="danger">종료</button></div><p id="classState" class="muted"></p></div>
<div class="card"><h2>학생명단</h2><input type="file" id="rosterFile" accept=".csv"><button id="rosterBtn" class="secondary">CSV 업로드</button></div>
<div class="card"><div class="top"><h2>학생별 진행·채점 현황</h2><button id="gradeAll" class="secondary">미가채점 일괄 가채점</button></div><div style="overflow:auto"><table><thead><tr><th>반</th><th>학번</th><th>이름</th><th>상태</th><th>AI/자동</th><th>교사점수</th><th>추가시간</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>
<div class="card"><h2>도움 요청</h2><div id="helps"></div></div>
</section>
<dialog id="detail" style="width:min(760px,95vw);border:0;border-radius:18px;padding:0"><div class="card" style="margin:0"><button id="closeDetail" class="secondary">닫기</button><div id="detailBody"></div></div></dialog>
<script>
let code='',data=null;const $=id=>document.getElementById(id);
async function get(u){const r=await fetch(u,{cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error||'조회 실패');return j}
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}),j=await r.json();if(!r.ok)throw Error(j.error||'요청 실패');return j}
$('tform').onsubmit=async e=>{e.preventDefault();code=$('code').value.trim();try{await load();$('tlogin').classList.add('hidden');$('dash').classList.remove('hidden')}catch(err){$('tmsg').textContent=err.message}};
$('refresh').onclick=load;
document.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{try{alert((await post('/api/admin',{code,action:b.dataset.act,className:$('classSel').value})).message);await load()}catch(e){alert(e.message)}});
$('rosterBtn').onclick=async()=>{const f=$('rosterFile').files[0];if(!f)return;try{alert((await post('/api/admin',{code,action:'import_roster',csvText:await f.text()})).message);await load()}catch(e){alert(e.message)}};
$('gradeAll').onclick=async()=>{for(const a of (data.attempts||[]).filter(x=>x.status==='submitted'&&!x.ai_score)){try{await post('/api/admin',{code,action:'ai_grade',studentId:a.student_id})}catch{}}await load()};
async function load(){data=await get('/api/admin?code='+encodeURIComponent(code));render()}
function render(){const cls=$('classSel').value,s=(data.sessions||[]).find(x=>x.class_name===cls);$('classState').textContent=cls+' · '+(s?.status||'closed');$('rows').innerHTML=(data.attempts||[]).map(a=>'<tr><td>'+a.class_name+'</td><td>'+a.student_id+'</td><td>'+a.name+'</td><td>'+a.status+'</td><td>'+(a.ai_score??'')+'</td><td>'+(a.teacher_score??'')+'</td><td>'+(a.extra_status||'none')+'</td><td><button onclick="openDetail(\''+a.student_id+'\')">보기</button></td></tr>').join('');$('helps').innerHTML=(data.helps||[]).filter(x=>x.status==='open').map(h=>'<div class="warn"><b>'+h.class_name+' · '+h.student_id+' '+h.name+'</b><p>'+h.message+'</p><button onclick="resolveHelp(\''+h.student_id+'\')">처리 완료</button></div>').join('')||'<p class="muted">대기 중인 요청 없음</p>'}
window.resolveHelp=async id=>{await post('/api/help',{code,action:'resolve',studentId:id});await load()};
window.openDetail=async id=>{const j=await get('/api/admin?code='+encodeURIComponent(code)+'&studentId='+encodeURIComponent(id)),a=j.attempt,g=a.answers||{},r=a.teacher_breakdown||a.ai_breakdown||{economy:25,policy:25,organization:20,cooperation:20,completion:4,time:6};$('detailBody').innerHTML='<h2>'+a.student_id+' '+a.name+'</h2><p><b>최종 보고서</b><br>'+String(g.report||'').replaceAll('<','&lt;')+'</p><div class="grid">'+[['economy',25,'경제 이해'],['policy',25,'정책 판단'],['organization',20,'국제기구'],['cooperation',20,'국제협력'],['completion',4,'완성도'],['time',6,'시간']].map(x=>'<label>'+x[2]+' /'+x[1]+'<input type="number" id="g_'+x[0]+'" value="'+(r[x[0]]??0)+'" '+(x[0]==='time'?'disabled':'')+'></label>').join('')+'</div><label>피드백<textarea id="feedback">'+(a.feedback||'')+'</textarea></label><div class="row"><button onclick="aiGrade(\''+a.student_id+'\')">가채점</button><button onclick="saveGrade(\''+a.student_id+'\')">점수·이력 저장</button><button class="secondary" onclick="extraApprove(\''+a.student_id+'\',5,false)">5분 승인 · -2</button><button class="secondary" onclick="extraApprove(\''+a.student_id+'\',10,false)">10분 승인 · -4</button><button class="secondary" onclick="extraApprove(\''+a.student_id+'\',5,true)">기술문제 5분</button></div>';$('detail').showModal()};
$('closeDetail').onclick=()=>$('detail').close();
window.aiGrade=async id=>{await post('/api/admin',{code,action:'ai_grade',studentId:id});$('detail').close();await load();openDetail(id)};
window.saveGrade=async id=>{let rubric={};for(const k of ['economy','policy','organization','cooperation','completion','time'])rubric[k]=Number($('g_'+k).value||0);await post('/api/admin',{code,action:'grade',studentId:id,rubric,feedback:$('feedback').value});$('detail').close();await load()};
window.extraApprove=async(id,min,exempt)=>{await post('/api/extra',{code,studentId:id,action:'approve',minutes:min,exempt});$('detail').close();await load()};
setInterval(()=>{if(code)load().catch(()=>{})},10000);
</script></main></body></html>`}

async function handleApi(req,res,url){
  const s=readStore();

  if(req.method==='POST'&&url.pathname==='/api/roster/validate'){
    try{const b=await bodyJson(req),report=parseRoster(b.csvText||b.students||[]);return send(res,report.students.length?200:400,{ok:!!report.students.length,report})}catch{return send(res,400,{ok:false,error:'명단 요청을 읽지 못했습니다.'})}
  }

  if(url.pathname==='/api/exam'){
    if(req.method==='GET'){
      const id=String(url.searchParams.get('studentId')||''),a=s.attempts[id],cls=a?.class_name||classNameFor(id),setting={class_name:cls,...(s.classes[cls]||{})};
      return send(res,200,{setting,attempt:attemptView(a)});
    }
    if(req.method==='POST'){
      const b=await bodyJson(req),id=String(b.studentId||'').trim();
      if(!id)return send(res,400,{error:'학번을 입력하세요.'});
      const action=b.action,cls=classNameFor(id),setting=s.classes[cls]||(s.classes[cls]={status:'closed',duration_minutes:45});
      if(action==='login'){
        const name=String(b.name||'').trim(),r=s.roster.find(x=>String(x.student_id)===id);
        if(r&&String(r.name).trim()!==name)return send(res,400,{error:'등록된 이름과 일치하지 않습니다.'});
        if(setting.status==='closed')return send(res,423,{error:cls+' 수행평가가 아직 시작되지 않았습니다.'});
        let a=s.attempts[id];
        if(!a)a=s.attempts[id]={student_id:id,name,class_name:cls,answers:{},status:'waiting',current_step:1,started_at:null,updated_at:now(),submitted_at:null,submission_type:null,ai_score:null,ai_feedback:null,ai_breakdown:null,teacher_score:null,teacher_breakdown:null,feedback:'',extra_status:'none',extra_requested_at:null,extra_granted_minutes:0,extra_started_at:null,extra_penalty_exempt:0};
        const v=s.visits[id]||{student_id:id,name,class_name:cls,first_seen_at:now(),login_count:0};v.last_seen_at=now();v.login_count++;v.last_phase=a.status;s.visits[id]=v;writeStore(s);
        return send(res,200,{setting:{class_name:cls,...setting},attempt:attemptView(a)});
      }
      const a=s.attempts[id];if(!a)return send(res,404,{error:'응시 기록을 찾지 못했습니다.'});
      if(action==='start'){if(!setting.started_at)return send(res,423,{error:'교사가 수행을 시작하지 않았습니다.'});a.status='in_progress';a.started_at=a.started_at||now()}
      else if(action==='save'){a.answers=b.answers||{};a.current_step=Number(b.currentStep||a.current_step||1);a.updated_at=now()}
      else if(action==='submit'){a.answers=b.answers||a.answers||{};a.current_step=Number(b.currentStep||5);a.status='submitted';a.submitted_at=now();a.submission_type=b.submissionType||'manual'}
      else if(action==='reopen_self'){if(a.status!=='submitted')return send(res,400,{error:'제출 완료 기록이 아닙니다.'});a.status='in_progress';a.submitted_at=null}
      else return send(res,400,{error:'알 수 없는 동작입니다.'});
      s.visits[id]={...(s.visits[id]||{}),student_id:id,name:a.name,class_name:a.class_name,last_seen_at:now(),last_phase:a.status};writeStore(s);
      return send(res,200,{setting:{class_name:cls,...setting},attempt:attemptView(a)});
    }
  }

  if(url.pathname==='/api/help'){
    if(req.method==='GET'){
      const code=url.searchParams.get('code'),studentId=url.searchParams.get('studentId');
      if(code){if(!teacherOK(code))return send(res,401,{error:'인증번호가 올바르지 않습니다.'});return send(res,200,{helps:s.helps.filter(x=>x.status==='open'),helpHistory:s.helps})}
      const h=[...s.helps].reverse().find(x=>x.student_id===studentId&&x.status==='open');return send(res,200,{help:h||null});
    }
    if(req.method==='POST'){
      const b=await bodyJson(req);
      if(b.action==='request'){const a=s.attempts[String(b.studentId)];if(!a)return send(res,404,{error:'응시 기록이 없습니다.'});s.helps.push({id:String(now()),student_id:a.student_id,name:a.name,class_name:a.class_name,message:String(b.message||'').slice(0,300),status:'open',requested_at:now()});writeStore(s);return send(res,200,{ok:true,message:'교사에게 도움 요청을 보냈습니다.'})}
      if(b.action==='resolve'){if(!teacherOK(b.code))return send(res,401,{error:'인증번호가 올바르지 않습니다.'});for(const h of s.helps)if(h.student_id===String(b.studentId)&&h.status==='open'){h.status='resolved';h.resolved_at=now()}writeStore(s);return send(res,200,{ok:true,message:'도움 요청을 처리 완료했습니다.'})}
    }
  }

  if(url.pathname==='/api/extra'&&req.method==='POST'){
    const b=await bodyJson(req),a=s.attempts[String(b.studentId)];if(!a)return send(res,404,{error:'응시 기록이 없습니다.'});
    if(b.action==='request'){a.extra_status='pending';a.extra_requested_at=now();writeStore(s);return send(res,200,{ok:true,message:'추가시간 요청을 보냈습니다.'})}
    if(!teacherOK(b.code))return send(res,401,{error:'인증번호가 올바르지 않습니다.'});
    if(b.action==='approve'){a.extra_status='approved';a.extra_granted_minutes=Math.max(0,Number(b.minutes||5));a.extra_started_at=now();a.extra_penalty_exempt=b.exempt?1:0;writeStore(s);return send(res,200,{ok:true,message:'추가시간을 승인했습니다.'})}
    if(b.action==='deny'){a.extra_status='denied';writeStore(s);return send(res,200,{ok:true,message:'추가시간 요청을 거절했습니다.'})}
  }

  if(url.pathname==='/api/admin'){
    if(req.method==='GET'){
      const code=url.searchParams.get('code');if(!teacherOK(code))return send(res,401,{error:'인증번호가 올바르지 않습니다.'});
      const studentId=url.searchParams.get('studentId');
      if(studentId){const a=s.attempts[studentId];if(!a)return send(res,404,{error:'학생 기록이 없습니다.'});return send(res,200,{attempt:attemptView({...a,visit:s.visits[studentId],grade_history:s.gradeHistory.filter(x=>x.student_id===studentId)})})}
      return send(res,200,{setting:{id:1,status:'closed',duration_minutes:45,started_at:null,paused_at:null,paused_seconds:0,updated_at:s.updated_at},sessions:Object.entries(s.classes).map(([class_name,x])=>({class_name,...x})),roster:s.roster,visits:Object.values(s.visits),attempts:Object.values(s.attempts).map(attemptView),helps:s.helps,aiConfig:{configured:false,source:'restored-compatible',model:'deterministic-rubric'}});
    }
    if(req.method==='POST'){
      const b=await bodyJson(req);if(!teacherOK(b.code))return send(res,401,{error:'인증번호가 올바르지 않습니다.'});const action=b.action,cls=b.className||'3학년 1반',c=s.classes[cls]||(s.classes[cls]={status:'closed',duration_minutes:45});
      if(action==='open_class'){c.status='open';c.started_at=null;c.deadline=null}
      else if(action==='start_class'){c.status='open';c.started_at=now();c.deadline=c.started_at+Number(c.duration_minutes||45)*60000;for(const a of Object.values(s.attempts))if(a.class_name===cls&&a.status==='waiting'){a.status='in_progress';a.started_at=a.started_at||c.started_at}}
      else if(action==='pause_class'){if(c.started_at&&!c.paused_at)c.paused_at=now()}
      else if(action==='resume_class'){if(c.paused_at){const d=now()-c.paused_at;c.paused_seconds=Number(c.paused_seconds||0)+d;c.deadline=Number(c.deadline||now())+d;c.paused_at=null}}
      else if(action==='close_class'){c.status='closed'}
      else if(action==='import_roster'){const report=parseRoster(b.csvText||'');if(!report.students.length)return send(res,400,{error:'유효한 명단이 없습니다.'});s.roster=report.students.map(x=>({student_id:String(x.studentId||x.student_id),name:x.name,class_name:x.className||x.class_name||classNameFor(x.studentId||x.student_id)}));writeStore(s);return send(res,200,{ok:true,message:s.roster.length+'명의 명단을 저장했습니다.'})}
      else if(action==='ai_grade'){const a=s.attempts[String(b.studentId)];if(!a)return send(res,404,{error:'학생 기록이 없습니다.'});const r=scoreRubric(a);a.ai_breakdown=r;a.ai_score=r.total;a.ai_feedback='복원 서버의 기준표 자동 가채점입니다. 최종 점수는 교사가 확인하세요.';a.ai_graded_at=now();writeStore(s);return send(res,200,{ok:true,message:'가채점했습니다.',grade:r})}
      else if(action==='grade'){const a=s.attempts[String(b.studentId)];if(!a)return send(res,404,{error:'학생 기록이 없습니다.'});const r={...(b.rubric||{})};r.time=timeScore(a);r.total=['economy','policy','organization','cooperation','completion','time'].reduce((n,k)=>n+Number(r[k]||0),0);a.teacher_breakdown=r;a.teacher_score=r.total;a.feedback=String(b.feedback||'');s.gradeHistory.push({id:String(now()),student_id:a.student_id,created_at:now(),teacher_score:r.total,provisional_score:a.ai_score,feedback:a.feedback,rubric:r});writeStore(s);return send(res,200,{ok:true,message:'교사 채점을 저장했습니다.',score:r.total})}
      else if(action==='reset'){delete s.attempts[String(b.studentId)];writeStore(s);return send(res,200,{ok:true,message:'학생 응시 기록을 초기화했습니다.'})}
      else return send(res,400,{error:'알 수 없는 관리 동작입니다.'});
      writeStore(s);return send(res,200,{ok:true,message:'반영되었습니다.'});
    }
  }

  return false;
}

http.createServer(async(req,res)=>{
  let url;try{url=new URL(req.url,'http://localhost')}catch{return send(res,400,{error:'잘못된 요청입니다.'})}
  try{
    if(url.pathname==='/health')return send(res,200,{ok:true,version:'v3.0-restored',mode:'standalone',source:'recovered-from-sites-deployment'});
    if(url.pathname==='/학생명단_템플릿.csv'){res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="yujint_roster.csv"'});return res.end('\uFEFF반,학번,이름\n1,30101,홍길동\n2,30201,김학생\n3,30301,이유진\n')}
    if(url.pathname.startsWith('/api/')){const handled=await handleApi(req,res,url);if(handled!==false)return}
    if(url.pathname==='/'||url.pathname==='/student'||url.pathname==='/student/')return send(res,200,studentHtml(),'text/html; charset=utf-8');
    if(url.pathname==='/teacher'||url.pathname==='/teacher/')return send(res,200,teacherHtml(),'text/html; charset=utf-8');
    return send(res,404,'Not Found','text/plain; charset=utf-8');
  }catch(e){console.error(e);return send(res,500,{error:'서버 처리 중 오류가 발생했습니다.'})}
}).listen(PORT,'0.0.0.0',()=>console.log('exchange crisis restored server listening',PORT));
