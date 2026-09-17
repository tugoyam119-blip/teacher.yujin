'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');

// Names and participation records live only in the private persistent volume.
module.exports=function createObservers({dataDir,readJson,writeJson,sendJson,sendError,readBody,checkPin,validatePayload,payloadHash,textIssue,visitor=false,buildXlsx,resultsModel}){
 const dir=path.join(dataDir,visitor?'visitors':'observers'),rosterFile=path.join(dir,'roster.json');
 fs.mkdirSync(dir,{recursive:true});
 const prefix=visitor?'/api/visitor/':'/api/observer/';
 const normalize=name=>String(name||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 const roster=()=>readJson(rosterFile)||{names:[]};
 const file=id=>path.join(dir,id+'.json');
 const session=()=>({is_open:1,login_allowed:1,server_is_open:1,timer_running:true,phase:visitor?'visitor':'observer',active_mode:visitor?'visitor':'observer',period_type:visitor?'visitor':'observer',remaining_seconds:5400,segment_remaining_seconds:5400,extra_seconds:0,time_penalty:0,penalty_exempt:true,can_request_extra:false,message:visitor?'일반 체험 · 시간 제한 없음':'참관 교사 체험 · 시간 제한 없음'});
 const readRecord=id=>/^[a-f0-9]{32}$/.test(String(id||''))?readJson(file(id)):null;
 return async function handle(req,res,u){
  const admin=u.pathname===(visitor?'/api/teacher/visitors':'/api/teacher/observers');
  if(!admin&&!u.pathname.startsWith(prefix))return false;
  const b=req.method==='POST'?await readBody(req):{};
  const fail=(message,status=400)=>{sendError(res,message,status);return true};
  const ok=value=>{sendJson(res,value);return true};
  if(admin){
   if(req.method!=='POST')return fail('지원하지 않는 요청',405);
   if(!checkPin(b.pin))return fail('교사 PIN이 올바르지 않습니다.',403);
   if(visitor){
    if(!['get','export'].includes(b.action))return fail('지원하지 않는 요청');
    const rows=fs.readdirSync(dir).filter(x=>/^[a-f0-9]{32}\.json$/.test(x)).map(x=>readJson(path.join(dir,x))).filter(Boolean).map(r=>({id:r.id,name:r.name,created_at:r.created_at,feedback:r.feedback||null,progress:r.progress||null})).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    if(b.action==='export'){
     const headers=['참여 번호','이름·별명','입장 시각','정책 제출 상태','후기','만족도(1~5)','후기 저장 시각',...resultsModel.answers({}).filter(x=>!x[0].startsWith('자기평가서')).map(x=>x[0])];
     const values=rows.map(r=>[r.id,r.name,r.created_at,r.progress?.submitted?'제출 완료':'체험 중',r.feedback?.text||'',r.feedback?.rating||'',r.feedback?.saved_at||'',...resultsModel.answers({payload:r.progress?.payload}).filter(x=>!x[0].startsWith('자기평가서')).map(x=>x[1])]);
     const data=buildXlsx(headers,values);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Cache-Control':'no-store','Content-Disposition':'attachment; filename="public_experience_results.xlsx"'});res.end(data);return true;
    }
    return ok({ok:1,rows});
   }
   if(b.action==='save'){
    if(!Array.isArray(b.names)||b.names.length>500)return fail('이름을 한 줄에 하나씩 입력하세요.');
    const names=[],seen=new Set();
    for(const raw of b.names){const name=String(raw).trim().replace(/\s+/g,' '),key=normalize(name);if(!name)continue;if(!/^[\p{L}\p{M} .'-]{2,60}$/u.test(name))return fail('명단에는 연락처 없이 이름만 입력하세요.');if(!seen.has(key)){names.push(name);seen.add(key)}}
    writeJson(rosterFile,{names,updated_at:new Date().toISOString()});
   }else if(b.action!=='get')return fail('지원하지 않는 요청');
   return ok({ok:1,names:roster().names});
  }
  const route=u.pathname.slice(prefix.length);
  if(route==='bootstrap'&&req.method==='GET')return ok({session:session(),reset_epoch:0});
  if(route==='login'&&req.method==='POST'){
   if(visitor){
    const name=String(b.name||'').trim();if(!name||name.length>40)return fail('이름 또는 별명을 1~40자로 입력하세요.');
    const record={id:crypto.randomBytes(16).toString('hex'),token:crypto.randomBytes(32).toString('hex'),name,created_at:new Date().toISOString()};writeJson(file(record.id),record);
    return ok({ok:1,student_id:record.id,name,token:record.token,role:'visitor',session:session()});
   }
   const name=roster().names.find(x=>normalize(x)===normalize(b.name));
   if(!name)return fail('등록된 교사 이름을 입력하세요. 명단에 없으면 수업 담당 선생님께 알려주세요.',403);
   // A private index allows name-only re-entry without exposing a public roster.
   const indexFile=path.join(dir,'index.json'),index=readJson(indexFile)||{},key=crypto.createHash('sha256').update(normalize(name)).digest('hex');
   let record=readRecord(index[key]);
   if(!record){record={id:crypto.randomBytes(16).toString('hex'),token:crypto.randomBytes(32).toString('hex'),name,created_at:new Date().toISOString()};writeJson(file(record.id),record);index[key]=record.id;writeJson(indexFile,index)}
   return ok({ok:1,student_id:record.id,name,token:record.token,role:'observer',session:session()});
  }
  const id=req.method==='GET'?u.searchParams.get('student_id'):b.student_id,record=readRecord(id);
  if(!record||req.headers[visitor?'x-visitor-token':'x-observer-token']!==record.token||(!visitor&&!roster().names.some(x=>normalize(x)===normalize(record.name))))return fail(visitor?'일반 체험 로그인에서 다시 입장해 주세요.':'교사 참여 화면에서 이름으로 다시 입장해 주세요.',403);
  const p=record.progress||{},ts=new Date().toISOString();
  const save=()=>writeJson(file(record.id),record);
  if(route==='progress'&&req.method==='GET')return ok({payload:p.payload||null,submitted:!!p.submitted,submitted_at:p.submitted_at||null,self_evaluation:p.self_evaluation||null,manual_save_at:p.manual_save_at||null,feedback:record.feedback||null,time:session(),reset_epoch:0});
  if(req.method!=='POST')return fail('없는 요청',404);
  if(visitor&&route==='feedback'){
   const text=String(b.text||'').trim(),rating=b.rating==null||b.rating===''?null:Number(b.rating);
   if(!text||text.length>3000)return fail('후기를 1~3000자로 입력하세요.');
   if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))return fail('만족도는 1~5점 중 선택하세요.');
   record.feedback={text,rating,saved_at:ts};save();return ok({ok:1,feedback:record.feedback});
  }
  if(route==='heartbeat')return ok({ok:1,session:session()});
  if(['save','manual-save','submit'].includes(route)){
   if(p.submitted)return fail('제출한 답안은 답안 다시 수정 버튼을 눌러 수정하세요.',409);
   const issue=validatePayload(b.payload,route==='submit',{optionalEvidence:true});if(issue)return fail(issue);
   if(route==='submit'&&p.manual_save_hash!==payloadHash(b.payload))return fail('최종 제출 전에 현재 답안을 임시저장해 주세요.',409);
   record.progress={...p,payload:{...b.payload,submitted:route==='submit',receiptTime:route==='submit'?ts:''},updated_at:ts,submitted:route==='submit',submitted_at:route==='submit'?ts:null};
   if(route==='manual-save'){record.progress.manual_save_at=ts;record.progress.manual_save_hash=payloadHash(b.payload)}
   save();return ok({ok:1,session:session(),manual_save_at:record.progress.manual_save_at,submitted_at:record.progress.submitted_at,extra_seconds:0,time_penalty:0,penalty_exempt:true});
  }
  if(route==='reopen-submission'){
   if(!p.submitted)return fail('제출한 답안이 없습니다.',409);
   record.progress={...p,previous_submission:{payload:p.payload,submitted_at:p.submitted_at},payload:{...p.payload,submitted:false,receiptTime:'',revision:true,step:7},submitted:false,submitted_at:null,manual_save_at:null,manual_save_hash:null};save();return ok({ok:1,payload:record.progress.payload,self_evaluation:p.self_evaluation||null,session:session()});
  }
  if(route==='self-eval'){
   if(!p.submitted)return fail('정책 답안을 먼저 제출하세요.',409);
   const draft=b.draft===true,text=draft?String(b.text||''):String(b.text||'').trim();
   if(draft&&p.self_evaluation?.submitted_at)return fail('이미 완료한 자기평가서입니다.',409);
   const issue=draft?(text.length>1000?'1000자 이내로 작성하세요.':''):textIssue(text,400);if(issue)return fail(issue);
   p.self_evaluation={text,saved_at:ts,submitted_at:draft?null:ts};record.progress=p;save();return ok({ok:1,...p.self_evaluation,draft});
  }
  return fail('없는 요청',404);
 };
};
