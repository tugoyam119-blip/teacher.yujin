/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from "cloudflare:workers";
import {ensureOperations} from "../operations";
import {ensureRuntimeSchema as init} from "../schema";
import {aiConfig} from "../grading";
import {gradeOne,batchGrade} from "../batch-grading";
import {v2Total} from "../../rubric-v2";
const ensureClassDeadline = init;
const runtimeEnv=env as unknown as Record<string,string|undefined>;function ok(req:Request,b?:Record<string,any>){const code=runtimeEnv.TEACHER_CODE||"000000";return(b?.code||new URL(req.url).searchParams.get("code"))===code}
const ensureExtra = init;
async function finalizeExpired(){const now=Date.now();await ensureExtra();await env.DB.prepare("UPDATE attempts SET status='submitted',submitted_at=?,submission_type='timeout',updated_at=? WHERE status='progress' AND paused_at IS NULL AND (CASE WHEN extra_started_at IS NOT NULL THEN extra_started_at+(extra_granted_minutes*60000) ELSE started_at+((duration_minutes+extra_granted_minutes)*60000)+(paused_seconds*1000) END)<=?").bind(now,now,now).run();await env.DB.prepare("UPDATE help_requests SET status='resolved',resolved_at=? WHERE status='open' AND student_id IN (SELECT student_id FROM attempts WHERE status='submitted')").bind(now).run();await env.DB.prepare("DELETE FROM help_requests WHERE student_id NOT IN (SELECT student_id FROM attempts)").run()}


