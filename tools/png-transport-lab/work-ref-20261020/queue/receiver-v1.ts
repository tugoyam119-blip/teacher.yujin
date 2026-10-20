
import { Database } from "bun:sqlite";
import { mkdir, rename, unlink } from "node:fs/promises";
await mkdir("/data/f5-cache",{recursive:true});
const qdb=new Database("/data/f5-jobs.sqlite",{create:true});
qdb.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, branch TEXT NOT NULL,path TEXT NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL,source TEXT,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,error TEXT,result TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL, UNIQUE(branch,path,sha))");
qdb.query("UPDATE jobs SET state='queued' WHERE state IN ('downloading','verified','committing')").run();
function qemit(test,data){console.log("F5_QUEUE",JSON.stringify({test,...data}))}
function publicJob(j){if(!j)return null;const {source,...safe}=j;return {...safe,result:j.result?JSON.parse(j.result):null};}
function validSource(s){try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.endsWith(".oaiusercontent.com")&&(!u.port||u.port==="443")}catch{return false}}
function enqueue(j){
 if(!safeBranch(j.branch)||!safeAssetPath(j.path)||!Number.isInteger(j.bytes)||j.bytes<45||j.bytes>MAX||!/^test\//.test(j.branch)||!/^[a-f0-9]{64}$/.test(j.sha256)||!validSource(j.download_url))throw Error("INVALID_JOB");
 const id=hex(new Uint8Array(new Bun.CryptoHasher("sha256").update(j.branch+"\n"+j.path+"\n"+j.sha256).digest()));
 const old=qdb.query("SELECT * FROM jobs WHERE id=?").get(id);const now=Date.now();
 if(old){if(old.bytes!==j.bytes)throw Error("SIZE_CONFLICT");if(old.state!=="succeeded"){qdb.query("UPDATE jobs SET source=?,state=CASE WHEN state IN ('failed','needs_source') THEN 'queued' ELSE state END,attempts=CASE WHEN state IN ('failed','needs_source') THEN 0 ELSE attempts END,next_at=0,updated_at=? WHERE id=?").run(j.download_url,now,id);}return {duplicate:true,job:publicJob(qdb.query("SELECT * FROM jobs WHERE id=?").get(id))};}
 qdb.query("INSERT INTO jobs(id,branch,path,sha,bytes,source,state,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',?,?)").run(id,j.branch,j.path,j.sha256,j.bytes,j.download_url,now,now);
 return {duplicate:false,job:publicJob(qdb.query("SELECT * FROM jobs WHERE id=?").get(id))};
}
let qbusy=false,qtimer;
function wakeQueue(delay=0){if(qtimer)clearTimeout(qtimer);qtimer=setTimeout(()=>drainQueue(),delay);}
function transition(id,state,extra={}){qdb.query("UPDATE jobs SET state=?,updated_at=? WHERE id=?").run(state,Date.now(),id);qemit("state",{id,state,...extra});}
async function downloadJob(j){
 const cache="/data/f5-cache/"+j.sha+".png";
 if(await Bun.file(cache).exists()){const b=new Uint8Array(await Bun.file(cache).arrayBuffer());if(b.length===j.bytes&&await sha256(b)===j.sha){validatePNG(b);return b;}await unlink(cache);}
 if(!j.source)throw Error("NEEDS_SOURCE");
 const r=await fetch(j.source,{redirect:"manual",signal:AbortSignal.timeout(90000)});
 if(r.status===401||r.status===403||r.status===404)throw Error("NEEDS_SOURCE");
 if(!r.ok)throw Error("SOURCE_HTTP_"+r.status);
 if(Number(r.headers.get("content-length")||0)>MAX)throw Error("SOURCE_TOO_LARGE");
 const chunks=[];let size=0;const reader=r.body.getReader();
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX||size>j.bytes)throw Error("SOURCE_TOO_LARGE");chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const b=new Uint8Array(size);let p=0;for(const c of chunks){b.set(c,p);p+=c.length;}
 if(size!==j.bytes||await sha256(b)!==j.sha)throw Error("SOURCE_MISMATCH");validatePNG(b);
 const temp=cache+"."+j.id+".tmp";await Bun.write(temp,b);await rename(temp,cache);
 qdb.query("UPDATE jobs SET source=NULL WHERE id=?").run(j.id);return b;
}
async function remoteMatches(j){
 try{const r=await verifyRemote(j.branch,j.path,j.sha,j.bytes,{Authorization:"Bearer "+Bun.env.GITHUB_TOKEN});return r.status==="BYTE_VERIFIED"?r:null;}catch(e){if(String(e.message).includes("_404"))return null;throw e;}
}
async function executeJob(j){
 transition(j.id,"downloading");const bytes=await downloadJob(j);transition(j.id,"verified");
 const form=new FormData();form.set("file",new File([bytes],"asset.png",{type:"image/png"}));form.set("sha256",j.sha);form.set("commit","false");
 const dry=await fetch("http://127.0.0.1:"+Number(Bun.env.PORT||3000)+"/api/assets/upload",{method:"POST",headers:{Authorization:"Bearer "+Bun.env.UPLOAD_TOKEN},body:form,signal:AbortSignal.timeout(90000)});
 const body=await dry.json();if(!dry.ok||body.sha256!==j.sha||body.bytes!==j.bytes)throw Error("DRY_FAILED");
 const existing=await remoteMatches(j);
 let result;
 if(existing)result={...existing,commit_skipped:true};
 else{transition(j.id,"committing");result=await ghCommit(bytes,j.path,j.branch,"test: register durable queued PNG",j.sha);}
 qdb.query("UPDATE jobs SET state='succeeded',source=NULL,error=NULL,result=?,updated_at=? WHERE id=?").run(JSON.stringify(result),Date.now(),j.id);
 qemit("succeeded",{job:publicJob(qdb.query("SELECT * FROM jobs WHERE id=?").get(j.id))});
}
async function drainQueue(){
 if(qbusy)return;qbusy=true;
 try{while(true){
 const j=qdb.query("SELECT * FROM jobs WHERE state IN ('queued','retry_wait') AND next_at<=? ORDER BY created_at,id LIMIT 1").get(Date.now());if(!j)break;
 qdb.query("UPDATE jobs SET attempts=attempts+1 WHERE id=?").run(j.id);j.attempts++;
 try{if(Bun.env.F5_QUEUE_QA_FAIL_PATH===j.path&&j.attempts===1)throw Error("QA_TRANSIENT");await executeJob(j);}
 catch(e){const msg=String(e.message);const terminal=/SOURCE_MISMATCH|SOURCE_TOO_LARGE|INVALID_|BAD_PNG|DRY_FAILED/.test(msg);
 const state=msg==="NEEDS_SOURCE"?"needs_source":terminal||j.attempts>=3?"failed":"retry_wait";
 const error=msg.match(/^[A-Z0-9_]+/)?.[0]||"JOB_FAILED";
 qdb.query("UPDATE jobs SET state=?,error=?,source=CASE WHEN ?='needs_source' THEN NULL ELSE source END,next_at=?,updated_at=? WHERE id=?").run(state,error,state,Date.now()+Math.min(10000,1000*2**j.attempts),Date.now(),j.id);qemit("error",{id:j.id,state,error,attempts:j.attempts});}
 }}finally{qbusy=false;const due=qdb.query("SELECT MIN(next_at) AS due FROM jobs WHERE state IN ('queued','retry_wait')").get();if(due.due!==null)wakeQueue(Math.max(100,due.due-Date.now()));}
}
async function queueRoute(req,url){
 if(!url.pathname.startsWith("/api/jobs"))return null;
 if(!auth(req))return json({error:"UNAUTHORIZED"},401);
 if(url.pathname==="/api/jobs"&&req.method==="POST"){try{const out=enqueue(await req.json());wakeQueue();return json(out,out.duplicate?200:202);}catch{return json({error:"INVALID_JOB"},422);}}
 if(url.pathname==="/api/jobs"&&req.method==="GET")return json({jobs:qdb.query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100").all().map(publicJob)});
 const match=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{64})$/);if(match&&req.method==="GET"){const j=publicJob(qdb.query("SELECT * FROM jobs WHERE id=?").get(match[1]));return json(j||{error:"NOT_FOUND"},j?200:404);}
 return json({error:"NOT_FOUND"},404);
}
function startQueue(){
 if(Bun.env.F5_QUEUE_JOB){try{const jobs=JSON.parse(Bun.env.F5_QUEUE_JOB);for(const j of Array.isArray(jobs)?jobs:[jobs])qemit("enqueued",enqueue(j));}catch{qemit("enqueue_failed",{error:"INVALID_JOB"});}}
 qemit("startup",{jobs:qdb.query("SELECT * FROM jobs").all().map(publicJob)});
 wakeQueue();
}

