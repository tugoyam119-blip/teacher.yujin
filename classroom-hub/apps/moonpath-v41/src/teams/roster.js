/**
 * PHASE 2-4: Teacher-only roster, attendance and deterministic rotation rules.
 * Pure reducer helpers. No DOM, clock, random or persistence calls.
 * Team/member identity remains stable across edits and transfers. Academic
 * assignment snapshots are attached at the moment of question preparation.
 */
import {insist,requireId,validTimestamp,clone,checkState} from '../engine/model.js';

export const ATTENDANCE_STATES=Object.freeze(['PRESENT','ABSENT','LATE','LEFT_EARLY','INACTIVE']);
export const ROSTER_COMMANDS=Object.freeze(['TEAM_MEMBER_ADDED','TEAM_ATTENDANCE_SET','TEAM_MEMBER_MOVED','TEAM_MEMBER_RENAMED','TEAM_RENAMED']);

const MAX_MEMBERS_PER_TEAM=80;
const safeName=(raw,label)=>{
  insist(typeof raw==='string'&&raw.trim().length>0&&raw.trim().length<=80,'ROSTER_NAME_INVALID',`${label} 이름은 1~80자여야 합니다.`);
  return raw.trim();
};
const findTeam=(state,id)=>{
  requireId(id,'모둠');const t=state.teams.find(t=>t.id===id);
  insist(t,'INVALID_TEAM','존재하지 않는 모둠입니다.');return t;
};
const findMember=(team,id)=>{
  requireId(id,'학생');const member=team.members.find(m=>m.id===id);
  insist(member,'ROSTER_MEMBER_NOT_FOUND','현재 모둠의 학생이 아닙니다.');return member;
};
const status=(value)=>{
  insist(ATTENDANCE_STATES.includes(value),'ATTENDANCE_INVALID','출석 상태는 PRESENT/ABSENT/LATE/LEFT_EARLY/INACTIVE 중 하나여야 합니다.');
  return value;
};

export function ensureParticipation(state){
  // Old PHASE 1/2-3 slot schema 1 remains loadable: this is an additive extension.
  if(!state.participation)state.participation={memberIds:[],rosterChanges:[],assignments:[],nextTeamIndex:0};
  return state.participation;
}
export function canEditRoster(state){
  checkState(state);
  const a=state.activeAttemptId?state.attempts[state.activeAttemptId]:null;
  insist(!a||a.timer.phase==='RESOLVED','ROSTER_CHANGE_DURING_ATTEMPT','문제 준비·진행·답변 제출·판정 대기 중에는 명단을 변경할 수 없습니다.');
  insist(!state.interception?.activeId&&!state.recovery?.activeId,'ROSTER_CHANGE_DURING_ATTEMPT',
    '가로채기·회수미션 진행 중에는 명단을 변경할 수 없습니다.');
  return true;
}

/** Inspect the next team without changing state or requiring a UI. */
export function suggestNextTeam(state){
  checkState(state);
  const initial=state.participation?.nextTeamIndex??0;
  for(let n=0;n<state.teams.length;n++){
    const team=state.teams[(initial+n)%state.teams.length];
    // A team without an imported roster can play in teacher-led mode. A team
    // whose entire *known* roster is absent/late/left must not be auto-picked.
    if(team.members.length===0||team.members.some(m=>m.status==='PRESENT'))return team.id;
  }
  insist(false,'NO_ELIGIBLE_TEAM','참여할 수 있는 모둠이 없습니다. 교사가 출석을 먼저 확인해야 합니다.');
}

const snap=team=>({teamId:team.id,teamName:team.name,rosterVersion:team.rosterVersion,
  members:clone(team.members),representativeCursor:team.representativeCursor});
