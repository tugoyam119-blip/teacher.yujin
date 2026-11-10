'use strict';
const remoteClientId=crypto.randomUUID().replaceAll('-','');
let remoteLastInput=performance.now(),remoteIdleSent=false;
const remoteTime=seconds=>Math.floor(Number(seconds||0)/60)+'분 '+String(Math.floor(Number(seconds||0)%60)).padStart(2,'0')+'초';
function remoteHeartbeatFields(){
 const idle=performance.now()-remoteLastInput>=300000;
 return {name:student?.name||'',remote_client_id:remoteClientId,remote_idle:idle,
  remote_active:!idle&&document.visibilityState==='visible'&&document.hasFocus()};
}
function remotePanel(){
 if(!student||!session.remote_configured)return '';
 const r=session.remote_window,available=session.remote_available;
 const date=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 return '<section class="card" style="max-width:1100px;margin:12px auto" aria-label="개별 기간 수행">'+
 '<h2>개별 기간 수행</h2><p>'+esc(date(r.starts_at))+' ~ '+esc(date(r.ends_at))+' (한국시간)</p>'+
 '<p><b id="remoteTotal">전체 누적 수행 '+remoteTime(session.total_used_seconds)+'</b> · <span id="remoteOnly">이번 개별 수행 '+remoteTime(r.active_seconds)+'</span></p>'+
 '<p>자료를 읽고 답안을 작성하는 시간을 누적합니다. 쉬거나 화면을 떠나 있는 동안은 제외합니다. 5분 동안 입력·클릭·스크롤이 없으면 자동으로 쉬기 상태가 됩니다. 계속 생각하거나 읽고 있다면 아래 버튼을 눌러 주세요.</p>'+
 (state.submitted?'<p>제출 완료 · 자기평가서 작성 시간은 수행시간에 포함하지 않습니다.</p>':
 !available?'<p>'+esc(session.message)+'</p>':
 session.is_open&&r.client_id===remoteClientId?'<button class="btn secondary" onclick="remoteAction(\'pause\')">저장하고 쉬기</button> <button class="btn secondary" onclick="remoteKeepWorking()">계속 읽고 / 생각하고 있어요</button>':
 '<button class="btn" onclick="remoteAction(\'resume\')">수행 시작 / 이어 하기</button>')+
 '<p class="small muted">접속 확인 신호를 바탕으로 시간을 기록합니다. 갑작스러운 연결 끊김에서는 마지막 몇 초가 누락될 수 있습니다. 평가는 답안과 기록을 선생님이 함께 확인합니다.</p><p id="remoteMessage" role="status"></p></section>';
}
function remoteKeepWorking(){remoteLastInput=performance.now();remoteIdleSent=false;heartbeatNow();const el=document.getElementById('remoteMessage');if(el)el.textContent='계속 수행 중으로 확인했습니다.'}
async function remoteAction(action){
 const buttons=document.querySelectorAll('[aria-label="개별 기간 수행"] button');buttons.forEach(b=>b.disabled=true);
 try{
  if(action==='pause'&&!state.submitted){
   clearTimeout(saveTimer);saveLocal();
   await api('/api/save',{method:'POST',body:JSON.stringify({student_id:student.student_id,name:student.name,remote_client_id:remoteClientId,payload:state})});
   setSave('ok','저장 완료');
  }
  const x=await api('/api/remote/session',{method:'POST',body:JSON.stringify({student_id:student.student_id,name:student.name,client_id:remoteClientId,action,step:state.step})});
  session=x.session;remoteLastInput=performance.now();remoteIdleSent=false;
  if(action==='resume'){startHeartbeat();await saveRemote()}
  render();
 }catch(e){const el=document.getElementById('remoteMessage');if(el)el.textContent=e.message;buttons.forEach(b=>b.disabled=false)}
}
for(const event of ['pointerdown','keydown','input','scroll','touchstart'])document.addEventListener(event,()=>{
 if(!session.remote_configured)return;
 remoteLastInput=performance.now();remoteIdleSent=false;
},{capture:true,passive:true});
function remoteLeave(){
 if(!student||!session.remote_configured||!session.is_open||state.submitted)return;
 const body={...heartbeatBody(),active:false,remote_active:false};
 fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(()=>{});
}
window.addEventListener('blur',remoteLeave);
window.addEventListener('pagehide',remoteLeave);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')remoteLeave()});
setInterval(()=>{
 if(!student||!session.remote_configured)return;
 const total=document.getElementById('remoteTotal'),only=document.getElementById('remoteOnly');
 if(total)total.textContent='전체 누적 수행 '+remoteTime(session.total_used_seconds);
 if(only)only.textContent='이번 개별 수행 '+remoteTime(session.remote_window?.active_seconds);
 if(session.is_open&&!state.submitted&&performance.now()-remoteLastInput>=300000&&!remoteIdleSent){remoteIdleSent=true;heartbeatNow()}
},1000);
