/**
 * PHASE 2-9 — isolated functional TEST screen, not approved HOME or release UI.
 * No external requests or legacy storage keys. DO NOT register in classroom yet.
 * This educator-only test page intentionally omits student-screen sync and PIN.
 */
import {TeacherEngineSession} from '../engine/session.js';
import {openEngineDatabase} from '../storage/indexeddb.js';
import {createQuestionEngine,publicQuestionView} from '../questions/engine.js';
import {listRecoveryCandidates} from '../questions/draw.js';
import {renderRegionResultMarkup} from '../world/result-card.js';

const $=id=>document.getElementById(id);
const el=(tag,txt=null)=>{const x=document.createElement(tag);if(txt!==null)x.textContent=String(txt);return x;};
const formValue=(id)=>$(id)?.value?.trim()??'';
const uniqueId=()=>`p29-ui-${Date.now()}-${Math.random().toString(36).slice(2)}-${++uniqueId.counter}`;
uniqueId.counter=0;
const TEST_DB_NAME='moonpath-v411-phase29-smoke-db-v1';

export function testDatabaseName(){return TEST_DB_NAME;}
export async function bootOneRegionSmoke({pack,world}={}){
 const qe=createQuestionEngine(pack);
 let teacher=null,flow='MAIN',database=null;
 let statusMessage='신규 시제품은 원본 게임이 아닌 별도 시험 데이터베이스를 사용합니다.';
 const storageKind=()=>globalThis.__MP_FAKE_BROWSER_DB__?'브라우저 메모리 모의 DB':'시험 전용 IndexedDB';
 const notify=(message,type='info')=>{
  statusMessage=message;const box=$('message');box.textContent=message;box.dataset.kind=type;
 };
 const withError=fn=>async()=>{try{await fn();draw()}catch(err){
   notify(`저장/명령 실패 — ${err.code??err.name??'ERROR'}: ${err.message}`,'error');
 }};
 const state=()=>teacher?.state?teacher.getState():null;
 const journeyMode=new URLSearchParams(location.search).get('journey')==='1';
 const selectedRegion=()=>journeyMode?(state()?.world.currentRegionId??'T1-R1'):'T1-R1';
 const regionInfo=id=>world.themes.flatMap(t=>t.regions.map(r=>({...r,themeName:t.name,themeId:t.id}))).find(r=>r.id===id);
 const active=()=>state()?.activeAttemptId?state().attempts[state().activeAttemptId]:null;
 const interception=()=>state()?.interception?.records.find(x=>x.id===state()?.interception?.activeId)??null;
 const recovery=()=>state()?.recovery?.pending.find(x=>x.id===state()?.recovery?.activeId)??null;
 const recoveryRun=()=>{const r=recovery();return r?.runs.find(x=>x.id===r.activeRunId)??null;};
 const mission=()=>flow==='INTERCEPTION'?interception():flow==='RECOVERY'?recoveryRun():active();
 const enabled=(id,yes)=>{if($(id))$(id).disabled=!yes;};
 const event=(action,fn)=>$(action).addEventListener('click',withError(fn));
 const makeLine=(name,value)=>{const row=el('div');row.className='status-row';row.append(el('span',name),el('strong',value));return row;};
 const attr=(tag,cls)=>{const x=el(tag);x.className=cls;return x;};
 const draw=()=>{
   const s=state();
   if(journeyMode)document.querySelector('h1').textContent=`《미지의 길》 ${regionInfo(selectedRegion()).name}`;
   $('region-title').textContent=journeyMode?`${regionInfo(selectedRegion()).name} · 지역 시험`:s?.world?.currentRegionId==='T1-R2'?'푸른 폭포길 · 회수 시험':'달빛 이끼길 · 통합 시험';
   $('slot-active').textContent=s?`슬롯 ${s.meta.slot} / revision ${s.meta.revision}`:'아직 시작하지 않음';
   $('status-data').replaceChildren();
   if(s){
    $('status-data').append(makeLine('모둠 수',s.teams.length),makeLine('별빛',s.rewards.starlight),
      makeLine('열쇠',s.rewards.keys),makeLine('보상 정산',s.rewards.settlementRequired?`필요 ${s.rewards.settlementDue}`:'정상'),
      makeLine('회수 대기',s.recovery.pending.filter(x=>x.status!=='INVALIDATED').length));
    const rid=selectedRegion(),info=regionInfo(rid),reg=s.world.regions[rid];
    const completed=reg.status==='COMPLETED';
    $('region-progress').textContent=`${info.name}: ${reg.status} / 기본 문제 목표 ${reg.baseQuota}건`;
    $('results').replaceChildren();
    if(completed){const page=el('div');page.innerHTML=renderRegionResultMarkup(teacher.getRegionResult(rid,{publicOnly:true}),{
      regionName:info.name,themeName:info.themeName});$('results').append(page);}
    const lessons=s.sessions.filter(x=>x.id===s.activeSessionId);
    $('lesson-phase').textContent=lessons.length?lessons[0].phase:'종료 또는 미시작';
    // Read-only public projection is never populated from the teacher state directly.
    $('public-json').textContent=JSON.stringify(teacher.getStudentProjection(),null,2);
    $('turn-status').textContent=`문항 ${s.questions.draws.length}개 / ${s.interception.records.length} 가로채기 / 회수 완료 ${s.recovery.resolved.length}`;
    enabled('region-enter',!!s&&!completed&&reg.status==='AVAILABLE');
    enabled('draw-question',reg.status==='IN_PROGRESS'&&(!active()||active().timer.phase==='RESOLVED')&&
       !interception()&&!recovery() && s.world.currentRegionId===rid&& s.sessions.some(x=>x.id===s.activeSessionId&&x.phase==='ACTIVE'));
    enabled('complete-region',reg.status==='IN_PROGRESS'&&!interception()&&!recovery());
    enabled('next-region',journeyMode?completed:completed && s.world.regions['T1-R2'].status==='AVAILABLE'&&s.world.currentRegionId==='T1-R1');
    const recoveryRegion=journeyMode?rid:'T1-R2';
    enabled('recovery-call',s.world.currentRegionId===recoveryRegion&&listRecoveryCandidates(s,{inRegionId:recoveryRegion}).length>0&&!recovery());
    enabled('intercept-open',!!active()?.judgement?.decision&&active().judgement.decision==='INCORRECT'&&
       !interception()&&!recovery()&&!s.interception.records.some(x=>x.sourceAttemptId===active().id));
    enabled('session-resume',lessons.length>0&&lessons[0].phase==='PAUSED');
   } else {
    ['region-enter','draw-question','complete-region','next-region','recovery-call','intercept-open','session-resume'].forEach(x=>enabled(x,false));
    $('region-progress').textContent='시험용 원정 미시작';$('lesson-phase').textContent='-';
    $('results').replaceChildren();$('public-json').textContent='{}';$('turn-status').textContent='';
   }
   if(s){const teams=$('team-select');const old=teams.value;teams.replaceChildren(...s.teams.map(t=>{
      const opt=el('option',t.name);opt.value=t.id;return opt;
    }));teams.value=s.teams.some(t=>t.id===old)?old:s.teams[0].id;}
   showQuestion();
 };
 const clearResponses=()=>{$('response-form').replaceChildren();};
 const addChoice=(container,text,key,kind)=>{
   const label=attr('label','question-choice');const input=el('input');input.type=kind;input.name='q-answer';input.value=String(key);
   label.append(input,el('span',text));container.append(label);return input;
 };
 const addSelect=(container,label,options)=>{
   const line=attr('label','question-select');line.append(el('span',label));const select=el('select');select.className='q-part';
   const blank=el('option','— 선택 —');blank.value='';select.append(blank);
   options.forEach(([k,v])=>{const item=el('option',v);item.value=k;select.append(item);});
   line.append(select);container.append(line);return select;
 };
 const currentQuestion=()=>{
  const s=state();if(!s)return null;
  const a=flow==='MAIN'?active():flow==='INTERCEPTION'?interception():recovery();
  if(!a)return null;
  const snap=flow==='MAIN'?a.questionSnapshot:flow==='INTERCEPTION'?a.questionSnapshot:
    s.attempts[a.sourceAttemptId]?.questionSnapshot;
  return snap?publicQuestionView(snap):null;
 };
 const showQuestion=()=>{
  const q=currentQuestion(),current=mission();
  const pane=$('question-pane');if(!q||!current||(flow==='MAIN'&&current.timer.phase==='RESOLVED')){pane.hidden=true;return;}
  pane.hidden=false;
  $('question-label').textContent=`${flow==='MAIN'?'기본문제':flow==='INTERCEPTION'?'가로채기':'오답 회수'} · ${q.questionId}`;
  $('question-stem').textContent=q.stem;
  $('question-stimulus').textContent=q.stimulus??'';
  const timer=current.timer;
  $('question-clock').textContent=`${timer.phase} / ${Math.ceil(timer.remainingMs/1000)}초 (저장 기준)`;
  const form=$('response-form');
  if(form.dataset.renderKey!==`${flow}:${current.id}`){
   clearResponses();form.dataset.renderKey=`${flow}:${current.id}`;
   if(q.type==='single_choice'||q.type==='true_false'){
    q.choices.forEach(c=>addChoice(form,`${c.key}. ${c.text}`,c.key,'radio'));
   }else if(q.type==='matching'){
    q.choices.left.forEach(v=>{const sel=addSelect(form,v.text,q.choices.right.map(r=>[r.key,r.text]));sel.dataset.key=v.key;});
   }else if(q.type==='categorization'){
    q.choices.items.forEach(v=>{const sel=addSelect(form,v.text,q.choices.categories.map(r=>[r.key,r.text]));sel.dataset.key=v.key;});
   }else if(q.type==='ordering'){
    q.choices.forEach(v=>{const sel=addSelect(form,v.text,q.choices.map((_,i)=>[String(i+1),`순서 ${i+1}`]));sel.dataset.key=v.key;});
   }else if(q.type==='short_text'||q.type==='manual'){
    const input=el('textarea');input.id='free-response';input.placeholder=q.type==='manual'?'학생의 근거와 설명':'학생의 단답';input.maxLength=3000;form.append(input);
   }
  }
  const answered=flow==='RECOVERY'?!!current.answer:!!current.answer;
  enabled('submit-answer',!answered&&timer.phase!=='RESOLVED');
  enabled('timer-start',timer.phase==='PREPARED');
  enabled('timer-pause',timer.phase==='RUNNING');
  enabled('timer-resume',timer.phase==='PAUSED'&&!answered);
  enabled('judge-right',!current.judgement&&timer.phase!=='PREPARED');
  enabled('judge-wrong',!current.judgement&&timer.phase!=='PREPARED');
  if(flow==='INTERCEPTION'||flow==='RECOVERY')$('intercept-open').disabled=true;
 };
 function readResponse(q){
  if(q.type==='single_choice'||q.type==='true_false'){
   const chosen=document.querySelector('#response-form input:checked');
   if(!chosen)throw new Error('선택한 답변이 없습니다.');
   return q.type==='true_false'?chosen.value==='O':chosen.value;
  }
  if(q.type==='short_text'||q.type==='manual'){
   const t=formValue('free-response');if(!t)throw new Error('학생 답안이 비어 있습니다.');return t;
  }
  const selects=[...document.querySelectorAll('#response-form select.q-part')];
  if(selects.some(sel=>!sel.value))throw new Error('선택하지 않은 항목이 있습니다.');
  if(q.type==='matching')return selects.map(x=>[x.dataset.key,x.value]);
  if(q.type==='categorization')return Object.fromEntries(selects.map(x=>[x.dataset.key,x.value]));
  if(q.type==='ordering')return selects.toSorted((a,b)=>Number(a.value)-Number(b.value)).map(x=>x.dataset.key);
  throw new Error('지원하지 않는 문항 형식입니다.');
 }
 const currentId=()=>flow==='MAIN'?active()?.id:flow==='INTERCEPTION'?interception()?.id:recovery()?.id;
 const dispatchTimer=async suffix=>{
  const prefix=flow==='MAIN'?'TIMER':flow==='INTERCEPTION'?'INTERCEPTION_TIMER':'RECOVERY_TIMER';
  if(flow==='MAIN')await teacher.dispatch(`${prefix}_${suffix}`);
  else if(flow==='INTERCEPTION')await teacher.controlInterception(`${prefix}_${suffix}`,{interceptionId:currentId()});
  else {const r=recovery();await teacher.controlRecovery(`${prefix}_${suffix}`,{recoveryId:r.id,runId:r.activeRunId});}
 };
 async function respond(){
  const q=currentQuestion(),answer=readResponse(q);
  if(flow==='MAIN')await teacher.submitAnswer({attemptId:active().id,response:answer});
  else if(flow==='INTERCEPTION')await teacher.controlInterception('INTERCEPTION_ANSWER_SUBMITTED',{
    interceptionId:interception().id,response:answer
  });else {const r=recovery();await teacher.controlRecovery('RECOVERY_ANSWER_SUBMITTED',{
    recoveryId:r.id,runId:r.activeRunId,response:answer
  });}
 }
 async function judge(decision){
  const reason=formValue('teacher-reason');
  if(reason.length<2)throw new Error('교사 확인 근거를 2자 이상 입력하세요.');
  const x=mission();const missingResponseConfirmed=!x.answer;
  if(flow==='MAIN')await teacher.judgeAnswer({
    attemptId:active().id,decision,teacherConfirmed:true,teacherReason:reason,missingResponseConfirmed
  });else if(flow==='INTERCEPTION')await teacher.controlInterception('INTERCEPTION_JUDGED',{
    interceptionId:interception().id,decision,teacherReason:reason,missingResponseConfirmed
  });else {const r=recovery();await teacher.controlRecovery('RECOVERY_JUDGED',{
    recoveryId:r.id,runId:r.activeRunId,decision,teacherReason:reason,missingResponseConfirmed
  });}
  flow='MAIN';$('response-form').dataset.renderKey='';notify(`교사 판정이 ${storageKind()} 저장 완료 후 반영됐습니다.`);
 }
 const initialize=async(mode)=>{
  const slot=Number($('slot-picker').value);
  if(teacher?.state)await teacher.close();
  teacher=new TeacherEngineSession(database,{newId:uniqueId,heartbeatMs:10000});
  if(mode==='CREATE'){
   await teacher.create({slot,world,teamCount:Number($('team-count').value)});
   await teacher.dispatch('SESSION_STARTED',{sessionId:uniqueId()});
   await teacher.enterRegion('T1-R1');notify('새 시험 원정 생성·달빛 이끼길 방문이 저장됐습니다.');
  }else{
   await teacher.open(slot);notify('저장된 시험 원정을 읽었습니다. 타이머/차시는 자동 재개되지 않습니다.');
  }
  flow='MAIN';$('response-form').dataset.renderKey='';draw();
 };
 // Isolate from both production game localStorage and development engine's normal DB.
 try{
  database=await openEngineDatabase({open(_name,version){return indexedDB.open(TEST_DB_NAME,version);}});
  $('engine-availability').textContent=globalThis.__MP_FAKE_BROWSER_DB__?'모의 DB UI 검증 중':'시험 DB 준비됨';
  notify(`${storageKind()} 준비 완료. 기존 moonpath-dev 저장 데이터는 접근하지 않습니다.`);
 }catch(err){
  notify(`브라우저 IndexedDB 사용 불가: ${err.message}. 시험 수행 불가.`, 'error');
  $('engine-availability').textContent='브라우저 저장 실패';
  return;
 }
 event('new-expedition',()=>initialize('CREATE'));
 event('continue-expedition',()=>initialize('CONTINUE'));
 event('region-enter',async()=>{await teacher.enterRegion(selectedRegion());notify('지역 진입 완료');});
 event('draw-question',async()=>{
  const result=await teacher.drawQuestion(qe,{regionId:selectedRegion(),teamId:$('team-select').value});
  flow='MAIN';$('response-form').dataset.renderKey='';notify(`문항 ${result.questionId}가 저장되었습니다. 교사가 타이머를 시작해야 합니다.`);
 });
 event('timer-start',async()=>{await dispatchTimer('STARTED');notify('타이머 시작 저장 완료');});
 event('timer-pause',async()=>{await dispatchTimer('PAUSED');notify('타이머 일시정지 저장 완료');});
 event('timer-resume',async()=>{await dispatchTimer('RESUMED');notify('교사 재개 저장 완료');});
 event('submit-answer',async()=>{await respond();notify('학생 답안 저장 완료 — 교사 최종 판정이 필요합니다.');});
 event('judge-right',async()=>judge('CORRECT'));
 event('judge-wrong',async()=>judge('INCORRECT'));
 event('intercept-open',async()=>{
  const s=teacher.getState(),a=active();
  const target=s.teams.find(x=>x.id!==a.teamId);
  if(!target)throw new Error('가로채기에 참여할 다른 모둠이 없습니다.');
  await teacher.openInterception({sourceAttemptId:a.id,targetTeamId:target.id});
  flow='INTERCEPTION';$('response-form').dataset.renderKey='';notify(`가로채기 대상: ${target.name}`);
 });
 event('complete-region',async()=>{await teacher.completeRegion(selectedRegion());notify('지역 완료·열쇠 지급이 저장됐습니다.');});
 const openRoutes=async()=>{
  const s=state();if(!s)throw new Error('탐험을 먼저 열어 주세요.');
  await teacher.dispatch('WORLD_VIEW_OPENED',{view:'FORK',themeId:regionInfo(selectedRegion()).themeId});
  if(s.sessions.some(x=>x.id===s.activeSessionId&&x.phase==='ACTIVE'))await teacher.dispatch('SESSION_PAUSED');
  const slot=s.meta.slot;await teacher.close();database.close();location.assign(`../journey/?slot=${slot}`);
 };
 event('next-region',async()=>{if(journeyMode){await openRoutes();return;}await teacher.enterRegion('T1-R2');notify('다음 지역에 진입했습니다. 원래 지역 결과는 유지됩니다.');});
 event('recovery-call',async()=>{
  const rid=journeyMode?selectedRegion():'T1-R2';
  const cand=listRecoveryCandidates(teacher.getState(),{inRegionId:rid})[0];
  if(!cand)throw new Error('자연 회수 후보가 없습니다.');
  await teacher.controlRecovery('RECOVERY_CALLED',{
   recoveryId:cand.id,teamId:cand.originTeamId,regionId:rid,mode:'NATURAL',reason:'다음 지역에서 원래 오답 모둠 회수'
  });
  flow='RECOVERY';$('response-form').dataset.renderKey='';notify('다음 지역 원모둠 회수 시작 대기');
 });
 event('session-resume',async()=>{await teacher.dispatch('SESSION_RESUMED');notify('교사가 차시를 재개했습니다.');});
 event('export-json',async()=>{
  if(!state())throw new Error('원정 세션이 없습니다.');
  const json=await teacher.exportJSON();
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const anchor=el('a');anchor.href=url;anchor.download=`moonpath-v411-smoke-slot-${state().meta.slot}.json`;
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  notify('JSON 백업이 생성됐습니다. 파일 자체와 재가져오기는 별도 확인하세요.');
 });
 event('import-json',async()=>{
  const file=$('json-file').files?.[0];if(!file)throw new Error('복원할 JSON 파일을 선택하세요.');
  const txt=await file.text(),slot=Number($('slot-picker').value);
  if(teacher?.state)await teacher.close();
  teacher=new TeacherEngineSession(database,{newId:uniqueId,heartbeatMs:10000});
  await teacher.restoreJSONToEmptySlot(slot,txt);
  notify('빈 슬롯으로 JSON을 복원했습니다. 자동 재개되지 않습니다.');
 });
 draw();
 // HOME B opens only an explicitly selected existing test slot; never create from a URL.
 const homeEntry=new URLSearchParams(location.search);
 if(homeEntry.get('home')==='b'){
  const slotText=homeEntry.get('slot');
  if(/^[123]$/.test(slotText??'')){
   $('slot-picker').value=slotText;
   try{await initialize('CONTINUE');}catch(err){notify(`HOME 탐험 열기 실패 — ${err.code??err.name}: ${err.message}`,'error');}
  }
  const back=el('button','HOME으로');back.id='return-home';back.type='button';$('toolbar').prepend(back);
  if(journeyMode){const routes=el('button','책장·갈림길');routes.type='button';routes.id='open-routes';routes.addEventListener('click',withError(openRoutes));$('toolbar').prepend(routes);$('next-region').textContent='갈림길로 이동';}
  back.addEventListener('click',withError(async()=>{
   back.disabled=true;
   try{
    const s=state();
    if(s?.sessions.some(x=>x.id===s.activeSessionId&&x.phase==='ACTIVE'))await teacher.dispatch('SESSION_PAUSED');
    if(teacher)await teacher.close();
    database.close();
    location.assign('../home-b/');
   }catch(err){back.disabled=false;throw err;}
  }));
 }
 return {testDatabaseName:TEST_DB_NAME,hasTeacherSession:()=>!!teacher?.state,readPublic:()=>teacher?.state?teacher.getStudentProjection():null};
}