const MAX=25*1024*1024;
const repoAllowed="tugoyam119-blip/teacher.yujin";
function json(data,status=200){return Response.json(data,{status,headers:{"cache-control":"no-store"}})}
const hex=u=>Array.from(u).map(x=>x.toString(16).padStart(2,"0")).join("");
function crc32(bytes,start,end){let c=0xffffffff;for(let i=start;i<end;i++){c^=bytes[i];for(let j=0;j<8;j++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0}
function u32(b,o){return((b[o]*0x1000000)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3])>>>0}
function validatePNG(b){const sig=[137,80,78,71,13,10,26,10];if(b.length<45||!sig.every((x,i)=>b[i]===x))throw Error("INVALID_PNG_SIGNATURE");let offset=8,seenIHDR=false,seenIEND=false,width=0,height=0,chunkCount=0;while(offset+12<=b.length){const len=u32(b,offset),end=offset+12+len;if(end>b.length)throw Error("TRUNCATED_CHUNK");const typ=String.fromCharCode(...b.subarray(offset+4,offset+8));if(crc32(b,offset+4,end-4)!==u32(b,end-4))throw Error("BAD_PNG_CRC");if(!seenIHDR){if(typ!=="IHDR"||len!==13)throw Error("INVALID_IHDR");width=u32(b,offset+8);height=u32(b,offset+12);if(!width||!height||width>16384||height>16384)throw Error("INVALID_DIMENSIONS");seenIHDR=true;}chunkCount++;offset=end;if(typ==="IEND"){if(len!==0||offset!==b.length)throw Error("INVALID_IEND");seenIEND=true;break;}}if(!seenIHDR||!seenIEND)throw Error("INCOMPLETE_PNG");return {width,height,chunkCount}}
async function sha256(b){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",b)))}
function auth(req){const token=Bun.env.UPLOAD_TOKEN;return !!token&&token.length>=24&&req.headers.get("authorization")==="Bearer "+token}

function safeAssetPath(path){return typeof path==="string"&&path.startsWith("tools/png-transport-lab/")&&path.endsWith(".png")&&!path.includes("..")&&!path.includes("\\")&&path.length<220&&/^[a-zA-Z0-9._/-]+$/.test(path)}
function safeBranch(branch){return typeof branch==="string"&&branch.startsWith("test/")&&!branch.includes("..")&&branch.length<=105&&/^[a-zA-Z0-9._/-]+$/.test(branch)}
async function readRemoteBytes(branch,path,authHeaders){if(!safeBranch(branch)||!safeAssetPath(path))throw Error("UNSAFE_REMOTE_REFERENCE");
  const url="https://raw.githubusercontent.com/"+repoAllowed+"/"+branch+"/"+path+"?f5check="+Date.now();
  const req=await fetch(url,{headers:{"Accept":"application/octet-stream","Cache-Control":"no-cache",...(authHeaders?{"Authorization":authHeaders.Authorization}:{})},signal:AbortSignal.timeout(60000)});
  if(!req.ok)throw Error("GITHUB_RAW_FETCH_"+req.status);
  if(Number(req.headers.get("content-length")||0)>MAX)throw Error("REMOTE_TOO_LARGE");
  let bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>MAX)throw Error("REMOTE_TOO_LARGE");
  return bytes;
}
async function verifyRemote(branch,path,expected,size,authHeaders){let bytes=await readRemoteBytes(branch,path,authHeaders);let remote=await sha256(bytes);return{status:remote===expected&&bytes.length===size?"BYTE_VERIFIED":"BYTE_MISMATCH",remote_sha256:remote,remote_bytes:bytes.length,sha_matches:remote===expected,size_matches:bytes.length===size};}
async function ghCommit(b,path,branch,message,expectedSha){
 if(!safeBranch(branch))throw Error("BRANCH_MUST_BE_TEST");
 if(!safeAssetPath(path))throw Error("UNSAFE_PATH");
 if(!Bun.env.GITHUB_TOKEN)return {status:"GITHUB_TOKEN_NOT_CONFIGURED",uploaded:false,verified:false};
 const url="https://api.github.com/repos/"+repoAllowed+"/contents/"+path;
 const headers={Authorization:"Bearer "+Bun.env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"};
 const get=await fetch(url+"?ref="+encodeURIComponent(branch),{headers,signal:AbortSignal.timeout(30000)});
 let prevSha;if(get.ok){let obj=await get.json();prevSha=obj.sha}else if(get.status!==404)throw Error("GITHUB_READ_"+get.status);
 const result=await fetch(url,{method:"PUT",headers,body:JSON.stringify({message,content:Buffer.from(b).toString("base64"),branch,...(prevSha?{sha:prevSha}:{})}),signal:AbortSignal.timeout(120000)});
 if(!result.ok)throw Error("GITHUB_WRITE_"+result.status+":"+(await result.text()).slice(0,120));
 const saved=await result.json();if(!saved.content?.sha)throw Error("GITHUB_NO_SHA");
 const verified=await verifyRemote(branch,path,expectedSha,b.length,headers);
 if(verified.status!=="BYTE_VERIFIED")throw Error("GITHUB_REMOTE_HASH_MISMATCH");
 return {status:"GITHUB_COMMITTED_AND_BYTES_VERIFIED",uploaded:true,verified:true,blob_sha:saved.content.sha,commit_sha:saved.commit?.sha,...verified};
}
console.log("F5_LISTEN_CONFIG",JSON.stringify({port:Number(Bun.env.PORT||3000),host:"0.0.0.0"}));Bun.serve({port:Number(Bun.env.PORT||3000),hostname:"0.0.0.0",idleTimeout:120,async fetch(req){const url=new URL(req.url);const qr=await queueRoute(req,url);if(qr)return qr;if(req.method==="GET"&&url.pathname==="/health")return json({ok:true,service:"png-binary-upload-f5-lab",version:"0.1.0",upload_ready:!!Bun.env.UPLOAD_TOKEN&&Bun.env.UPLOAD_TOKEN.length>=24,github_ready:!!Bun.env.GITHUB_TOKEN,chatgpt_file_ref_access:false});if(url.pathname==="/mcp"&&req.method==="POST"){if(!auth(req))return json({error:"UNAUTHORIZED"},401);let rpc;try{rpc=await req.json()}catch{return json({error:"INVALID_JSON"},400)}if(rpc.method==="initialize")return json({jsonrpc:"2.0",id:rpc.id,result:{protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"png-f5-lab",version:"0.1.0"}}});if(rpc.method==="notifications/initialized")return new Response(null,{status:202});if(rpc.method==="tools/list")return json({jsonrpc:"2.0",id:rpc.id,result:{tools:[{name:"capabilities",description:"Reports PNG ingestion status; ChatGPT-native file_ref resolution not yet available.",inputSchema:{type:"object",properties:{}}}]}});if(rpc.method==="tools/call"&&rpc.params?.name==="capabilities")return json({jsonrpc:"2.0",id:rpc.id,result:{content:[{type:"text",text:"Binary upload POST /api/assets/upload (multipart form file, sha256). ChatGPT file_ref direct read is NOT supported; upload requires explicit file bytes. GitHub writes disabled unless GITHUB_TOKEN configured and safe test path/branch supplied."}]}});return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32601,message:"Method not found"}})}if(url.pathname==="/api/assets/verify-remote"){if(!auth(req))return json({error:"UNAUTHORIZED"},401);if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);let args;try{args=await req.json()}catch{return json({error:"INVALID_JSON"},400)}const {branch,path,sha256:expect,bytes:expectedSize}=args||{};if(!safeBranch(branch)||!safeAssetPath(path))return json({error:"INVALID_BRANCH_OR_PATH"},422);if(!/^[a-f0-9]{64}$/.test(String(expect))||!Number.isInteger(expectedSize)||expectedSize<1||expectedSize>MAX)return json({error:"INVALID_CHECK_VALUES"},422);try{const chk=await verifyRemote(branch,path,expect,expectedSize,Bun.env.GITHUB_TOKEN?{Authorization:"Bearer "+Bun.env.GITHUB_TOKEN}:undefined);return json(chk,chk.status==="BYTE_VERIFIED"?200:422)}catch(err){return json({error:String(err.message)},502)}}if(url.pathname!=="/api/assets/upload")return json({error:"NOT_FOUND"},404);if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);if(!auth(req))return json({error:"UNAUTHORIZED_OR_NOT_CONFIGURED"},401);if(Number(req.headers.get("content-length")||0)>MAX+100000)return json({error:"TOO_LARGE"},413);let form;try{form=await req.formData()}catch{return json({error:"INVALID_MULTIPART"},400)}const file=form.get("file");if(!(file instanceof File))return json({error:"FILE_REQUIRED"},400);if(file.size>MAX)return json({error:"TOO_LARGE"},413);let bytes=new Uint8Array(await file.arrayBuffer());let details;try{details=validatePNG(bytes)}catch(e){return json({error:String(e.message)},422)}const sha=await sha256(bytes),expect=String(form.get("sha256")||"").toLowerCase();if(!/^[a-f0-9]{64}$/.test(expect)||sha!==expect)return json({error:"SHA256_MISMATCH",computed_sha256:sha},422);const result={verified:true,bytes:bytes.length,sha256:sha,...details};if(form.get("commit")==="true"&&!Bun.env.GITHUB_TOKEN)return json({error:"GITHUB_TOKEN_NOT_CONFIGURED",verified_input:true,uploaded:false},503);if(form.get("commit")==="true"){try{result.github=await ghCommit(bytes,String(form.get("target_path")||""),String(form.get("branch")||""),"test: register verified binary png",sha)}catch(e){return json({error:String(e.message),...result},422)}}return json(result)}});

startQueue();
