'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..');
function harness(options={}){
 const dir=options.dir||fs.mkdtempSync(path.join(root,'test-data-remote-'));
 const clock={value:Date.parse('2026-11-10T08:00:00Z')};
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.value]))}static now(){return clock.value}}
 let handler;
 const localRequire=createRequire(path.join(root,'server.js')),cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const req=id=>{
   if(id==='http')return {createServer(fn){handler=fn;return {listen(){}}}};
   if(id.startsWith('./')&&path.resolve(path.dirname(file),id).includes(path.join('lib','remote-assessment')))return load(path.resolve(path.dirname(file),id+'.js'));
   return localRequire(id);
  };
  const context={module:m,exports:m.exports,require:req,__dirname:path.dirname(file),__filename:file,Buffer,Date:ClockDate,URL,setTimeout,clearTimeout,setInterval,clearInterval,console:{log(){},warn(){},error(){}},process:{pid:process.pid,env:{DATA_DIR:dir,PORT:'0',TEACHER_PIN:'test-only',OPENAI_API_KEY:'',...(options.env||{})}}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});return m.exports;
 }
 if(options.seed)for(const [file,value]of Object.entries(options.seed))put(file,value);
 load(path.join(root,'server.js'));
 function put(file,value){const f=path.join(dir,file);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(value))}
 function read(file){return JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'))}
 async function request(url,body,method=body===undefined?'GET':'POST'){
  const req=require('node:stream').Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]),res=new EventEmitter();req.method=method;req.url=url;req.headers={host:'localhost'};req.destroy=()=>{};
  let status=200,headers={},chunks=[];
  res.headersSent=false;res.writeHead=(s,h)=>{status=s;headers=h;res.headersSent=true};res.write=b=>chunks.push(Buffer.from(b));
  let resolve;const done=new Promise(r=>resolve=r);
  res.end=b=>{if(b)chunks.push(Buffer.from(b));const bytes=Buffer.concat(chunks),text=bytes.toString('utf8');let json;try{json=JSON.parse(text)}catch{}res.emit('finish');resolve({status,headers,body:json,text,bytes})};
  const handling=handler(req,res);

  await handling;return done;
 }
 const advance=ms=>clock.value+=ms;
 const cleanup=()=>fs.rmSync(dir,{recursive:true,force:true});
 return {dir,clock,put,read,request,advance,cleanup};
}
module.exports={harness};
