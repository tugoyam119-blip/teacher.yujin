'use strict';
const active=s=>!!s.is_open&&!!(s.timer_running||s.personal_extra_active||s.compensation_active);
const key=s=>String(s.session_id||'');
function duration(a,s,now){
 let seconds=Math.max(0,(now-a.started_ms)/1000);
 if(a.mode==='regular'||a.mode==='makeup')seconds=Math.min(seconds,Math.max(0,Number(s.classroom_elapsed_seconds||0)-a.started_elapsed));
 return Math.floor(seconds);
}
function signal(previous,b,s,submitted,now=Date.now()){
 const a={...(previous||{})};
 if(!Number.isFinite(b.sent_at)||b.sent_at<=Number(a.last_signal||0))return a;
 a.last_signal=b.sent_at;
 if(b.away){
  if(!active(s)||submitted)return a;
  if(a.away&&a.session_key===key(s))return a;
  return {...a,away:true,session_key:key(s),mode:s.active_mode,started_ms:now,started_elapsed:Number(s.classroom_elapsed_seconds||0),id:String(now),seconds:0,returned_at:null,acknowledged:false};
 }
 if(a.away){a.seconds=a.session_key===key(s)?duration(a,s,now):0;a.away=false;a.returned_at=new Date(now).toISOString();if(a.seconds>=60)a.history=[...(a.history||[]),{id:a.id,seconds:a.seconds,started_ms:a.started_ms,returned_at:a.returned_at,acknowledged:!!a.acknowledged}].slice(-30)}
 return a;
}
function view(a,s,submitted,now=Date.now()){
 if(!a)return null;
 const current=a.session_key===key(s),seconds=a.away?(current?duration(a,s,now):0):Number(a.seconds||0);
 const alert=seconds>=60&&!a.acknowledged&&(!a.away||(current&&active(s)&&!submitted));
 if(!alert){const pending=(a.history||[]).find(x=>!x.acknowledged);if(pending)return {id:pending.id,away:false,seconds:pending.seconds,alert:true,started_at:new Date(pending.started_ms).toISOString(),returned_at:pending.returned_at}}
 return {id:a.id||'',away:!!a.away&&current,seconds,alert,started_at:a.started_ms?new Date(a.started_ms).toISOString():null,returned_at:a.returned_at||null};
}
module.exports={active,signal,view};