function compactCursor(team){
  team.representativeCursor=team.members.length?team.representativeCursor%team.members.length:0;
}
/** Every mutation has before/after roster snapshots so previous versions remain reconstructable. */
export function applyRosterCommand(state,type,payload,{eventId,at}={}){
  insist(ROSTER_COMMANDS.includes(type),'ROSTER_COMMAND_INVALID','지원하지 않는 모둠 명령입니다.');
  canEditRoster(state);validTimestamp(at);requireId(eventId,'이벤트');
  insist(payload?.teacherConfirmed===true,'TEACHER_REQUIRED','모둠·명단·출석 변경은 교사 확인이 필요합니다.');
  const changes=ensureParticipation(state);
  let teams=[],targetMemberId=null;
  const note=payload.reason;
  insist(note===undefined||note===null||(typeof note==='string'&&note.length<=1000),'REASON_INVALID','기록 사유는 최대 1000자입니다.');
  if(type==='TEAM_MEMBER_ADDED'){
    const t=findTeam(state,payload.teamId);
    requireId(payload.memberId,'학생');safeName(payload.name,'학생');
    const memberStatus=status(payload.status??'PRESENT');
    insist(memberStatus!=='INACTIVE'&&memberStatus!=='LEFT_EARLY','ATTENDANCE_INVALID','처음 명단에는 재적 학생을 추가하세요.');
    insist(!changes.memberIds.includes(payload.memberId)&&!state.teams.some(team=>team.members.some(m=>m.id===payload.memberId)),
      'ROSTER_MEMBER_DUPLICATE','학생 ID는 원정 전체에서 한 번만 생성해야 합니다.');
    insist(t.members.length<MAX_MEMBERS_PER_TEAM,'ROSTER_LIMIT','한 모둠의 명단은 최대 80명입니다.');
    teams=[t];targetMemberId=payload.memberId;
  }else if(type==='TEAM_MEMBER_MOVED'){
    const src=findTeam(state,payload.fromTeamId),dest=findTeam(state,payload.toTeamId);
    insist(src.id!==dest.id,'ROSTER_MOVE_INVALID','이동 전후 모둠은 달라야 합니다.');
    findMember(src,payload.memberId);
    insist(!dest.members.some(m=>m.id===payload.memberId),'ROSTER_MEMBER_DUPLICATE','같은 모둠에 이미 학생이 존재합니다.');
    insist(dest.members.length<MAX_MEMBERS_PER_TEAM,'ROSTER_LIMIT','이동 대상 모둠의 정원이 가득 찼습니다.');
    teams=[src,dest];targetMemberId=payload.memberId;
  }else if(type==='TEAM_RENAMED'){
    const t=findTeam(state,payload.teamId);const name=safeName(payload.name,'모둠');
    insist(t.name!==name,'ROSTER_UNCHANGED','변경 전후 이름이 같습니다.');teams=[t];
  }else{
    const t=findTeam(state,payload.teamId),m=findMember(t,payload.memberId);
    targetMemberId=m.id;teams=[t];
    if(type==='TEAM_ATTENDANCE_SET'){
      status(payload.status);
      insist(m.status!==payload.status,'ROSTER_UNCHANGED','현재 출석 상태와 같습니다.');
      if(m.status==='LEFT_EARLY'&&payload.status==='PRESENT'){
        insist(typeof note==='string'&&note.trim(),'REASON_REQUIRED','조퇴 후 재입장 사유를 기록해야 합니다.');
      }
      if(payload.status==='INACTIVE')insist(typeof note==='string'&&note.trim(),'REASON_REQUIRED','제외 처리 사유를 기록해야 합니다.');
    }else if(type==='TEAM_MEMBER_RENAMED'){
      const name=safeName(payload.name,'학생');
      insist(m.name!==name,'ROSTER_UNCHANGED','변경 전후 이름이 같습니다.');
    }
  }
  const before=teams.map(snap);
  if(type==='TEAM_MEMBER_ADDED'){
    const t=teams[0];t.members.push({id:payload.memberId,name:payload.name.trim(),status:payload.status??'PRESENT',joinedAt:at});
    changes.memberIds.push(payload.memberId);
  }else if(type==='TEAM_MEMBER_MOVED'){
    const [src,dest]=teams;
    const idx=src.members.findIndex(m=>m.id===payload.memberId);
    const [moving]=src.members.splice(idx,1);
    if(idx<src.representativeCursor)src.representativeCursor--;
    compactCursor(src);
    dest.members.push({...moving,joinedAt:at});compactCursor(dest);
  }else if(type==='TEAM_RENAMED')teams[0].name=payload.name.trim();
  else if(type==='TEAM_MEMBER_RENAMED')findMember(teams[0],payload.memberId).name=payload.name.trim();
  else if(type==='TEAM_ATTENDANCE_SET')findMember(teams[0],payload.memberId).status=payload.status;
  for(const team of teams){team.rosterVersion+=1;compactCursor(team);}
  const after=teams.map(snap);
  changes.rosterChanges.push({eventId,at,type,memberId:targetMemberId,
    before,after,reason:typeof note==='string'?note.trim()||null:null});
}

/** Auto-representative selection, fixed in the same event as question issuance. */
export function assignRepresentative(state,{teamId,attemptId,eventId,at,teamSelection='MANUAL'}={}){
  requireId(attemptId,'문제 시도');requireId(eventId,'이벤트');validTimestamp(at);
  insist(['AUTO','MANUAL'].includes(teamSelection),'TEAM_SELECTION_INVALID','모둠 선택 방식이 올바르지 않습니다.');
  const team=findTeam(state,teamId);
  const activity=ensureParticipation(state);
  if(teamSelection==='AUTO'){
    insist(suggestNextTeam(state)===team.id,'TEAM_TURN_INVALID','자동 순환으로 선택한 모둠이 현재 순서와 다릅니다.');
  }
  insist(!activity.assignments.some(x=>x.attemptId===attemptId),'REPRESENTATIVE_DUPLICATE','이미 대표를 지정한 문제 시도입니다.');
  const members=clone(team.members);
  const before=team.representativeCursor;
  let rep=null;
  if(members.length){
    const size=members.length;
    for(let offset=0;offset<size;offset++){
      const i=(before+offset)%size;
      if(members[i].status==='PRESENT'){
        rep=members[i];team.representativeCursor=(i+1)%size;break;
      }
    }
    insist(rep,'NO_ELIGIBLE_REPRESENTATIVE','해당 모둠에 출석한 대표 후보가 없습니다. 출석 상태를 확인하세요.');
  }
  activity.nextTeamIndex=(state.teams.findIndex(x=>x.id===teamId)+1)%state.teams.length;
  const assignment={teamId:team.id,teamName:team.name,rosterVersion:team.rosterVersion,
    members,representativeMemberId:rep?.id??null,representativeName:rep?.name??null,
    representativeCursorBefore:before,representativeCursorAfter:team.representativeCursor,selectionMode:teamSelection};
  activity.assignments.push({attemptId,eventId,at,assignment:clone(assignment)});
  return assignment;
}

/** Actual solver is separately identified, never inferred from who was representative. */
export function validateSolverIdentity(attempt,memberId){
  if(memberId===null||memberId===undefined)return null;
  requireId(memberId,'실제 해결자');
  insist(attempt.teamAssignment?.members?.some(m=>m.id===memberId),
    'SOLVER_NOT_IN_ORIGINAL_ROSTER','해결 학생은 출제 당시 원 모둠에 있어야 합니다. 다른 모둠의 가로채기는 2-5에서 처리합니다.');
  return memberId;
}
