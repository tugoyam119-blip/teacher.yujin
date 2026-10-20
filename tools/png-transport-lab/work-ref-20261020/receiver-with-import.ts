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
console.log("F5_LISTEN_CONFIG",JSON.stringify({port:Number(Bun.env.PORT||3000),host:"0.0.0.0"}));Bun.serve({port:Number(Bun.env.PORT||3000),hostname:"0.0.0.0",idleTimeout:120,async fetch(req){const url=new URL(req.url);if(req.method==="GET"&&url.pathname==="/health")return json({ok:true,service:"png-binary-upload-f5-lab",version:"0.1.0",upload_ready:!!Bun.env.UPLOAD_TOKEN&&Bun.env.UPLOAD_TOKEN.length>=24,github_ready:!!Bun.env.GITHUB_TOKEN,chatgpt_file_ref_access:false});if(url.pathname==="/mcp"&&req.method==="POST"){if(!auth(req))return json({error:"UNAUTHORIZED"},401);let rpc;try{rpc=await req.json()}catch{return json({error:"INVALID_JSON"},400)}if(rpc.method==="initialize")return json({jsonrpc:"2.0",id:rpc.id,result:{protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"png-f5-lab",version:"0.1.0"}}});if(rpc.method==="notifications/initialized")return new Response(null,{status:202});if(rpc.method==="tools/list")return json({jsonrpc:"2.0",id:rpc.id,result:{tools:[{name:"capabilities",description:"Reports PNG ingestion status; ChatGPT-native file_ref resolution not yet available.",inputSchema:{type:"object",properties:{}}}]}});if(rpc.method==="tools/call"&&rpc.params?.name==="capabilities")return json({jsonrpc:"2.0",id:rpc.id,result:{content:[{type:"text",text:"Binary upload POST /api/assets/upload (multipart form file, sha256). ChatGPT file_ref direct read is NOT supported; upload requires explicit file bytes. GitHub writes disabled unless GITHUB_TOKEN configured and safe test path/branch supplied."}]}});return json({jsonrpc:"2.0",id:rpc.id,error:{code:-32601,message:"Method not found"}})}if(url.pathname==="/api/assets/verify-remote"){if(!auth(req))return json({error:"UNAUTHORIZED"},401);if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);let args;try{args=await req.json()}catch{return json({error:"INVALID_JSON"},400)}const {branch,path,sha256:expect,bytes:expectedSize}=args||{};if(!safeBranch(branch)||!safeAssetPath(path))return json({error:"INVALID_BRANCH_OR_PATH"},422);if(!/^[a-f0-9]{64}$/.test(String(expect))||!Number.isInteger(expectedSize)||expectedSize<1||expectedSize>MAX)return json({error:"INVALID_CHECK_VALUES"},422);try{const chk=await verifyRemote(branch,path,expect,expectedSize,Bun.env.GITHUB_TOKEN?{Authorization:"Bearer "+Bun.env.GITHUB_TOKEN}:undefined);return json(chk,chk.status==="BYTE_VERIFIED"?200:422)}catch(err){return json({error:String(err.message)},502)}}if(url.pathname!=="/api/assets/upload")return json({error:"NOT_FOUND"},404);if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);if(!auth(req))return json({error:"UNAUTHORIZED_OR_NOT_CONFIGURED"},401);if(Number(req.headers.get("content-length")||0)>MAX+100000)return json({error:"TOO_LARGE"},413);let form;try{form=await req.formData()}catch{return json({error:"INVALID_MULTIPART"},400)}const file=form.get("file");if(!(file instanceof File))return json({error:"FILE_REQUIRED"},400);if(file.size>MAX)return json({error:"TOO_LARGE"},413);let bytes=new Uint8Array(await file.arrayBuffer());let details;try{details=validatePNG(bytes)}catch(e){return json({error:String(e.message)},422)}const sha=await sha256(bytes),expect=String(form.get("sha256")||"").toLowerCase();if(!/^[a-f0-9]{64}$/.test(expect)||sha!==expect)return json({error:"SHA256_MISMATCH",computed_sha256:sha},422);const result={verified:true,bytes:bytes.length,sha256:sha,...details};if(form.get("commit")==="true"&&!Bun.env.GITHUB_TOKEN)return json({error:"GITHUB_TOKEN_NOT_CONFIGURED",verified_input:true,uploaded:false},503);if(form.get("commit")==="true"){try{result.github=await ghCommit(bytes,String(form.get("target_path")||""),String(form.get("branch")||""),"test: register verified binary png",sha)}catch(e){return json({error:String(e.message),...result},422)}}return json(result)}});

async function runF5ImportJob() {
 const raw=Bun.env.F5_IMPORT_JOB;if(!raw)return;
 const job=JSON.parse(raw);
 const emit=(test,data)=>console.log("F5_WORK_QA",JSON.stringify({run:job.run,test,...data}));
 const url=new URL(job.download_url);
 if(url.protocol!=="https:"||!url.hostname.endsWith(".oaiusercontent.com"))throw Error("UNTRUSTED_SOURCE");
 if(!safeBranch(job.branch)||!safeAssetPath(job.path))throw Error("UNSAFE_TARGET");
 const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error("SOURCE_HTTP_"+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length!==job.bytes||await sha256(bytes)!==job.sha256)throw Error("SOURCE_MISMATCH");
 validatePNG(bytes);emit("source",{bytes:bytes.length,sha256:job.sha256});
 const local="http://127.0.0.1:"+Number(Bun.env.PORT||3000)+"/api/assets/upload";
 async function send(test,commit=false,hash=job.sha256,token=Bun.env.UPLOAD_TOKEN) {
  const form=new FormData();form.set("file",new File([bytes],"fixture_20MB.png",{type:"image/png"}));
  form.set("sha256",hash);form.set("commit",String(commit));form.set("branch",job.branch);form.set("target_path",job.path);
  const r=await fetch(local,{method:"POST",headers:{Authorization:"Bearer "+token},body:form,signal:AbortSignal.timeout(180000)});
  const body=await r.json();emit(test,{status:r.status,result:body});
  return {r,body};
 }
 for(let i=1;i<=3;i++){const {r,body}=await send("dry_"+i);if(!r.ok||body.bytes!==job.bytes||body.sha256!==job.sha256)throw Error("DRY_FAILED");}
 const badAuth=await send("bad_auth",false,job.sha256,"invalid-test-token");if(badAuth.r.status!==401)throw Error("AUTH_NOT_REJECTED");
 const badSha=await send("bad_sha",false,"0".repeat(64));if(badSha.r.status!==422)throw Error("SHA_NOT_REJECTED");
 for(let i=1;i<=3;i++){const {r,body}=await send("commit_"+i,true);if(!r.ok||!body.github?.verified)throw Error("COMMIT_FAILED");}
 emit("complete",{ok:true});
}
runF5ImportJob().catch(e=>console.log("F5_WORK_QA",JSON.stringify({test:"failure",error:String(e.message).split("?")[0]})));
