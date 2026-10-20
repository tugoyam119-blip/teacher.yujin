
async function verifyQueueFinal(){
 if(!Bun.env.F5_QA_MANIFEST)return;
 const base=JSON.parse(Bun.env.F5_QA_MANIFEST),local="http://127.0.0.1:"+Number(Bun.env.PORT||3000);
 const headers={Authorization:"Bearer "+Bun.env.UPLOAD_TOKEN,"Content-Type":"application/json"};
 const assert=(ok,test,data={})=>{qemit("verification",{test,ok,...data});if(!ok)throw Error(test)};
 async function post(body,authorized=true){const r=await fetch(local+"/api/jobs",{method:"POST",headers:authorized?headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 const unauthorized=await post(base,false);assert(unauthorized.status===401,"auth_rejected",{status:unauthorized.status});
 const main=await post({...base,branch:"main"});assert(main.status===422,"main_rejected",{status:main.status});
 const oversized=await post({...base,bytes:MAX+1});assert(oversized.status===422,"oversized_rejected",{status:oversized.status});
 const origin=await post({...base,download_url:"https://example.com/test.png"});assert(origin.status===422,"untrusted_source_rejected",{status:origin.status});
 const first=await post(base);assert(first.status===202,"new_job",{id:first.body.job?.id,status:first.status});
 const duplicate=await post(base);assert(duplicate.status===200&&duplicate.body.duplicate&&duplicate.body.job.id===first.body.job.id,"duplicate_same_id");
 const retry=await post({...base,path:base.path.replace(".png","-retry.png")});assert(retry.status===202,"retry_job",{id:retry.body.job?.id});
 const bad=await post({...base,path:base.path.replace(".png","-badsha.png"),sha256:"0".repeat(64)});assert(bad.status===202,"badsha_job",{id:bad.body.job?.id});
 const ids=[first.body.job.id,retry.body.job.id,bad.body.job.id];
 for(let i=0;i<90;i++){
  const jobs=await Promise.all(ids.map(async id=>{const r=await fetch(local+"/api/jobs/"+id,{headers});return r.json()}));
  if(jobs.every(j=>["succeeded","failed","needs_source"].includes(j.state))){
   assert(jobs[0].state==="succeeded","new_job_success",{job:jobs[0]});
   assert(jobs[1].state==="succeeded"&&jobs[1].attempts===2,"retry_success",{job:jobs[1]});
   assert(jobs[2].state==="failed"&&jobs[2].error==="SOURCE_MISMATCH"&&jobs[2].attempts===1,"badsha_failed_no_retry",{job:jobs[2]});
   const again=await post(base);assert(again.body.duplicate&&again.body.job.state==="succeeded","completed_duplicate");
   const list=await fetch(local+"/api/jobs",{headers});const data=await list.json();
   assert(list.status===200&&!JSON.stringify(data).includes("sig=")&&!data.jobs.some(j=>"source" in j),"list_redacts_source");
   qemit("verification_complete",{ok:true,ids});return;
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw Error("VERIFICATION_TIMEOUT");
}
verifyQueueFinal().catch(e=>qemit("verification_failure",{error:e.message}));
