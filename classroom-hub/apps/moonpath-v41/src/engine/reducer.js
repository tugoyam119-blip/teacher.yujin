import {checkState,clone,insist,requireId,validTimestamp,timerRemainingMs,TIME_SAND_COST,TIME_SAND_EXTENSION_MS,canonicalJson} from './model.js';
import {validateDrawCommand} from '../questions/draw.js';

/** Pure event reducer: no DOM, network, localStorage, IndexedDB, Date.now or random IDs. */
export function reduceCommand(current,command){
  checkState(current);
  insist(command&&typeof command==='object','COMMAND_INVALID','명령은 객체여야 합니다.');
  const {eventId,type,at}=command;
  requireId(eventId,'이벤트');validTimestamp(at);
  insist(typeof type==='string','COMMAND_INVALID','명령 유형이 없습니다.');
  const prior=current.eventLog.find(e=>e.eventId===eventId);
  if(prior){
    insist(prior.type===type,'EVENT_ID_CONFLICT','같은 이벤트 ID로 다른 명령을 제출할 수 없습니다.');
    if(prior.payload!==undefined){
      insist(canonicalJson(prior.payload)===canonicalJson(command.payload??{}),'EVENT_ID_CONFLICT','같은 이벤트 ID로 다른 내용의 명령을 제출할 수 없습니다.');
    }
    return {duplicate:true,state:current,event:null};
  }
  insist(at>=current.meta.updatedAt,'CLOCK_BACKWARD','저장된 마지막 이벤트보다 앞선 시각입니다. PC 시각을 확인하세요.');
  const state=clone(current);
  const payload=clone(command.payload??{});
  const last=()=>{const a=state.activeAttemptId&&state.attempts[state.activeAttemptId];insist(a,'NO_ATTEMPT','활성 문제가 없습니다.');return a;};
  const activeSession=()=>{const x=state.sessions.find(s=>s.id===state.activeSessionId);insist(x,'NO_SESSION','현재 차시가 없습니다.');return x;};
  const finishActiveTime=s=>{if(s.phase==='ACTIVE'){s.activeMs+=Math.max(0,at-s.activeSince);s.activeSince=null;}};
  const ensureRunningNotExpired=a=>insist(a.timer.phase!=='RUNNING'||timerRemainingMs(a,at)>0,'TIMER_DEADLINE','시각 만료가 도달했습니다. 만료 이벤트를 확정해야 합니다.');
  switch(type){
    case 'EXPEDITION_CREATED':
      insist(current.meta.revision===0,'NOT_INITIAL','신규 원정 생성 명령은 최초에만 허용합니다.');
      break;
    case 'SCREEN_CHANGED':
      insist(typeof payload.screen==='string'&&/^[A-Z_]+$/.test(payload.screen),'INVALID_SCREEN','화면 ID가 올바르지 않습니다.');
      if(state.activeAttemptId){const a=last();insist(a.timer.phase==='RESOLVED','ATTEMPT_ACTIVE','문제 진행 중 일반 화면 이동을 할 수 없습니다.');}
      state.screen=payload.screen;
      break;
    case 'SESSION_STARTED':{
      insist(!state.activeSessionId,'SESSION_ACTIVE','이미 진행 중인 차시가 있습니다.');
      requireId(payload.sessionId,'차시');
      insist(!state.sessions.some(x=>x.id===payload.sessionId),'SESSION_EXISTS','이미 존재하는 차시 ID입니다.');
      state.sessions.push({id:payload.sessionId,startedAt:at,endedAt:null,activeMs:0,activeSince:at,phase:'ACTIVE'});
      state.activeSessionId=payload.sessionId;break;
    }
    case 'SESSION_PAUSED':{
      const s=activeSession();insist(s.phase==='ACTIVE','SESSION_NOT_ACTIVE','차시가 진행 중이 아닙니다.');
      if(state.activeAttemptId){
        const a=last();if(a.timer.phase==='RUNNING'){
          a.timer.remainingMs=timerRemainingMs(a,at);
          a.timer.phase=a.timer.remainingMs===0?'EXPIRED_AWAITING_TEACHER':'PAUSED';
          a.timer.runningSince=null;
        }
      }
      finishActiveTime(s);s.phase='PAUSED';break;
    }
    case 'SESSION_RESUMED':{
      const s=activeSession();insist(s.phase==='PAUSED','SESSION_NOT_PAUSED','일시정지된 차시가 아닙니다.');s.phase='ACTIVE';s.activeSince=at;break;
    }
    case 'SESSION_ENDED':{
      const s=activeSession();insist(state.activeAttemptId?last().timer.phase==='RESOLVED':true,'ATTEMPT_ACTIVE','진행 중인 문제를 먼저 처리해야 합니다.');
      finishActiveTime(s);s.phase='ENDED';s.endedAt=at;state.activeSessionId=null;break;
    }
    case 'ATTEMPT_PREPARED':{
      const s=activeSession();insist(s.phase==='ACTIVE','SESSION_NOT_ACTIVE','진행 중인 차시가 필요합니다.');
      insist(!state.activeAttemptId||last().timer.phase==='RESOLVED','ATTEMPT_ACTIVE','기존 문제를 먼저 처리해야 합니다.');
      requireId(payload.attemptId,'문제 시도');requireId(payload.questionId,'문항');
      insist(!state.attempts[payload.attemptId],'ATTEMPT_EXISTS','같은 문제 시도 ID가 존재합니다.');
      insist(state.teams.some(t=>t.id===payload.teamId),'INVALID_TEAM','존재하지 않는 모둠입니다.');
      const sec=state.settings.timerSeconds;
      state.attempts[payload.attemptId]={id:payload.attemptId,questionId:payload.questionId,questionRevision:payload.questionRevision??null,teamId:payload.teamId,sessionId:s.id,preparedAt:at,resolvedAt:null,timer:{phase:'PREPARED',remainingMs:sec*1000,runningSince:null,usedTimeSand:false}};
      state.activeAttemptId=payload.attemptId;break;
    }
    case 'QUESTION_DRAWN':{
      // PHASE 2-2. A selected question and its PREPARED attempt are committed in
      // the SAME event/IndexedDB transaction. No grading or reward takes place.
      const s=activeSession();insist(s.phase==='ACTIVE','SESSION_NOT_ACTIVE','진행 중인 차시가 필요합니다.');
      insist(!state.activeAttemptId||last().timer.phase==='RESOLVED','ATTEMPT_ACTIVE','기존 문제를 먼저 처리해야 합니다.');
      validateDrawCommand(state,payload,at);
      const sec=state.settings.timerSeconds;
      const {attemptId,questionId,regionId,teamId,mode,questionSnapshot}=payload;
      const row={attemptId,questionId,regionId,teamId,mode,issuedAt:at,questionRevision:questionSnapshot.questionRevision};
      state.questions.draws??=[];
      state.questions.draws.push(row);
      if(mode==='NEW')state.questions.issuedIds.push(questionId);
      if(state.world.currentRegionId===null)state.world.currentRegionId=regionId;
      state.attempts[attemptId]={id:attemptId,questionId,questionRevision:questionSnapshot.questionRevision,
        teamId,regionId,drawMode:mode,questionSnapshot:clone(questionSnapshot),sessionId:s.id,
        preparedAt:at,resolvedAt:null,
        timer:{phase:'PREPARED',remainingMs:sec*1000,runningSince:null,usedTimeSand:false}};
      state.activeAttemptId=attemptId;break;
    }
    case 'TIMER_STARTED':{
      const a=last();insist(a.timer.phase==='PREPARED','TIMER_NOT_PREPARED','준비된 문제가 아닙니다.');
      insist(activeSession().phase==='ACTIVE','SESSION_NOT_ACTIVE','차시를 먼저 재개해야 합니다.');
      a.timer.phase=state.settings.timerSeconds===0?'PAUSED':'RUNNING';
      a.timer.runningSince=a.timer.phase==='RUNNING'?at:null;break;
    }
    case 'TIMER_PAUSED':{
      const a=last();insist(a.timer.phase==='RUNNING','TIMER_NOT_RUNNING','타이머가 실행 중이 아닙니다.');ensureRunningNotExpired(a);
      a.timer.remainingMs=timerRemainingMs(a,at);a.timer.phase='PAUSED';a.timer.runningSince=null;break;
    }
    case 'TIMER_RESUMED':{
      const a=last();insist(a.timer.phase==='PAUSED','TIMER_NOT_PAUSED','타이머가 정지 상태가 아닙니다.');
      insist(activeSession().phase==='ACTIVE','SESSION_NOT_ACTIVE','차시를 먼저 재개해야 합니다.');
      insist(a.timer.remainingMs>0,'NO_REMAINING_TIME','잔여 시간이 없습니다.');
      a.timer.phase='RUNNING';a.timer.runningSince=at;break;
    }
    case 'TIMER_EXPIRED':{
      const a=last();insist(a.timer.phase==='RUNNING'&&timerRemainingMs(a,at)===0,'TIMER_NOT_EXPIRED','아직 만료되지 않은 타이머입니다.');
      a.timer.remainingMs=0;a.timer.runningSince=null;a.timer.phase='EXPIRED_AWAITING_TEACHER';break;
    }
    case 'TIME_SAND_USED':{
      const a=last();insist(['RUNNING','PAUSED'].includes(a.timer.phase),'MAGIC_BAD_PHASE','진행/일시정지 문제에서만 사용할 수 있습니다.');
      ensureRunningNotExpired(a);
      insist(state.settings.timerSeconds!==0,'TIMER_DISABLED','타이머 끔 설정에서는 시간을 연장할 수 없습니다.');
      insist(state.magic.unlocked.includes('TIME_SAND'),'MAGIC_LOCKED','시간의 모래 해금 조건이 충족되지 않았습니다.');
      insist(!a.timer.usedTimeSand,'MAGIC_DUPLICATE','한 문제에 시간의 모래를 중복 사용할 수 없습니다.');
      insist(!state.rewards.settlementRequired,'SETTLEMENT_REQUIRED','별빛 정산이 필요하여 추가 소비를 차단했습니다.');
      insist(state.rewards.starlight>=TIME_SAND_COST,'INSUFFICIENT_STARS','별빛이 부족합니다.');
      const left=timerRemainingMs(a,at);
      a.timer.remainingMs=left+TIME_SAND_EXTENSION_MS;
      if(a.timer.phase==='RUNNING')a.timer.runningSince=at;
      a.timer.usedTimeSand=true;
      state.rewards.starlight-=TIME_SAND_COST;
      state.rewards.ledger.push({eventId,type:'TIME_SAND_SPEND',amount:-TIME_SAND_COST,attemptId:a.id});
      state.magic.used.push({eventId,magicId:'TIME_SAND',attemptId:a.id,at,cost:TIME_SAND_COST});break;
    }
    case 'CHECKPOINT_REPAIRED':{
      insist(payload.teacherConfirmed===true&&['latest','previous'].includes(payload.source),'TEACHER_REQUIRED','체크포인트 복구에는 교사 명시 확인이 필요합니다.');
      break;
    }
    case 'RECOVER_INTERRUPTED':{
      const a=state.activeAttemptId?last():null;
      const s=state.activeSessionId?activeSession():null;
      insist((a?.timer.phase==='RUNNING')||(s?.phase==='ACTIVE'),'RECOVERY_NOT_NEEDED','복원으로 정지시킬 실행 상태가 없습니다.');
      // Intentional: pause at the last persisted remaining time, never run/expire in the closed interval.
      if(a?.timer.phase==='RUNNING'){a.timer.phase='PAUSED';a.timer.runningSince=null;}
      if(s?.phase==='ACTIVE'){
        // Active time between last persisted event and unexpected shutdown is unknown; do not invent it.
        s.activeSince=null;s.phase='PAUSED';
      }
      break;
    }
    case 'ATTEMPT_RESOLVED':{
      // PHASE 1 timer harness ONLY. Academic judgement and rewards are PHASE 2, never auto-credit.
      const a=last();insist(a.timer.phase!=='RESOLVED','ALREADY_RESOLVED','이미 확정한 문제입니다.');
      insist(payload.teacherConfirmed===true,'TEACHER_REQUIRED','문제 종료에는 교사 확인이 필요합니다.');
      if(a.timer.phase==='RUNNING'){a.timer.remainingMs=timerRemainingMs(a,at);a.timer.runningSince=null;}
      a.timer.phase='RESOLVED';a.resolvedAt=at;break;
    }
    default:throw new Error(`UNIMPLEMENTED_COMMAND: ${type}`);
  }
  const seq=current.meta.revision+1;
  const event={seq,eventId,type,at,payload};
  state.meta.revision=seq;state.meta.updatedAt=at;
  state.eventLog.push({seq,eventId,type,at,payload:clone(payload)});
  if(type==='TIME_SAND_USED'||type==='RECOVER_INTERRUPTED'||type==='SESSION_ENDED'||type==='CHECKPOINT_REPAIRED') state.audit.push({seq,eventId,type,at});
  checkState(state);
  return {duplicate:false,state,event};
}
