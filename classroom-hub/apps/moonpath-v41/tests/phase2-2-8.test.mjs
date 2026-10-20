import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {createQuestionEngine} from '../src/questions/engine.js';
import {planQuestionDraw,listRecoveryCandidates} from '../src/questions/draw.js';
import {regionResult,worldProgress,processedRegionalAttempts} from '../src/world/regions.js';
import {renderRegionResultMarkup} from '../src/world/result-card.js';
import {TeacherEngineSession} from '../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../src/storage/indexeddb.js';
import {FakeDatabase} from './support-fake-idb.mjs';
import {verifyBackup} from '../src/storage/backup.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const pack=JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
const qe=createQuestionEngine(pack);
let seq=0;const id=()=>`p28-${++seq}`;
const init=(teamCount=2)=>{let s=newExpedition({slot:1,expeditionId:id(),createdAt:1800000000000,teamCount,world});s=ev(s,'EXPEDITION_CREATED');return ev(s,'SESSION_STARTED',{sessionId:id()});};
const cmd=(s,type,payload={},eventId=id())=>({type,payload,eventId,at:s.meta.updatedAt+1});
const ev=(s,type,payload={},eventId=id())=>reduceCommand(s,cmd(s,type,payload,eventId)).state;
const fail=(fn,code)=>assert.throws(fn,e=>e.code===code,code);
const visit=(s,regionId,mode='MAIN')=>ev(s,'REGION_ENTERED',{regionId,mode,teacherConfirmed:true});
const finish=(s,regionId)=>ev(s,'REGION_COMPLETED',{regionId,teacherConfirmed:true});
function response(q){switch(q.type){
 case 'single_choice':return q.answer.correct[0];
 case 'true_false':return q.answer.correct;
 case 'matching':return structuredClone(q.answer.pairs);
 case 'ordering':return structuredClone(q.answer.order);
 case 'categorization':return structuredClone(q.answer.assignments);
 case 'short_text':return q.answer.accepted[0];
 case 'manual':return '교과서 개념과 사례를 연결하여 설명함';
 default:throw Error(q.type);
}}
function issue(s,regionId,decision='CORRECT',teamId='TEAM_01'){
 const at=s.meta.updatedAt+1,attemptId=id();const payload=planQuestionDraw(s,qe,{regionId,teamId,attemptId,at,random:()=>0});
 s=ev(s,'QUESTION_DRAWN',payload);s=ev(s,'TIMER_STARTED');
 const q=pack.questions.find(x=>x.id===payload.questionId);
 if(decision==='CORRECT'){
  s=ev(s,'ANSWER_SUBMITTED',{attemptId,response:response(q)});
  s=ev(s,'ANSWER_JUDGED',{attemptId,decision:'CORRECT',teacherConfirmed:true,teacherReason:'교사 최종 판정 확인'});
 }else{
  s=ev(s,'TIMER_PAUSED');
  s=ev(s,'ANSWER_JUDGED',{attemptId,decision:'INCORRECT',teacherConfirmed:true,missingResponseConfirmed:true,
    teacherReason:'교사 확인으로 응답 부재 처리'});
 }
 return s;
}
const processRegion=(s,regionId,{incorrectFirst=false,mode='MAIN'}={})=>{
 s=visit(s,regionId,mode);
 const quota=s.world.regions[regionId].baseQuota;
 for(let j=0;j<quota;j++)s=issue(s,regionId,incorrectFirst&&j===0?'INCORRECT':'CORRECT',s.teams[j%s.teams.length].id);
 return finish(s,regionId);
};
const firstRegion=()=>processRegion(init(),'T1-R1');

