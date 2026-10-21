import {DB_NAME,EngineError,checkSlot,checkState,clone,insist,validTimestamp,requireId,canonicalJson} from '../engine/model.js';
import {reduceCommand} from '../engine/reducer.js';
import {activeInterception,activeRecovery} from '../recovery/flows.js';

const DB_VERSION=2;
export const LEASE_TTL_MS=30_000;
const STORES=Object.freeze({slots:'slots',events:'events',checkpoints:'checkpoints',leases:'leases',quarantine:'quarantine',archives:'archives'});
const cpKey=(slot,type)=>`${slot}:${type}`;
const evKey=(slot,seq)=>`${slot}:${String(seq).padStart(12,'0')}`;

function onTx(db,storeNames,mode,plan){
  return new Promise((resolve,reject)=>{
    let tx, outcome, problem;
    try{tx=db.transaction(storeNames,mode)}catch(err){reject(err);return;}
    const abort=(err)=>{problem=err;try{tx.abort();}catch{reject(err);}};
    tx.oncomplete=()=>resolve(outcome);
    tx.onabort=()=>reject(problem??tx.error??new EngineError('WRITE_ABORTED','데이터베이스 거래가 중단되었습니다.'));
    tx.onerror=()=>{ /* onabort provides the definitive error */ };
    try{plan(tx,{done(value){outcome=value;},fail:abort});}catch(e){abort(e);}
  });
}

export async function openEngineDatabase(factory=globalThis.indexedDB){
  insist(factory&&typeof factory.open==='function','IDB_UNAVAILABLE','이 환경은 IndexedDB를 제공하지 않습니다.');
  const db=await new Promise((resolve,reject)=>{
    let req;try{req=factory.open(DB_NAME,DB_VERSION);}catch(e){reject(e);return;}
    req.onupgradeneeded=()=>{
      const d=req.result;
      for(const name of Object.values(STORES))if(!d.objectStoreNames.contains(name)){
        d.createObjectStore(name,{keyPath:'key'});
      }
    };
    req.onerror=()=>reject(req.error||new EngineError('IDB_OPEN_FAILED','IndexedDB 열기 실패'));
    req.onblocked=()=>reject(new EngineError('IDB_BLOCKED','다른 탭이 DB 버전 변경을 차단하고 있습니다.'));
    req.onsuccess=()=>resolve(req.result);
  });
  db.onversionchange=()=>db.close();
  return new IndexedDbExpeditionStore(db);
}

