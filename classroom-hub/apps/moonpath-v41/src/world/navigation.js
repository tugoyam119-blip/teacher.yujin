import {insist} from '../engine/model.js';

export function hasLiveMission(s){
 return !!(s.activeAttemptId&&s.attempts[s.activeAttemptId]?.timer.phase!=='RESOLVED')||!!s.interception.activeId||!!s.recovery.activeId;
}
export function themeUnlocked(s,themeId){
 const index=s.world.themes.findIndex(t=>t.id===themeId);
 return index>=0&&(index===0||s.world.regions[s.world.themes[index-1].regionIds[4]].status==='COMPLETED');
}
export function applyWorldView(s,p){
 insist(!hasLiveMission(s),'ATTEMPT_ACTIVE','진행 중인 문항·가로채기·회수를 먼저 마쳐야 책장과 갈림길로 이동할 수 있습니다.');
 insist(p.view==='BOOKSHELF'||p.view==='FORK','WORLD_VIEW_INVALID','책장 또는 갈림길을 선택하세요.');
 if(p.view==='FORK')insist(themeUnlocked(s,p.themeId),'THEME_LOCKED','앞 테마의 마지막 지역을 먼저 완료하세요.');
 s.world.navigation={view:p.view,themeId:p.view==='FORK'?p.themeId:null};s.screen=p.view;
}
export function regionOptions(s,themeId){
 const theme=s.world.themes.find(t=>t.id===themeId);insist(theme,'THEME_INVALID','공식 테마가 아닙니다.');
 const current=s.world.currentRegionId,inProgress=current&&s.world.regions[current].status==='IN_PROGRESS';
 return theme.regionIds.map((id,index)=>{
  const status=s.world.regions[id].status,continuing=id===current&&status==='IN_PROGRESS';
  const branch=index===1?'LEFT':index===2?'RIGHT':null;
  const extra=!!branch&&s.world.regions[theme.regionIds[4]].status==='COMPLETED'&&s.world.mainRouteChoice[themeId]!==branch;
  const initial=themeId===s.world.themes[0].id&&index===0&&!current&&!s.questions.draws.length;
  const extraActive=s.world.additionalExplorationReturn;
  const allowed=themeUnlocked(s,themeId)&&!hasLiveMission(s)&&status!=='COMPLETED'&&
   (!inProgress||continuing)&&(!extraActive||extraActive.regionId===id)&&
   (initial||status==='AVAILABLE'||continuing);
  const visited=(s.world.visitHistory??[]).some(v=>v.regionId===id)||current===id;
  const reason=hasLiveMission(s)?'진행 중인 문항을 먼저 마쳐 주세요.':status==='COMPLETED'?'완료 결과를 다시 볼 수 있습니다.':!themeUnlocked(s,themeId)?'앞 테마의 마지막 지역을 먼저 완료하세요.':extraActive&&extraActive.regionId!==id?'추가 탐험을 마치고 원래 위치로 먼저 복귀하세요.':inProgress&&!continuing?'현재 진행 중인 지역을 먼저 완료하세요.':allowed?(continuing?'저장된 지역을 이어갑니다.':extra?'주경로를 유지하는 미방문 분기 추가 탐험입니다.':'교사가 진입을 확인하면 저장합니다.'):branch&&s.world.mainRouteChoice[themeId]&&s.world.mainRouteChoice[themeId]!==branch?'선택하지 않은 길입니다. 이 테마의 주경로 완료 후 추가 탐험으로 열립니다.':'선행 지역을 먼저 완료하세요.';
  return {id,status,continuing,mode:extra?'EXTRA':'MAIN',allowed,visited,reason,canViewResult:status==='COMPLETED'&&(s.world.results??[]).some(r=>r.regionId===id)};
 });
}
