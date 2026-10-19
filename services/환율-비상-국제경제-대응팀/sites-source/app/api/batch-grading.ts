/* eslint-disable @typescript-eslint/no-explicit-any */
import {env} from 'cloudflare:workers';
import {aiGrade} from './grading';
import {GRADING_VERSION,participationReview} from './participation';

const changes=(r:any)=>Number(r.meta?.changes||0);
async function lock(){
 await env.DB.prepare("INSERT OR IGNORE INTO grading_lock(id) VALUES(1)").run();
 const token=crypto.randomUUID(),r=await env.DB.prepare('UPDATE grading_lock SET token=?,expires_at=? WHERE id=1 AND expires_at<?').bind(token,Date.now()+90000,Date.now()).run();
 return changes(r)?token:null;
}
async function unlock(token:string){await env.DB.prepare('UPDATE grading_lock SET expires_at=0 WHERE id=1 AND token=?').bind(token).run()}
async function gradeStudent(id:string,lease:string){
 const row:any=await env.DB.prepare('SELECT * FROM attempts WHERE student_id=?').bind(id).first();
 if(!row||row.status!=='submitted'||row.teacher_score!=null||id==='000000')return {status:'skipped',reason:'미제출·기록 없음 또는 교사 확정점수 보호'};
 const session:any=await env.DB.prepare('SELECT status FROM class_sessions WHERE class_name=?').bind(row.class_name).first();
 const makeup:any=await env.DB.prepare('SELECT status FROM makeup_rounds WHERE class_name=?').bind(row.class_name).first();
 if(session&&session.status!=='closed'||makeup?.status==='open')throw Error('진행 중인 반은 마감 후 가채점하세요.');
 const answers=JSON.parse(row.answers||'{}');
 const context=[GRADING_VERSION,row.answers,row.started_at,row.submitted_at,row.paused_seconds,row.paused_at,row.extra_penalty,row.extra_penalty_exempt,row.extra_granted_minutes,row.submission_type,row.writing_changes,row.writing_seconds,row.current_step];
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(context))))).map(x=>x.toString(16).padStart(2,'0')).join('');
 let previous:any;try{previous=JSON.parse(row.ai_breakdown||'null')}catch{}
 if(previous?.answerHash===hash)return {status:'cached',ai:previous};
 const result=await aiGrade(answers),process=participationReview(row,answers,result.completion);
 result.answerHash=hash;result.gradingVersion=GRADING_VERSION;
 result.completion=process.completion;result.participation=process.evidence;
 result.reviewFlags=[...new Set([...(Array.isArray(result.reviewFlags)?result.reviewFlags:[]),...(result.reviewReason?[result.reviewReason]:[]),...process.flags])];
 if(process.evidence.corroborated)result.completionEvidence+=' · 저장된 작성 변경 및 단계 진행 근거 확인';
 result.reviewRequired=Boolean(result.reviewRequired||result.reviewFlags.length);
 result.reviewReason=result.reviewFlags.join(' / ');
 result.time=Number(row.extra_penalty_exempt)===1?6:Number(row.extra_penalty||0)===0?6:Number(row.extra_penalty)===2?4:Number(row.extra_penalty)===4?2:0;
 result.score=result.economy+result.policy+result.organization+result.cooperation+result.completion+result.time;
 // Compare the full snapshot so concurrent reopen/edit/teacher confirmation cannot be overwritten.
 const r=await env.DB.prepare("UPDATE attempts SET ai_score=?,ai_feedback=?,ai_breakdown=?,ai_graded_at=? WHERE student_id=? AND teacher_score IS NULL AND status='submitted' AND answers=? AND updated_at=? AND started_at=? AND submitted_at=? AND extra_penalty=? AND extra_penalty_exempt=? AND EXISTS(SELECT 1 FROM grading_lock WHERE id=1 AND token=? AND expires_at>?)").bind(result.score,result.feedback,JSON.stringify(result),Date.now(),id,row.answers,row.updated_at,row.started_at,row.submitted_at,row.extra_penalty,row.extra_penalty_exempt,lease,Date.now()).run();
 if(!changes(r))throw Error('채점 중 답안·운영 기록·교사 점수가 변경되었습니다. 다시 확인하세요.');
 return {status:'graded',ai:result};
}
export async function gradeOne(id:string){
 const token=await lock();if(!token)throw Error('다른 가채점 처리 중입니다. 잠시 후 다시 시도하세요.');
 try{return await gradeStudent(id,token)}finally{await unlock(token)}
}
async function snapshot(){
 const job:any=await env.DB.prepare('SELECT * FROM grading_jobs WHERE id=1').first();
 if(!job)return null;
 const {results:items}=await env.DB.prepare('SELECT student_id,status,error FROM grading_items WHERE job_token=? ORDER BY student_id').bind(job.token).all();
 return {...job,items,total:items.length,completed:items.filter((x:any)=>!['pending','running'].includes(x.status)).length,failed:items.filter((x:any)=>x.status==='failed').length};
}
export async function batchGrade(action:string,b:any){
 if(action==='status')return snapshot();
 const lease=await lock();if(!lease){if(action==='start'||action==='retry')throw Error('다른 가채점 처리 중입니다. 진행 상태를 확인하세요.');return {...await snapshot(),busy:true}}
 try{
  let job:any=await env.DB.prepare('SELECT * FROM grading_jobs WHERE id=1').first();
  if(action==='start'){
   if(job?.status==='running')return snapshot();
   const scope=String(b.className||'').trim();if(!scope)throw Error('가채점할 반 또는 전체를 선택하세요.');
   if(scope!=='전체'&&!await env.DB.prepare('SELECT student_id FROM roster WHERE class_name=? LIMIT 1').bind(scope).first())throw Error('등록된 반을 선택하세요.');
   const {results:open}=await env.DB.prepare("SELECT class_name FROM class_sessions WHERE status<>'closed' AND (?='전체' OR class_name=?) UNION SELECT class_name FROM makeup_rounds WHERE status='open' AND (?='전체' OR class_name=?)").bind(scope,scope,scope,scope).all();
   if(open.length)throw Error('선택 범위의 정규·보충평가를 마감한 뒤 가채점하세요.');
   const token=crypto.randomUUID();
   // A single transaction creates a durable, fixed roster snapshot. Never resets student data.
   await env.DB.batch([
    env.DB.prepare("INSERT INTO grading_jobs(id,token,scope,status,created_at) VALUES(1,?,?,'running',?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,scope=excluded.scope,status='running',created_at=excluded.created_at").bind(token,scope,Date.now()),
    env.DB.prepare("INSERT INTO grading_items(job_token,student_id) SELECT ?,student_id FROM attempts WHERE student_id<>'000000' AND status='submitted' AND teacher_score IS NULL AND (?='전체' OR class_name=?)").bind(token,scope,scope),
   ]);
   return snapshot();
  }
  if(!job||job.token!==b.token)throw Error('작업이 변경되었습니다. 진행 상태를 새로 확인하세요.');
  if(action==='retry'){
   await env.DB.batch([env.DB.prepare("UPDATE grading_items SET status='pending',error='' WHERE job_token=? AND status='failed'").bind(job.token),env.DB.prepare("UPDATE grading_jobs SET status='running' WHERE id=1")] );
   return snapshot();
  }
  if(action!=='step')throw Error('지원하지 않는 일괄 가채점 요청입니다.');
  // An abandoned in-flight request is retried only after the global lease expires.
  await env.DB.prepare("UPDATE grading_items SET status='pending' WHERE job_token=? AND status='running'").bind(job.token).run();
  const item:any=await env.DB.prepare("SELECT student_id FROM grading_items WHERE job_token=? AND status='pending' ORDER BY student_id LIMIT 1").bind(job.token).first();
  if(item){
   await env.DB.prepare("UPDATE grading_items SET status='running',error='' WHERE job_token=? AND student_id=?").bind(job.token,item.student_id).run();
   try{const result=await gradeStudent(item.student_id,lease);await env.DB.prepare('UPDATE grading_items SET status=?,error=? WHERE job_token=? AND student_id=?').bind(result.status,result.reason||'',job.token,item.student_id).run()}
   catch(e){await env.DB.prepare("UPDATE grading_items SET status='failed',error=? WHERE job_token=? AND student_id=?").bind(e instanceof Error?e.message:'가채점 실패',job.token,item.student_id).run()}
  }
  const pending=await env.DB.prepare("SELECT student_id FROM grading_items WHERE job_token=? AND status IN ('pending','running') LIMIT 1").bind(job.token).first();
  if(!pending)await env.DB.prepare("UPDATE grading_jobs SET status='completed' WHERE id=1 AND token=?").bind(job.token).run();
  return snapshot();
 }finally{await unlock(lease)}
}