test('첫 지역 이전 다른 지역 및 명시적 방문 없는 완료 금지',()=>{
 const s=init();fail(()=>visit(s,'T2-R1'),'REGION_LOCKED');
 fail(()=>visit(s,'T1-R3'),'REGION_LOCKED');
 fail(()=>finish(s,'T1-R1'),'REGION_NOT_ENTERED');
 assert.equal(s.rewards.keys,0);
});
test('교사 승인 없이는 지역 진입·문제수 변경·완료 불가',()=>{
 let s=init();fail(()=>ev(s,'REGION_ENTERED',{regionId:'T1-R1',mode:'MAIN'}),'TEACHER_REQUIRED');
 s=visit(s,'T1-R1');fail(()=>ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:3,reason:'조정'}),'TEACHER_REQUIRED');
 fail(()=>ev(s,'REGION_COMPLETED',{regionId:'T1-R1'}),'TEACHER_REQUIRED');
});
test('초기 기본문제 수=모둠수, 부족하면 완료 불가, 완료 +1열쇠·별빛 +0',()=>{
 let s=init(4);s=visit(s,'T1-R1');assert.equal(s.world.regions['T1-R1'].baseQuota,4);
 s=issue(s,'T1-R1','CORRECT');fail(()=>finish(s,'T1-R1'),'REGION_QUOTA_NOT_MET');
 const before=s.rewards.starlight;
 for(let j=1;j<4;j++)s=issue(s,'T1-R1','CORRECT');
 assert.equal(s.rewards.starlight,before+3);
 s=finish(s,'T1-R1');assert.equal(s.rewards.keys,1);assert.equal(s.rewards.starlight,4);
 assert.equal(s.rewards.ledger.filter(x=>x.type==='KEY_EARN').length,1);
 assert.equal(s.world.regions['T1-R2'].status,'AVAILABLE');assert.equal(s.world.regions['T1-R3'].status,'AVAILABLE');
 assert.equal(regionResult(s,'T1-R1').processed,4);checkState(s);
});
test('동일 완료 이벤트 재시도는 멱등, 별개 완료 이벤트는 차단',()=>{
 let s=init();s=visit(s,'T1-R1');s=issue(s,'T1-R1');s=issue(s,'T1-R1');
 const ec=cmd(s,'REGION_COMPLETED',{regionId:'T1-R1',teacherConfirmed:true},id());
 s=reduceCommand(s,ec).state;const old=structuredClone(s);assert.equal(reduceCommand(s,ec).duplicate,true);
 assert.deepEqual(s,old);fail(()=>finish(s,'T1-R1'),'REGION_NOT_ACTIVE');assert.equal(s.rewards.keys,1);
});
test('오답 미회수 상태여도 기본 문제를 전부 처리하면 지역 완료; 회수 권리는 보존',()=>{
 let s=processRegion(init(),'T1-R1',{incorrectFirst:true});
 const result=regionResult(s,'T1-R1');assert.deepEqual([result.processed,result.correct,result.incorrect,result.unresolvedRecovery],[2,1,1,1]);
 assert.equal(s.recovery.pending.length,1);assert.equal(s.world.regions['T1-R1'].status,'COMPLETED');
 assert.equal(s.rewards.keys,1);assert.equal(s.rewards.starlight,1);
 assert.equal(worldProgress(s).themes[0].learningComplete,false);checkState(s);
});
test('지역 문제 수 교사 조정 및 사유 이력 보존; 이미 판정한 개수 이하 변경 제한',()=>{
 let s=init(3);s=visit(s,'T1-R1');s=ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:2,reason:'남은 차시 시간에 맞춘 변경',teacherConfirmed:true});
 assert.equal(s.world.regions['T1-R1'].baseQuota,2);assert.equal(s.world.quotaHistory.length,1);
 s=issue(s,'T1-R1');s=issue(s,'T1-R1');
 fail(()=>ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:1,reason:'이미 끝난 문제 제외',teacherConfirmed:true}),'REGION_QUOTA_BELOW_PROCESSED');
 fail(()=>issue(s,'T1-R1'),'REGION_QUOTA_REACHED');
 s=finish(s,'T1-R1');assert.equal(regionResult(s,'T1-R1').baseQuota,2);checkState(s);
});
test('문제 준비/실행/교사 판정 전 지역 변경·완료·추가 탐험 금지',()=>{
 let s=init();s=visit(s,'T1-R1');
 const at=s.meta.updatedAt+1,attemptId=id();s=ev(s,'QUESTION_DRAWN',planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId,at,random:()=>0}));
 fail(()=>visit(s,'T1-R2'),'ATTEMPT_ACTIVE');fail(()=>finish(s,'T1-R1'),'ATTEMPT_ACTIVE');
 fail(()=>ev(s,'EXTRA_EXPLORATION_STARTED',{regionId:'T1-R3',teacherConfirmed:true}),'ATTEMPT_ACTIVE');
});
test('R1→왼쪽 R2→합류 R4→최종 R5 주경로, 오른쪽 R3는 완료 전 차단',()=>{
 let s=firstRegion();s=visit(s,'T1-R2');assert.equal(s.world.mainRouteChoice.T1,'LEFT');
 fail(()=>visit(s,'T1-R3'),'REGION_IN_PROGRESS');
 for(let j=0;j<2;j++)s=issue(s,'T1-R2');s=finish(s,'T1-R2');
 assert.equal(s.world.regions['T1-R3'].status,'LOCKED');fail(()=>visit(s,'T1-R3'),'REGION_LOCKED');
 s=processRegion(s,'T1-R4');s=processRegion(s,'T1-R5');
 assert.equal(s.rewards.keys,4);assert.equal(s.world.regions['T2-R1'].status,'AVAILABLE');
 assert.equal(s.world.regions['T1-R3'].status,'AVAILABLE');
 assert.equal(worldProgress(s).themes[0].mainFinished,true);
 assert.equal(worldProgress(s).themes[0].fullExploration,false);checkState(s);
});
test('오른쪽 R3 선택 시 왼쪽 R2는 주경로 완료 전 금지',()=>{
 let s=firstRegion();s=visit(s,'T1-R3');assert.equal(s.world.mainRouteChoice.T1,'RIGHT');
 for(let j=0;j<2;j++)s=issue(s,'T1-R3');s=finish(s,'T1-R3');
 fail(()=>visit(s,'T1-R2'),'REGION_LOCKED');s=processRegion(s,'T1-R4');s=processRegion(s,'T1-R5');
 assert.equal(s.world.regions['T1-R2'].status,'AVAILABLE');checkState(s);
});
test('추가 탐험은 주경로 최종 완료 후 미방문 분기만, 복귀 위치·문항 이력 보존',()=>{
 let s=firstRegion();s=processRegion(s,'T1-R2');s=processRegion(s,'T1-R4');s=processRegion(s,'T1-R5');
 const before=s.questions.draws.length,src=s.world.currentRegionId;
 fail(()=>visit(s,'T1-R3','MAIN'),'REGION_LOCKED');
 s=ev(s,'SCREEN_CHANGED',{screen:'BOOKSHELF'});
 s=ev(s,'EXTRA_EXPLORATION_STARTED',{regionId:'T1-R3',teacherConfirmed:true});
 assert.equal(s.world.additionalExplorationReturn.fromRegionId,src);
 fail(()=>visit(s,'T2-R1'),'EXTRA_RETURN_REQUIRED');
 fail(()=>ev(s,'EXTRA_EXPLORATION_RETURNED',{teacherConfirmed:true}),'EXTRA_NOT_COMPLETED');
 s=processRegion(s,'T1-R3',{mode:'EXTRA'});
 assert.equal(worldProgress(s).themes[0].fullExploration,true);
 assert.equal(s.rewards.keys,5);
 s=ev(s,'EXTRA_EXPLORATION_RETURNED',{teacherConfirmed:true});
 assert.equal(s.world.currentRegionId,src);assert.equal(s.screen,'BOOKSHELF');
 assert.equal(s.questions.draws.length,before+2);
 assert.equal(s.world.mainRouteChoice.T1,'LEFT');checkState(s);
});
test('오답 회수 자연 등장: 실제 지역 방문 순서가 추가된 뒤에만 후보 노출',()=>{
 let s=processRegion(init(),'T1-R1',{incorrectFirst:true});
 const before=listRecoveryCandidates(s,{inRegionId:'T1-R1'});assert.equal(before.length,0);
 s=visit(s,'T1-R2');
 assert.deepEqual(s.world.regionEntryOrder,['T1-R1','T1-R2']);
 const candidates=listRecoveryCandidates(s,{inRegionId:'T1-R2'});
 assert.equal(candidates.length,1);assert.equal(candidates[0].originRegionId,'T1-R1');
 assert.equal(candidates[0].originTeamId,'TEAM_01');checkState(s);
});
test('완료 뒤 교사 판정 정정이 원문제 기록을 덮어쓰지 않으면서 결과 통계를 재산출',()=>{
 let s=firstRegion();const aid=s.world.results[0].attemptIds[0],original=structuredClone(s.attempts[aid]);
 s=ev(s,'JUDGEMENT_CORRECTED',{scope:'ANSWER',targetId:aid,decision:'INCORRECT',reason:'제출 답안과 근거를 다시 검토함',teacherConfirmed:true});
 assert.equal(regionResult(s,'T1-R1').correct,1);assert.equal(regionResult(s,'T1-R1').incorrect,1);
 assert.deepEqual(s.attempts[aid],original);assert.equal(s.world.results[0].attemptIds[0],aid);checkState(s);
});
test('학생 공개 지역 결과에는 답안·정답·교사 사유·개인 명단·감사 로그가 없음',()=>{
 let s=firstRegion();const p=publicProjection(s,s.meta.updatedAt);
 assert.equal(p.regionResult?.processed,2);assert.equal(p.regionResult?.keyGranted,true);
 const text=JSON.stringify(p);
 for(const secret of ['originalSnapshot','teacherReason','answer_display','contribution','memberIds','eventLog','corrections','sourceAttemptId'])
  assert.equal(text.includes(secret),false,secret);
});
test('저장 후 지역 방문 이벤트·완료 증거·키 장부를 변조하면 checkState 차단',()=>{
 const s=firstRegion();for(const mutate of [
  x=>{x.world.regionEntryOrder.push('T2-R1')},
  x=>{x.world.visitHistory[0].regionId='T2-R1'},
  x=>{x.world.results[0].baseQuota=20},
  x=>{x.world.regions['T1-R1'].completedAt=5},
  x=>{x.rewards.ledger=x.rewards.ledger.filter(l=>l.type!=='KEY_EARN')},
  x=>{x.world.regions['T1-R2'].status='COMPLETED'},
 ]){const damaged=structuredClone(s);mutate(damaged);assert.throws(()=>checkState(damaged));}
});
test('지역 완료 이벤트 같은 ID 다른 내용 재사용은 충돌 처리',()=>{
 let s=firstRegion();const e=s.eventLog.find(x=>x.type==='REGION_COMPLETED');
 fail(()=>reduceCommand(s,{...e,payload:{regionId:'T1-R2',teacherConfirmed:true}}),'EVENT_ID_CONFLICT');
});
test('기본 진입 없이 구형 모의 출제 기록이 있는 슬롯은 무근거 방문을 소급 생성하지 않음',()=>{
 let s=init();const at=s.meta.updatedAt+1,attemptId=id();
 s=ev(s,'QUESTION_DRAWN',planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId,at,random:()=>0}));
 s=ev(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'이전 시제품 시험 출제 무효'});
 fail(()=>visit(s,'T1-R1'),'LEGACY_REGION_HISTORY');assert.equal(s.world.regionEntryOrder.length,0);
});

