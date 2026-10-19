/* eslint-disable @typescript-eslint/no-explicit-any */
import {env} from "cloudflare:workers";

const runtimeEnv=env as unknown as Record<string,string|undefined>;
import {ensureRuntimeSchema as init} from "../schema";
function teacher(code:string|null){return code===(runtimeEnv.TEACHER_CODE||"000000")}

export async function GET(request:Request){
  await init();
  const u=new URL(request.url),studentId=u.searchParams.get("studentId"),code=u.searchParams.get("code");
  if(code){
    if(!teacher(code))return Response.json({error:"교사 인증번호가 올바르지 않습니다."},{status:401});
  const now=Date.now();
  await env.DB.prepare("UPDATE help_requests SET status='resolved',resolved_at=? WHERE status='open' AND student_id IN (SELECT student_id FROM attempts WHERE status='submitted')").bind(now).run();
  await env.DB.prepare("UPDATE help_history SET status='resolved',resolved_at=? WHERE status='open' AND student_id IN (SELECT student_id FROM attempts WHERE status='submitted')").bind(now).run();

    const {results}=await env.DB.prepare("SELECT * FROM help_history ORDER BY requested_at DESC").all();
    return Response.json({helps:results.filter((x:any)=>x.status==='open'),helpHistory:results});
  }
  if(!studentId)return Response.json({help:null});
  const help=await env.DB.prepare("SELECT h.* FROM help_requests h JOIN attempts a ON a.student_id=h.student_id WHERE h.student_id=? AND h.status='open' AND a.status<>'submitted'").bind(studentId).first();
  return Response.json({help});
}

export async function POST(request:Request){
  await init();
  const b=await request.json() as Record<string,any>,now=Date.now();
  if(b.action==="request"){
    const id=String(b.studentId||"").trim(),message=String(b.message||"").trim().slice(0,120);
    const attempt:any=await env.DB.prepare("SELECT name,class_name,current_step,status FROM attempts WHERE student_id=?").bind(id).first();
    if(!attempt||attempt.status==="submitted")return Response.json({error:"진행 중인 응시 정보를 찾을 수 없습니다."},{status:404});
    if(!message)return Response.json({error:"도움이 필요한 항목을 하나 선택하세요."},{status:400});
    await env.DB.prepare("INSERT INTO help_requests (student_id,name,class_name,step,message,status,requested_at,resolved_at) VALUES (?,?,?,?,?,'open',?,NULL) ON CONFLICT(student_id) DO UPDATE SET name=excluded.name,class_name=excluded.class_name,step=excluded.step,message=excluded.message,status='open',requested_at=CASE WHEN help_requests.status='resolved' THEN excluded.requested_at ELSE help_requests.requested_at END,resolved_at=NULL").bind(id,attempt.name,attempt.class_name,Number(attempt.current_step||1),message,now).run();
    await env.DB.prepare("INSERT INTO help_history (id,student_id,name,class_name,step,message,status,requested_at,resolved_at) VALUES (?,?,?,?,?,?,'open',?,NULL)").bind(`${id}-${now}`,id,attempt.name,attempt.class_name,Number(attempt.current_step||1),message,now).run();
    return Response.json({ok:true,message:"교사에게 도움 요청을 보냈습니다."});
  }
  if(!teacher(String(b.code||"")))return Response.json({error:"교사 인증번호가 올바르지 않습니다."},{status:401});
  if(b.action==="resolve"){
    const studentId=String(b.studentId||"");
    await env.DB.prepare("UPDATE help_requests SET status='resolved',resolved_at=? WHERE student_id=?").bind(now,studentId).run();
    await env.DB.prepare("UPDATE help_history SET status='resolved',resolved_at=? WHERE student_id=? AND status='open'").bind(now,studentId).run();
    return Response.json({ok:true,message:"도움 요청을 처리 완료로 표시했습니다."});
  }
  if(b.action==="clear"){
    await env.DB.prepare("DELETE FROM help_requests").run();
    await env.DB.prepare("DELETE FROM help_history").run();
    return Response.json({ok:true});
  }
  return Response.json({error:"지원하지 않는 요청입니다."},{status:400});
}
