import {newExpedition,clone,checkSlot,checkState,publicProjection,insist} from './model.js';
import {openEngineDatabase} from '../storage/indexeddb.js';
import {makeBackup,verifyBackup} from '../storage/backup.js';
import {planQuestionDraw} from '../questions/draw.js';

/** Only this teacher-side facade may send writes; publicProjection is an allowlist. */
export class TeacherEngineSession {
  constructor(store,{clock=()=>Date.now(),newId=()=>crypto.randomUUID(),writerId=null,heartbeatMs=10_000,onLeaseLost=null}={}){
    this.store=store;this.clock=clock;this.newId=newId;this.writerId=writerId??newId();
    this.slot=null;this.lease=null;this.state=null;this.heartbeatMs=heartbeatMs;this.onLeaseLost=onLeaseLost;this.heartbeat=null;
    this.queue=Promise.resolve();
  }
  static async openDatabase(opts){return new TeacherEngineSession(await openEngineDatabase(opts?.indexedDB),opts);}
  _startHeartbeat(){
    this._stopHeartbeat();if(!this.heartbeatMs)return;
    this.heartbeat=setInterval(async()=>{
      if(this.slot===null||!this.lease)return;
      try{const fresh=await this.store.acquireWriter(this.slot,this.writerId);this.lease=fresh;}
      catch(err){this._stopHeartbeat();this.onLeaseLost?.(err);}
    },this.heartbeatMs);
    this.heartbeat.unref?.(); // Avoid keeping Node-based tests/tools alive.
  }
  _stopHeartbeat(){if(this.heartbeat!==null){clearInterval(this.heartbeat);this.heartbeat=null;}}
  _enqueue(action){const pending=this.queue.then(action);this.queue=pending.catch(()=>{});return pending;}
  async create({slot,world,teamCount=4,timerSeconds=60,expeditionId=this.newId()}){
    return this._enqueue(async()=>{
      checkSlot(slot);insist(this.slot===null,'SESSION_BOUND','이미 열린 슬롯이 있습니다.');
      const at=this.clock(),lease=await this.store.acquireWriter(slot,this.writerId);
      try{
        const blank=newExpedition({slot,world,teamCount,timerSeconds,createdAt:at,expeditionId});
        const result=await this.store.createSlot(blank,{type:'EXPEDITION_CREATED',eventId:this.newId(),at,payload:{}},lease);
        this.slot=slot;this.lease=lease;this.state=result.state;this._startHeartbeat();return clone(result.state);
      }catch(err){await this.store.releaseWriter(slot,lease).catch(()=>{});throw err;}
    });
  }
  async open(slot,{pauseRunning=true}={}){
    return this._enqueue(async()=>{
      checkSlot(slot);insist(this.slot===null,'SESSION_BOUND','이미 열린 슬롯이 있습니다.');
      const lease=await this.store.acquireWriter(slot,this.writerId);
      try{
        const found=await this.store.read(slot);
        insist(found.state,'SLOT_EMPTY','저장된 탐험이 없습니다.');
        insist(!found.needsRepair,'CHECKPOINT_REPAIR_REQUIRED','최신 데이터에 이상이 있어 직전 정상 체크포인트가 발견되었습니다. 교사가 수동 복구를 확인해야 합니다.');
        this.slot=slot;this.lease=lease;this.state=found.state;
        const s=this.state;
        const timer=s.activeAttemptId&&s.attempts[s.activeAttemptId]?.timer;
        const session=s.activeSessionId&&s.sessions.find(x=>x.id===s.activeSessionId);
        if(pauseRunning&&(timer?.phase==='RUNNING'||session?.phase==='ACTIVE')){
          const at=Math.max(this.clock(),s.meta.updatedAt);
          const command={type:'RECOVER_INTERRUPTED',eventId:this.newId(),at,payload:{reason:'REOPEN'}};
          const result=await this.store.commit(slot,command,{expectedRevision:s.meta.revision,lease});
          if(result.committed)this.state=result.state;
        }
        this._startHeartbeat();return clone(this.state);
      }catch(err){this.slot=null;this.state=null;this.lease=null;await this.store.releaseWriter(slot,lease).catch(()=>{});throw err;}
    });
  }
  async recoverCheckpoint(slot,{source='latest',confirmation}={}){
    return this._enqueue(async()=>{
      checkSlot(slot);insist(this.slot===null,'SESSION_BOUND','복구 전 기존 교사 세션을 닫아야 합니다.');
      insist(confirmation===`RECOVER_SLOT_${slot}`,'TEACHER_REQUIRED','교사가 정확한 슬롯의 복구를 확인해야 합니다.');
      const lease=await this.store.acquireWriter(slot,this.writerId);
      try{
        const result=await this.store.repairFromCheckpoint(slot,{source,teacherConfirmed:true,eventId:this.newId(),at:this.clock(),lease});
        this.slot=slot;this.lease=lease;this.state=result.state;
        const a=this.state.activeAttemptId&&this.state.attempts[this.state.activeAttemptId];
        const lesson=this.state.activeSessionId&&this.state.sessions.find(x=>x.id===this.state.activeSessionId);
        if(a?.timer.phase==='RUNNING'||lesson?.phase==='ACTIVE'){
          const pause=await this.store.commit(slot,{type:'RECOVER_INTERRUPTED',eventId:this.newId(),at:Math.max(this.clock(),this.state.meta.updatedAt),payload:{reason:'CHECKPOINT_REPAIR'}},{expectedRevision:this.state.meta.revision,lease});
          if(pause.committed)this.state=pause.state;
        }
        this._startHeartbeat();return clone(this.state);
      }catch(err){this.slot=null;this.lease=null;this.state=null;await this.store.releaseWriter(slot,lease).catch(()=>{});throw err;}
    });
  }
  async dispatch(type,payload={},eventId=this.newId()){
    return this._enqueue(async()=>{
      insist(this.state&&this.lease,'SESSION_NOT_OPEN','교사용 원정 세션을 열어야 합니다.');
      // Reject a backwards PC clock BEFORE refreshing the lease or touching the DB.
      const at=this.clock();
      insist(at>=this.state.meta.updatedAt,'CLOCK_BACKWARD','컴퓨터 시각이 이전 이벤트보다 뒤로 이동했습니다. 시계를 확인하세요.');
      // Refresh a lease before every teacher command, including after a long idle.
      // If another teacher window obtained the lease, this throws before any save.
      this.lease=await this.store.acquireWriter(this.slot,this.writerId);
      const command={type,eventId,at,payload};
      const result=await this.store.commit(this.slot,command,{expectedRevision:this.state.meta.revision,lease:this.lease});
      // Only mutate the in-memory teacher state AFTER the IndexedDB transaction completes.
      this.state=result.state;
      return {committed:result.committed,duplicate:result.duplicate??false,state:clone(this.state)};
    });
  }
  /** Plans + persists the exact draw inside one teacher-side serialized operation. */
  async drawQuestion(questionEngine,{regionId,teamId,attemptId=null,eventId=null,random=Math.random}={}){
    return this._enqueue(async()=>{
      insist(this.state&&this.lease,'SESSION_NOT_OPEN','교사 원정 세션을 먼저 열어야 합니다.');
      // A double-click/retry with the SAME event ID returns its original issued
      // attempt, not a fresh random draw. Never mutate state or reroll.
      const issuingEventId=eventId??this.newId();
      const prior=this.state.eventLog.find(e=>e.eventId===issuingEventId);
      if(prior){
        insist(prior.type==='QUESTION_DRAWN' && prior.payload?.regionId===regionId &&
          prior.payload?.teamId===teamId && (attemptId===null||prior.payload?.attemptId===attemptId),
          'EVENT_ID_CONFLICT','동일 출제 ID에 다른 요청이 접수되었습니다.');
        return {committed:false,duplicate:true,state:clone(this.state),
          attemptId:prior.payload.attemptId,questionId:prior.payload.questionId,mode:prior.payload.mode};
      }
      const at=this.clock();
      insist(at>=this.state.meta.updatedAt,'CLOCK_BACKWARD','PC 시각 역행을 확인하세요.');
      // Plan from a stable state in the same queue as all teacher commands.
      const issuingAttemptId=attemptId??this.newId();
      const payload=planQuestionDraw(this.state,questionEngine,{regionId,teamId,attemptId:issuingAttemptId,at,random});
      this.lease=await this.store.acquireWriter(this.slot,this.writerId);
      const result=await this.store.commit(this.slot,{type:'QUESTION_DRAWN',eventId:issuingEventId,at,payload},{
        expectedRevision:this.state.meta.revision,lease:this.lease
      });
      this.state=result.state; // no in-memory commit before oncomplete
      return {committed:result.committed,duplicate:result.duplicate??false,state:clone(this.state),
        attemptId:issuingAttemptId,questionId:payload.questionId,mode:payload.mode};
    });
  }
  getState(){insist(this.state,'SESSION_NOT_OPEN','세션이 없습니다.');return clone(this.state);}
  getStudentProjection(){return publicProjection(this.getState(),this.clock());}
  async exportJSON(){
    insist(this.state,'SESSION_NOT_OPEN','먼저 슬롯을 열어야 합니다.');
    const data=await this.store.readConsistentForBackup(this.slot);
    return JSON.stringify(await makeBackup(data,{exportedAt:this.clock()}),null,2);
  }
  async restoreJSONToEmptySlot(slot,json){
    return this._enqueue(async()=>{
      insist(this.slot===null,'SESSION_BOUND','복원하기 전에 현재 세션을 닫아야 합니다.');
      const restored=await verifyBackup(json);
      insist(restored.state.meta.slot===slot,'SLOT_MISMATCH','백업과 대상 슬롯이 일치하지 않습니다.');
      const lease=await this.store.acquireWriter(slot,this.writerId);
      try{
        const result=await this.store.restoreToEmptySlot(slot,restored,lease,{
          recoveryEventId:this.newId(),recoveryAt:Math.max(this.clock(),restored.state.meta.updatedAt)
        });
        this.slot=slot;this.lease=lease;this.state=result.state;
        // The imported snapshot and safety pause were committed in ONE transaction.
        // A failing write never leaves a silently RUNNING restored slot.
        this._startHeartbeat();return clone(this.state);
      }
      catch(err){this.slot=null;this.lease=null;this.state=null;await this.store.releaseWriter(slot,lease).catch(()=>{});throw err;}
    });
  }
  async close(){
    return this._enqueue(async()=>{
      const slot=this.slot,lease=this.lease;
      this._stopHeartbeat();this.slot=null;this.lease=null;this.state=null;
      if(slot!==null&&lease)await this.store.releaseWriter(slot,lease);
    });
  }
}