export async function GET(req:Request){
 if(!ok(req))return Response.json({error:"교사 인증번호가 올바르지 않습니다."},{status:401});
 await init();await finalizeExpired();
 const studentId=new URL(req.url).searchParams.get("studentId");
 if(new URL(req.url).searchParams.get('export')==='1'){
  const scope=new URL(req.url).searchParams.get('className')||'전체';
  const {results:rows}=await env.DB.prepare("SELECT * FROM attempts WHERE student_id<>'000000' AND (?='전체' OR class_name=?) ORDER BY class_name,student_id").bind(scope,scope).all();
  const {results:history}=await env.DB.prepare("SELECT h.* FROM grade_history h JOIN attempts a ON a.student_id=h.student_id WHERE (?='전체' OR a.class_name=?) ORDER BY h.created_at DESC").bind(scope,scope).all();
  return Response.json({attempts:rows.map((x:any)=>({...x,answers:JSON.parse(x.answers||'{}'),grade_history:history.filter((h:any)=>h.student_id===x.student_id)}))},{headers:{'Cache-Control':'no-store'}});
 }
 if(studentId){
  const attempt:any=await env.DB.prepare("SELECT * FROM attempts WHERE student_id=? AND student_id<>'000000'").bind(studentId).first();
  if(!attempt)return Response.json({error:"학생 상세 답안을 찾을 수 없습니다."},{status:404});
  const {results:gradeHistory}=await env.DB.prepare("SELECT * FROM grade_history WHERE student_id=? ORDER BY created_at DESC").bind(studentId).all();
  return Response.json({attempt:{...attempt,answers:JSON.parse(attempt.answers||"{}"),grade_history:gradeHistory}});
 }
 const setting=await env.DB.prepare("SELECT * FROM settings WHERE id=1").first(),{results}=await env.DB.prepare("SELECT * FROM attempts WHERE student_id<>'000000' ORDER BY class_name,student_id").all(),{results:roster}=await env.DB.prepare("SELECT * FROM roster ORDER BY class_name,student_id").all(),{results:sessions}=await env.DB.prepare("SELECT * FROM class_sessions WHERE class_name<>'교사용 시범' ORDER BY class_name").all(),{results:visits}=await env.DB.prepare("SELECT * FROM student_visits ORDER BY class_name,student_id").all(),{results:makeupRounds}=await env.DB.prepare("SELECT * FROM makeup_rounds ORDER BY class_name").all(),{results:makeupRoster}=await env.DB.prepare("SELECT * FROM makeup_roster ORDER BY class_name,student_id").all(),config=await aiConfig();
 const attempts=results.map(({answers,ai_feedback,ai_breakdown,ai_v2_breakdown,teacher_breakdown,feedback,...summary}:any)=>{let meta:any={};try{meta=ai_breakdown?JSON.parse(ai_breakdown):{}}catch{}let v2:any={};try{v2=ai_v2_breakdown?JSON.parse(ai_v2_breakdown):{}}catch{}return{...summary,ai_v2_review_required:Boolean(v2.reviewRequired),ai_v2_review_flags:v2.reviewFlags||[],ai_confidence:meta.confidence||null,ai_review_required:Boolean(meta.reviewRequired),ai_review_flags:meta.reviewFlags||[],ai_review_reason:meta.reviewReason||''}});
 return Response.json({setting,sessions,roster,visits,makeupRounds,makeupRoster,aiConfig:{configured:Boolean(config.key),source:config.source,model:config.model,updatedAt:config.updatedAt},attempts});
}
export async function POST(req:Request){const b=await req.json() as Record<string,any>;if(!ok(req,b))return Response.json({error:"교사 인증번호가 올바르지 않습니다."},{status:401});await init();if(!["reset","start_class","start_all","control","control_all","batch_grade","ai_grade"].includes(b.action))await finalizeExpired();const now=Date.now();
if(b.action==="open_all"){
 const duration=Math.max(5,Math.min(180,Number(b.duration)||45));
 const {results:classes}=await env.DB.prepare("SELECT DISTINCT class_name FROM roster WHERE class_name<>'' ORDER BY class_name").all();
 if(!classes.length)return Response.json({error:"등록된 반이 없습니다. 학생 명단을 먼저 확인하세요."},{status:400});
 let opened=0;
 for(const row of classes as any[]){
  const className=String(row.class_name);
  const makeup:any=await env.DB.prepare("SELECT status FROM makeup_rounds WHERE class_name=?").bind(className).first();if(makeup?.status==="open")continue;
  await env.DB.prepare("INSERT OR IGNORE INTO class_sessions (class_name,status,duration_minutes,paused_seconds,updated_at) VALUES (?,'closed',?,0,?)").bind(className,duration,now).run();
  const result:any=await env.DB.prepare("UPDATE class_sessions SET status='open',duration_minutes=?,started_at=?,exam_started_at=NULL,paused_at=NULL,paused_seconds=0,updated_at=? WHERE class_name=? AND status='closed'").bind(duration,now,now,className).run();
  opened+=Number(result.meta?.changes||0);
 }
 return Response.json({ok:true,opened,total:classes.length,message:`전체 ${classes.length}개 반 중 ${opened}개 반을 동시에 열었습니다.`});
}
if(b.action==="start_class"){
 await ensureClassDeadline();
 const className=String(b.className||"").trim();if(!className)return Response.json({error:"시작할 반을 선택하세요."},{status:400});
 if(className==="전체")return Response.json({error:"전체반은 조회 전용입니다. 전체 반 동시 수행 시작 기능을 사용하세요."},{status:400});
 const existing:any=await env.DB.prepare("SELECT * FROM class_sessions WHERE class_name=?").bind(className).first();
 if(existing?.exam_started_at)return Response.json({ok:true,alreadyStarted:true,status:existing.status,startedAt:Number(existing.exam_started_at),deadline:Number(existing.deadline||Number(existing.exam_started_at)+Number(existing.duration_minutes||45)*60000+Number(existing.paused_seconds||0)*1000),message:"이미 수행이 시작되었습니다. 기존 시작 시각과 종료 시각을 유지합니다."});
 const deadline=now+Number(existing?.duration_minutes||45)*60000;
 const result:any=await env.DB.prepare("UPDATE class_sessions SET status='open',started_at=?,exam_started_at=?,deadline=?,updated_at=? WHERE class_name=? AND status IN ('open','waiting') AND exam_started_at IS NULL").bind(now,now,deadline,now,className).run();
 if(!Number(result.meta?.changes||0))return Response.json({error:"서버가 닫혀 있어 수행을 시작할 수 없습니다."},{status:409});
 const started:any=await env.DB.prepare("SELECT * FROM class_sessions WHERE class_name=?").bind(className).first();
 return Response.json({ok:true,status:'running',startedAt:Number(started.exam_started_at),deadline:Number(started.deadline),message:`${className} 학생들의 평가 타이머를 동시에 시작했습니다.`});
}
if(b.action==="start_all"){
 const result:any=await env.DB.prepare("UPDATE class_sessions SET started_at=?,exam_started_at=?,deadline=?+duration_minutes*60000,updated_at=? WHERE status='open' AND exam_started_at IS NULL AND class_name<>'교사용 시범'").bind(now,now,now,now).run();
 const started=Number(result.meta?.changes||0);if(!started)return Response.json({error:"시작할 열린 반이 없거나 이미 평가가 시작되었습니다."},{status:409});
 return Response.json({ok:true,message:`${started}개 반의 평가 타이머를 동시에 시작했습니다.`});
}
if(b.action==="control_all"){
 const command=String(b.command||"");if(!["pause","resume","close"].includes(command))return Response.json({error:"지원하지 않는 전체반 제어입니다."},{status:400});
 const condition=command==="pause"?"status='open' AND exam_started_at IS NOT NULL":command==="resume"?"status='paused'":"status<>'closed'";
 const {results:targets}=await env.DB.prepare(`SELECT class_name,status,paused_at FROM class_sessions WHERE class_name<>'교사용 시범' AND ${condition} ORDER BY class_name`).all();
 if(!targets.length)return Response.json({error:"현재 이 제어가 필요한 반이 없습니다."},{status:409});
 for(const s of targets as any[]){if(command==="pause"){await env.DB.prepare("UPDATE class_sessions SET status='paused',paused_at=?,updated_at=? WHERE class_name=? AND status='open'").bind(now,now,s.class_name).run();await env.DB.prepare("UPDATE attempts SET paused_at=?,updated_at=? WHERE status='progress' AND class_name=? AND paused_at IS NULL").bind(now,now,s.class_name).run()}if(command==="resume"){const added=Math.floor((now-Number(s.paused_at||now))/1000);await env.DB.prepare("UPDATE class_sessions SET status='open',paused_seconds=paused_seconds+?,paused_at=NULL,updated_at=? WHERE class_name=? AND status='paused'").bind(added,now,s.class_name).run();const {results:paused}=await env.DB.prepare("SELECT student_id,paused_at FROM attempts WHERE status='progress' AND class_name=? AND paused_at IS NOT NULL").bind(s.class_name).all();for(const x of paused as any[])await env.DB.prepare("UPDATE attempts SET paused_seconds=paused_seconds+?,paused_at=NULL,updated_at=? WHERE student_id=?").bind(Math.floor((now-Number(x.paused_at))/1000),now,x.student_id).run()}if(command==="close"){await env.DB.prepare("UPDATE class_sessions SET status='closed',updated_at=? WHERE class_name=?").bind(now,s.class_name).run();await env.DB.prepare("UPDATE attempts SET status='submitted',submitted_at=?,submission_type='teacher_close',updated_at=? WHERE status='progress' AND class_name=?").bind(now,now,s.class_name).run()}}
 return Response.json({ok:true,affectedClasses:(targets as any[]).map(x=>x.class_name),message:`${(targets as any[]).map(x=>x.class_name).join(', ')} 전체 반 동시 ${command==="pause"?'일시정지':command==="resume"?'재개':'마감'}를 적용했습니다.`});
}
if(b.action==="control"&&b.command==="open"){
 const className=String(b.className||"").trim();if(!className||className==='전체')return Response.json({error:'운영할 반을 선택하세요.'},{status:400});
 const makeup:any=await env.DB.prepare("SELECT status FROM makeup_rounds WHERE class_name=?").bind(className).first();if(makeup?.status==='open')return Response.json({error:'보충평가를 먼저 마감하세요.'},{status:409});
 const duration=Math.max(5,Math.min(180,Number(b.duration)||45));
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO class_sessions (class_name,status,duration_minutes,paused_seconds,updated_at) VALUES (?,'closed',?,0,?)").bind(className,duration,now),
  env.DB.prepare("UPDATE class_sessions SET status='open',duration_minutes=?,started_at=?,exam_started_at=NULL,deadline=NULL,paused_at=NULL,paused_seconds=0,updated_at=? WHERE class_name=? AND status='closed'").bind(duration,now,now,className),
 ]);
 return Response.json({ok:true,message:className+' 서버가 열려 있습니다. 학생 입장 후 수행 시작을 눌러 주세요.'});
}

