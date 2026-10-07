'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const validId=id=>/^[A-Za-z0-9_-]{1,40}$/.test(id)&&!Object.hasOwn(Object.prototype,id)&&id!=='prototype';
const timestamp=value=>typeof value==='number'?value:(typeof value==='string'&&/^\d+$/.test(value)?Number(value):Date.parse(value));
function deadline(a,c){
 const base=timestamp(c.deadline);
 const extra=a.extra_status==='approved'&&Number(a.extra_granted_minutes)>0?timestamp(a.extra_started_at)+Number(a.extra_granted_minutes)*60000:0;
 return Number.isFinite(base)&&base>0?Math.max(base,Number.isFinite(extra)?extra:0):NaN;
}
function writeBlock(a,c,time=Date.now(),allowSubmitted=false){
 if(!a)return '응시 기록이 없습니다.';
 if(!allowSubmitted&&a.status==='submitted')return '이미 제출한 답안은 수정할 수 없습니다.';
 if(!c||c.status!=='open'||!c.started_at)return '교사가 수행을 시작하지 않았거나 종료했습니다.';
 if(c.paused_at)return '수행평가가 일시정지되었습니다.';
 const end=deadline(a,c);
 if(!Number.isFinite(end)||time>=end)return '수행 시간이 종료되었습니다. 교사에게 문의하세요.';
 return null;
}
function studentView(a,c){
 if(!a)return null;
 const fields=['student_id','name','class_name','answers','status','current_step','started_at','updated_at','submitted_at','submission_type','extra_status','extra_requested_at','extra_granted_minutes','extra_started_at','extra_penalty_exempt'];
 return {...Object.fromEntries(fields.filter(k=>Object.hasOwn(a,k)).map(k=>[k,a[k]])),effective_deadline:deadline(a,c),write_block:writeBlock(a,c)};
}
function createAccess(dataDir){
 const file=path.join(dataDir,'student-access.json');
 // A missing file is a fresh install; corrupted credentials must fail closed.
 const credentials=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const sessions=new Map(),failures=new Map();
 const save=()=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(credentials),{mode:0o600});fs.renameSync(tmp,file)};
 function revoke(id){for(const [key,s] of sessions)if(s.id===id)sessions.delete(key)}
 return {
  issue(id,identity){const code=crypto.randomBytes(16).toString('hex');credentials[id]={hash:hash(code),identity};save();revoke(id);return code},
  revoke,
  login(req,res,id,code,identity){
   const key=id, t=Date.now();for(const [k,f] of failures)if(f.until<=t)failures.delete(k);
   const f=failures.get(key);
   const expected=credentials[id];
   if(!expected||expected.identity!==identity||!crypto.timingSafeEqual(Buffer.from(expected.hash),Buffer.from(hash(code)))){
    if(f&&f.count>=10)return {error:'로그인 시도가 많습니다. 15분 후 다시 시도하세요.',status:429};
    if(!failures.has(key)&&failures.size>=10000)return {error:'잠시 후 다시 시도하세요.',status:429};
    failures.set(key,{count:(f?.count||0)+1,until:f?.until||t+15*60000});return {error:'학번, 이름 또는 개인 입장코드를 확인하세요.',status:401};
   }
   failures.delete(key);
   for(const [k,s] of sessions)if(s.expires<=t)sessions.delete(k);
   // Logging in on a shared browser invalidates the previous cookie session.
   const old=this.token(req);if(old)sessions.delete(hash(old));
   const token=crypto.randomBytes(32).toString('base64url');sessions.set(hash(token),{id,identity,expires:t+8*3600000});
   const secure=process.env.NODE_ENV==='production'||req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
   res.setHeader('Set-Cookie','exchange_student='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800'+(secure?'; Secure':''));return null;
  },
  token(req){return String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('exchange_student='))?.slice('exchange_student='.length)},
  authorized(req,id,identity){const token=this.token(req);const s=token&&sessions.get(hash(token));return !!s&&s.expires>Date.now()&&s.id===id&&s.identity===identity&&credentials[id]?.identity===identity},
  logout(req,res){const token=this.token(req);if(token)sessions.delete(hash(token));res.setHeader('Set-Cookie','exchange_student=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')}
 };
}
module.exports={validId,timestamp,deadline,writeBlock,studentView,createAccess};
