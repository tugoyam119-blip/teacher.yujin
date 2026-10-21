import {effectiveOriginDecision} from '../corrections/reconcile.js';

// Teacher-only read model. Never mutate a saved state or infer a judgement from an answer suggestion.
export function expeditionJournal(state){
 const attempts=Object.values(state.attempts).sort((a,b)=>a.preparedAt-b.preparedAt).map(a=>({
  id:a.id,questionId:a.questionId,sessionId:a.sessionId,regionId:a.regionId,
  team:state.teams.find(t=>t.id===a.teamId)?.name??a.teamId,
  decision:a.judgement?.teacherConfirmed?effectiveOriginDecision(state,a.id):'PENDING',
  mode:a.drawMode??'NEW',timerPhase:a.timer.phase
 }));
 const counts=rows=>({issued:rows.length,correct:rows.filter(a=>a.decision==='CORRECT').length,
  incorrect:rows.filter(a=>a.decision==='INCORRECT').length,pending:rows.filter(a=>a.decision==='PENDING').length});
 return {
  name:state.meta.expeditionName||`슬롯 ${state.meta.slot} 탐험`,slot:state.meta.slot,revision:state.meta.revision,
  updatedAt:state.meta.updatedAt,totals:counts(attempts),starlight:state.rewards.starlight,keys:state.rewards.keys,
  recoveryPending:state.recovery.pending.filter(r=>r.status!=='INVALIDATED').length,recoveryResolved:state.recovery.resolved.filter(r=>r.status==='RESOLVED').length,
  sessions:state.sessions.map((s,i)=>({number:i+1,id:s.id,phase:s.phase,activeMs:s.activeMs,...counts(attempts.filter(a=>a.sessionId===s.id))})),
  teams:state.teams.map(t=>({id:t.id,name:t.name,contribution:t.contribution})),attempts,
  audit:state.audit.map(a=>({seq:a.seq,type:a.type,at:a.at})),corrections:state.corrections.records.length
 };
}
export const decisionLabel=value=>({CORRECT:'정답',INCORRECT:'오답',PENDING:'교사 판정 대기'}[value]??value);
// Quote CSV cells and neutralize spreadsheet formula injection, including leading whitespace/control characters.
export function csvCell(value){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function journalCsv(report){
 const rows=[['탐험',report.name],['슬롯',report.slot],['저장 버전',report.revision],
  ['출제',report.totals.issued,'정답',report.totals.correct,'오답',report.totals.incorrect,'판정 대기',report.totals.pending],
  ['별빛',report.starlight,'열쇠',report.keys],[],['문항 ID','차시 ID','지역 ID','모둠','교사 확정 판정','타이머 상태'],
  ...report.attempts.map(a=>[a.questionId,a.sessionId,a.regionId,a.team,decisionLabel(a.decision),a.timerPhase]),
  [],['모둠','누적 공헌도'],...report.teams.map(t=>[t.name,t.contribution]),
  [],['차시','상태','저장된 활동시간(ms)','출제','정답','오답','판정 대기'],
  ...report.sessions.map(s=>[s.number,s.phase,s.activeMs,s.issued,s.correct,s.incorrect,s.pending]),
  [],['감사 순번','사건 유형','시각(ms)'],...report.audit.map(a=>[a.seq,a.type,a.at])];
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