if(b.action==="control"){const className=String(b.className||"").trim();if(!className)return Response.json({error:"먼저 운영할 반을 선택하세요."},{status:400});await env.DB.prepare("INSERT OR IGNORE INTO class_sessions (class_name,status,duration_minutes,paused_seconds,updated_at) VALUES (?,'closed',45,0,?)").bind(className,now).run();const s:any=await env.DB.prepare("SELECT * FROM class_sessions WHERE class_name=?").bind(className).first();if(b.command==="open")await env.DB.prepare("UPDATE class_sessions SET status='open',duration_minutes=?,started_at=?,paused_at=NULL,paused_seconds=0,updated_at=? WHERE class_name=?").bind(Number(b.duration||45),now,now,className).run();if(b.command==="pause"&&s.status==="open"){await env.DB.prepare("UPDATE class_sessions SET status='paused',paused_at=?,updated_at=? WHERE class_name=?").bind(now,now,className).run();await env.DB.prepare("UPDATE attempts SET paused_at=?,updated_at=? WHERE status='progress' AND class_name=? AND paused_at IS NULL").bind(now,now,className).run()}if(b.command==="resume"&&s.status==="paused"){await env.DB.prepare("UPDATE class_sessions SET status='open',paused_seconds=paused_seconds+?,paused_at=NULL,updated_at=? WHERE class_name=?").bind(Math.floor((now-s.paused_at)/1000),now,className).run();const {results:paused}=await env.DB.prepare("SELECT student_id,paused_at FROM attempts WHERE status='progress' AND class_name=? AND paused_at IS NOT NULL").bind(className).all();for(const x of paused as any[])await env.DB.prepare("UPDATE attempts SET paused_seconds=paused_seconds+?,paused_at=NULL,updated_at=? WHERE student_id=?").bind(Math.floor((now-Number(x.paused_at))/1000),now,x.student_id).run()}if(b.command==="close"){await env.DB.prepare("UPDATE class_sessions SET status='closed',updated_at=? WHERE class_name=?").bind(now,className).run();await env.DB.prepare("UPDATE attempts SET status='submitted',submitted_at=?,submission_type='teacher_close',updated_at=? WHERE status='progress' AND class_name=?").bind(now,now,className).run()}}
if(b.action==="open_makeup"){
 const className=String(b.className||"").trim(),duration=Math.max(5,Math.min(180,Number(b.duration)||45));if(!className)return Response.json({error:"보충평가를 열 반을 선택하세요."},{status:400});
 const regular:any=await env.DB.prepare("SELECT status FROM class_sessions WHERE class_name=?").bind(className).first();if(regular&&regular.status!=="closed")return Response.json({error:"정규 수행평가 서버를 먼저 마감하세요."},{status:409});
 await env.DB.prepare("DELETE FROM makeup_roster WHERE class_name=?").bind(className).run();const result:any=await env.DB.prepare("INSERT INTO makeup_roster (student_id,name,class_name,added_at) SELECT r.student_id,r.name,r.class_name,? FROM roster r WHERE r.class_name=? AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.student_id=r.student_id)").bind(now,className).run();
 const count=Number(result.meta?.changes||0);if(!count)return Response.json({error:"이 반에는 보충평가 대상 미참여 학생이 없습니다."},{status:400});
 await env.DB.prepare("INSERT INTO makeup_rounds (class_name,status,duration_minutes,opened_at,exam_started_at,closed_at,updated_at) VALUES (?,'open',?,?,NULL,NULL,?) ON CONFLICT(class_name) DO UPDATE SET status='open',duration_minutes=excluded.duration_minutes,opened_at=excluded.opened_at,exam_started_at=NULL,closed_at=NULL,updated_at=excluded.updated_at").bind(className,duration,now,now).run();return Response.json({ok:true,message:`${className} 미참여 ${count}명의 보충평가 미리보기를 열었습니다.`});
}
if(b.action==="start_makeup"){const className=String(b.className||"").trim(),result:any=await env.DB.prepare("UPDATE makeup_rounds SET exam_started_at=?,updated_at=? WHERE class_name=? AND status='open' AND exam_started_at IS NULL").bind(now,now,className).run();if(!Number(result.meta?.changes||0))return Response.json({error:"열린 보충평가가 없거나 이미 시작되었습니다."},{status:409});return Response.json({ok:true,message:`${className} 보충평가 타이머를 일괄 시작했습니다.`})}
if(b.action==="close_makeup"){const className=String(b.className||"").trim();await env.DB.prepare("UPDATE makeup_rounds SET status='closed',closed_at=?,updated_at=? WHERE class_name=?").bind(now,now,className).run();await env.DB.prepare("UPDATE attempts SET status='submitted',submitted_at=?,submission_type='makeup_close',updated_at=? WHERE status='progress' AND student_id IN (SELECT student_id FROM makeup_roster WHERE class_name=?)").bind(now,now,className).run();return Response.json({ok:true,message:`${className} 보충평가를 마감했습니다.`})}
if(b.action==="roster"){await env.DB.prepare("DELETE FROM roster").run();for(const r of Array.isArray(b.rows)?b.rows:[])if(r.studentId&&r.name)await env.DB.prepare("INSERT INTO roster (student_id,name,class_name) VALUES (?,?,?)").bind(String(r.studentId),String(r.name),String(r.className||"")).run()}
if(b.action==="reopen")await env.DB.prepare("UPDATE attempts SET status='progress',submitted_at=NULL,submission_type=NULL,updated_at=? WHERE student_id=?").bind(now,String(b.studentId)).run();
if(b.action==="reset"){
 const id=String(b.studentId||'').trim();
 const listed:any=await env.DB.prepare("SELECT * FROM roster WHERE student_id=?").bind(id).first();
 if(!listed)return Response.json({error:'명단의 학생을 찾을 수 없습니다.'},{status:404});
 const statements=['attempts','student_visits','makeup_roster','grade_history','help_requests','help_history'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE student_id=?`).bind(id));
 if(b.restartTimer===true)statements.push(env.DB.prepare("INSERT INTO attempts (student_id,name,class_name,status,started_at,duration_minutes,paused_seconds,current_step,updated_at,restart_authorized_at) VALUES (?,?,?,'ready',0,45,0,0,?,?)").bind(id,listed.name,listed.class_name,now,now));
 await env.DB.batch(statements);
 return Response.json({ok:true,studentId:id,restartOnEntry:b.restartTimer===true,durationMinutes:b.restartTimer===true?45:null,message:listed.name+' 학생의 접속·응시 기록을 초기화했습니다.'});
}

if(b.action==="reset_class"){
 const className=String(b.className||"").trim();
 if(!className||b.confirmText!==className)return Response.json({error:"반 이름 확인이 일치하지 않습니다."},{status:400});
 const result:any=await env.DB.prepare("DELETE FROM attempts WHERE class_name=?").bind(className).run();
 await env.DB.prepare("DELETE FROM student_visits WHERE class_name=?").bind(className).run();await env.DB.prepare("DELETE FROM makeup_roster WHERE class_name=?").bind(className).run();await env.DB.prepare("DELETE FROM makeup_rounds WHERE class_name=?").bind(className).run();await env.DB.prepare("DELETE FROM grade_history WHERE student_id IN (SELECT student_id FROM roster WHERE class_name=?)").bind(className).run();
 await env.DB.prepare("UPDATE class_sessions SET status='closed',started_at=NULL,exam_started_at=NULL,paused_at=NULL,paused_seconds=0,updated_at=? WHERE class_name=?").bind(now,className).run();
 return Response.json({ok:true,deleted:Number(result.meta?.changes||0),message:`${className} 응시 기록을 초기화했습니다.`});
}
if(b.action==="reset_all"){
 if(b.confirmText!=="전체 초기화")return Response.json({error:"확인 문구가 일치하지 않습니다."},{status:400});
 const result:any=await env.DB.prepare("DELETE FROM attempts").run();
 await env.DB.prepare("DELETE FROM student_visits").run();await env.DB.prepare("DELETE FROM makeup_roster").run();await env.DB.prepare("DELETE FROM makeup_rounds").run();await env.DB.prepare("DELETE FROM grade_history").run();
 await env.DB.prepare("UPDATE settings SET status='closed',started_at=NULL,paused_at=NULL,paused_seconds=0,updated_at=? WHERE id=1").bind(now).run();
 await env.DB.prepare("UPDATE class_sessions SET status='closed',started_at=NULL,exam_started_at=NULL,paused_at=NULL,paused_seconds=0,updated_at=?").bind(now).run();
 return Response.json({ok:true,deleted:Number(result.meta?.changes||0),message:`전체 응시 기록 ${Number(result.meta?.changes||0)}건을 초기화했습니다.`});
}
if(b.action==="save_api_key"){const key=String(b.apiKey||"").trim();if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(key))return Response.json({error:"올바른 OPENAI_API_KEY 형식을 확인하세요."},{status:400});await env.DB.prepare("INSERT INTO teacher_settings (id,openai_api_key,model,updated_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET openai_api_key=excluded.openai_api_key,model=excluded.model,updated_at=excluded.updated_at").bind(key,"gpt-5.6-luna",now).run();return Response.json({ok:true,message:"API 키를 서버에 저장했습니다. 전체 키 값은 다시 표시되지 않습니다."})}
if(b.action==="delete_api_key"){await env.DB.prepare("INSERT INTO teacher_settings (id,openai_api_key,model,updated_at) VALUES (1,NULL,?,?) ON CONFLICT(id) DO UPDATE SET openai_api_key=NULL,updated_at=excluded.updated_at").bind("gpt-5.6-luna",now).run();return Response.json({ok:true,message:"교사용 저장 API 키를 삭제했습니다."})}
if(b.action==="test_api_key"){const config=await aiConfig();if(!config.key)return Response.json({error:"연결할 API 키가 없습니다."},{status:400});const test=await fetch("https://api.openai.com/v1/models",{headers:{authorization:`Bearer ${config.key}`}});if(!test.ok)return Response.json({error:`API 키 연결에 실패했습니다. (${test.status})`},{status:503});return Response.json({ok:true,message:`API 키 연결을 확인했습니다. · 모델 ${config.model}`})}
if(b.action==="create_mock"){const samples=[['DEMO001','김환율'],['DEMO002','이정책'],['DEMO003','박협력'],['DEMO004','최기구']];for(const[id,name]of samples){await env.DB.prepare("INSERT OR IGNORE INTO roster (student_id,name,class_name) VALUES (?,?,'모의반')").bind(id,name).run();const answers={won:'하락',dollar:'상승',cost:'증가',groups:{exporter:'유리',importer:'불리'},exportReason:'원화 가치 하락으로 해외 판매 가격 경쟁력이 높아져 수출에 도움이 된다.',importReason:'같은 원자재를 사기 위해 더 많은 원화가 필요해 비용 부담이 커진다.',effects:['수입물가 상승','외채 상환 부담 증가'],policies:['외환시장에 달러 공급','수입 생필품 가격 지원'],policyEffect:'달러 부족을 완화하고 생활물가 상승의 충격을 줄일 수 있다.',policyRisk:'외환보유액이 줄어들고 지원이 길어지면 재정 부담이 커질 수 있다.',report:'환율 급등으로 수입물가와 외채 부담이 커지므로 외환시장 안정 정책을 우선 시행하고 IMF 등 국제기구 및 주변국과 통화 협력을 추진해야 한다.'};await env.DB.prepare("INSERT OR REPLACE INTO attempts (student_id,name,class_name,answers,status,current_step,auto_score,started_at,duration_minutes,paused_seconds,updated_at,submitted_at,submission_type) VALUES (?,?,?,?,'submitted',5,0,?,45,0,?,?,'mock')").bind(id,name,'모의반',JSON.stringify(answers),now-1800000,now,now).run()}return Response.json({ok:true,message:"가채점 시험용 모의 제출 4건을 만들었습니다."})}
if(b.action==="delete_mock"){await env.DB.prepare("DELETE FROM grade_history WHERE student_id LIKE 'DEMO%'").run();await env.DB.prepare("DELETE FROM attempts WHERE student_id LIKE 'DEMO%' AND class_name='모의반'").run();await env.DB.prepare("DELETE FROM roster WHERE student_id LIKE 'DEMO%' AND class_name='모의반'").run();return Response.json({ok:true,message:"시험용 모의 명단과 제출 기록을 삭제했습니다."})}
if(b.action==="grade"){
 const id=String(b.studentId),row:any=await env.DB.prepare('SELECT * FROM attempts WHERE student_id=?').bind(id).first();if(!row)return Response.json({error:'채점할 학생 기록을 찾을 수 없습니다.'},{status:404});
 const rubric=b.rubric||{},v2=b.rubricVersion==='v2.0';if(b.rubricVersion&&!['legacy','v2.0'].includes(b.rubricVersion))return Response.json({error:'지원하지 않는 채점 기준입니다.'},{status:400});
 let teacherScore:number;
 if(v2){if(b.planConfirmed!==true)return Response.json({error:'PDF v2.0과 사전 공지된 평가계획의 배점 일치를 확인한 뒤 확정하세요.'},{status:400});try{teacherScore=v2Total(rubric)}catch(e){return Response.json({error:e instanceof Error?e.message:'점수 형식 오류'},{status:400})}}
 else{const allowed:any={economy:[25,20,15,10],policy:[25,20,15,10],organization:[20,16,12,8],cooperation:[20,16,12,8],completion:[4,3,2,1],time:[6,4,2,0]};for(const key of Object.keys(allowed))if(!allowed[key].includes(Number(rubric[key])))return Response.json({error:'채점표의 A~D 단계 중 하나를 선택하세요.'},{status:400});teacherScore=Object.keys(allowed).reduce((sum,key)=>sum+Number(rubric[key]),0)}
 const feedback=String(b.feedback||''),provisional=v2?row.ai_v2_score:row.ai_score,savedRubric=v2?{...rubric,rubricVersion:'v2.0',evaluationPlanConfirmedAt:now}:rubric;
 await env.DB.batch([
  env.DB.prepare('UPDATE attempts SET teacher_score=?,teacher_breakdown=?,feedback=?,updated_at=? WHERE student_id=?').bind(teacherScore,JSON.stringify(savedRubric),feedback,now,id),
  env.DB.prepare('INSERT INTO grade_history (student_id,event_type,auto_score,ai_score,extra_penalty,provisional_score,teacher_score,feedback,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,v2?'teacher_grade_v2':'teacher_grade',Number(row.auto_score||0),provisional??null,v2?0:Number(row.extra_penalty||0),provisional??null,teacherScore,feedback,now)
 ]);return Response.json({ok:true,message:row.name+' 학생의 '+teacherScore+'점과 채점 기록을 저장했습니다.'})
}
if(b.action==="ai_grade"){try{const result=await gradeOne(String(b.studentId),b.rubricVersion);return Response.json({ok:true,...result,message:result.status==='skipped'?'교사 확정점수 또는 미제출 기록을 보호했습니다.':'가채점 결과를 저장했습니다.'})}catch(e){return Response.json({error:e instanceof Error?e.message:'가채점 실패'},{status:503})}}
if(b.action==='batch_grade'){try{return Response.json({ok:true,job:await batchGrade(String(b.operation||'status'),b)})}catch(e){return Response.json({error:e instanceof Error?e.message:'일괄 가채점 실패'},{status:409})}}
return Response.json({ok:true})}
