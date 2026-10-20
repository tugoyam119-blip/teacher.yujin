
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
