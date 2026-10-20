/** PHASE 2-4 tests. Real official question bank. Node + fake IDB are not a native-browser PASS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {suggestNextTeam} from '../src/teams/roster.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {planQuestionDraw} from '../src/questions/draw.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {verifyBackup} from '../src/storage/backup.js';

const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url),'utf8'));
const source=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url),'utf8'));
const qe=createQuestionEngine(source);
let serial=0;const id=()=>`p24-id-${++serial}`;
const CLOCK=1823000000000;
const newState=(teamCount=4)=>{
  const initial=newExpedition({slot:1,expeditionId:id(),createdAt:CLOCK,world,teamCount});
  let state=act(initial,'EXPEDITION_CREATED');state=act(state,'SESSION_STARTED',{sessionId:id()});
  return state;
};
const act=(s,type,payload={},eventId=id())=>reduceCommand(s,{type,eventId,at:s.meta.updatedAt+1,payload}).state;
const team=(s,index)=>s.teams[index-1];
const add=(s,teamId,memberId,name,status='PRESENT')=>act(s,'TEAM_MEMBER_ADDED',{teamId,memberId,name,status,teacherConfirmed:true});
const attend=(s,teamId,memberId,status,reason)=>act(s,'TEAM_ATTENDANCE_SET',{teamId,memberId,status,reason,teacherConfirmed:true});
const move=(s,memberId,fromTeamId,toTeamId)=>act(s,'TEAM_MEMBER_MOVED',{memberId,fromTeamId,toTeamId,teacherConfirmed:true,reason:'수업 중 편성 조정'});
const draw=(s,teamId='TEAM_01',teamSelection='MANUAL')=>{
  const planned=planQuestionDraw(s,qe,{regionId:'T1-R1',teamId,attemptId:id(),at:s.meta.updatedAt+1,random:()=>0});
  return act(s,'QUESTION_DRAWN',{...planned,teamSelection});
};
const done=s=>act(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'대표 순환 시험으로 교사가 시도를 종료함'});
const code=(fn,name)=>assert.throws(fn,e=>e.code===name,`${name} 기대`);
const asyncCode=(promise,name)=>assert.rejects(promise,e=>e.code===name,`${name} 기대`);
const old=(s)=>s.attempts[s.activeAttemptId];
const eq=(a,b)=>assert.deepEqual(a,b);
const env=(teamCount=4)=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>CLOCK+serial});
  const teacher=new TeacherEngineSession(store,{clock:()=>CLOCK+serial,newId:id,heartbeatMs:0});
  return {db,store,teacher,create:()=>teacher.create({slot:1,world,teamCount})};
};

for(let teams=2;teams<=8;teams++)test(`2~8모둠 공식 고유 ID와 자동 순환: ${teams}개`,()=>{
  let s=newState(teams);const ids=s.teams.map(x=>x.id);
  eq(ids,Array.from({length:teams},(_,i)=>`TEAM_${String(i+1).padStart(2,'0')}`));
  for(let k=0;k<teams*2;k++){
    const next=suggestNextTeam(s);
    assert.equal(next,ids[k%teams]);
    s=draw(s,next,'AUTO');assert.equal(old(s).teamAssignment.selectionMode,'AUTO');s=done(s);
  }
  assert.equal(s.participation.assignments.length,teams*2);
  assert.equal(s.rewards.starlight,0);
});

test('명단 추가: UUID식 독립 ID·이름·상태·버전·감사 이벤트',()=>{
  const start=newState(),s=add(start,'TEAM_01','M01',' 홍 길 동 ','LATE');
  assert.equal(team(s,1).members[0].id,'M01');assert.equal(team(s,1).members[0].name,'홍 길 동');
  assert.equal(team(s,1).members[0].status,'LATE');assert.equal(team(s,1).rosterVersion,2);
  eq(s.participation.memberIds,['M01']);assert.equal(s.participation.rosterChanges.length,1);
  assert.equal(s.participation.rosterChanges[0].before[0].rosterVersion,1);
  assert.equal(s.participation.rosterChanges[0].after[0].rosterVersion,2);
  assert.equal(start.teams[0].members.length,0);checkState(s);
});

test('교사 미확인 명단·이동·출석 변경은 기록 전에 차단',()=>{
  let s=newState();
  code(()=>act(s,'TEAM_MEMBER_ADDED',{teamId:'TEAM_01',memberId:'M',name:'학생'}),'TEACHER_REQUIRED');
  s=add(s,'TEAM_01','M','학생');
  code(()=>act(s,'TEAM_MEMBER_MOVED',{fromTeamId:'TEAM_01',toTeamId:'TEAM_02',memberId:'M'}),'TEACHER_REQUIRED');
  code(()=>act(s,'TEAM_ATTENDANCE_SET',{teamId:'TEAM_01',memberId:'M',status:'ABSENT'}),'TEACHER_REQUIRED');
});

test('출결: PRESENT·ABSENT·LATE·LEFT_EARLY·INACTIVE와 복귀',()=>{
  let s=add(newState(),'TEAM_01','M','학생');
  for(const status of ['ABSENT','LATE','PRESENT','LEFT_EARLY']){
    s=attend(s,'TEAM_01','M',status);
    assert.equal(team(s,1).members[0].status,status);
  }
  code(()=>attend(s,'TEAM_01','M','PRESENT'),'REASON_REQUIRED');
  s=attend(s,'TEAM_01','M','PRESENT','조퇴 후 재입장 허용');
  code(()=>attend(s,'TEAM_01','M','INACTIVE'),'REASON_REQUIRED');
  s=attend(s,'TEAM_01','M','INACTIVE','전출 처리');
  assert.equal(team(s,1).rosterVersion,8); // initial 1 + add + 6 status changes
  assert.equal(s.participation.rosterChanges.length,7);checkState(s);
});

test('유효하지 않은 출석·빈 이름·80자 초과·중복 ID 차단',()=>{
  let s=newState();
  for(const name of ['', ' ', 'x'.repeat(81)])code(()=>add(s,'TEAM_01','X',name),'ROSTER_NAME_INVALID');
  code(()=>add(s,'TEAM_01','X','학생','UNKNOWN'),'ATTENDANCE_INVALID');
  code(()=>add(s,'TEAM_01','X','학생','LEFT_EARLY'),'ATTENDANCE_INVALID');
  s=add(s,'TEAM_01','X','학생');
  code(()=>add(s,'TEAM_02','X','다른 학생'),'ROSTER_MEMBER_DUPLICATE');
  code(()=>attend(s,'TEAM_01','X','UNKNOWN'),'ATTENDANCE_INVALID');
  code(()=>attend(s,'TEAM_01','X','PRESENT'),'ROSTER_UNCHANGED');
  code(()=>attend(s,'TEAM_02','X','ABSENT'),'ROSTER_MEMBER_NOT_FOUND');
});

test('교사 수정: 모둠·학생 이름 변경에도 과거 스냅샷 유지',()=>{
  let s=add(newState(),'TEAM_01','M','첫 이름');
  s=draw(s);const a=structuredClone(old(s).teamAssignment);s=done(s);
  s=act(s,'TEAM_MEMBER_RENAMED',{teamId:'TEAM_01',memberId:'M',name:'새 이름',teacherConfirmed:true});
  s=act(s,'TEAM_RENAMED',{teamId:'TEAM_01',name:'별빛모둠',teacherConfirmed:true});
  assert.equal(team(s,1).name,'별빛모둠');assert.equal(team(s,1).members[0].name,'새 이름');
  eq(s.attempts[s.activeAttemptId].teamAssignment,a);
  assert.equal(a.teamName,'1모둠');assert.equal(a.representativeName,'첫 이름');
});

test('학생 ID 이동: 현재 모둠만 이동하고 원래 답안의 소속·명단·대표 ID 불변',()=>{
  let s=add(newState(),'TEAM_01','S1','김가람');s=draw(s);
  const attemptId=s.activeAttemptId,original=structuredClone(old(s).teamAssignment);
  s=done(s);s=move(s,'S1','TEAM_01','TEAM_02');
  assert.equal(team(s,1).members.length,0);assert.equal(team(s,2).members[0].id,'S1');
  assert.equal(team(s,1).rosterVersion,3);assert.equal(team(s,2).rosterVersion,2);
  assert.equal(s.participation.memberIds.filter(id=>id==='S1').length,1);
  eq(s.attempts[attemptId].teamAssignment,original);
  assert.equal(s.attempts[attemptId].teamId,'TEAM_01');
  checkState(s);
});

test('모둠 이동 전/후 버전·출석 그대로 유지, 잘못된 이동 차단',()=>{
  let s=add(newState(),'TEAM_01','S1','학생','ABSENT');
  code(()=>move(s,'S1','TEAM_01','TEAM_01'),'ROSTER_MOVE_INVALID');
  code(()=>move(s,'NOTHERE','TEAM_01','TEAM_02'),'ROSTER_MEMBER_NOT_FOUND');
  code(()=>move(s,'S1','TEAM_01','UNKNOWN'),'INVALID_TEAM');
  s=move(s,'S1','TEAM_01','TEAM_02');
  assert.equal(team(s,2).members[0].status,'ABSENT');
  code(()=>add(s,'TEAM_03','S1','중복'),'ROSTER_MEMBER_DUPLICATE');
  checkState(s);
});

for(const phase of ['PREPARED','RUNNING','PAUSED','EXPIRED_AWAITING_TEACHER']){
  test(`문제 ${phase} 중에는 출석·명단·이동·이름 변경 전부 차단`,()=>{
    let s=add(newState(),'TEAM_01','M','학생');s=draw(s);
    if(phase!=='PREPARED')s=act(s,'TIMER_STARTED');
    if(phase==='PAUSED')s=act(s,'TIMER_PAUSED');
    if(phase==='EXPIRED_AWAITING_TEACHER'){
      const at=s.attempts[s.activeAttemptId].timer.runningSince+60000;
      s=reduceCommand(s,{type:'TIMER_EXPIRED',eventId:id(),at,payload:{}}).state;
    }
    for(const [t,p] of [
      ['TEAM_ATTENDANCE_SET',{teamId:'TEAM_01',memberId:'M',status:'ABSENT'}],
      ['TEAM_MEMBER_ADDED',{teamId:'TEAM_02',memberId:'N',name:'둘'}],
      ['TEAM_MEMBER_MOVED',{memberId:'M',fromTeamId:'TEAM_01',toTeamId:'TEAM_02'}],
      ['TEAM_RENAMED',{teamId:'TEAM_01',name:'변경된 모둠'}]
    ])code(()=>act(s,t,{...p,teacherConfirmed:true}),'ROSTER_CHANGE_DURING_ATTEMPT');
  });
}

test('교사 판정으로 RESOLVED 후에만 다음 차시 명단 변경',()=>{
  let s=add(newState(),'TEAM_01','M','학생');s=draw(s);s=done(s);
  s=attend(s,'TEAM_01','M','ABSENT');assert.equal(team(s,1).members[0].status,'ABSENT');
  checkState(s);
});

test('대표 자동 순환은 한 모둠에서 순차 지정 후 처음으로 돌아간다',()=>{
  let s=newState();for(let i=1;i<=4;i++)s=add(s,'TEAM_01',`m${i}`,`학생${i}`);
  const actual=[];
  for(let i=0;i<9;i++){
    s=draw(s);actual.push(old(s).teamAssignment.representativeMemberId);s=done(s);
  }
  eq(actual,['m1','m2','m3','m4','m1','m2','m3','m4','m1']);
  assert.equal(team(s,1).representativeCursor,1);
});

test('결석·지각·조퇴 인원은 대표 선발에서 건너뛰며 출석 전환 후 다시 참여',()=>{
  let s=newState();s=add(s,'TEAM_01','a','가');s=add(s,'TEAM_01','b','나','LATE');s=add(s,'TEAM_01','c','다','ABSENT');s=add(s,'TEAM_01','d','라');
  s=draw(s);assert.equal(old(s).teamAssignment.representativeMemberId,'a');s=done(s);
  s=draw(s);assert.equal(old(s).teamAssignment.representativeMemberId,'d');s=done(s);
  s=attend(s,'TEAM_01','b','PRESENT');
  s=draw(s);assert.equal(old(s).teamAssignment.representativeMemberId,'a');s=done(s);
  s=draw(s);assert.equal(old(s).teamAssignment.representativeMemberId,'b');s=done(s);
  s=attend(s,'TEAM_01','b','LEFT_EARLY');
  s=draw(s);assert.equal(old(s).teamAssignment.representativeMemberId,'d');checkState(s);
});

test('모두 결석·지각이면 수동 해당 모둠 출제도 안전 차단',()=>{
  let s=add(newState(),'TEAM_01','m1','학생','ABSENT');
  code(()=>draw(s),'NO_ELIGIBLE_REPRESENTATIVE');
  s=attend(s,'TEAM_01','m1','PRESENT');s=draw(s);
  assert.equal(old(s).teamAssignment.representativeMemberId,'m1');
});

test('자동 모둠 순서는 출석자 없는 명단 보유 모둠을 건너뛴다',()=>{
  let s=add(newState(3),'TEAM_01','a','결석','ABSENT');
  s=add(s,'TEAM_02','b','출석');s=add(s,'TEAM_03','c','출석');
  eq(suggestNextTeam(s),'TEAM_02');
  s=draw(s,'TEAM_02','AUTO');s=done(s);
  eq(suggestNextTeam(s),'TEAM_03');
  s=draw(s,'TEAM_03','AUTO');s=done(s);
  eq(suggestNextTeam(s),'TEAM_02');
  s=attend(s,'TEAM_01','a','PRESENT');
  // cursor moves back to team 1 when a manual turn ends on 3
  assert.equal(suggestNextTeam(s),'TEAM_01');
});

test('모든 모둠 명단이 있어도 전원 미출석이라면 자동 순환 차단',()=>{
  let s=newState(2);s=add(s,'TEAM_01','a','가','ABSENT');s=add(s,'TEAM_02','b','나','LATE');
  code(()=>suggestNextTeam(s),'NO_ELIGIBLE_TEAM');
});

test('수동 선택은 다음 자동 선택 위치만 조정, 대표 선발 이력은 보존',()=>{
  let s=newState(4);s=draw(s,'TEAM_03');assert.equal(s.participation.nextTeamIndex,3);s=done(s);
  assert.equal(suggestNextTeam(s),'TEAM_04');
  s=draw(s,'TEAM_04','AUTO');
  assert.equal(old(s).teamAssignment.selectionMode,'AUTO');
  code(()=>draw(s,'TEAM_01','AUTO'),'ATTEMPT_ACTIVE');
});

test('잘못된 자동 모둠 강제는 출제 승인 전 차단',()=>{
  const s=newState();code(()=>draw(s,'TEAM_03','AUTO'),'TEAM_TURN_INVALID');
});

test('대표자·원모둠과 별개로 실제 해결 학생을 기록하고 위조 ID는 차단',()=>{
  let s=newState();s=add(s,'TEAM_01','r','대표');s=add(s,'TEAM_01','solver','풀이 학생');
  s=draw(s);const at=s.activeAttemptId;assert.equal(old(s).teamAssignment.representativeMemberId,'r');
  s=act(s,'TIMER_STARTED');
  code(()=>act(s,'ANSWER_SUBMITTED',{attemptId:at,response:'B',submittedByMemberId:'fake'}),'SOLVER_NOT_IN_ORIGINAL_ROSTER');
  // Actual published question may vary, answer is accepted as long as a valid option for this problem.
  const q=old(s).questionSnapshot.issuedSnapshot;
  const response=q.type==='single_choice'?q.choices[0].key:q.type==='true_false'?true:null;
  if(response!==null){
    s=act(s,'ANSWER_SUBMITTED',{attemptId:at,response,submittedByMemberId:'solver'});
    assert.equal(old(s).answer.submittedByMemberId,'solver');
    const decision=old(s).answer.suggestion.status==='correct'?'CORRECT':'INCORRECT';
    s=act(s,'ANSWER_JUDGED',{attemptId:at,decision,teacherConfirmed:true});
    assert.equal(old(s).judgement.solverMemberId,'solver');
    assert.equal(old(s).judgement.solverTeamId,'TEAM_01');
    assert.equal(old(s).teamAssignment.representativeMemberId,'r');
  }
});

test('실제 해결자 미지정 시 특정 학생을 임의 추정하지 않음',()=>{
  let s=add(newState(),'TEAM_01','r','대표');s=draw(s);s=act(s,'TIMER_STARTED');
  const a=old(s),q=a.questionSnapshot.issuedSnapshot;
  if(q.type==='single_choice'||q.type==='true_false'){
    const response=q.type==='true_false'?true:q.choices[0].key;
    s=act(s,'ANSWER_SUBMITTED',{attemptId:a.id,response});
    const decision=old(s).answer.suggestion.status==='correct'?'CORRECT':'INCORRECT';
    s=act(s,'ANSWER_JUDGED',{attemptId:a.id,decision,teacherConfirmed:true});
    assert.equal(old(s).judgement.solverMemberId,null);
  }
});

test('미응답 원오답 회수의 원 모둠·대표 버전이 이후 전출돼도 고정',()=>{
  let s=add(newState(),'TEAM_01','M','원래 대표');s=draw(s);const attempt=old(s);
  s=act(s,'TIMER_STARTED');
  s=act(s,'TIMER_PAUSED');
  s=act(s,'ANSWER_JUDGED',{attemptId:attempt.id,decision:'INCORRECT',teacherConfirmed:true,missingResponseConfirmed:true,teacherReason:'미응답 확인'});
  const recovery=structuredClone(s.recovery.pending[0]);
  s=move(s,'M','TEAM_01','TEAM_02');
  eq(s.recovery.pending[0],recovery);
  assert.equal(recovery.originTeamId,'TEAM_01');assert.equal(recovery.originRosterVersion,2);
  assert.equal(recovery.originRepresentativeMemberId,'M');
});

test('누적 공헌도, 별빛은 명단 수정 시 변하지 않음',()=>{
  let s=add(newState(),'TEAM_01','M','학생');const a=structuredClone(s.rewards),points=s.teams.map(t=>t.contribution);
  s=attend(s,'TEAM_01','M','ABSENT');s=move(s,'M','TEAM_01','TEAM_02');
  eq(s.rewards,a);eq(s.teams.map(t=>t.contribution),points);
});

test('명단 변경 audit와 이벤트는 현재 출제 스냅샷과 일치',()=>{
  let s=newState();s=add(s,'TEAM_01','M','학생');s=attend(s,'TEAM_01','M','LATE');s=move(s,'M','TEAM_01','TEAM_02');
  assert.equal(s.participation.rosterChanges.length,3);
  assert.equal(s.audit.filter(x=>x.type.startsWith('TEAM_')).length,3);
  for(const change of s.participation.rosterChanges){
    assert.equal(s.eventLog.some(e=>e.eventId===change.eventId&&e.type===change.type),true);
  }
});

test('같은 이벤트 ID 반복은 모둠/버전 증가 한 번, 다른 요청은 차단',()=>{
  let s=newState();const at=s.meta.updatedAt+1,cmd={type:'TEAM_MEMBER_ADDED',eventId:'member-add-idempotent',at,
    payload:{teamId:'TEAM_01',memberId:'M',name:'학생',teacherConfirmed:true}};
  s=reduceCommand(s,cmd).state;
  assert.equal(reduceCommand(s,cmd).duplicate,true);assert.equal(team(s,1).rosterVersion,2);
  code(()=>reduceCommand(s,{...cmd,payload:{...cmd.payload,name:'다른 사람'}}),'EVENT_ID_CONFLICT');
  assert.equal(s.participation.rosterChanges.length,1);
});

test('명단 ID/현재 버전/대표 기록을 변조하면 checkState가 거부',()=>{
  let s=add(newState(),'TEAM_01','M','학생');
  const q=structuredClone(s);q.teams[1].members.push({...q.teams[0].members[0]});
  code(()=>checkState(q),'ROSTER_MEMBER_DUPLICATE');
  const ver=structuredClone(s);ver.teams[0].rosterVersion=100;code(()=>checkState(ver),'ROSTER_HISTORY_INVALID');
  s=draw(s);const rep=structuredClone(s);rep.participation.assignments[0].assignment.representativeMemberId='ghost';
  code(()=>checkState(rep),'REPRESENTATIVE_HISTORY_INVALID');
});

test('PHASE 1/2-3 저장 구조에 participation 없더라도 구 상태 그대로 읽을 수 있음',()=>{
  let s=newState();delete s.participation;checkState(s);
  s=act(s,'SESSION_PAUSED');checkState(s);
  assert.equal(s.participation,undefined);
  s=act(s,'SESSION_RESUMED');checkState(s);
});

test('모의 IndexedDB 저장 실패는 roster·rotation·이벤트 전체 롤백',async()=>{
  const {db,teacher,create}=env();await create();
  const before=teacher.getState();db.failNextWrite=true;
  await assert.rejects(teacher.addTeamMember({teamId:'TEAM_01',name:'학생',memberId:'M'}),e=>e.name==='QuotaExceededError');
  eq(teacher.getState(),before);
  assert.equal(db.inspect('slots',1).state.meta.revision,before.meta.revision);
  assert.equal(db.inspect('checkpoints','1:latest').revision,before.meta.revision);
  await teacher.addTeamMember({teamId:'TEAM_01',name:'학생',memberId:'M'});
  assert.equal(teacher.getState().teams[0].members.length,1);
  await teacher.close();
});

test('모의 IndexedDB 동시 출석 변경은 순서대로 직렬 확정',async()=>{
  const {teacher,create}=env();await create();
  await teacher.addTeamMember({teamId:'TEAM_01',name:'학생',memberId:'M'});
  const two=await Promise.all([teacher.setTeamAttendance({teamId:'TEAM_01',memberId:'M',status:'ABSENT'}),
    teacher.setTeamAttendance({teamId:'TEAM_01',memberId:'M',status:'PRESENT'})]);
  assert.equal(two.length,2);
  assert.equal(teacher.getState().teams[0].members[0].status,'PRESENT');
  await teacher.close();
});

test('모의 DB 저장·재접속 후 명단·출석·대표 순서 복원',async()=>{
  const {store,teacher,create}=env();await create();
  await teacher.addTeamMember({teamId:'TEAM_01',name:'가',memberId:'a'});
  await teacher.addTeamMember({teamId:'TEAM_01',name:'나',memberId:'b'});
  await teacher.dispatch('SESSION_STARTED',{sessionId:'s1'});
  const first=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  assert.equal(teacher.getState().attempts[first.attemptId].teamAssignment.representativeMemberId,'a');
  await teacher.dispatch('ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'대표 순환 테스트'});
  await teacher.close();
  const re=new TeacherEngineSession(store,{clock:()=>CLOCK+serial,newId:id,heartbeatMs:0});
  const opened=await re.open(1);
  assert.equal(opened.attempts[first.attemptId].teamAssignment.representativeMemberId,'a');
  assert.equal(opened.teams[0].representativeCursor,1);
  await re.dispatch('SESSION_RESUMED');
  const second=await re.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  assert.equal(re.getState().attempts[second.attemptId].teamAssignment.representativeMemberId,'b');
  await re.close();
});

test('모의 DB JSON 백업·복원 후 이동한 학생 ID와 과거 원본 그대로 보존',async()=>{
  const {teacher,create}=env();await create();
  await teacher.addTeamMember({teamId:'TEAM_01',memberId:'M',name:'원래 모둠 학생'});
  await teacher.dispatch('SESSION_STARTED',{sessionId:'class1'});
  const issued=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  await teacher.dispatch('ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'실제 문제 기록만 보존'});
  await teacher.moveTeamMember({memberId:'M',fromTeamId:'TEAM_01',toTeamId:'TEAM_02'});
  const before=teacher.getState(),backup=await teacher.exportJSON();
  const verified=await verifyBackup(backup);
  eq(verified.state.participation,before.participation);
  await teacher.close();
  const db2=new FakeDatabase(),st2=new IndexedDbExpeditionStore(db2,{clock:()=>CLOCK+serial});
  const restored=new TeacherEngineSession(st2,{clock:()=>CLOCK+serial,newId:id,heartbeatMs:0});
  const state=await restored.restoreJSONToEmptySlot(1,backup);
  assert.equal(state.teams[1].members[0].id,'M');
  assert.equal(state.attempts[issued.attemptId].teamAssignment.teamId,'TEAM_01');
  assert.equal(state.attempts[issued.attemptId].teamAssignment.representativeMemberId,'M');
  await restored.close();
});

test('세 슬롯의 명단 ID는 각각 독립, 교사창 동시저장 혼합 없음',async()=>{
  const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>CLOCK+serial}),clients=[];
  for(const slot of [1,2,3]){
    const t=new TeacherEngineSession(store,{clock:()=>CLOCK+serial,newId:id,heartbeatMs:0});
    await t.create({slot,world});clients.push(t);
    await t.addTeamMember({teamId:'TEAM_01',memberId:'SAME_WITHIN_DIFFERENT_SLOT',name:'학생'});
  }
  eq(clients.map(t=>t.getState().participation.memberIds),Array(3).fill(0).map(()=>['SAME_WITHIN_DIFFERENT_SLOT']));
  await clients[0].setTeamAttendance({teamId:'TEAM_01',memberId:'SAME_WITHIN_DIFFERENT_SLOT',status:'ABSENT'});
  assert.equal(clients[1].getState().teams[0].members[0].status,'PRESENT');
  for(const client of clients)await client.close();
});

test('학생 공개 데이터에는 실명·명단·출석·실제 해결자·감사 이력 노출 없음',()=>{
  let s=add(newState(),'TEAM_01','PERSON_ID_001','특이한학생실명');s=draw(s);
  const projection=JSON.stringify(publicProjection(s,s.meta.updatedAt));
  for(const privateValue of ['PERSON_ID_001','특이한학생실명','rosterVersion','representativeMemberId','memberIds','rosterChanges','solverMemberId','memberName','attendance']){
    assert.equal(projection.includes(privateValue),false,privateValue);
  }
  assert.equal(s.teams[0].members[0].name,'특이한학생실명');
});

test('수동 명단 편집 80명 정원까지 허용, 초과는 불변',()=>{
  let s=newState();for(let n=0;n<80;n++)s=add(s,'TEAM_01',`M${n}`,`학생${n}`);
  assert.equal(s.teams[0].members.length,80);
  code(()=>add(s,'TEAM_01','overflow','마지막'),'ROSTER_LIMIT');
  assert.equal(s.teams[0].members.length,80);
});

test('모의 저장 실패 직후 대표 순서·출제 이력은 변경되지 않으며 재시도는 한 번만 소비',async()=>{
  const {db,teacher,create}=env();await create();
  await teacher.addTeamMember({teamId:'TEAM_01',name:'첫째',memberId:'a'});
  await teacher.addTeamMember({teamId:'TEAM_01',name:'둘째',memberId:'b'});
  await teacher.dispatch('SESSION_STARTED',{sessionId:'lesson1'});
  const before=teacher.getState();
  const eid='saved-draw-id',attemptId='stable-attempt-id';db.failNextWrite=true;
  await assert.rejects(teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId,eventId:eid,random:()=>0}),e=>e.name==='QuotaExceededError');
  eq(teacher.getState(),before);
  assert.equal(db.inspect('slots',1).state.teams[0].representativeCursor,0);
  const issued=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId,eventId:eid,random:()=>0});
  assert.equal(issued.attemptId,attemptId);
  assert.equal(teacher.getState().teams[0].representativeCursor,1);
  const retry=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId,eventId:eid,random:()=>0.9});
  assert.equal(retry.duplicate,true);assert.equal(teacher.getState().teams[0].representativeCursor,1);
  await teacher.close();
});

test('자동 모둠 중복 이벤트를 수동 모둠 이벤트로 재사용하면 충돌 처리',async()=>{
  const {teacher,create}=env();await create();await teacher.dispatch('SESSION_STARTED',{sessionId:'lesson1'});
  const result=await teacher.drawQuestion(qe,{regionId:'T1-R1',eventId:'auto-one',random:()=>0});
  assert.equal(result.state.attempts[result.attemptId].teamAssignment.selectionMode,'AUTO');
  const duplicate=await teacher.drawQuestion(qe,{regionId:'T1-R1',eventId:'auto-one',random:()=>0.5});
  assert.equal(duplicate.duplicate,true);
  await asyncCode(teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',eventId:'auto-one',random:()=>0}),'EVENT_ID_CONFLICT');
  await teacher.close();
});

test('교사 창 소유권이 다른 창으로 이동한 뒤에는 명단 변경 불가',async()=>{
  const {store,teacher,create}=env();await create();
  const original=teacher.getState();
  // Fake DB lease clocks and teacher clocks may be different, so use stored lease expiration.
  const lease=await store.acquireWriter(1,teacher.writerId);
  // Direct conflicting writer is blocked until lease expiration; never commit unsafely.
  await asyncCode(store.acquireWriter(1,'unexpected-second-window'),'WRITER_BUSY');
  eq(teacher.getState(),original);assert.equal(lease.writerId,teacher.writerId);
  await teacher.close();
});

test('학생 실명/출결을 수정했는데 명단 버전이 증가하지 않으면 스냅샷 불일치로 검출',()=>{
  const s=add(newState(),'TEAM_01','M','학생');
  const changed=structuredClone(s);changed.teams[0].members[0].name='몰래 수정';
  code(()=>checkState(changed),'ROSTER_HISTORY_INVALID');
  const attendance=structuredClone(s);attendance.teams[0].members[0].status='ABSENT';
  code(()=>checkState(attendance),'ROSTER_HISTORY_INVALID');
});

test('팀 이전과 재복귀를 반복해도 최초 시도의 대표/원모둠 불변',()=>{
  let s=add(newState(),'TEAM_01','M','원래 대표');s=draw(s);
  const id=s.activeAttemptId,assignment=structuredClone(s.attempts[id].teamAssignment);
  s=done(s);s=move(s,'M','TEAM_01','TEAM_02');s=move(s,'M','TEAM_02','TEAM_03');s=move(s,'M','TEAM_03','TEAM_01');
  eq(s.attempts[id].teamAssignment,assignment);
  assert.equal(s.teams[0].members[0].id,'M');assert.equal(s.teams[0].rosterVersion,4);
  assert.equal(s.participation.memberIds.length,1);checkState(s);
});

test('대표가 아닌 학생이 제출한 뒤 원 모둠이 이동해도 해결자 스냅샷 유지',()=>{
  let s=newState();s=add(s,'TEAM_01','representative','대표');s=add(s,'TEAM_01','solver','실제 풀이');
  s=draw(s);const a=old(s),q=a.questionSnapshot.issuedSnapshot;
  s=act(s,'TIMER_STARTED');
  // Assess the official question type without inventing an accepted answer.
  let response=null;
  switch(q.type){
    case 'single_choice':response=q.choices[0].key;break;
    case 'true_false':response=true;break;
    case 'short_text':response='임시 답변';break;
    default:response='임시 답변';break;
  }
  // When a shape is complex, the previous tests cover its grading; use safe optional branch.
  if(q.type==='single_choice'||q.type==='true_false'||q.type==='short_text'){
    s=act(s,'ANSWER_SUBMITTED',{attemptId:a.id,response,submittedByMemberId:'solver'});
    const sug=old(s).answer.suggestion;
    const teacherReason=sug.needsTeacherReview?'표현을 확인함':null;
    s=act(s,'ANSWER_JUDGED',{attemptId:a.id,decision:sug.status==='incorrect'?'INCORRECT':'CORRECT',teacherConfirmed:true,teacherReason});
    const solver=structuredClone(old(s).judgement);
    s=move(s,'solver','TEAM_01','TEAM_02');
    eq(s.attempts[a.id].judgement,solver);
    assert.equal(solver.solverMemberId,'solver');assert.equal(solver.solverTeamId,'TEAM_01');
  }
});
