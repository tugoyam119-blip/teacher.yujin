const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const {parseRoster,toClimateRows}=require('./lib/roster-standard');

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = '3.6.3';
const PROJECT_ID = 'international-climate-conference-assessment';
const PROJECT_NAME = '기후국제회의 수행평가';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '000000';
const TEACHER_STUDENT_ID = '000000';
const TEACHER_COOKIE = 'climate_teacher_session';
const TEACHER_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const ENV_OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const TOTAL_SECONDS = 45 * 60;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
// Railway volumes are mounted at /data. Prefer that mount automatically so a
// missing DATA_DIR variable never sends assessment records to ephemeral disk.
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(ROOT, 'data'));
const STORAGE_MODE = path.resolve(DATA_DIR) === '/data' ? 'persistent-volume' : 'local';
const LOG_FILE = path.join(DATA_DIR, 'events.jsonl');
const ROSTER_FILE = path.join(DATA_DIR, 'roster.json');
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const CLASS_RUNTIME_FILE = path.join(DATA_DIR, 'class-runtime.json');
const PRESENCE_FILE = path.join(DATA_DIR, 'presence.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'teacher-settings.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
if (!fs.existsSync(ROSTER_FILE)) fs.writeFileSync(ROSTER_FILE, JSON.stringify({updatedAt:null, students:[]}, null, 2));
if (!fs.existsSync(RUNTIME_FILE)) fs.writeFileSync(RUNTIME_FILE, JSON.stringify({serverOpen:false,timerPaused:true,pauseStartedAt:new Date().toISOString(),totalPausedMs:0,updatedAt:null}, null, 2));
else {
 try {
  const legacyRuntime=JSON.parse(fs.readFileSync(RUNTIME_FILE,'utf8'));
  if(typeof legacyRuntime.serverOpen!=='boolean'){
   legacyRuntime.serverOpen=false;
   legacyRuntime.timerPaused=true;
   legacyRuntime.pauseStartedAt=legacyRuntime.pauseStartedAt||new Date().toISOString();
   legacyRuntime.totalPausedMs=Number(legacyRuntime.totalPausedMs||0);
   legacyRuntime.updatedAt=new Date().toISOString();
   fs.writeFileSync(RUNTIME_FILE,JSON.stringify(legacyRuntime,null,2));
  }
 }catch{fs.writeFileSync(RUNTIME_FILE, JSON.stringify({serverOpen:false,timerPaused:true,pauseStartedAt:new Date().toISOString(),totalPausedMs:0,updatedAt:null}, null, 2));}
}
if (!fs.existsSync(SETTINGS_FILE)) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify({openaiApiKeyEnc:null,updatedAt:null}, null, 2), {mode:0o600}); }
try{fs.chmodSync(SETTINGS_FILE,0o600)}catch{}

const countries = ['hanbit', 'saebom', 'pureun', 'taeyang'];
const countryLabels={hanbit:'한빛국',saebom:'새봄국',pureun:'푸른섬국',taeyang:'태양국'};
const priorityLabels={growth:'경제 성장',reduction:'온실가스 감축',energy:'에너지 안정',damage:'기후위기 피해 감소',responsibility:'국제적 책임'};
const budgets={renewable:'개발도상국 재생에너지 지원',disaster:'기후재난 피해국 지원',tech:'친환경 기술 개발',forest:'산림 보호',transition:'화석연료 산업 전환 지원'};
const agreementLabels={A:'A안 · 동일책임안',B:'B안 · 차등책임안',C:'C안 · 자율감축안'};
const actorLabels={state:'개별 국가',un:'UN',org:'국제환경기구',business:'기업',ngo:'NGO',citizen:'시민'};
const actorRoleLabels={negotiation:'국가 간 협상·합의 조정',finance:'재정·기술 지원',implementation:'정책·기술의 실제 이행',monitoring:'이행 감시·정보 공개',representation:'피해 집단·시민 의견 반영'};
const evidenceLabels={responsibility:'자료 1 · 배출 책임',vulnerability:'자료 2 · 기후피해 위험',energy:'자료 3 · 에너지·전환 조건'};
const compromiseLabels={rate:'감축률',finance:'재정 지원',time:'이행 시기',technology:'기술 지원',other:'기타 조건'};
const scoreMax={countryUnderstanding:25,policyChoice:25,compromise:25,reflection:25};
const scoreLabels={countryUnderstanding:'국가 이해',policyChoice:'정책 선택',compromise:'절충안',reflection:'성찰·최종 합의'};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const now=()=>new Date().toISOString();
const newId=()=>crypto.randomUUID();
const hashInt=s=>crypto.createHash('sha256').update(String(s)).digest().readUInt32BE(0);