test('모의 IndexedDB: 지역 완료·열쇠·이벤트·2세대 체크포인트를 원자적으로 확정하고 실패시 롤백',async()=>{
 let clock=1800000200000;const db=new FakeDatabase(),store=new IndexedDbExpeditionStore(db,{clock:()=>clock});
 const teacher=new TeacherEngineSession(store,{clock:()=>clock,newId:id,heartbeatMs:0});
 await teacher.create({slot:1,world,teamCount:2});clock+=1;await teacher.dispatch('SESSION_STARTED',{sessionId:'Lesson28'});
 clock+=1;await teacher.enterRegion('T1-R1');
 for(let j=0;j<2;j++){
  clock+=1;const out=await teacher.drawQuestion(qe,{regionId:'T1-R1',teamId:'TEAM_01',random:()=>0});
  clock+=1;await teacher.dispatch('TIMER_STARTED');
  const q=pack.questions.find(x=>x.id===out.questionId);
  clock+=1;await teacher.submitAnswer({attemptId:out.attemptId,response:response(q)});
  clock+=1;await teacher.judgeAnswer({attemptId:out.attemptId,decision:'CORRECT',teacherConfirmed:true,teacherReason:'교사 확인'});
 }
 const prev=teacher.getState();const prevRevision=prev.meta.revision;clock+=1;db.failNextWrite=true;
 await assert.rejects(teacher.completeRegion('T1-R1'),e=>e.name==='QuotaExceededError');
 assert.deepEqual(teacher.getState(),prev);assert.equal(db.inspect('slots',1).state.meta.revision,prevRevision);
 assert.equal(db.inspect('events',`1:${String(prevRevision+1).padStart(12,'0')}`),undefined);
 clock+=1;const done=await teacher.completeRegion('T1-R1');assert.equal(done.committed,true);
 assert.equal(done.state.rewards.keys,1);assert.equal(done.state.rewards.starlight,2);
 assert.equal(db.inspect('slots',1).state.world.regions['T1-R1'].status,'COMPLETED');
 assert.equal(db.inspect('checkpoints','1:latest').revision,prevRevision+1);
 assert.equal(db.inspect('checkpoints','1:previous').revision,prevRevision);
 const backup=await teacher.exportJSON();const verified=await verifyBackup(backup);
 assert.equal(verified.state.world.results.length,1);await teacher.close();
 const reopened=new TeacherEngineSession(store,{clock:()=>clock,newId:id,heartbeatMs:0});
 const loaded=await reopened.open(1);assert.equal(loaded.world.regions['T1-R1'].status,'COMPLETED');
 assert.equal(loaded.rewards.keys,1);await reopened.close();
});
test('모든 6테마 주경로 24지역과 추가 분기 6지역: 실제 60문항 사용·열쇠30·테마 완전탐색',()=>{
 let s=init(2);
 for(let t=1;t<=6;t++){
  const region=idx=>`T${t}-R${idx}`;
  s=processRegion(s,region(1));
  s=processRegion(s,region(2));
  s=processRegion(s,region(4));
  s=processRegion(s,region(5));
  assert.equal(worldProgress(s).themes[t-1].mainFinished,true);
  assert.equal(worldProgress(s).themes[t-1].fullExploration,false);
  s=ev(s,'SCREEN_CHANGED',{screen:'BOOKSHELF'});
  s=ev(s,'EXTRA_EXPLORATION_STARTED',{regionId:region(3),teacherConfirmed:true});
  s=processRegion(s,region(3),{mode:'EXTRA'});
  assert.equal(worldProgress(s).themes[t-1].fullExploration,true);
  s=ev(s,'EXTRA_EXPLORATION_RETURNED',{teacherConfirmed:true});
 }
 assert.equal(s.questions.issuedIds.length,60);
 assert.equal(s.world.results.length,30);
 assert.equal(worldProgress(s).mainEndingUnlocked,true);
 assert.equal(s.rewards.keys,30);assert.equal(s.rewards.starlight,60);
 assert.equal(s.rewards.ledger.filter(x=>x.type==='KEY_EARN').length,30);
 assert.equal(new Set(s.rewards.ledger.map(x=>x.claim)).size,s.rewards.ledger.length);
 assert.equal(s.world.regionEntryOrder.length,30);
 assert.equal(s.recovery.pending.length,0);checkState(s);
});
test('교사 변경으로 기본 문제 수를 늘려도 최초 완료까지 자동 처리·추가 지급하지 않음',()=>{
 let s=init();s=visit(s,'T1-R1');s=ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:4,reason:'실제 출석 모둠 순서 조정',teacherConfirmed:true});
 for(let j=0;j<2;j++)s=issue(s,'T1-R1');fail(()=>finish(s,'T1-R1'),'REGION_QUOTA_NOT_MET');
 s=issue(s,'T1-R1');s=issue(s,'T1-R1');s=finish(s,'T1-R1');
 assert.equal(regionResult(s,'T1-R1').baseQuota,4);assert.equal(s.rewards.keys,1);checkState(s);
});
test('문제 무효 종료는 기본 문제 처리 수로 인정하지 않음',()=>{
 let s=init();s=visit(s,'T1-R1');const at=s.meta.updatedAt+1,attemptId=id();
 s=ev(s,'QUESTION_DRAWN',planQuestionDraw(s,qe,{regionId:'T1-R1',teamId:'TEAM_01',attemptId,at,random:()=>0}));
 s=ev(s,'ATTEMPT_RESOLVED',{teacherConfirmed:true,voidReason:'입력 오류가 확인되어 무효화'});
 assert.equal(processedRegionalAttempts(s,'T1-R1').length,0);fail(()=>finish(s,'T1-R1'),'REGION_QUOTA_NOT_MET');
 s=issue(s,'T1-R1');s=issue(s,'T1-R1');s=finish(s,'T1-R1');
 assert.equal(regionResult(s,'T1-R1').processed,2);assert.equal(s.questions.draws.length,3);checkState(s);
});
test('차시 종료·다음 날 재개 시 부분 진행 중인 동일 지역만 재진입 가능, 문제수 유지',()=>{
 let s=init();s=visit(s,'T1-R1');s=issue(s,'T1-R1');const issued=s.questions.issuedIds.length;
 fail(()=>visit(s,'T1-R1'),'REGION_ALREADY_ENTERED');
 s=ev(s,'SESSION_ENDED');s=ev(s,'SESSION_STARTED',{sessionId:id()});
 fail(()=>visit(s,'T1-R2'),'REGION_IN_PROGRESS');
 s=visit(s,'T1-R1');assert.equal(s.world.regionEntryOrder.length,2);
 assert.equal(s.world.regions['T1-R1'].baseQuota,2);assert.equal(s.questions.issuedIds.length,issued);
 s=issue(s,'T1-R1');s=finish(s,'T1-R1');assert.equal(s.rewards.keys,1);checkState(s);
});
test('직접 출제 함수로 현재 지역을 우회해도 명시적 지역 진입 상태에서 차단',()=>{
 const s=visit(init(),'T1-R1');const at=s.meta.updatedAt+1,attemptId=id();
 fail(()=>planQuestionDraw(s,qe,{regionId:'T1-R2',teamId:'TEAM_01',attemptId,at,random:()=>0}),'REGION_CHANGED');
});
test('보류된 회수는 다른 지역에 들어가도 자연 후보에서 제외',()=>{
 let s=processRegion(init(),'T1-R1',{incorrectFirst:true});const r=s.recovery.pending[0];
 s=ev(s,'RECOVERY_DEFERRED',{recoveryId:r.id,reason:'현재 학습 속도에 따라 회수를 보류함',teacherConfirmed:true});
 s=visit(s,'T1-R2');assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R2'}).length,0);
 s=ev(s,'RECOVERY_RELEASED',{recoveryId:r.id,teacherConfirmed:true});
 assert.equal(listRecoveryCandidates(s,{inRegionId:'T1-R2'}).length,1);checkState(s);
});
test('새 지역 진입 뒤 실제 NATURAL 회수 호출·원모둠 우선 보존',()=>{
 let s=processRegion(init(),'T1-R1',{incorrectFirst:true});const r=s.recovery.pending[0];
 s=visit(s,'T1-R2');
 const p={recoveryId:r.id,runId:id(),teamId:r.originTeamId,regionId:'T1-R2',mode:'NATURAL',teacherConfirmed:true};
 s=ev(s,'RECOVERY_CALLED',p);
 assert.equal(s.recovery.activeId,r.id);assert.equal(s.recovery.pending[0].runs[0].mode,'NATURAL');
 fail(()=>finish(s,'T1-R2'),'SIDE_MISSION_ACTIVE');
 s=ev(s,'RECOVERY_FORFEITED',{recoveryId:r.id,runId:p.runId,teacherConfirmed:true,reason:'회수 학습을 잠시 보류함'});
 assert.equal(s.recovery.activeId,null);checkState(s);
});
test('변조된 주경로 선택 LEFT→RIGHT 변경은 저장 로드 검사에서 차단',()=>{
 const s=visit(firstRegion(),'T1-R2');const damaged=structuredClone(s);
 damaged.world.mainRouteChoice.T1='RIGHT';fail(()=>checkState(damaged),'REGION_ROUTE_INVALID');
});
test('존재하지 않았던 해금 상태 조작, 키 잔액 조작, 방문 차시 변조 차단',()=>{
 const s=firstRegion();const attacks=[
  [x=>{x.world.regions['T6-R5'].status='AVAILABLE'},'REGION_UNLOCK_INVALID'],
  [x=>{x.rewards.keys=88},'REGION_KEY_INVALID'],
  [x=>{x.world.visitHistory[0].sessionId='FORGED_SESSION'},'REGION_HISTORY_INVALID'],
  [x=>{x.world.mainRouteChoice.T1='LEFT'},'REGION_ROUTE_INVALID'],
 ];
 for(const [tamper,code] of attacks){const d=structuredClone(s);tamper(d);fail(()=>checkState(d),code);}
});
test('추가 탐험 복귀 시 과거 지역 완료 보상과 기존 문제 시도/대표/출제 이력 불변',()=>{
 let s=firstRegion();s=processRegion(s,'T1-R2');s=processRegion(s,'T1-R4');s=processRegion(s,'T1-R5');
 const before=structuredClone(s.questions.draws),firstAttempts=structuredClone(s.attempts);
 s=ev(s,'SCREEN_CHANGED',{screen:'BOOKSHELF'});
 s=ev(s,'EXTRA_EXPLORATION_STARTED',{regionId:'T1-R3',teacherConfirmed:true});s=processRegion(s,'T1-R3',{mode:'EXTRA'});
 s=ev(s,'EXTRA_EXPLORATION_RETURNED',{teacherConfirmed:true});
 assert.deepEqual(s.questions.draws.slice(0,before.length),before);
 for(const [k,v] of Object.entries(firstAttempts))assert.deepEqual(s.attempts[k],v);
 assert.equal(s.rewards.keys,5);assert.equal(s.world.mainRouteChoice.T1,'LEFT');checkState(s);
});
test('사용자는 지역 결과에서 정정 후 정확한 정답/오답 집계 확인; 학생 공개는 통계만',()=>{
 let s=processRegion(init(),'T1-R1',{incorrectFirst:true});
 assert.equal(regionResult(s,'T1-R1',{publicOnly:true}).incorrect,1);
 const aid=s.world.results[0].attemptIds[0];
 s=ev(s,'JUDGEMENT_CORRECTED',{scope:'ANSWER',targetId:aid,decision:'CORRECT',reason:'교사 근거 재검토 후 정답으로 정정함',teacherConfirmed:true});
 assert.equal(regionResult(s,'T1-R1',{publicOnly:true}).incorrect,0);
 assert.equal(regionResult(s,'T1-R1',{publicOnly:true}).correct,2);
 assert.equal(regionResult(s,'T1-R1').perTeam.length,2);
 assert.equal(s.rewards.keys,1);checkState(s);
});
test('지역 기본문제 수 변경 이벤트 이유/숫자 변조를 감지',()=>{
 let s=visit(init(),'T1-R1');s=ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:3,reason:'학급 활동시간을 반영함',teacherConfirmed:true});
 for(const [mutate,code] of [
  [x=>{x.world.quotaHistory[0].baseQuota=9},'REGION_QUOTA_INVALID'],
  [x=>{x.world.quotaHistory[0].at=4},'REGION_QUOTA_INVALID'],
 ]){const d=structuredClone(s);mutate(d);fail(()=>checkState(d),code);}
});
test('지역 결과 카드의 집계에는 회수문제·가로채기 시도를 기본문항으로 중복 계산하지 않음',()=>{
 let s=processRegion(init(),'T1-R1',{incorrectFirst:true});
 assert.equal(regionResult(s,'T1-R1').processed,2);
 const r=s.recovery.pending[0];s=ev(s,'RECOVERY_CALLED',{recoveryId:r.id,runId:id(),teamId:r.originTeamId,
  regionId:'T1-R1',mode:'FORCED',reason:'오답 학습 보충',teacherConfirmed:true});
 assert.equal(regionResult(s,'T1-R1').processed,2);checkState(s);
});
test('공개 지역 완료 텍스트 카드 HTML 생성: 기본 문제·정답·오답·열쇠·별빛0',()=>{
 const s=processRegion(init(),'T1-R1',{incorrectFirst:true});
 const html=renderRegionResultMarkup(regionResult(s,'T1-R1',{publicOnly:true}),
  {regionName:'달빛 이끼길',themeName:'푸른 달빛의 숲'});
 for(const str of ['달빛 이끼길','푸른 달빛의 숲','2/2','남은 회수미션','열쇠 +1','별빛 +0'])assert.ok(html.includes(str));
 assert.ok(!html.includes('originalSnapshot'));
});
test('공개 지역 결과의 이름에 태그/따옴표가 주입돼도 HTML 이스케이프',()=>{
 const s=firstRegion();const html=renderRegionResultMarkup(regionResult(s,'T1-R1',{publicOnly:true}),
  {regionName:'<img src=x onerror="alert(1)">',themeName:'X & Y'});
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('onerror="alert'));
 assert.ok(html.includes('&lt;img'));assert.ok(html.includes('X &amp; Y'));
});
test('완료되지 않은 지역 결과 표시 금지 및 공개 요약 변조 검사',()=>{
 const s=visit(init(),'T1-R1');
 assert.equal(regionResult(s,'T1-R1'),null);
 fail(()=>renderRegionResultMarkup({regionId:'T1-R1',keyGranted:false}),'REGION_RESULT_INVALID');
});
test('책장 이동 전 추가 탐험 시작을 금지하고 교사 화면 이동 후만 허용',()=>{
 let s=firstRegion();s=processRegion(s,'T1-R2');s=processRegion(s,'T1-R4');s=processRegion(s,'T1-R5');
 fail(()=>ev(s,'EXTRA_EXPLORATION_STARTED',{regionId:'T1-R3',teacherConfirmed:true}),'EXTRA_FROM_BOOKSHELF');
 s=ev(s,'SCREEN_CHANGED',{screen:'BOOKSHELF'});
 s=ev(s,'EXTRA_EXPLORATION_STARTED',{regionId:'T1-R3',teacherConfirmed:true});
 assert.equal(s.world.additionalExplorationReturn.regionId,'T1-R3');checkState(s);
});
test('지역 진행 중 다른 차시 이관 시 원래 대표·답안 및 회수 원모둠 정보 유지',()=>{
 let s=init();s=visit(s,'T1-R1');s=issue(s,'T1-R1','INCORRECT');
 const orig=structuredClone(s.recovery.pending[0]);
 s=ev(s,'SESSION_ENDED');s=ev(s,'SESSION_STARTED',{sessionId:id()});
 s=visit(s,'T1-R1');s=issue(s,'T1-R1','CORRECT');s=finish(s,'T1-R1');
 assert.equal(s.recovery.pending[0].sourceAttemptId,orig.sourceAttemptId);
 assert.equal(s.recovery.pending[0].originTeamId,orig.originTeamId);
 assert.equal(s.world.regions['T1-R1'].status,'COMPLETED');
 assert.equal(s.rewards.keys,1);checkState(s);
});
test('진입 결과·정답·회수미션 이력과 무관하게 열쇠 최초 보상은 지역당 1회',()=>{
 let s=processRegion(init(),'T1-R1',{incorrectFirst:true});
 const prior=s.world.regions['T1-R1'];const count=s.rewards.keys;
 fail(()=>visit(s,'T1-R1'),'REGION_COMPLETED');
 fail(()=>finish(s,'T1-R1'),'REGION_NOT_ACTIVE');
 assert.equal(s.rewards.keys,count);assert.deepEqual(s.world.regions['T1-R1'],prior);
});
test('관리자 사유 없는 지역 기본 문제 수 조정·0개/61개·동일 수 재지정 금지',()=>{
 let s=visit(init(),'T1-R1');
 for(const invalid of [0,61,2.5])fail(()=>ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:invalid,reason:'교사 승인함',teacherConfirmed:true}),'REGION_QUOTA_INVALID');
 fail(()=>ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:3,reason:' ',teacherConfirmed:true}),'REGION_REASON_REQUIRED');
 fail(()=>ev(s,'REGION_QUOTA_SET',{regionId:'T1-R1',baseQuota:2,reason:'동일 수',teacherConfirmed:true}),'REGION_QUOTA_NO_CHANGE');
});
test('실제 결과 카드는 키를 지급하지 않았으면 생성 금지',()=>{
 const s=firstRegion();const publicData=regionResult(s,'T1-R1',{publicOnly:true});
 fail(()=>renderRegionResultMarkup({...publicData,keyGranted:false}),'REGION_RESULT_INVALID');
});
