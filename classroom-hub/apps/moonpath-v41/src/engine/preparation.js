// Opt-in settings for new expeditions. Legacy saves are never upgraded implicitly.
const demand=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'PREPARATION_INVALID'});};
export function normalizePreparation(raw,fallbackSeed=''){
 demand(raw&&raw.version===1,'탐험 준비 규칙 버전이 올바르지 않습니다.');
 const {lessonMinutes,confirmation,participation,membersPerTeam}=raw;
 demand([25,45,60].includes(lessonMinutes),'탐험 시간은25/45/60분입니다.');
 demand(['CAREFUL','STANDARD','QUICK'].includes(confirmation),'진행 확인 수준을 선택하세요.');
 demand(['ROTATION','COOPERATIVE'].includes(participation),'학생 참여 방식을 선택하세요.');
 demand(Number.isInteger(membersPerTeam)&&membersPerTeam>=1&&membersPerTeam<=10,'모둠당 인원은1~10명입니다.');
 demand(typeof raw.seed==='string'&&raw.seed.trim().length<=64,'Seed는64자 이내 문자열입니다.');
 const seed=raw.seed.trim().normalize('NFC')||fallbackSeed.slice(0,64);
 demand(seed.length>0,'저장된 Seed가 없습니다.');
 return {version:1,lessonMinutes,confirmation,participation,membersPerTeam,seed};
}
export function applyPreparation(state,raw){
 const config=normalizePreparation(raw,state.meta.expeditionId);
 state.settings.preparation=config;state.settings.lessonMinutes=config.lessonMinutes;
 state.settings.interception=config.participation==='ROTATION';
 for(const team of state.teams)for(let i=1;i<=config.membersPerTeam;i++){
  const id=`${team.id}-MEMBER-${i}`;
  team.members.push({id,name:`학생 ${i}`,status:'PRESENT',joinedAt:state.meta.createdAt});
  state.participation.memberIds.push(id);
 }
}
export function seedRandomForDraw(state,regionId,teamId){
 const p=state.settings.preparation;if(!p)return Math.random;
 // No timestamps, slot IDs or random attempt IDs: replay depends on actual choices.
 const input=JSON.stringify([p,state.meta.packId,state.meta.packVersion,state.settings.teamCount,state.settings.timerSeconds,
  state.world.themes.map(t=>t.regionIds),regionId,teamId,(state.questions.draws??[]).map(d=>[d.questionId,d.regionId,d.teamId,d.mode])]);
 let h=2166136261;for(let i=0;i<input.length;i++)h=Math.imul(h^input.charCodeAt(i),16777619)>>>0;
 return ()=>{h=(h+0x6D2B79F5)>>>0;let t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function lessonBudget(state,at){
 const p=state.settings.preparation;if(!p)return null;
 const lesson=state.sessions.find(s=>s.id===state.activeSessionId);if(!lesson)return null;
 const elapsedMs=lesson.activeMs+(lesson.phase==='ACTIVE'?Math.max(0,at-lesson.activeSince):0);
 const limitMs=p.lessonMinutes*60_000;
 return {elapsedMs,remainingMs:Math.max(0,limitMs-elapsedMs),reached:elapsedMs>=limitMs,wrapRequested:lesson.wrapRequested===true};
}