let eventCache=null,eventLoadPromise=null,sessionCache=null,eventWriteChain=Promise.resolve();
async function readEvents(){
 if(eventCache)return eventCache;
 if(!eventLoadPromise)eventLoadPromise=fsp.readFile(LOG_FILE,'utf8').then(txt=>{eventCache=txt.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean);return eventCache}).finally(()=>{eventLoadPromise=null});
 return eventLoadPromise;
}
async function readSessions(){if(!sessionCache)sessionCache=new Map((reconstruct(await readEvents(),true)).map(s=>[s.sessionId,s]));return [...sessionCache.values()].filter(s=>s.status!=='reset');}
async function appendEvent(event){
 const enriched={...event,ts:now()};
 const write=async()=>{await fsp.appendFile(LOG_FILE,JSON.stringify(enriched)+'\n','utf8');if(eventCache)eventCache.push(enriched);if(sessionCache)applySessionEvent(sessionCache,enriched)};
 eventWriteChain=eventWriteChain.catch(()=>{}).then(write);
 return eventWriteChain;
}
async function readRoster(){try{const j=JSON.parse(await fsp.readFile(ROSTER_FILE,'utf8'));return {updatedAt:j.updatedAt||null,students:Array.isArray(j.students)?j.students:[]};}catch{return {updatedAt:null,students:[]};}}
async function writeRoster(students){const data={updatedAt:now(),students};await fsp.writeFile(ROSTER_FILE,JSON.stringify(data,null,2),'utf8');return data;}
async function readRuntime(){try{return {...{serverOpen:false,timerPaused:true,pauseStartedAt:null,totalPausedMs:0,updatedAt:null},...JSON.parse(await fsp.readFile(RUNTIME_FILE,'utf8'))}}catch{return {serverOpen:false,timerPaused:true,pauseStartedAt:null,totalPausedMs:0,updatedAt:null}}}
async function writeRuntime(rt){rt.updatedAt=now();await fsp.writeFile(RUNTIME_FILE,JSON.stringify(rt,null,2),'utf8');return rt;}
function emptyClassRuntime(){return {version:1,updatedAt:null,classes:{},sessions:{}};}
function classRecord(classNo,mode='regular'){return {classNo:Number(classNo),mode:mode==='makeup'?'makeup':'regular',sessionId:newId(),phase:'ready',openedAt:now(),runStartedAt:null,elapsedSeconds:0,checkpointSeconds:TOTAL_SECONDS,updatedAt:now()};}
async function readClassRuntime(){try{const j=JSON.parse(await fsp.readFile(CLASS_RUNTIME_FILE,'utf8'));return {version:1,updatedAt:j.updatedAt||null,classes:j.classes&&typeof j.classes==='object'?j.classes:{},sessions:j.sessions&&typeof j.sessions==='object'?j.sessions:{}};}catch{return emptyClassRuntime();}}
async function writeClassRuntime(cr){cr.version=1;cr.updatedAt=now();await fsp.writeFile(CLASS_RUNTIME_FILE,JSON.stringify(cr,null,2),'utf8');return cr;}
function classElapsedSeconds(rec,at=Date.now()){let elapsed=Math.max(0,Math.floor(Number(rec?.elapsedSeconds||0)));if(rec?.phase==='running'&&rec.runStartedAt){const started=Date.parse(rec.runStartedAt);if(Number.isFinite(started))elapsed+=Math.max(0,Math.floor((at-started)/1000));}return Math.min(TOTAL_SECONDS,elapsed);}
async function settleClassRecord(cr,rec){if(!rec||rec.phase!=='running')return rec;const elapsed=classElapsedSeconds(rec),checkpoint=TOTAL_SECONDS;if(elapsed<checkpoint)return rec;rec.elapsedSeconds=checkpoint;rec.runStartedAt=null;rec.phase='finished';rec.updatedAt=now();cr.sessions[rec.sessionId]=rec;cr.classes[String(rec.classNo)]=rec.sessionId;await writeClassRuntime(cr);return rec;}
async function currentClassRecord(classNo){const cr=await readClassRuntime(),id=cr.classes[String(Number(classNo))],rec=id?cr.sessions[id]:null;if(rec)await settleClassRecord(cr,rec);return {cr,rec:id?cr.sessions[id]:null};}
async function classRuntimeView(){const cr=await readClassRuntime(),rows=[];for(let classNo=1;classNo<=3;classNo++){const id=cr.classes[String(classNo)],rec=id?cr.sessions[id]:null;if(rec)await settleClassRecord(cr,rec);const live=id?cr.sessions[id]:null,elapsed=live?classElapsedSeconds(live):0;rows.push(live?{...live,elapsedSeconds:elapsed,remainingSeconds:Math.max(0,TOTAL_SECONDS-elapsed)}:{classNo,mode:'regular',sessionId:null,phase:'closed',openedAt:null,runStartedAt:null,elapsedSeconds:0,remainingSeconds:TOTAL_SECONDS,checkpointSeconds:TOTAL_SECONDS,updatedAt:null});}return {version:1,classes:rows};}
let presenceCache=null,presenceLastWrite=0;
function readPresence(){if(presenceCache)return presenceCache;try{presenceCache=JSON.parse(fs.readFileSync(PRESENCE_FILE,'utf8'));}catch{presenceCache={};}return presenceCache;}
function touchPresence(s,login=false){if(!s?.studentId)return;const p=readPresence(),ts=now(),old=p[String(s.studentId)]||{};p[String(s.studentId)]={...old,studentId:String(s.studentId),className:s.className||deriveClass(s.studentId),lastSeen:ts,firstSeen:old.firstSeen||ts,loginCount:Number(old.loginCount||0)+(login?1:0)};if(login||Date.now()-presenceLastWrite>5000){presenceLastWrite=Date.now();fsp.writeFile(PRESENCE_FILE,JSON.stringify(p,null,2),'utf8').catch(()=>{});}}
function settingsCipherKey(){return crypto.createHash('sha256').update(`${PROJECT_ID}|${TEACHER_PASSWORD}|openai-key`).digest();}
function encryptSecret(value){const text=String(value||'');if(!text)return null;const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',settingsCipherKey(),iv);const enc=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:enc.toString('base64')};}
function decryptSecret(payload){if(!payload||!payload.iv||!payload.tag||!payload.data)return '';try{const decipher=crypto.createDecipheriv('aes-256-gcm',settingsCipherKey(),Buffer.from(payload.iv,'base64'));decipher.setAuthTag(Buffer.from(payload.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(payload.data,'base64')),decipher.final()]).toString('utf8');}catch{return '';}}
async function readSettings(){try{const j=JSON.parse(await fsp.readFile(SETTINGS_FILE,'utf8'));const legacy=String(j.openaiApiKey||'');const decrypted=decryptSecret(j.openaiApiKeyEnc);return {openaiApiKey:decrypted||legacy,updatedAt:j.updatedAt||null};}catch{return {openaiApiKey:'',updatedAt:null};}}
async function writeSettings(next){const key=String(next.openaiApiKey||'');const data={openaiApiKeyEnc:encryptSecret(key),updatedAt:now()};await fsp.writeFile(SETTINGS_FILE,JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});try{await fsp.chmod(SETTINGS_FILE,0o600)}catch{}return data;}
async function openAIConfig(){const s=await readSettings();const saved=String(s.openaiApiKey||'').trim();const env=String(ENV_OPENAI_API_KEY||'').trim();const apiKey=saved||env;return {apiKey,configured:!!apiKey,source:saved?'teacher-settings':env?'environment':'none',updatedAt:s.updatedAt||null,model:OPENAI_MODEL};}
function validOpenAIKey(value){const s=String(value||'').trim();return s.length>=20&&!/\s/.test(s)&&s.startsWith('sk-');}

function effectivePausedMs(rt,at=Date.now()){let v=Number(rt.totalPausedMs||0);if(rt.timerPaused&&rt.pauseStartedAt){const p=Date.parse(rt.pauseStartedAt);if(Number.isFinite(p))v+=Math.max(0,at-p);}return v;}
function deriveClass(studentId){const s=String(studentId||'');if(/^\d{5}$/.test(s))return `${Number(s.slice(1,3))}반`;return ''}
function deriveNumber(studentId){const s=String(studentId||'');if(/^\d{5}$/.test(s))return Number(s.slice(-2));return null}
function fallbackCountry(studentId,className=''){const n=deriveNumber(studentId);const cls=className||deriveClass(studentId);if(Number.isFinite(n)&&n>0){const offset=hashInt(cls||String(studentId).slice(0,-2))%4;return countries[(n-1+offset)%4];}return countries[hashInt(studentId)%4];}
function assignBalancedCountries(entries){const groups=new Map();for(const e of entries){const cls=e.className||deriveClass(e.studentId)||'미분류';if(!groups.has(cls))groups.set(cls,[]);groups.get(cls).push(e);}const out=[];for(const [cls,list] of groups){list.sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId),'ko'));const offset=hashInt(cls)%4;list.forEach((e,i)=>out.push({...e,className:e.className||deriveClass(e.studentId),country:countries[(i+offset)%4]}));}return out.sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId),'ko'))}

