
async function runF5Regression(){
 const emit=(test,data)=>console.log("F5_REGRESSION",JSON.stringify({test,...data}));
 const {deflateSync}=await import("node:zlib");
 function chunk(type,data){const out=new Uint8Array(data.length+12);new DataView(out.buffer).setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);new DataView(out.buffer).setUint32(out.length-4,crc32(out,4,out.length-4));return out;}
 const ih=new Uint8Array(13);const dv=new DataView(ih.buffer);dv.setUint32(0,1);dv.setUint32(4,1);ih[8]=8;ih[9]=6;
 function fixture(size){const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(new Uint8Array([0,1,2,3,255])))];let used=parts.reduce((a,b)=>a+b.length,0)+24;const pad=new Uint8Array(size-used);pad.set([81,65,0]);parts.push(chunk("tEXt",pad),chunk("IEND",new Uint8Array()));const out=new Uint8Array(size);let p=0;for(const b of parts){out.set(b,p);p+=b.length}return out;}
 const local="http://127.0.0.1:"+Number(Bun.env.PORT||3000)+"/api/assets/upload";
 for(const mb of [1,5,10]) {const bytes=fixture(mb*1024*1024);const sha=await sha256(bytes);validatePNG(bytes);
 for(let i=1;i<=3;i++){const f=new FormData();f.set("file",new File([bytes],"fixture.png"));f.set("sha256",sha);f.set("commit","false");const r=await fetch(local,{method:"POST",headers:{Authorization:"Bearer "+Bun.env.UPLOAD_TOKEN},body:f});const body=await r.json();emit(mb+"MB_"+i,{status:r.status,...body});if(!r.ok||body.sha256!==sha||body.bytes!==bytes.length)throw Error("REGRESSION_FAILED");}}
 const {connect}=await import("node:net");
 await new Promise((resolve,reject)=>{const s=connect(Number(Bun.env.PORT||3000),"127.0.0.1");s.on("error",reject);s.on("connect",()=>{s.write("POST /api/assets/upload HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer "+Bun.env.UPLOAD_TOKEN+"\r\nContent-Type: multipart/form-data; boundary=interrupted\r\nContent-Length: 20979500\r\n\r\n--interrupted\r\nContent-Disposition: form-data; name=\"file\"; filename=\"abort.png\"\r\n\r\n");s.write(new Uint8Array(65536),()=>{s.destroy();resolve(null)});});});
 const health=await fetch("http://127.0.0.1:"+Number(Bun.env.PORT||3000)+"/health");emit("interrupted_body",{partial_bytes:65536,client_disconnected:true,health_status:health.status,commit_requested:false});emit("complete",{ok:health.ok});
}
runF5Regression().catch(e=>console.log("F5_REGRESSION",JSON.stringify({test:"failure",error:e.message})));
