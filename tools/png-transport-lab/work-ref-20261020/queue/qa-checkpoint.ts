
async function runQueueAPIQA(){
 const local="http://127.0.0.1:"+Number(Bun.env.PORT||3000);
 const headers={Authorization:"Bearer "+Bun.env.UPLOAD_TOKEN,"Content-Type":"application/json"};
 const j=JSON.parse(Bun.env.F5_QUEUE_JOB)[0];
 const dup=await fetch(local+"/api/jobs",{method:"POST",headers,body:JSON.stringify(j)});const d=await dup.json();
 if(dup.status!==200||!d.duplicate||d.job.state!=="succeeded")throw Error("DUPLICATE_FAILED");
 const bad=await fetch(local+"/api/jobs",{method:"POST",headers,body:JSON.stringify({...j,branch:"main"})});if(bad.status!==422)throw Error("MAIN_NOT_REJECTED");
 const list=await fetch(local+"/api/jobs",{headers});const data=await list.json();
 if(JSON.stringify(data).includes("download_url")||JSON.stringify(data).includes("sig="))throw Error("SOURCE_LEAK");
 qemit("api_qa",{duplicate_status:dup.status,duplicate_id:d.job.id,main_status:bad.status,list_status:list.status,source_redacted:true});
 // Emulate the crash checkpoint after GitHub commit but before the durable success write.
 qdb.query("UPDATE jobs SET state='committing',result=NULL WHERE id=?").run(d.job.id);
 qemit("recovery_checkpoint",{id:d.job.id,state:"committing",simulation:true});
}
runQueueAPIQA().catch(e=>qemit("qa_failure",{error:e.message}));