/** All mutating operations complete only after an IndexedDB readwrite transaction commits. */
export class IndexedDbExpeditionStore {
  constructor(db,{clock=()=>Date.now()}={}){this.db=db;this.clock=clock;}
  close(){this.db.close();}
  async listArchives(){
    return onTx(this.db,[STORES.archives],'readonly',(tx,{done})=>{const r=tx.objectStore(STORES.archives).getAll();r.onsuccess=()=>done(r.result.sort((a,b)=>b.archivedAt-a.archivedAt));});
  }
  async archiveSlot(slot,{archiveId,expectedRevision,lease}){
    checkSlot(slot);requireId(archiveId,'보관');const now=validTimestamp(this.clock());
    return onTx(this.db,Object.values(STORES),'readwrite',(tx,{done,fail})=>{
      const names=['slots','events','checkpoints','leases','quarantine'],rows={};let loaded=0;
      for(const name of names){const r=tx.objectStore(name).getAll();r.onsuccess=()=>{rows[name]=r.result;if(++loaded!==names.length)return;try{
        const row=rows.slots.find(x=>x.key===slot),l=rows.leases.find(x=>x.key===slot);this._checkLease(l,lease,now);
        insist(row?.state,'SLOT_EMPTY','보관할 탐험이 없습니다.');checkState(row.state);
        insist(row.state.meta.revision===expectedRevision,'REVISION_CONFLICT','탐험이 변경되었습니다. 다시 확인하세요.');
        const s=row.state,lesson=s.sessions.find(x=>x.id===s.activeSessionId),running=[s.attempts[s.activeAttemptId],activeInterception(s),activeRecovery(s)?.runs?.find(x=>x.id===activeRecovery(s)?.activeRunId)].some(x=>x?.timer.phase==='RUNNING');
        insist(lesson?.phase!=='ACTIVE'&&!running,'PAUSE_REQUIRED','수업과 타이머를 저장·일시정지한 뒤 보관하세요.');
        const events=rows.events.filter(x=>x.slot===slot),checkpoints=rows.checkpoints.filter(x=>x.slot===slot),quarantine=rows.quarantine.filter(x=>x.slot===slot);
        insist(events.length===s.meta.revision&&events.every(x=>canonicalJson(x.event)===canonicalJson(s.eventLog[x.event.seq-1])),'BROKEN_SEQUENCE','보관할 이벤트 이력이 일치하지 않습니다.');
        insist(canonicalJson(checkpoints.find(x=>x.key===cpKey(slot,'latest'))?.state)===canonicalJson(s),'CHECKPOINT_DIVERGED','보관할 최신 체크포인트가 일치하지 않습니다.');
        tx.objectStore(STORES.archives).add({key:archiveId,archivedAt:now,slot,state:s,events,checkpoints,quarantine,restoredAt:null});
        tx.objectStore(STORES.slots).delete(slot);
        for(const name of ['events','checkpoints','quarantine'])for(const x of rows[name].filter(x=>x.slot===slot))tx.objectStore(name).delete(x.key);
        done({committed:true,archiveId});
      }catch(e){fail(e);}};}
    });
  }
  async restoreArchive(archiveId,{lease}){
    requireId(archiveId,'보관');const now=validTimestamp(this.clock());
    return onTx(this.db,Object.values(STORES),'readwrite',(tx,{done,fail})=>{
      const ar=tx.objectStore(STORES.archives).get(archiveId);ar.onsuccess=()=>{try{
        const a=ar.result;insist(a&&!a.restoredAt,'ARCHIVE_UNAVAILABLE','복원할 보관 기록이 없거나 이미 복원했습니다.');checkSlot(a.slot);checkState(a.state);
        let row,l,loaded=0;const ready=()=>{if(++loaded!==2)return;try{
          this._checkLease(l,lease,now);insist(!row,'SLOT_OCCUPIED',`원래 슬롯 ${a.slot}을 먼저 보관해 비워 주세요. 기존 탐험은 덮어쓰지 않습니다.`);
          tx.objectStore(STORES.slots).add({key:a.slot,state:a.state});
          for(const name of ['events','checkpoints','quarantine'])for(const x of a[name])tx.objectStore(name).add(x);
          tx.objectStore(STORES.archives).put({...a,restoredAt:now});done({committed:true,slot:a.slot});
        }catch(e){fail(e);}};
        const sr=tx.objectStore(STORES.slots).get(a.slot),lr=tx.objectStore(STORES.leases).get(a.slot);sr.onsuccess=()=>{row=sr.result;ready();};lr.onsuccess=()=>{l=lr.result;ready();};
      }catch(e){fail(e);}};
    });
  }
  async acquireWriter(slot,writerId){
    checkSlot(slot);requireId(writerId,'작성자');
    const now=validTimestamp(this.clock());
    return onTx(this.db,[STORES.leases],'readwrite',(tx,{done,fail})=>{
      const o=tx.objectStore(STORES.leases);
      const req=o.get(slot);
      req.onsuccess=()=>{
        try{
          const old=req.result;
          insist(!old||old.writerId===writerId||old.expiresAt<=now,'WRITER_BUSY','다른 교사 창이 이 슬롯의 쓰기 권한을 사용 중입니다.');
          const lease={key:slot,writerId,epoch:old?.writerId===writerId?old.epoch:(old?.epoch??0)+1,expiresAt:now+LEASE_TTL_MS};
          o.put(lease);done(clone(lease));
        }catch(e){fail(e);}
      };
    });
  }
  async releaseWriter(slot,{writerId,epoch}){
    checkSlot(slot);requireId(writerId,'작성자');
    return onTx(this.db,[STORES.leases],'readwrite',(tx,{done,fail})=>{
      const o=tx.objectStore(STORES.leases),r=o.get(slot);
      r.onsuccess=()=>{try{const old=r.result;if(old?.writerId===writerId&&old.epoch===epoch){o.delete(slot);done(true);}else done(false);}catch(e){fail(e);}};
    });
  }
  _checkLease(stored,lease,now){
    insist(!!stored&&stored.writerId===lease?.writerId&&stored.epoch===lease?.epoch&&stored.expiresAt>now,'WRITER_NOT_OWNED','쓰기 소유권이 만료되거나 다른 창으로 변경되었습니다.');
  }
  async createSlot(state,command,lease){
    checkState(state);checkSlot(state.meta.slot);
    const {slot}=state.meta,now=validTimestamp(this.clock());
    insist(state.meta.revision===0,'NOT_EMPTY_EXPEDITION','새 원정 revision은 0이어야 합니다.');
    const reduced=reduceCommand(state,command);
    insist(!reduced.duplicate&&reduced.event.type==='EXPEDITION_CREATED','INITIAL_EVENT','최초 이벤트는 EXPEDITION_CREATED여야 합니다.');
    return onTx(this.db,Object.values(STORES),'readwrite',(tx,{done,fail})=>{
      const ls=tx.objectStore(STORES.leases), ss=tx.objectStore(STORES.slots),es=tx.objectStore(STORES.events),cs=tx.objectStore(STORES.checkpoints);
      let l,s,loaded=0;
      const ready=()=>{
        if(++loaded!==2)return;
        try{
          this._checkLease(l,lease,now);
          insist(!s,'SLOT_OCCUPIED','해당 슬롯에 저장된 게임이 있습니다. 백업 없이 덮어쓸 수 없습니다.');
          ss.add({key:slot,state:reduced.state});
          es.add({key:evKey(slot,reduced.event.seq),slot,event:reduced.event});
          cs.put({key:cpKey(slot,'latest'),slot,revision:reduced.state.meta.revision,state:reduced.state});
          ls.put({...l,expiresAt:now+LEASE_TTL_MS});
          done({committed:true,state:clone(reduced.state),event:clone(reduced.event)});
        }catch(e){fail(e);}
      };
      const lr=ls.get(slot),sr=ss.get(slot);
      lr.onsuccess=()=>{l=lr.result;ready();};sr.onsuccess=()=>{s=sr.result;ready();};
    });
  }
  async commit(slot,command,{expectedRevision,lease}){
    checkSlot(slot);
    insist(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'REVISION_REQUIRED','저장 시 현재 revision이 필요합니다.');
    const now=validTimestamp(this.clock());
    return onTx(this.db,Object.values(STORES),'readwrite',(tx,{done,fail})=>{
      const ls=tx.objectStore(STORES.leases),ss=tx.objectStore(STORES.slots),es=tx.objectStore(STORES.events),cs=tx.objectStore(STORES.checkpoints);
      let l,s,loaded=0;
      const ready=()=>{
        if(++loaded!==2)return;
        try{
          this._checkLease(l,lease,now);
          insist(s&&s.state,'SLOT_EMPTY','저장된 슬롯이 없습니다.');
          checkState(s.state);
          insist(s.state.meta.revision===expectedRevision,'REVISION_CONFLICT','다른 창 또는 명령이 이미 상태를 변경했습니다. 다시 불러오세요.');
          const result=reduceCommand(s.state,command);
          if(result.duplicate){done({committed:false,duplicate:true,state:clone(s.state)});return;}
          // These three writes and the writer lease are inseparable by transaction design.
          ss.put({key:slot,state:result.state});
          es.add({key:evKey(slot,result.event.seq),slot,event:result.event});
          cs.put({key:cpKey(slot,'previous'),slot,revision:s.state.meta.revision,state:s.state});
          cs.put({key:cpKey(slot,'latest'),slot,revision:result.state.meta.revision,state:result.state});
          ls.put({...l,expiresAt:now+LEASE_TTL_MS});
          done({committed:true,duplicate:false,state:clone(result.state),event:clone(result.event)});
        }catch(e){fail(e);}
      };
      const lr=ls.get(slot),sr=ss.get(slot);
      lr.onsuccess=()=>{l=lr.result;ready();};sr.onsuccess=()=>{s=sr.result;ready();};
    });
  }
  async read(slot){
    checkSlot(slot);
    return onTx(this.db,[STORES.slots,STORES.checkpoints],'readonly',(tx,{done,fail})=>{
      let row,latest,prev,loaded=0;
      const ready=()=>{
        if(++loaded!==3)return;
        const candidates=[['slot',row?.state],['latest',latest?.state],['previous',prev?.state]];
        for(const [source,s] of candidates){
          if(!s)continue;
          try{
            checkState(s);insist(s.meta.slot===slot,'SLOT_MISMATCH','복구용 슬롯이 다릅니다.');
            // Two independently persisted views should be exactly the same after an atomic write.
            if(source==='slot'&&latest?.state){
              checkState(latest.state);
              insist(JSON.stringify(s)===JSON.stringify(latest.state),'CHECKPOINT_DIVERGED','최신 체크포인트와 상태가 불일치합니다.');
            }
            done({state:clone(s),source,needsRepair:source!=='slot'});return;
          }catch{/* seek a previous checkpoint */}
        }
        if(row||latest||prev)fail(new EngineError('ALL_CHECKPOINTS_INVALID','저장 데이터와 정상 체크포인트를 읽을 수 없습니다.'));
        else done({state:null,source:null,needsRepair:false});
      };
      const sr=tx.objectStore(STORES.slots).get(slot),cr=tx.objectStore(STORES.checkpoints);
      const lr=cr.get(cpKey(slot,'latest')),pr=cr.get(cpKey(slot,'previous'));
      sr.onsuccess=()=>{row=sr.result;ready();};lr.onsuccess=()=>{latest=lr.result;ready();};pr.onsuccess=()=>{prev=pr.result;ready();};
    });
  }
  async readConsistentForBackup(slot){
    checkSlot(slot);
    return onTx(this.db,[STORES.slots,STORES.events],'readonly',(tx,{done,fail})=>{
      let row,items,loaded=0;
      const ready=()=>{
        if(++loaded!==2)return;
        try{
          insist(row?.state,'SLOT_EMPTY','비어 있는 슬롯은 백업할 수 없습니다.');checkState(row.state);
          const ev=(items??[]).filter(x=>x.slot===slot).map(x=>x.event).sort((a,b)=>a.seq-b.seq);
          insist(ev.length===row.state.meta.revision,'EVENT_COUNT','원본 이벤트 로그와 revision 불일치.');
          ev.forEach((e,i)=>{const original=row.state.eventLog[i];
            insist(e.seq===i+1&&e.eventId===original.eventId&&e.type===original.type&&e.at===original.at,'BROKEN_SEQUENCE','백업 로그 불일치');
            if(original.payload!==undefined)insist(canonicalJson(e.payload??{})===canonicalJson(original.payload),'BROKEN_SEQUENCE','백업 이벤트 내용이 상태와 다릅니다.');
          });
          done({state:clone(row.state),events:clone(ev)});
        }catch(e){fail(e);}
      };
      const sr=tx.objectStore(STORES.slots).get(slot),er=tx.objectStore(STORES.events).getAll();
      sr.onsuccess=()=>{row=sr.result;ready();};er.onsuccess=()=>{items=er.result;ready();};
    });
  }
  async repairFromCheckpoint(slot,{source='latest',teacherConfirmed=false,eventId,at,lease}={}){
    checkSlot(slot);requireId(eventId,'복구 이벤트');validTimestamp(at);
    insist(teacherConfirmed===true,'TEACHER_REQUIRED','체크포인트 복구는 명시적인 교사 확인이 필요합니다.');
    insist(['latest','previous'].includes(source),'CHECKPOINT_INVALID','최신 또는 직전 체크포인트만 선택할 수 있습니다.');
    const now=validTimestamp(this.clock());
    return onTx(this.db,Object.values(STORES),'readwrite',(tx,{done,fail})=>{
      const ls=tx.objectStore(STORES.leases),ss=tx.objectStore(STORES.slots),es=tx.objectStore(STORES.events),cs=tx.objectStore(STORES.checkpoints),qs=tx.objectStore(STORES.quarantine);
      let l,row,cp,events,loaded=0;
      const ready=()=>{if(++loaded!==4)return;try{
        this._checkLease(l,lease,now);
        insist(cp?.state,'CHECKPOINT_MISSING','선택한 정상 체크포인트가 없습니다.');
        const original=cp.state;checkState(original);
        insist(original.meta.slot===slot,'SLOT_MISMATCH','체크포인트 슬롯이 올바르지 않습니다.');
        // Don't overwrite an already valid slot, and never truncate an unexplained event chain.
        if(row?.state){try{checkState(row.state);insist(JSON.stringify(row.state)!==JSON.stringify(original),'CHECKPOINT_REPAIR_UNNEEDED','정상 상태는 복구 대상으로 덮어쓸 수 없습니다.');}catch(e){if(e.code==='CHECKPOINT_REPAIR_UNNEEDED')throw e;}}
        const stored=events.filter(x=>x.slot===slot).map(x=>x.event).sort((a,b)=>a.seq-b.seq);
        insist(stored.length===original.meta.revision,'FORENSIC_REVIEW_REQUIRED','로그와 체크포인트의 revision이 달라 수동 정합성 검토가 필요합니다.');
        stored.forEach((e,i)=>{const ref=original.eventLog[i];
          insist(e.seq===i+1&&e.eventId===ref.eventId&&e.type===ref.type&&e.at===ref.at,'FORENSIC_REVIEW_REQUIRED','이벤트 로그 연쇄가 불일치합니다.');
          if(ref.payload!==undefined)insist(canonicalJson(e.payload??{})===canonicalJson(ref.payload),'FORENSIC_REVIEW_REQUIRED','이벤트 상세 내용이 불일치합니다.');
        });
        const result=reduceCommand(original,{type:'CHECKPOINT_REPAIRED',eventId,at,payload:{teacherConfirmed:true,source}});
        const safetyKey=`${slot}:damaged:${result.event.seq}:${eventId}`;
        qs.add({key:safetyKey,slot,original:row??null,at,repairedFrom:source});
        ss.put({key:slot,state:result.state});
        es.add({key:evKey(slot,result.event.seq),slot,event:result.event});
        cs.put({key:cpKey(slot,'previous'),slot,revision:original.meta.revision,state:original});
        cs.put({key:cpKey(slot,'latest'),slot,revision:result.state.meta.revision,state:result.state});
        ls.put({...l,expiresAt:now+LEASE_TTL_MS});done({committed:true,state:clone(result.state),quarantineKey:safetyKey});
      }catch(e){fail(e);}};
      const lr=ls.get(slot),sr=ss.get(slot),cr=cs.get(cpKey(slot,source)),er=es.getAll();
      lr.onsuccess=()=>{l=lr.result;ready();};sr.onsuccess=()=>{row=sr.result;ready();};cr.onsuccess=()=>{cp=cr.result;ready();};er.onsuccess=()=>{events=er.result;ready();};
    });
  }
  async restoreToEmptySlot(slot,pack,lease,{recoveryEventId=null,recoveryAt=null}={}){
    checkSlot(slot);checkState(pack.state);
    insist(pack.state.meta.slot===slot,'SLOT_MISMATCH','슬롯 번호가 다른 백업은 무단 전환하지 않습니다.');
    insist(Array.isArray(pack.events)&&pack.events.length===pack.state.meta.revision,'EVENT_COUNT','복구 로그 개수가 다릅니다.');
    pack.events.forEach((e,i)=>{
      const ref=pack.state.eventLog[i];
      insist(e.seq===ref.seq&&e.eventId===ref.eventId&&e.type===ref.type&&e.at===ref.at,'BACKUP_EVENT_MISMATCH','백업의 이벤트 내용이 상태 기록과 일치하지 않습니다.');
      if(ref.payload!==undefined)insist(canonicalJson(e.payload??{})===canonicalJson(ref.payload),'BACKUP_EVENT_MISMATCH','백업의 이벤트 상세 내용이 일치하지 않습니다.');
    });
    let restoredState=pack.state,restoredEvents=pack.events;
    const a=restoredState.activeAttemptId&&restoredState.attempts[restoredState.activeAttemptId];
    const lesson=restoredState.activeSessionId&&restoredState.sessions.find(s=>s.id===restoredState.activeSessionId);
    const detachedRunning=[activeInterception(restoredState),
      activeRecovery(restoredState)?.runs?.find(x=>x.id===activeRecovery(restoredState)?.activeRunId)]
      .some(x=>x?.timer.phase==='RUNNING');
    if(a?.timer.phase==='RUNNING'||lesson?.phase==='ACTIVE'||detachedRunning){
      requireId(recoveryEventId,'복원 중단 이벤트');validTimestamp(recoveryAt);
      const stopped=reduceCommand(restoredState,{
        type:'RECOVER_INTERRUPTED',eventId:recoveryEventId,at:Math.max(recoveryAt,restoredState.meta.updatedAt),
        payload:{reason:'BACKUP_IMPORT'}
      });
      restoredState=stopped.state;restoredEvents=[...pack.events,stopped.event];
    }
    const now=validTimestamp(this.clock());
    return onTx(this.db,Object.values(STORES),'readwrite',(tx,{done,fail})=>{
      const ls=tx.objectStore(STORES.leases),ss=tx.objectStore(STORES.slots),es=tx.objectStore(STORES.events),cs=tx.objectStore(STORES.checkpoints);
      let l,s,loaded=0;const ready=()=>{if(++loaded!==2)return;try{
        this._checkLease(l,lease,now);insist(!s,'SLOT_OCCUPIED','기존 슬롯 저장이 있어 자동 덮어쓰기를 차단했습니다.');
        ss.add({key:slot,state:restoredState});
        for(const e of restoredEvents)es.add({key:evKey(slot,e.seq),slot,event:e});
        cs.put({key:cpKey(slot,'latest'),slot,revision:restoredState.meta.revision,state:restoredState});
        ls.put({...l,expiresAt:now+LEASE_TTL_MS});done({committed:true,state:clone(restoredState)});
      }catch(e){fail(e);}};
      const lr=ls.get(slot),sr=ss.get(slot);lr.onsuccess=()=>{l=lr.result;ready();};sr.onsuccess=()=>{s=sr.result;ready();};
    });
  }
}
