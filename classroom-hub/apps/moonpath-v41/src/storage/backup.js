import {checkState,clone,EngineError,insist,ENGINE_VERSION,SCHEMA_VERSION,canonicalJson} from '../engine/model.js';
export const BACKUP_FORMAT='moonpath-v411-backup-v1';

export async function sha256(utf8){
  insist(globalThis.crypto?.subtle,'CRYPTO_UNAVAILABLE','SHA-256 Web Crypto API가 필요합니다.');
  const buf=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(utf8));
  return [...new Uint8Array(buf)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function makeBackup(stateAndEvents,{exportedAt=Date.now()}={}){
  const {state,events}=stateAndEvents;checkState(state);
  insist(Array.isArray(events)&&events.length===state.meta.revision,'EVENT_COUNT','이벤트 로그가 누락되었습니다.');
  events.forEach((e,i)=>{const original=state.eventLog[i];
    insist(e.seq===original.seq&&e.eventId===original.eventId&&e.type===original.type&&e.at===original.at,'BACKUP_EVENT_MISMATCH','이벤트 로그 내용이 상태와 다릅니다.');
    if(original.payload!==undefined)insist(canonicalJson(e.payload??{})===canonicalJson(original.payload),'BACKUP_EVENT_MISMATCH','이벤트 상세 내용이 상태와 다릅니다.');
  });
  const payload={format:BACKUP_FORMAT,schemaVersion:SCHEMA_VERSION,engineVersion:ENGINE_VERSION,slot:state.meta.slot,expeditionId:state.meta.expeditionId,exportedAt,state:clone(state),events:clone(events)};
  return {...payload,integrity:{algorithm:'SHA-256',hex:await sha256(JSON.stringify(payload))}};
}
export async function verifyBackup(input){
  const full=typeof input==='string'?JSON.parse(input):clone(input);
  insist(full?.integrity?.algorithm==='SHA-256'&&/^[a-f0-9]{64}$/.test(full.integrity.hex),'BACKUP_INTEGRITY_MISSING','백업 무결성 정보가 없습니다.');
  const {integrity,...payload}=full;
  const actual=await sha256(JSON.stringify(payload));
  insist(actual===integrity.hex,'BACKUP_CHECKSUM_INVALID','백업 파일이 변조 또는 손상되었습니다.');
  insist(payload.format===BACKUP_FORMAT,'BACKUP_FORMAT','다른 종류의 백업 파일입니다.');
  insist(payload.schemaVersion===SCHEMA_VERSION&&payload.engineVersion===ENGINE_VERSION,'BACKUP_VERSION','엔진 및 백업 스키마 버전이 호환되지 않습니다.');
  checkState(payload.state);
  insist(payload.slot===payload.state.meta.slot&&payload.expeditionId===payload.state.meta.expeditionId,'BACKUP_ID_MISMATCH','원정 ID/슬롯이 일치하지 않습니다.');
  insist(Array.isArray(payload.events)&&payload.events.length===payload.state.meta.revision,'EVENT_COUNT','이벤트 로그의 개수가 다릅니다.');
  payload.events.forEach((e,i)=>{
    const original=payload.state.eventLog[i];
    insist(e.seq===i+1&&e.eventId===original.eventId&&e.type===original.type&&e.at===original.at,'BROKEN_SEQUENCE','이벤트 ID·유형·시각 또는 순번이 일치하지 않습니다.');
    if(original.payload!==undefined)insist(canonicalJson(e.payload??{})===canonicalJson(original.payload),'BROKEN_SEQUENCE','이벤트 상세 내용이 일치하지 않습니다.');
  });
  return {state:payload.state,events:payload.events};
}
