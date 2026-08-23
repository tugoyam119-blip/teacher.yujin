const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = '2.2.3';
const PROJECT_ID = 'international-climate-conference-assessment';
const PROJECT_NAME = '국제기후회의 수행평가';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '000000';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const LOG_FILE = path.join(DATA_DIR, 'events.jsonl');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');

const countries = ['hanbit', 'saebom', 'pureun', 'taeyang'];
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const hashCountry = studentId => countries[crypto.createHash('sha256').update(String(studentId)).digest()[0] % countries.length];

async function appendEvent(event) { await fsp.appendFile(LOG_FILE, JSON.stringify({ ...event, ts: now() }) + '\n', 'utf8'); }
async function readEvents() {
  const txt = await fsp.readFile(LOG_FILE, 'utf8');
  return txt.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}
function reconstruct(events) {
  const sessions = new Map();
  for (const e of events) {
    if (!e.sessionId) continue;
    if (e.type === 'start') sessions.set(e.sessionId, {sessionId:e.sessionId,studentId:e.studentId,name:e.name,country:e.country,startedAt:e.ts,updatedAt:e.ts,submittedAt:null,status:'in_progress',progress:0,data:{},score:null,teacherNote:''});
    const s = sessions.get(e.sessionId); if (!s) continue;
    if (e.type === 'save') { s.data={...s.data,...(e.data||{})}; s.progress=Math.max(s.progress||0,Number(e.progress||0)); s.updatedAt=e.ts; }
    if (e.type === 'submit') { s.data={...s.data,...(e.data||{})}; s.progress=100; s.status='submitted'; s.submittedAt=e.ts; s.updatedAt=e.ts; }
    if (e.type === 'score') { s.score=e.score; s.teacherNote=e.teacherNote||''; s.updatedAt=e.ts; }
    if (e.type === 'reset') { s.status='reset'; s.updatedAt=e.ts; }
  }
  return [...sessions.values()].filter(s => s.status !== 'reset');
}
async function latestByStudent(studentId) { return reconstruct(await readEvents()).filter(s=>s.studentId===studentId).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt))[0] || null; }
function sendJson(res, status, obj) { const body=JSON.stringify(obj); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)}); res.end(body); }
function sendText(res, status, body, type='text/plain; charset=utf-8', extra={}) { res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(body),...extra}); res.end(body); }
async function bodyJson(req) { return await new Promise((resolve,reject)=>{let data='';req.on('data',c=>{data+=c;if(data.length>1_000_000){reject(new Error('too large'));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch(e){reject(e)}});req.on('error',reject)}); }
function teacherOK(req, url) { return (req.headers['x-teacher-key'] || url.searchParams.get('password') || '') === TEACHER_PASSWORD; }
function csvEscape(v) { const s=v==null?'':String(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }

async function serveStatic(req,res,url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname='/index.html';
  if (pathname === '/teacher') pathname='/teacher.html';
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) return sendText(res,403,'Forbidden');
  try { const stat=await fsp.stat(file); if(!stat.isFile()) throw new Error(); const data=await fsp.readFile(file); res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store'}); res.end(data); }
  catch { sendText(res,404,'Not found'); }
}

async function handle(req,res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    // 교사용 진입 호환성: 관리 서버가 ?teacher=1 형태로 링크해도 교사용 화면으로 이동합니다.
    if (req.method==='GET' && url.pathname==='/' && (url.searchParams.get('teacher')==='1' || url.searchParams.get('mode')==='teacher')) {
      res.writeHead(302, { Location: '/teacher', 'Cache-Control':'no-store' });
      return res.end();
    }
    if (req.method==='GET' && (url.pathname==='/teacher/' || url.pathname==='/teacher.html')) {
      res.writeHead(302, { Location: '/teacher', 'Cache-Control':'no-store' });
      return res.end();
    }
    if (req.method==='GET' && url.pathname==='/health') return sendJson(res,200,{ok:true,projectId:PROJECT_ID,name:PROJECT_NAME,version:APP_VERSION,time:now()});
    if (req.method==='GET' && url.pathname==='/api/project-info') return sendJson(res,200,{projectId:PROJECT_ID,name:PROJECT_NAME,version:APP_VERSION,type:'server',studentPath:'/',teacherPath:'/teacher',teacherQuery:'/?teacher=1',theme:'green',mobileOptimized:true,lessons:2,totalMinutes:90,recommendedMinutesPerLesson:45});
    if (req.method==='POST' && url.pathname==='/api/teacher/auth') {
      const b=await bodyJson(req);
      const supplied=String(b.password||'');
      if (supplied!==TEACHER_PASSWORD) return sendJson(res,401,{ok:false,error:'교사용 비밀번호가 올바르지 않습니다.'});
      return sendJson(res,200,{ok:true});
    }
    if (req.method==='POST' && url.pathname==='/api/start') {
      const b=await bodyJson(req), studentId=String(b.studentId||'').trim(), name=String(b.name||'').trim();
      if(!/^\d{4,6}$/.test(studentId)) return sendJson(res,400,{error:'학번은 숫자 4~6자리로 입력하세요.'});
      if(name.length<2||name.length>20) return sendJson(res,400,{error:'이름을 정확히 입력하세요.'});
      const existing=await latestByStudent(studentId);
      if(existing&&existing.status==='submitted') return sendJson(res,409,{error:'이미 제출이 완료된 학번입니다. 수정이 필요하면 교사에게 문의하세요.'});
      if(existing&&existing.status==='in_progress'&&existing.name===name) return sendJson(res,200,{resumed:true,session:existing,serverNow:now()});
      if(existing&&existing.status==='in_progress'&&existing.name!==name) return sendJson(res,409,{error:'같은 학번으로 진행 중인 수행평가가 있습니다. 이름을 처음과 다르게 입력했다면 교사에게 문의하세요.'});
      const sessionId=newId(), country=hashCountry(studentId); await appendEvent({type:'start',sessionId,studentId,name,country});
      return sendJson(res,200,{resumed:false,session:{sessionId,studentId,name,country,data:{},progress:0,status:'in_progress'},serverNow:now()});
    }
    if (req.method==='POST' && url.pathname==='/api/save') {
      const b=await bodyJson(req); if(!b.sessionId) return sendJson(res,400,{error:'세션 정보가 없습니다.'});
      await appendEvent({type:'save',sessionId:b.sessionId,data:b.data||{},progress:Number(b.progress||0)}); return sendJson(res,200,{ok:true,savedAt:now()});
    }
    if (req.method==='POST' && url.pathname==='/api/submit') {
      const b=await bodyJson(req); if(!b.sessionId) return sendJson(res,400,{error:'세션 정보가 없습니다.'});
      await appendEvent({type:'submit',sessionId:b.sessionId,data:b.data||{}}); return sendJson(res,200,{ok:true,submittedAt:now()});
    }
    if (req.method==='GET' && url.pathname.startsWith('/api/session/')) {
      const id=url.pathname.split('/').pop(), s=reconstruct(await readEvents()).find(x=>x.sessionId===id); if(!s)return sendJson(res,404,{error:'세션을 찾을 수 없습니다.'}); return sendJson(res,200,{session:s,serverNow:now()});
    }
    if (url.pathname.startsWith('/api/teacher/') && !teacherOK(req,url)) return sendJson(res,401,{error:'교사용 비밀번호가 올바르지 않습니다.'});
    if (req.method==='GET' && url.pathname==='/api/teacher/submissions') return sendJson(res,200,{sessions:reconstruct(await readEvents()).sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId),'ko'))});
    if (req.method==='POST' && url.pathname==='/api/teacher/score') {
      const b=await bodyJson(req), allowed={dataAnalysis:[0,5,10,15],nationalDecision:[0,5,10,15],budgetTradeoff:[0,5,10,15,20],international:[0,5,10,15],compromise:[0,5,10,15],governance:[0,5,10],reflection:[0,5,10]}, fields=Object.keys(allowed), clean={};
      if(!b.sessionId||!b.score)return sendJson(res,400,{error:'채점 정보가 부족합니다.'});
      for(const f of fields){const v=Number(b.score[f]);if(!Number.isFinite(v)||!allowed[f].includes(v))return sendJson(res,400,{error:`${f} 점수를 확인하세요.`});clean[f]=v;}clean.total=fields.reduce((a,f)=>a+clean[f],0);
      await appendEvent({type:'score',sessionId:b.sessionId,score:clean,teacherNote:String(b.teacherNote||'').slice(0,1000)}); return sendJson(res,200,{ok:true,score:clean});
    }
    if (req.method==='POST' && url.pathname==='/api/teacher/reset') { const b=await bodyJson(req); if(!b.sessionId)return sendJson(res,400,{error:'세션 정보가 없습니다.'}); await appendEvent({type:'reset',sessionId:b.sessionId}); return sendJson(res,200,{ok:true}); }
    if (req.method==='GET' && url.pathname==='/api/teacher/export.csv') {
      const sessions=reconstruct(await readEvents()).sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId),'ko'));
      const headers=['학번','이름','국가','상태','진행률','시작시각','제출시각','선택자료','자료근거','1순위','2순위','우선순위이유','예산_재생에너지','예산_재난지원','예산_기술개발','예산_산림보호','예산_산업전환','예산_최우선이유','70억_우선감액','70억_감액이유','협상전_1차입장','선택협약','협약선택이유','불리한협약','불리한이유','반대국가','반대이유','절충조정요소','절충안','협력주체','협력주체역할배정','협력이유','재판단','최종합의문','총점','교사메모'];
      const rows=sessions.map(s=>{const d=s.data||{},b=d.budget||{};return[s.studentId,s.name,s.country,s.status,s.progress,s.startedAt,s.submittedAt,(d.evidenceSources||[]).join('|'),d.evidenceReason,d.priority1,d.priority2,d.priorityReason,b.renewable,b.disaster,b.tech,b.forest,b.transition,d.budgetHighReason,d.budgetCut,d.budgetCutReason,d.initialPosition,d.agreement,d.agreementReason,d.unfavorableAgreement,d.unfavorableReason,d.opposingCountry,d.oppositionReason,d.compromiseDimension,d.compromise,(d.actors||[]).join('|'),(d.actors||[]).map(k=>`${k}:${d.actorAssignments?.[k]||''}`).join('|'),d.actorReason,d.reconsiderChoice,d.finalDeclaration,s.score?.total??'',s.teacherNote||'']});
      const csv='\uFEFF'+[headers,...rows].map(r=>r.map(csvEscape).join(',')).join('\n'); return sendText(res,200,csv,'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="climate_assessment_results.csv"'});
    }
    return serveStatic(req,res,url);
  } catch(e) { console.error(e); return sendJson(res,500,{error:'서버 처리 중 오류가 발생했습니다.'}); }
}

http.createServer(handle).listen(PORT,()=>console.log(`${PROJECT_NAME} v${APP_VERSION} running on http://localhost:${PORT}`));