function applySessionEvent(sessions,e){
  if(!e.sessionId)return;
  if(e.type==='start')sessions.set(e.sessionId,{sessionId:e.sessionId,studentId:e.studentId,name:e.name,className:e.className||deriveClass(e.studentId),country:e.country,pauseBaseMs:Number(e.pauseBaseMs||0),timerMode:e.timerMode||'legacy',classNo:Number(e.classNo||0),classSessionId:e.classSessionId||null,startedAt:e.ts,updatedAt:e.ts,submittedAt:null,status:'in_progress',progress:0,data:{},score:null,scoreHistory:[],teacherNote:'',aiGrade:null,synthetic:!!e.synthetic,timerExempt:!!e.timerExempt,reopenedAt:null,reopenCount:0,reopenHistory:[]});
  const s=sessions.get(e.sessionId);if(!s)return;
  if(e.type==='save'){s.data={...s.data,...(e.data||{})};s.progress=Math.max(s.progress||0,Number(e.progress||0));s.updatedAt=e.ts;}
  if(e.type==='submit'){s.data={...s.data,...(e.data||{})};s.progress=100;s.status='submitted';s.submittedAt=e.ts;s.updatedAt=e.ts;s.timerExempt=false;}
  if(e.type==='score'){s.score=e.score;s.teacherNote=e.teacherNote||'';s.scoreHistory.push({at:e.ts,total:Number(e.score?.total||0),score:e.score,teacherNote:e.teacherNote||''});s.updatedAt=e.ts;}
  if(e.type==='ai_grade'){s.aiGrade=e.aiGrade;s.updatedAt=e.ts;}
  if(e.type==='reopen'){s.status='review_reopened';s.reopenedAt=e.ts;s.reopenCount+=1;s.reopenHistory.push({at:e.ts});s.updatedAt=e.ts;s.timerExempt=true;s.data={...s.data,reviewReady:true};}
  if(e.type==='reset'){s.status='reset';s.updatedAt=e.ts;}
}
function reconstruct(events,includeReset=false){
 const sessions=new Map();
 for(const e of events){
  applySessionEvent(sessions,e);
 }
 return [...sessions.values()].filter(s=>includeReset||s.status!=='reset');
}
async function latestByStudent(studentId){return (await readSessions()).filter(s=>s.studentId===studentId).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt))[0]||null;}
async function classSessionWriteState(s){if(!s||s.timerMode!=='class_session_v1'||s.timerExempt)return {ok:true};const cr=await readClassRuntime(),rec=cr.sessions[String(s.classSessionId||'')];if(!rec)return {ok:false,error:'반별 수행 세션을 찾을 수 없습니다.'};await settleClassRecord(cr,rec);const phase=cr.sessions[rec.sessionId].phase;return {ok:phase==='running',phase,error:phase==='ready'?'선생님이 수행 시작을 누르면 답안을 작성할 수 있습니다.':phase==='finished'?'수행시간이 종료되었습니다. 현재 답안이 자동 제출됩니다.':'현재 수행이 일시정지되어 있습니다.'};}
async function timerForSession(s){const rt=await readRuntime();if(s.timerExempt)return {remainingSeconds:null,paused:true,exempt:true,totalSeconds:TOTAL_SECONDS,serverOpen:!!rt.serverOpen};if(s.timerMode==='class_session_v1'){const cr=await readClassRuntime(),rec=cr.sessions[String(s.classSessionId||'')];if(!rec)return {remainingSeconds:TOTAL_SECONDS,paused:true,exempt:false,totalSeconds:TOTAL_SECONDS,serverOpen:!!rt.serverOpen,phase:'closed',timerMode:'class_session_v1'};const live=await settleClassRecord(cr,rec),elapsed=classElapsedSeconds(live);return {remainingSeconds:Math.max(0,TOTAL_SECONDS-elapsed),paused:live.phase!=='running',exempt:false,totalSeconds:TOTAL_SECONDS,serverOpen:!!rt.serverOpen,phase:live.phase,timerMode:'class_session_v1',classNo:live.classNo,classSessionId:live.sessionId,elapsedSeconds:elapsed,checkpointSeconds:Number(live.checkpointSeconds||2700),mode:live.mode};}const start=Date.parse(s.startedAt);if(!Number.isFinite(start))return {remainingSeconds:TOTAL_SECONDS,paused:rt.timerPaused,exempt:false,totalSeconds:TOTAL_SECONDS,serverOpen:!!rt.serverOpen};const pausedSinceStart=Math.max(0,effectivePausedMs(rt)-Number(s.pauseBaseMs||0));const activeElapsed=Math.max(0,Date.now()-start-pausedSinceStart);return {remainingSeconds:Math.max(0,TOTAL_SECONDS-Math.floor(activeElapsed/1000)),paused:!!rt.timerPaused,exempt:false,totalSeconds:TOTAL_SECONDS,serverOpen:!!rt.serverOpen};}
function sendJson(res,status,obj,extra={}){const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store',...extra});res.end(body);}
function sendText(res,status,body,type='text/plain; charset=utf-8',extra={}){res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store',...extra});res.end(body);}
async function bodyJson(req){return await new Promise((resolve,reject)=>{let data='';req.on('data',c=>{data+=c;if(data.length>3_000_000){reject(new Error('too large'));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{})}catch(e){reject(e)}});req.on('error',reject)});}
function validTeacherKey(value){const key=String(value||'');return key===TEACHER_PASSWORD||key===TEACHER_STUDENT_ID;}
function teacherSessionToken(){return crypto.createHmac('sha256',TEACHER_PASSWORD).update('climate-teacher-session-v1').digest('hex')}
function cookieValue(req,name){const raw=String(req.headers.cookie||'');for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return ''}
function validTeacherCookie(req){const supplied=cookieValue(req,TEACHER_COOKIE),expected=teacherSessionToken();if(!supplied||supplied.length!==expected.length)return false;try{return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))}catch{return false}}
function teacherCookie(req,clear=false){const secure=String(req.headers['x-forwarded-proto']||'').includes('https')||!String(req.headers.host||'').includes('localhost');return `${TEACHER_COOKIE}=${clear?'':teacherSessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:TEACHER_COOKIE_MAX_AGE}${secure?'; Secure':''}`}
function teacherOK(req,url){return validTeacherCookie(req)||validTeacherKey(req.headers['x-teacher-key']||url.searchParams.get('password'));}
function csvEscape(v){const s=v==null?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function koStatus(s){return s==='submitted'?'제출 완료':s==='review_reopened'?'수정 재개':'진행 중'}
function progressToStepServer(p){p=Number(p||0);if(p>=100)return 4;if(p>=75)return 3;if(p>=50)return 2;if(p>=25)return 1;return 0;}

function studentPayloadForAI(s){const d=s.data||{};return {country:countryLabels[s.country]||s.country,initialPriority:priorityLabels[d.priority1]||d.priority1||'',priorityReason:d.priorityReason||'',agreement:agreementLabels[d.agreement]||d.agreement||'',budgetAllocation:d.budget||{},policyReason:d.agreementReason||'',opposingCountry:countryLabels[d.opposingCountry]||d.opposingCountry||'',compromiseDimension:compromiseLabels[d.compromiseDimension]||d.compromiseDimension||'',compromise:d.compromise||'',reconsiderChoice:d.reconsiderChoice==='revise'?'일부 판단 수정':'처음 판단 유지',finalDeclaration:d.finalDeclaration||''};}
function aiPrompt(s){return `당신은 고등학교 기후위기 수행평가의 교사용 가채점 보조자입니다. 최종 점수는 교사가 결정합니다. 특정 선택을 정답으로 간주하지 말고 학생 답안에 있는 근거만 평가하세요. 각 영역은 25점, 총 100점입니다.\n1) 국가 이해: 배정 국가의 조건을 파악하고 처음 판단의 이유와 연결했는가.\n2) 정책 선택: 협약과 예산 선택이 국가 조건과 논리적으로 연결되는가.\n3) 절충안: 상대국도 받아들일 수 있도록 양측의 행동·지원·양보가 구체적인가.\n4) 성찰·최종 합의: 처음 판단과 협상 결과를 비교하고 실행 가능한 결론을 제시했는가.\n문장 표현력보다 판단과 근거를 우선하세요. 점수는 정수로 쓰고 근거문장은 답안에서 60자 이내로 영역당 최대 2개만 인용하세요. 반드시 JSON만 출력하세요.\n{"confidence":"high|medium|low","overall":"전체 판단 2~3문장","reviewFlags":["교사가 확인할 점"],"areas":{"countryUnderstanding":{"score":0,"reason":"","evidence":[]},"policyChoice":{"score":0,"reason":"","evidence":[]},"compromise":{"score":0,"reason":"","evidence":[]},"reflection":{"score":0,"reason":"","evidence":[]}}}\n학생 답안:\n${JSON.stringify(studentPayloadForAI(s),null,2)}`;}
function extractResponseText(j){if(typeof j.output_text==='string')return j.output_text;return (j.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text'||typeof x.text==='string').map(x=>x.text||'').join('');}
function validateAIGrade(raw){const areas={},src=raw?.areas||{};for(const [k,max] of Object.entries(scoreMax)){const a=src[k]||{},score=Math.max(0,Math.min(max,Math.round(Number(a.score)||0)));areas[k]={score,reason:String(a.reason||'').slice(0,700),evidence:(Array.isArray(a.evidence)?a.evidence:[]).map(x=>String(x).slice(0,60)).filter(Boolean).slice(0,2)};}const total=Object.values(areas).reduce((a,x)=>a+x.score,0);return {model:OPENAI_MODEL,createdAt:now(),total,confidence:['high','medium','low'].includes(raw?.confidence)?raw.confidence:'medium',overall:String(raw?.overall||'').slice(0,1200),reviewFlags:(Array.isArray(raw?.reviewFlags)?raw.reviewFlags:[]).map(x=>String(x).slice(0,300)).slice(0,8),areas};}
async function runAIGrade(s){const cfg=await openAIConfig();if(!cfg.apiKey)throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. 교사용 페이지의 AI 가채점 설정에서 API 키를 저장하세요.');const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.apiKey}`},body:JSON.stringify({model:OPENAI_MODEL,input:aiPrompt(s),max_output_tokens:2600})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j?.error?.message||`AI 요청 실패 (${r.status})`);let text=extractResponseText(j).trim().replace(/^```json\s*/,'').replace(/```$/,'').trim();let parsed;try{parsed=JSON.parse(text)}catch{const m=text.match(/\{[\s\S]*\}/);if(!m)throw new Error('AI 응답을 점수 형식으로 읽지 못했습니다.');parsed=JSON.parse(m[0]);}return validateAIGrade(parsed);}

async function serveStatic(req,res,url){let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';if(pathname==='/teacher')pathname='/teacher.html';if(pathname==='/operate'||pathname==='/classroom')pathname='/operate.html';const safe=path.normalize(pathname).replace(/^(\.\.[/\\])+/,'');const file=path.join(PUBLIC,safe);if(!file.startsWith(PUBLIC))return sendText(res,403,'Forbidden');try{const stat=await fsp.stat(file);if(!stat.isFile())throw new Error();const data=await fsp.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store'});res.end(data)}catch{sendText(res,404,'Not found')}}


function syntheticAnswer(student,index){
 const country=student.country||fallbackCountry(student.studentId,student.className),opponent={hanbit:'saebom',saebom:'hanbit',pureun:'taeyang',taeyang:'pureun'}[country],level=index%5===0?'basic':index%3===0?'strong':'standard';
 const profile={
  hanbit:{priority:'responsibility',agreement:'B',plan:'transition',condition:'과거 배출 책임과 친환경 기술 역량이 크지만 제조업 일자리도 지켜야 한다',policy:'차등책임안을 선택해 선진국이 더 많이 감축하고 기술·재정을 지원해야 한다',trade:'산업 전환 속도를 단계적으로 조정하고 노동자 재교육을 함께 지원한다'},
  saebom:{priority:'growth',agreement:'B',plan:'balanced',condition:'과거 배출 책임은 작지만 석탄 의존과 현재 배출이 빠르게 늘고 있다',policy:'차등책임안을 바탕으로 성장 기회를 보장받되 지원을 받아 석탄 사용을 줄여야 한다',trade:'선진국의 기술 지원을 조건으로 신규 석탄발전을 줄이고 재생에너지를 확대한다'},
  pureun:{priority:'damage',agreement:'A',plan:'damage',condition:'배출 책임은 매우 작지만 해수면 상승과 태풍 피해가 가장 크고 대응 재정이 부족하다',policy:'모든 국가의 빠른 감축과 피해국 기후재정 지원이 함께 필요하다',trade:'피해 복구 기금을 우선 확보하고 지원받은 재생에너지 설비의 운영 결과를 공개한다'},
  taeyang:{priority:'energy',agreement:'C',plan:'transition',condition:'석유·가스 수출이 재정과 일자리의 중심이지만 태양광 전환 잠재력도 크다',policy:'단계적 자율 감축과 산업 전환 지원을 결합해야 경제 충격을 줄일 수 있다',trade:'화석연료 감축 일정을 제시하고 국제사회는 태양광 산업과 노동자 전환을 지원한다'}
 }[country];
 const short=level==='basic';
 const sampleBudgets={hanbit:{renewable:20,disaster:10,tech:30,forest:10,transition:30},saebom:{renewable:30,disaster:10,tech:20,forest:10,transition:30},pureun:{renewable:20,disaster:40,tech:10,forest:20,transition:10},taeyang:{renewable:30,disaster:10,tech:20,forest:10,transition:30}};
 return{priority1:profile.priority,priority2:'',priorityReason:short?`${profile.condition}. 그래서 우리 국가에 직접 필요한 가치를 우선해야 한다.`:`${profile.condition}. 따라서 단기 비용만 볼 것이 아니라 책임과 실행 가능성을 함께 고려해 이 가치를 우선해야 한다.`,initialPosition:profile.condition,agreement:profile.agreement,budgetPlan:'custom',budget:sampleBudgets[country],budgetTouched:true,preparationComplete:true,countryRevealDone:true,agreementReason:short?`${profile.policy}. 국가 상황에 맞기 때문이다.`:`${profile.policy}. 이 선택은 감축 부담과 경제·피해 조건을 함께 반영하며 예산도 가장 시급한 분야에 집중할 수 있다.`,budgetHighReason:profile.policy,opposingCountry:opponent,oppositionReason:'상대국은 배출 책임·경제 구조·피해 수준이 달라 같은 속도와 비용을 받아들이기 어렵다.',compromiseDimension:'speed',compromiseChoice:'conditional',compromise:short?`${profile.trade}. 서로 조금씩 양보하면 합의할 수 있다.`:`${profile.trade}. 우리 국가는 이행 일정과 점검 결과를 공개하고 상대국도 약속한 지원 또는 감축을 실행해 양측의 부담과 이익을 나눈다.`,reconsiderChoice:index%4===0?'revise':'keep',finalDeclaration:short?`우리 국가는 ${profile.policy}. 상대국과는 ${profile.trade}. 합의 이행 상황을 함께 확인하겠다.`:`협상 결과 우리 국가는 ${profile.policy}. 동시에 ${profile.trade}. 각 국가는 감축·지원 일정을 공개하고 국제기구가 이행을 점검하여 기후위기 대응과 경제적 부담을 함께 조정하겠다.`,assessmentVersion:'45min-v3.6.0',reviewReady:true,synthetic:true};
}
async function handle(req,res){
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 try{
  if(req.method==='GET'&&url.pathname==='/teacher')return serveStatic(req,res,new URL('/teacher-center.html',url));
  if(req.method==='GET'&&url.pathname==='/manage')return serveStatic(req,res,new URL('/teacher.html',url));
  if(req.method==='GET'&&url.pathname==='/classroom')return serveStatic(req,res,new URL('/classroom.html',url));
  if(req.method==='GET'&&url.pathname==='/'&&(url.searchParams.get('operate')==='1'||url.searchParams.get('mode')==='operate'||url.searchParams.get('classroom')==='1')){res.writeHead(302,{Location:'/operate','Cache-Control':'no-store'});return res.end()}
  if(req.method==='GET'&&url.pathname==='/'&&(url.searchParams.get('teacher')==='1'||url.searchParams.get('mode')==='teacher')){res.writeHead(302,{Location:'/teacher','Cache-Control':'no-store'});return res.end()}
  if(req.method==='GET'&&['/operate/','/operate.html','/classroom/','/classroom.html'].includes(url.pathname)){res.writeHead(302,{Location:'/operate','Cache-Control':'no-store'});return res.end()}
  if(req.method==='GET'&&['/teacher/','/teacher.html'].includes(url.pathname)){res.writeHead(302,{Location:'/teacher','Cache-Control':'no-store'});return res.end()}
  if(req.method==='GET'&&url.pathname==='/health')return sendJson(res,200,{ok:true,projectId:PROJECT_ID,name:PROJECT_NAME,version:APP_VERSION,storage:STORAGE_MODE,time:now()});
  if(req.method==='GET'&&url.pathname==='/api/project-info')return sendJson(res,200,{projectId:PROJECT_ID,name:PROJECT_NAME,version:APP_VERSION,type:'server',studentPath:'/',teacherPath:'/teacher',operatePath:'/operate',theme:'green',mobileOptimized:true,totalActiveMinutes:45,phaseGate:false,teacherPause:false,serverGate:true,rosterUpload:true,aiGrading:true,teacherApiKeyInput:true});
  if(req.method==='GET'&&url.pathname==='/api/teacher/auth')return teacherOK(req,url)?sendJson(res,200,{ok:true,authenticated:true}):sendJson(res,401,{ok:false,authenticated:false});
  if(req.method==='POST'&&url.pathname==='/api/teacher/auth'){const b=await bodyJson(req);if(!validTeacherKey(b.password))return sendJson(res,401,{ok:false,error:'교사용 비밀번호가 올바르지 않습니다.'});return sendJson(res,200,{ok:true,authenticated:true},{'Set-Cookie':teacherCookie(req)});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/logout')return sendJson(res,200,{ok:true},{'Set-Cookie':teacherCookie(req,true)});
  if(req.method==='GET'&&url.pathname==='/api/server-status'){const rt=await readRuntime();return sendJson(res,200,{open:!!rt.serverOpen,paused:!!rt.timerPaused,updatedAt:rt.updatedAt});}
  if(req.method==='GET'&&url.pathname==='/api/classroom/public'){const classNo=Math.max(1,Math.min(3,Number(url.searchParams.get('classNo')||1))),className=`${classNo}반`,roster=await readRoster(),sessions=(await readSessions()),presence=readPresence(),targets=roster.students.length?roster.students.filter(x=>(x.className||deriveClass(x.studentId))===className):sessions.filter(s=>(s.className||deriveClass(s.studentId))===className),ids=new Set(targets.map(x=>String(x.studentId))),classSessions=sessions.filter(s=>ids.has(String(s.studentId))||(s.className||deriveClass(s.studentId))===className),uniqueEntered=new Set(classSessions.map(s=>String(s.studentId))),submitted=new Set(classSessions.filter(s=>s.status==='submitted').map(s=>String(s.studentId))),online=[...ids].filter(id=>presence[id]?.lastSeen&&Date.now()-Date.parse(presence[id].lastSeen)<=25000).length,cr=await classRuntimeView(),runtime=cr.classes.find(x=>x.classNo===classNo);return sendJson(res,200,{classNo,runtime,summary:{total:ids.size||uniqueEntered.size,online,entered:uniqueEntered.size,never:Math.max(0,(ids.size||uniqueEntered.size)-uniqueEntered.size),submitted:submitted.size},stageCounts:Array.from({length:5},(_,step)=>classSessions.filter(s=>s.status!=='submitted'&&progressToStepServer(s.progress)===step).length)});}

  if(req.method==='POST'&&url.pathname==='/api/start'){
   const b=await bodyJson(req),studentId=String(b.studentId||'').trim(),name=String(b.name||'').trim();
   if(!/^\d{4,6}$/.test(studentId))return sendJson(res,400,{error:'학번은 숫자 4~6자리로 입력하세요.'});
   if(studentId===TEACHER_STUDENT_ID){const existing=await latestByStudent(studentId);if(existing&&['in_progress','review_reopened'].includes(existing.status))return sendJson(res,200,{resumed:true,session:existing,serverNow:now(),timer:await timerForSession(existing)});const sessionId=newId(),s={sessionId,studentId,name:'교사 시험',className:'교사용',country:'hanbit',pauseBaseMs:0,data:{},progress:0,status:'in_progress',startedAt:now(),timerExempt:true};await appendEvent({type:'start',sessionId,studentId,name:s.name,className:s.className,country:s.country,pauseBaseMs:0,timerExempt:true});return sendJson(res,200,{resumed:false,session:s,serverNow:now(),timer:await timerForSession(s)});}
   const gate=await readRuntime();if(!gate.serverOpen)return sendJson(res,423,{error:'현재 수행평가 서버가 닫혀 있습니다. 선생님이 서버를 연 뒤 다시 로그인하세요.',code:'SERVER_CLOSED'});
   if(name.length<2||name.length>20)return sendJson(res,400,{error:'이름을 정확히 입력하세요.'});
   const roster=await readRoster(), rosterEntry=roster.students.find(x=>String(x.studentId)===studentId);
   if(roster.students.length&&!rosterEntry)return sendJson(res,400,{error:'등록된 학생 명단에서 학번을 찾을 수 없습니다. 학번을 확인하거나 교사에게 문의하세요.'});
   if(rosterEntry&&String(rosterEntry.name).trim()!==name)return sendJson(res,400,{error:'등록된 학생 명단의 이름과 일치하지 않습니다. 이름을 정확히 입력하세요.'});
   const existing=await latestByStudent(studentId);
   if(existing&&existing.status==='submitted')return sendJson(res,409,{error:'이미 제출이 완료된 학번입니다. 수정이 필요하면 교사에게 문의하세요.'});
   if(existing&&['in_progress','review_reopened'].includes(existing.status)&&existing.name===name){touchPresence(existing,true);return sendJson(res,200,{resumed:true,session:existing,serverNow:now(),timer:await timerForSession(existing)});}
   if(existing&&['in_progress','review_reopened'].includes(existing.status)&&existing.name!==name)return sendJson(res,409,{error:'같은 학번으로 진행 중인 수행평가가 있습니다. 교사에게 문의하세요.'});
   const rt=await readRuntime(),className=rosterEntry?.className||deriveClass(studentId),classNo=Number(String(className).replace(/\D/g,''));if(classNo<1||classNo>3)return sendJson(res,409,{error:'학생의 반 정보를 확인할 수 없습니다. 교사에게 문의하세요.'});const {rec}=await currentClassRecord(classNo);if(!rec||['closed','finished'].includes(rec.phase))return sendJson(res,423,{error:'우리 반 입장이 아직 열리지 않았습니다. 선생님 안내를 기다려 주세요.',code:'CLASS_ADMISSION_CLOSED'});const country=rosterEntry?.country||fallbackCountry(studentId,className),pauseBaseMs=effectivePausedMs(rt),sessionId=newId();
   await appendEvent({type:'start',sessionId,studentId,name,className,country,pauseBaseMs,timerMode:'class_session_v1',classNo,classSessionId:rec.sessionId});
   const s={sessionId,studentId,name,className,country,pauseBaseMs,timerMode:'class_session_v1',classNo,classSessionId:rec.sessionId,data:{},progress:0,status:'in_progress',startedAt:now(),timerExempt:false};touchPresence(s,true);
   return sendJson(res,200,{resumed:false,session:s,serverNow:now(),timer:await timerForSession(s)});
  }
  if(req.method==='POST'&&url.pathname==='/api/preparation'){const b=await bodyJson(req);if(!b.sessionId)return sendJson(res,400,{error:'세션 정보가 없습니다.'});const s=(await readSessions()).find(x=>x.sessionId===b.sessionId);if(!s)return sendJson(res,404,{error:'세션을 찾을 수 없습니다.'});if(s.status==='submitted')return sendJson(res,409,{error:'이미 제출이 완료되었습니다.'});if(s.timerMode==='class_session_v1'){const cr=await readClassRuntime(),rec=cr.sessions[String(s.classSessionId||'')];if(!rec)return sendJson(res,409,{error:'반별 수행 준비 상태를 찾을 수 없습니다.'});await settleClassRecord(cr,rec);if(['closed','finished'].includes(rec.phase))return sendJson(res,423,{error:'현재는 국가 준비 상태를 저장할 수 없습니다.',phase:rec.phase});}await appendEvent({type:'save',sessionId:b.sessionId,data:{countryRevealDone:!!b.countryRevealDone,preparationComplete:!!b.preparationComplete,currentStep:0,assessmentVersion:'45min-v3.6.0'},progress:0});touchPresence(s);return sendJson(res,200,{ok:true,savedAt:now()});}
  if(req.method==='POST'&&url.pathname==='/api/save'){const b=await bodyJson(req);if(!b.sessionId)return sendJson(res,400,{error:'세션 정보가 없습니다.'});const s=(await readSessions()).find(x=>x.sessionId===b.sessionId);if(!s)return sendJson(res,404,{error:'세션을 찾을 수 없습니다.'});const gate=await classSessionWriteState(s);if(!gate.ok)return sendJson(res,423,{error:gate.error,phase:gate.phase});await appendEvent({type:'save',sessionId:b.sessionId,data:b.data||{},progress:Number(b.progress||0)});touchPresence(s);return sendJson(res,200,{ok:true,savedAt:now()});}
  if(req.method==='POST'&&url.pathname==='/api/submit'){const gate=await readRuntime();if(!gate.serverOpen)return sendJson(res,423,{error:'수행평가 서버가 닫혀 있습니다. 교사가 다시 연 뒤 제출하세요.',serverClosed:true});const b=await bodyJson(req);if(!b.sessionId)return sendJson(res,400,{error:'세션 정보가 없습니다.'});const s=(await readSessions()).find(x=>x.sessionId===b.sessionId);if(!s)return sendJson(res,404,{error:'세션을 찾을 수 없습니다.'});const writeState=await classSessionWriteState(s);if(!writeState.ok&&writeState.phase!=='finished')return sendJson(res,423,{error:writeState.error,phase:writeState.phase});await appendEvent({type:'submit',sessionId:b.sessionId,data:b.data||{}});touchPresence(s);return sendJson(res,200,{ok:true,submittedAt:now()});}
  if(req.method==='GET'&&url.pathname.startsWith('/api/session/')){const id=url.pathname.split('/').pop(),s=(await readSessions()).find(x=>x.sessionId===id);if(!s)return sendJson(res,404,{error:'세션을 찾을 수 없습니다.'});touchPresence(s);return sendJson(res,200,{session:s,serverNow:now(),timer:await timerForSession(s)});}
  if(req.method==='GET'&&url.pathname.startsWith('/api/timer/')){const id=url.pathname.split('/').pop(),s=(await readSessions()).find(x=>x.sessionId===id);if(!s)return sendJson(res,404,{error:'세션을 찾을 수 없습니다.'});touchPresence(s);return sendJson(res,200,await timerForSession(s));}

  if(url.pathname.startsWith('/api/teacher/')&&!teacherOK(req,url))return sendJson(res,401,{error:'교사용 비밀번호가 올바르지 않습니다.'});
  if(req.method==='GET'&&url.pathname==='/api/teacher/submissions'){const roster=await readRoster(),rt=await readRuntime(),cfg=await openAIConfig(),sessions=(await readSessions()).sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId),'ko')),presence=readPresence(),classRuntime=await classRuntimeView(),known=new Map();for(const x of roster.students)known.set(String(x.studentId),{studentId:String(x.studentId),name:x.name,className:x.className||deriveClass(x.studentId)});for(const s of sessions)if(!known.has(String(s.studentId)))known.set(String(s.studentId),{studentId:String(s.studentId),name:s.name,className:s.className||deriveClass(s.studentId)});const presenceRows=[...known.values()].map(x=>{const p=presence[x.studentId],last=p?.lastSeen||null,online=!!last&&Date.now()-Date.parse(last)<=25000,studentSessions=sessions.filter(s=>String(s.studentId)===x.studentId);return {...x,online,everEntered:!!(p||studentSessions.length),lastSeen:last,loginCount:Number(p?.loginCount||0),submitted:studentSessions.some(s=>s.status==='submitted')};});return sendJson(res,200,{sessions,roster,server:{open:!!rt.serverOpen,updatedAt:rt.updatedAt},timer:{paused:rt.timerPaused,pauseStartedAt:rt.pauseStartedAt},classRuntime,presence:presenceRows,ai:{configured:cfg.configured,model:cfg.model,source:cfg.source,updatedAt:cfg.updatedAt}});}
  if(req.method==='GET'&&url.pathname==='/api/teacher/ai-settings'){const cfg=await openAIConfig();return sendJson(res,200,{configured:cfg.configured,source:cfg.source,updatedAt:cfg.updatedAt,model:cfg.model});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/ai-settings'){const b=await bodyJson(req),apiKey=String(b.apiKey||'').trim();if(!validOpenAIKey(apiKey))return sendJson(res,400,{error:'API 키 형식을 확인하세요. 공백 없이 sk- 로 시작하는 OpenAI API 키를 입력하세요.'});await writeSettings({openaiApiKey:apiKey});return sendJson(res,200,{ok:true,configured:true,source:'teacher-settings',model:OPENAI_MODEL});}
  if(req.method==='DELETE'&&url.pathname==='/api/teacher/ai-settings'){await writeSettings({openaiApiKey:''});const cfg=await openAIConfig();return sendJson(res,200,{ok:true,configured:cfg.configured,source:cfg.source,model:cfg.model});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/ai-settings/test'){const cfg=await openAIConfig();if(!cfg.apiKey)return sendJson(res,400,{error:'저장된 API 키가 없습니다.'});try{const rr=await fetch('https://api.openai.com/v1/models',{headers:{'Authorization':`Bearer ${cfg.apiKey}`}});const jj=await rr.json().catch(()=>({}));if(!rr.ok)return sendJson(res,400,{error:jj?.error?.message||`OpenAI 연결 확인 실패 (${rr.status})`});return sendJson(res,200,{ok:true,message:'OpenAI API 연결이 정상입니다.'});}catch(e){return sendJson(res,503,{error:'OpenAI API에 연결하지 못했습니다. 네트워크 상태를 확인하세요.'});}}
  if(req.method==='GET'&&url.pathname==='/api/teacher/server'){const rt=await readRuntime();return sendJson(res,200,{open:!!rt.serverOpen,paused:!!rt.timerPaused,updatedAt:rt.updatedAt});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/server'){
   const b=await bodyJson(req),action=String(b.action||'');let rt=await readRuntime();
   if(action==='open_with_admission'){
    const classNos=[...new Set((Array.isArray(b.classNos)?b.classNos:[b.classNo]).map(Number).filter(n=>n>=1&&n<=3))];
    if(!classNos.length)return sendJson(res,400,{error:'서버와 입장을 열 반을 선택하세요.'});
    const mode=b.mode==='makeup'?'makeup':'regular',cr=await readClassRuntime();
    for(const classNo of classNos){const id=cr.classes[String(classNo)],rec=id?cr.sessions[id]:null;if(rec&&rec.mode!==mode&&!['closed','finished'].includes(rec.phase))return sendJson(res,409,{error:`${classNo}반 ${rec.mode==='makeup'?'결석·보충':'정규 수행'} 세션을 먼저 종료해 주세요.`});}
    if(!rt.serverOpen){if(rt.timerPaused){const p=Date.parse(rt.pauseStartedAt||'');if(Number.isFinite(p))rt.totalPausedMs=Number(rt.totalPausedMs||0)+Math.max(0,Date.now()-p);rt.timerPaused=false;rt.pauseStartedAt=null;}rt.serverOpen=true;await writeRuntime(rt);}
    for(const classNo of classNos){const id=cr.classes[String(classNo)],existing=id?cr.sessions[id]:null;if(!existing||['closed','finished'].includes(existing.phase)||existing.mode!==mode){const rec=classRecord(classNo,mode);cr.sessions[rec.sessionId]=rec;cr.classes[String(classNo)]=rec.sessionId;}}
    await writeClassRuntime(cr);return sendJson(res,200,{ok:true,open:true,paused:false,updatedAt:rt.updatedAt,classRuntime:await classRuntimeView()});
   }
   if(action==='close'&&rt.serverOpen){if(!rt.timerPaused){rt.timerPaused=true;rt.pauseStartedAt=now();}rt.serverOpen=false;await writeRuntime(rt);const cr=await readClassRuntime();let changed=false;for(const id of Object.values(cr.classes)){const rec=cr.sessions[id];if(rec?.phase==='running'){rec.elapsedSeconds=classElapsedSeconds(rec);rec.runStartedAt=null;rec.phase='paused';rec.updatedAt=now();changed=true;}}if(changed)await writeClassRuntime(cr);}
   else if(action==='open'&&!rt.serverOpen){if(rt.timerPaused){const p=Date.parse(rt.pauseStartedAt||'');if(Number.isFinite(p))rt.totalPausedMs=Number(rt.totalPausedMs||0)+Math.max(0,Date.now()-p);rt.timerPaused=false;rt.pauseStartedAt=null;}rt.serverOpen=true;await writeRuntime(rt);}
   return sendJson(res,200,{ok:true,open:!!rt.serverOpen,paused:!!rt.timerPaused,updatedAt:rt.updatedAt});
  }
  if(req.method==='GET'&&url.pathname==='/api/teacher/class-runtime')return sendJson(res,200,await classRuntimeView());
  if(req.method==='POST'&&url.pathname==='/api/teacher/class-runtime'){
   const b=await bodyJson(req),classNo=Number(b.classNo||0),action=String(b.action||''),mode=b.mode==='makeup'?'makeup':'regular';if(classNo<1||classNo>7)return sendJson(res,400,{error:'반은 1~7 중에서 선택하세요.'});const rt=await readRuntime();if(action==='open_admission'&&!rt.serverOpen)return sendJson(res,409,{error:'먼저 전체 학생 서버를 열어 주세요.'});let {cr,rec}=await currentClassRecord(classNo);
   if(action==='open_admission'){if(rec&&rec.mode!==mode&&!['closed','finished'].includes(rec.phase))return sendJson(res,409,{error:`${classNo}반 ${rec.mode==='makeup'?'결석·보충':'정규 수행'} 세션을 먼저 종료해 주세요.`});if(!rec||['closed','finished'].includes(rec.phase)||rec.mode!==mode){rec=classRecord(classNo,mode);cr.sessions[rec.sessionId]=rec;cr.classes[String(classNo)]=rec.sessionId;await writeClassRuntime(cr);}return sendJson(res,200,{ok:true,classRuntime:await classRuntimeView()});}
   if(!rec)return sendJson(res,409,{error:'먼저 선택 반의 수행 입장을 열어 주세요.'});
   if(action==='start'||action==='resume'){if(!rt.serverOpen)return sendJson(res,409,{error:'전체 학생 서버가 닫혀 있습니다.'});if(rec.phase==='finished')return sendJson(res,409,{error:'이미 45분이 종료된 세션입니다.'});rec.checkpointSeconds=TOTAL_SECONDS;rec.phase='running';rec.runStartedAt=now();rec.updatedAt=now();await writeClassRuntime(cr);}
   else if(action==='pause'){if(rec.phase==='running'){rec.elapsedSeconds=classElapsedSeconds(rec);rec.runStartedAt=null;rec.phase='paused';rec.updatedAt=now();await writeClassRuntime(cr);}}
   else if(action==='finish'){rec.elapsedSeconds=classElapsedSeconds(rec);rec.runStartedAt=null;rec.phase='finished';rec.updatedAt=now();await writeClassRuntime(cr);}
   else return sendJson(res,400,{error:'지원하지 않는 반별 수행 동작입니다.'});
   return sendJson(res,200,{ok:true,classRuntime:await classRuntimeView()});
  }
  // 이전 버전 UI와의 호환: 일시정지=서버 닫기, 재개=서버 열기
  if(req.method==='GET'&&url.pathname==='/api/teacher/timer'){const rt=await readRuntime();return sendJson(res,200,{paused:rt.timerPaused,pauseStartedAt:rt.pauseStartedAt,updatedAt:rt.updatedAt,serverOpen:!!rt.serverOpen});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/timer'){const b=await bodyJson(req),action=String(b.action||'');req.url='/api/teacher/server';let rt=await readRuntime();const mapped=action==='pause'?'close':action==='resume'?'open':'';if(mapped==='close'&&rt.serverOpen){if(!rt.timerPaused){rt.timerPaused=true;rt.pauseStartedAt=now();}rt.serverOpen=false;await writeRuntime(rt);}else if(mapped==='open'&&!rt.serverOpen){if(rt.timerPaused){const p=Date.parse(rt.pauseStartedAt||'');if(Number.isFinite(p))rt.totalPausedMs=Number(rt.totalPausedMs||0)+Math.max(0,Date.now()-p);rt.timerPaused=false;rt.pauseStartedAt=null;}rt.serverOpen=true;await writeRuntime(rt);}return sendJson(res,200,{ok:true,paused:rt.timerPaused,serverOpen:!!rt.serverOpen});}
  if(req.method==='GET'&&url.pathname==='/api/teacher/roster')return sendJson(res,200,await readRoster());
  if(req.method==='POST'&&url.pathname==='/api/teacher/roster'){
   const b=await bodyJson(req),parsed=parseRoster(typeof b.csvText==='string'?b.csvText:(b.students||[]));if(!parsed.students.length)return sendJson(res,400,{error:parsed.errors[0]?.message||'인식할 수 있는 학생이 없습니다.',report:parsed});const clean=toClimateRows(parsed.students);if(b.preview)return sendJson(res,200,{ok:true,preview:true,count:clean.length,students:clean,report:parsed});const roster=await writeRoster(assignBalancedCountries(clean));return sendJson(res,200,{ok:true,count:roster.students.length,roster,report:parsed});
  }
  if(req.method==='DELETE'&&url.pathname==='/api/teacher/roster'){await writeRoster([]);return sendJson(res,200,{ok:true});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/synthetic-submissions'){
   const roster=await readRoster();if(!roster.students.length)return sendJson(res,400,{error:'먼저 학생 명단을 등록하세요.'});const current=(await readSessions()),activeById=new Map(current.map(s=>[String(s.studentId),s]));let created=0,skipped=0;
   for(let i=0;i<roster.students.length;i++){const student=roster.students[i],existing=activeById.get(String(student.studentId));if(existing){skipped++;continue}const sessionId=newId(),data=syntheticAnswer(student,i);await appendEvent({type:'start',sessionId,studentId:String(student.studentId),name:student.name,className:student.className,country:student.country,timerExempt:true,synthetic:true});await appendEvent({type:'submit',sessionId,data});created++;}
   return sendJson(res,200,{ok:true,created,skipped,total:roster.students.length});
  }
  if(req.method==='DELETE'&&url.pathname==='/api/teacher/synthetic-submissions'){const synthetic=(await readSessions()).filter(s=>s.synthetic);for(const s of synthetic)await appendEvent({type:'reset',sessionId:s.sessionId});return sendJson(res,200,{ok:true,removed:synthetic.length});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/reopen'){const b=await bodyJson(req),s=(await readSessions()).find(x=>x.sessionId===b.sessionId);if(!s)return sendJson(res,404,{error:'학생 응시를 찾을 수 없습니다.'});if(s.status!=='submitted')return sendJson(res,400,{error:'제출 완료 학생만 최종 검토 상태로 다시 열 수 있습니다.'});await appendEvent({type:'reopen',sessionId:s.sessionId});return sendJson(res,200,{ok:true});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/reset'){const b=await bodyJson(req);if(!b.sessionId)return sendJson(res,400,{error:'세션 정보가 없습니다.'});await appendEvent({type:'reset',sessionId:b.sessionId});return sendJson(res,200,{ok:true});}
  if(req.method==='POST'&&url.pathname==='/api/teacher/ai-grade'){const b=await bodyJson(req),s=(await readSessions()).find(x=>x.sessionId===b.sessionId);if(!s)return sendJson(res,404,{error:'학생 응시를 찾을 수 없습니다.'});if(s.status!=='submitted')return sendJson(res,400,{error:'제출 완료 답안만 AI 가채점할 수 있습니다.'});try{const aiGrade=await runAIGrade(s);await appendEvent({type:'ai_grade',sessionId:s.sessionId,aiGrade});return sendJson(res,200,{ok:true,aiGrade});}catch(e){return sendJson(res,503,{error:e.message});}}
  if(req.method==='POST'&&url.pathname==='/api/teacher/score'){
   const b=await bodyJson(req),fields=Object.keys(scoreMax),clean={};if(!b.sessionId||!b.score)return sendJson(res,400,{error:'채점 정보가 부족합니다.'});
   for(const f of fields){const v=Number(b.score[f]),max=scoreMax[f];if(!Number.isInteger(v)||v<0||v>max)return sendJson(res,400,{error:`${scoreLabels[f]} 점수는 0~${max}점 사이의 정수로 입력하세요.`});clean[f]=v;}clean.total=fields.reduce((a,f)=>a+clean[f],0);await appendEvent({type:'score',sessionId:b.sessionId,score:clean,teacherNote:String(b.teacherNote||'').slice(0,1000)});return sendJson(res,200,{ok:true,score:clean});
  }
  if(req.method==='GET'&&url.pathname==='/api/teacher/export.csv'){
   const sessions=(await readSessions()).sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId),'ko')),roster=await readRoster();const sessionById=new Map(sessions.map(s=>[s.studentId,s]));const base=roster.students.length?roster.students: sessions.map(s=>({studentId:s.studentId,name:s.name,className:s.className,country:s.country}));
   const headers=['반','학번','이름','국가','상태','진행률','시작시각','제출시각','선택자료','자료근거','1순위','2순위','우선순위이유','예산_재생에너지지원','예산_기후재난지원','예산_친환경기술','예산_산림보호','예산_산업전환','예산_최우선이유','70억_우선감액','70억_감액이유','협상전_1차입장','선택협약','협약선택이유','불리한협약','불리한이유','반대국가','반대이유','절충조정요소','절충안','협력주체','협력주체역할배정','협력이유','재판단','최종합의문','AI가채점','AI신뢰도','자료분석점수','국가입장점수','예산TRADEOFF점수','국제관계점수','갈등조정점수','국제협력점수','재판단최종합의점수','최종총점','교사메모'];
   const rows=base.map(r=>{const s=sessionById.get(r.studentId),d=s?.data||{},b=d.budget||{},sc=s?.score||{};return[r.className||deriveClass(r.studentId),r.studentId,r.name,countryLabels[s?.country||r.country]||'',s?koStatus(s.status):'미시작',s?.progress??0,s?.startedAt||'',s?.submittedAt||'',(d.evidenceSources||[]).map(x=>evidenceLabels[x]||x).join(' | '),d.evidenceReason||'',priorityLabels[d.priority1]||'',priorityLabels[d.priority2]||'',d.priorityReason||'',b.renewable??'',b.disaster??'',b.tech??'',b.forest??'',b.transition??'',d.budgetHighReason||'',budgets[d.budgetCut]||'',d.budgetCutReason||'',d.initialPosition||'',agreementLabels[d.agreement]||'',d.agreementReason||'',agreementLabels[d.unfavorableAgreement]||'',d.unfavorableReason||'',countryLabels[d.opposingCountry]||'',d.oppositionReason||'',compromiseLabels[d.compromiseDimension]||d.compromiseDimension||'',d.compromise||'',(d.actors||[]).map(x=>actorLabels[x]||x).join(' | '),(d.actors||[]).map(k=>`${actorLabels[k]||k}: ${actorRoleLabels[d.actorAssignments?.[k]]||''}`).join(' | '),d.actorReason||'',d.reconsiderChoice==='revise'?'입장 수정':d.reconsiderChoice?'입장 유지':'',d.finalDeclaration||'',s?.aiGrade?.total??'',s?.aiGrade?.confidence==='high'?'높음':s?.aiGrade?.confidence==='medium'?'보통':s?.aiGrade?.confidence==='low'?'낮음':'',sc.dataAnalysis??'',sc.nationalDecision??'',sc.budgetTradeoff??'',sc.international??'',sc.compromise??'',sc.governance??'',sc.reflection??'',sc.total??'',s?.teacherNote||''];});
   const csv='\uFEFF'+[headers,...rows].map(r=>r.map(csvEscape).join(',')).join('\n');return sendText(res,200,csv,'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="climate_assessment_results_ko.csv"'});
  }
  return serveStatic(req,res,url);
 }catch(e){console.error(e);return sendJson(res,500,{error:'서버 처리 중 오류가 발생했습니다.'});}
}
function measuredHandle(req,res){
 const started=process.hrtime.bigint(),originalWriteHead=res.writeHead;let processingMs=0;
 res.writeHead=function(statusCode,headers){processingMs=Number(process.hrtime.bigint()-started)/1e6;const next={...(headers||{}),'Server-Timing':`app;dur=${processingMs.toFixed(1)}`,'X-Server-Processing-Ms':processingMs.toFixed(1)};return originalWriteHead.call(this,statusCode,next)};
 res.once('finish',()=>{if(String(req.url||'').startsWith('/api/')||req.url==='/health')console.log(JSON.stringify({type:'request',method:req.method,path:String(req.url||'').split('?')[0],status:res.statusCode,processingMs:Number(processingMs.toFixed(1)),at:now()}))});
 return handle(req,res);
}
readSessions().then(()=>http.createServer(measuredHandle).listen(PORT,()=>console.log(`${PROJECT_NAME} v${APP_VERSION} running on http://localhost:${PORT}`))).catch(e=>{console.error('세션 캐시 초기화 실패',e);process.exitCode=1});
