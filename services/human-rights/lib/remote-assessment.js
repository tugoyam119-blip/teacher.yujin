'use strict';
// Active time is confirmed by consecutive server-received signals, never by a client duration.
const MAX_GAP_MS=20000;
function status(r,now=Date.now()){
 if(!r?.enabled)return 'disabled';
 if(now<Date.parse(r.starts_at))return 'scheduled';
 if(now>=Date.parse(r.ends_at))return 'ended';
 return 'available';
}
function clientValid(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(id)}
function pulse(t,signal,now=Date.now()){
 const r=t.remote_window;
 if(!r?.enabled||r.paused||signal.client_id!==r.client_id)return 0;
 const last=Date.parse(r.last_signal_at),gap=now-last;
 let seconds=0;
 if(r.last_active&&gap>0&&gap<=MAX_GAP_MS){
  seconds=Math.max(0,(Math.min(now,Date.parse(r.ends_at))-Math.max(last,Date.parse(r.starts_at)))/1000);
 }
 if(seconds>0){
  const used=Math.max(0,Number(t.period1_used||0)+Number(t.period2_used||0)+Number(t.makeup_used||0));
  const regular=Math.min(seconds,Math.max(0,5400-used));
  t.makeup_used=Number(t.makeup_used||0)+regular;
  t.extra_used=Number(t.extra_used||0)+seconds-regular;
  r.active_seconds=Number(r.active_seconds||0)+seconds;
  r.step_seconds=r.step_seconds||Array(8).fill(0);
  const step=Math.max(0,Math.min(7,Number(r.last_step)||0));
  r.step_seconds[step]=Number(r.step_seconds[step]||0)+seconds;
 }
 r.last_signal_at=new Date(now).toISOString();
 r.last_active=signal.active===true&&status(r,now)==='available';
 r.last_step=Math.max(0,Math.min(7,Number(signal.step)||0));
 return seconds;
}
function pause(t,signal,now=Date.now()){
 const r=t.remote_window;if(!r)return;
 pulse(t,{...signal,active:false},now);
 r.paused=true;r.last_active=false;r.last_signal_at=null;r.client_id=null;
}
function resume(t,id,step,now=Date.now()){
 const r=t.remote_window;
 if(status(r,now)!=='available')throw Error('지정된 수행 기간이 아닙니다.');
 if(!clientValid(id))throw Error('화면을 새로고침한 뒤 다시 시도해 주세요.');
 if(!r.paused&&r.client_id!==id&&now-Date.parse(r.last_signal_at)<MAX_GAP_MS)
  throw Error('다른 창에서 수행 중입니다. 그 창에서 쉬기를 누르거나 닫은 뒤 20초 후 다시 시도하세요.');
 // Repeated resume from this same page must not erase an unconfirmed interval.
 if(!r.paused&&r.client_id===id)pulse(t,{client_id:id,active:true,step},now);
 r.paused=false;r.client_id=id;r.last_signal_at=new Date(now).toISOString();r.last_active=true;
 r.last_step=Math.max(0,Math.min(7,Number(step)||0));
 r.started_at=r.started_at||new Date(now).toISOString();
}
function describe(t,now=Date.now()){
 const r=t.remote_window;if(!r)return null;
 return {enabled:!!r.enabled,status:status(r,now),starts_at:r.starts_at,ends_at:r.ends_at,paused:!!r.paused,client_id:r.client_id||null,
  active_seconds:Number(r.active_seconds||0),step_seconds:r.step_seconds||Array(8).fill(0),
  started_at:r.started_at||null,updated_at:r.updated_at||null};
}
module.exports={status,clientValid,pulse,pause,resume,describe,MAX_GAP_MS};
