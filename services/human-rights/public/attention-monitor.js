'use strict';
const AttentionMonitor=(()=>{
 let audio=null,seen=new Set();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function beep(){if(!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=880;g.gain.value=.12;o.start();o.stop(audio.currentTime+.45)}
 async function enable(){try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();await audio.resume();beep();document.querySelectorAll('.attentionSound').forEach(b=>b.textContent='알림음 켜짐')}catch{alert('브라우저의 소리 허용 설정을 확인하세요.')}}
 function panel(rows){
  const alerts=(rows||[]).filter(r=>r.attention?.alert);
  const fresh=alerts.filter(r=>!seen.has(r.student_id+':'+r.attention.id));
  fresh.forEach(r=>seen.add(r.student_id+':'+r.attention.id));if(fresh.length)beep();
  return `<section class="card" style="${alerts.length?'border:2px solid #c92c3a;background:#fff3f3':''}"><h3>🔔 1분 이상 화면 이탈 · ${alerts.length}명</h3><p class="small muted">다른 탭·창으로 전환하거나 화면을 떠난 기록입니다. AI 사용을 판정하지 않습니다. 자동 새로고침 중 약 5초 이내에 반영됩니다.</p><button class="btn secondary attentionSound" onclick="AttentionMonitor.enable()">${audio?.state==='running'?'알림음 켜짐':'알림음 켜기·시험'}</button>${alerts.map(r=>`<div style="padding:12px 0;border-bottom:1px solid #e8c9c9"><b>${esc(r.student_id)} ${esc(r.name)}</b> · ${Math.floor(r.attention.seconds/60)}분 ${r.attention.seconds%60}초 · ${r.attention.away?'아직 돌아오지 않음':'화면 복귀'} <button class="btn secondary small" onclick="AttentionMonitor.ack('${esc(r.student_id)}','${esc(r.attention.id)}',this)">확인 완료</button></div>`).join('')}</section>`;
 }
 async function ack(id,event,button){button.disabled=true;try{const r=await fetch('/api/teacher/attention-ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin,student_id:id,event_id:event})});if(!r.ok)throw Error('알림 확인 처리에 실패했습니다.');button.textContent='확인됨'}catch(e){button.disabled=false;alert(e.message)}}
 return {panel,enable,ack};
})();
