/* eslint-disable @typescript-eslint/no-explicit-any */
import {env} from "cloudflare:workers";

const runtimeEnv=env as unknown as Record<string,string|undefined>;
import {ensureRuntimeSchema as init} from "../schema";
function teacher(code:string){return code===(runtimeEnv.TEACHER_CODE||"000000")}

export async function POST(request:Request){
 await init();const b=await request.json() as Record<string,any>,now=Date.now();
 if(b.action==="request"){
  const id=String(b.studentId||""),x:any=await env.DB.prepare("SELECT * FROM attempts WHERE student_id=?").bind(id).first();
  if(!x||x.status!=="progress")return Response.json({error:"진행 중인 응시 정보를 찾을 수 없습니다."},{status:404});
  const baseEnd=Number(x.started_at)+Number(x.duration_minutes)*60000+Number(x.paused_seconds||0)*1000,remaining=Math.floor((baseEnd-now)/1000);
  if(x.paused_at)return Response.json({error:"일시정지 중에는 추가시간을 요청할 수 없습니다."},{status:409});
  if(remaining>300)return Response.json({error:"잔여시간이 5분 이하일 때 요청할 수 있습니다."},{status:409});
  if(remaining<=0)return Response.json({error:"기본시간이 종료되었습니다. 교사에게 직접 문의하세요."},{status:409});
  if(x.extra_status&&x.extra_status!=="none")return Response.json({error:"추가시간은 한 번만 요청할 수 있습니다."},{status:409});
  await env.DB.prepare("UPDATE attempts SET extra_status='pending',extra_requested_at=?,updated_at=? WHERE student_id=?").bind(now,now,id).run();
  return Response.json({ok:true,message:"추가시간 요청을 보냈습니다. 승인 전까지 기본시간은 계속 흐릅니다."});
 }
 if(!teacher(String(b.code||"")))return Response.json({error:"교사 인증번호가 올바르지 않습니다."},{status:401});
 const id=String(b.studentId||""),x:any=await env.DB.prepare("SELECT * FROM attempts WHERE student_id=?").bind(id).first();
 if(!x||x.extra_status!=="pending")return Response.json({error:"처리할 추가시간 요청이 없습니다."},{status:404});
 if(b.action==="deny"){
  await env.DB.prepare("UPDATE attempts SET extra_status='denied',extra_decided_at=?,extra_reason='교사 거절',updated_at=? WHERE student_id=?").bind(now,now,id).run();
  return Response.json({ok:true,message:`${x.name} 학생의 추가시간 요청을 거절했습니다.`});
 }
 if(b.action==="approve"){
  const minutes=Number(b.minutes)===10?10:5,exempt=b.exempt?1:0,session:any=await env.DB.prepare("SELECT status FROM class_sessions WHERE class_name=?").bind(x.class_name).first();
  if(!session||session.status==="closed")return Response.json({error:"서버가 마감된 반입니다. 먼저 해당 반 서버를 열어 주세요."},{status:409});
  const baseEnd=Number(x.started_at)+Number(x.duration_minutes)*60000+Number(x.paused_seconds||0)*1000,extraStart=now>=baseEnd?now:null;
  await env.DB.prepare("UPDATE attempts SET status='progress',submitted_at=NULL,submission_type=NULL,extra_status='approved',extra_granted_minutes=?,extra_started_at=?,extra_penalty_exempt=?,extra_penalty=0,extra_decided_at=?,extra_reason=?,updated_at=? WHERE student_id=?").bind(minutes,extraStart,exempt,now,exempt?'기술 문제 보상시간':'학생 요청 추가시간',now,id).run();
  return Response.json({ok:true,message:`${x.name} 학생에게 ${minutes}분을 승인했습니다.${exempt?' 감점은 적용하지 않습니다.':''}`});
 }
 return Response.json({error:"지원하지 않는 요청입니다."},{status:400});
}
