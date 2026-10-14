import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newExpedition,checkState,publicProjection,timerRemainingMs} from '../src/engine/model.js';
import {reduceCommand} from '../src/engine/reducer.js';
import {makeBackup,verifyBackup} from '../src/storage/backup.js';
const world=JSON.parse(readFileSync(new URL('../config/world.json',import.meta.url)));
const INITIAL=1_800_000_000_000;
let num=0;
function blank({slot=1,teamCount=4,timerSeconds=60}={}){
  return newExpedition({slot,teamCount,timerSeconds,world,createdAt:INITIAL,expeditionId:`EXP-${slot}`});
}
function apply(state,type,at=INITIAL,extra={}){return reduceCommand(state,{type,at,eventId:extra.eventId||`evt-${++num}`,payload:extra.payload||{}}).state;}
function boot(args={}){return apply(blank(args),'EXPEDITION_CREATED');}
function lesson(s){return apply(s,'SESSION_STARTED',INITIAL+100,{payload:{sessionId:'lesson1'}});}
function prepared(s){return apply(lesson(s),'ATTEMPT_PREPARED',INITIAL+200,{payload:{attemptId:'attempt-01',questionId:'IS2-U01-A01',questionRevision:1,teamId:'TEAM_01'}});}
function startTimer(s){return apply(prepared(s),'TIMER_STARTED',INITIAL+300);}
function expectCode(fn,code){assert.throws(fn,e=>e.code===code,`Expected error code ${code}`);}

test('신규 원정은 3개 슬롯과 2~8개 모둠, 30지역 기준을 강제한다',()=>{
 for (let slot=1;slot<=3;slot++)for(const teamCount of [2,4,8]){
  const s=boot({slot,teamCount});checkState(s);
  assert.equal(s.meta.slot,slot);assert.equal(s.teams.length,teamCount);assert.equal(s.meta.revision,1);
  assert.equal(s.rewards.starlight,0);assert.equal(s.rewards.keys,0);assert.equal(Object.keys(s.world.regions).length,30);
 }
 expectCode(()=>blank({slot:4}),'SLOT_INVALID');expectCode(()=>blank({teamCount:1}),'INVALID_TEAM_COUNT');
 expectCode(()=>blank({timerSeconds:30}),'INVALID_TIMER');
});

test('같은 이벤트 ID를 재시도하면 revision·보상·이벤트가 늘지 않는다',()=>{
 let a=boot();const evt={type:'SESSION_STARTED',eventId:'fixed-101',at:INITIAL+100,payload:{sessionId:'S-101'}};
 let b=reduceCommand(a,evt);assert.equal(b.state.meta.revision,2);assert.equal(b.duplicate,false);
 let again=reduceCommand(b.state,evt);assert.equal(again.duplicate,true);assert.equal(again.state.meta.revision,2);
 assert.equal(again.state.eventLog.length,2);
});

test('순수 상태 전이: 이미 저장된 상태를 직접 변경하지 않는다',()=>{
 const old=boot(),copy=structuredClone(old);apply(old,'SESSION_STARTED',INITIAL+100,{payload:{sessionId:'S-a'}});
 assert.deepEqual(old,copy);
});

test('교사 명령 전에는 타이머가 PREPARED이고 자동 시작하지 않는다',()=>{
 const s=prepared(boot()),a=s.attempts['attempt-01'];
 assert.equal(a.timer.phase,'PREPARED');assert.equal(a.timer.runningSince,null);assert.equal(a.timer.remainingMs,60000);
});

test('타이머는 실행·일시정지·재개 시각에 따라 잔여 시간을 정확히 계산한다',()=>{
 let s=startTimer(boot());let a=s.attempts['attempt-01'];
 assert.equal(timerRemainingMs(a,INITIAL+5_300),55000);
 s=apply(s,'TIMER_PAUSED',INITIAL+5_300);a=s.attempts['attempt-01'];
 assert.equal(a.timer.phase,'PAUSED');assert.equal(a.timer.remainingMs,55000);
 assert.equal(timerRemainingMs(a,INITIAL+100_000),55000);
 s=apply(s,'TIMER_RESUMED',INITIAL+6_300);a=s.attempts['attempt-01'];
 assert.equal(timerRemainingMs(a,INITIAL+7_300),54000);
});

test('만료 1ms 전 일시정지 허용, 정확히 만료되면 교사 확인 대기로 전이한다',()=>{
 let s=startTimer(boot());
 let before=apply(s,'TIMER_PAUSED',INITIAL+60_299);
 assert.equal(before.attempts['attempt-01'].timer.remainingMs,1);
 expectCode(()=>apply(s,'TIMER_PAUSED',INITIAL+60_300),'TIMER_DEADLINE');
 s=apply(s,'TIMER_EXPIRED',INITIAL+60_300);
 assert.equal(s.attempts['attempt-01'].timer.phase,'EXPIRED_AWAITING_TEACHER');
 assert.equal(s.attempts['attempt-01'].timer.remainingMs,0);
 assert.equal(s.rewards.starlight,0); // 만료 자체는 오답/보상 이벤트가 아님.
});

test('이미 실행/일시정지 중인 타이머의 중복 버튼을 거부한다',()=>{
 let s=startTimer(boot());expectCode(()=>apply(s,'TIMER_STARTED',INITIAL+301),'TIMER_NOT_PREPARED');
 s=apply(s,'TIMER_PAUSED',INITIAL+1000);expectCode(()=>apply(s,'TIMER_PAUSED',INITIAL+1001),'TIMER_NOT_RUNNING');
});

test('시간의 모래는 별빛4개 차감과 20초 연장을 하나의 순수 이벤트로 정산한다',()=>{
 let s=startTimer(boot());s.magic.unlocked.push('TIME_SAND');s.rewards.starlight=4;
 s=apply(s,'TIME_SAND_USED',INITIAL+10_300);
 assert.equal(s.rewards.starlight,0);assert.equal(s.rewards.ledger.at(-1).amount,-4);
 assert.equal(s.attempts['attempt-01'].timer.remainingMs,70000);
 assert.equal(timerRemainingMs(s.attempts['attempt-01'],INITIAL+20_300),60000);
 expectCode(()=>apply(s,'TIME_SAND_USED',INITIAL+10_301),'MAGIC_DUPLICATE');
});

test('별빛 부족 또는 정산 필요 상태에서는 시간의 모래의 일부 효과도 발생하지 않는다',()=>{
 const a=startTimer(boot());a.magic.unlocked.push('TIME_SAND');const previous=structuredClone(a);
 expectCode(()=>apply(a,'TIME_SAND_USED',INITIAL+10_300),'INSUFFICIENT_STARS');
 assert.deepEqual(a,previous);
 a.rewards.starlight=4;a.rewards.settlementRequired=true;
 expectCode(()=>apply(a,'TIME_SAND_USED',INITIAL+10_300),'SETTLEMENT_REQUIRED');
});

test('재접속 시 진행 중 타이머와 차시는 정지하며 자동 시작하지 않는다',()=>{
 let s=startTimer(boot());s=apply(s,'RECOVER_INTERRUPTED',INITIAL+30_300);
 assert.equal(s.attempts['attempt-01'].timer.phase,'PAUSED');
 assert.equal(s.sessions[0].phase,'PAUSED');
 assert.equal(s.attempts['attempt-01'].timer.remainingMs,60000);
 expectCode(()=>apply(s,'RECOVER_INTERRUPTED',INITIAL+31_000),'RECOVERY_NOT_NEEDED');
 s=apply(s,'SESSION_RESUMED',INITIAL+31_050);
 s=apply(s,'TIMER_RESUMED',INITIAL+31_100);assert.equal(s.attempts['attempt-01'].timer.phase,'RUNNING');
});

test('진행 중 문제에서 화면 이동을 차단, 교사 종료 확인 후 허용',()=>{
 let s=startTimer(boot());expectCode(()=>apply(s,'SCREEN_CHANGED',INITIAL+500,{payload:{screen:'BOOKSHELF'}}),'ATTEMPT_ACTIVE');
 expectCode(()=>apply(s,'ATTEMPT_RESOLVED',INITIAL+600,{payload:{teacherConfirmed:false}}),'TEACHER_REQUIRED');
 s=apply(s,'ATTEMPT_RESOLVED',INITIAL+600,{payload:{teacherConfirmed:true}});
 s=apply(s,'SCREEN_CHANGED',INITIAL+601,{payload:{screen:'BOOKSHELF'}});
 assert.equal(s.screen,'BOOKSHELF');assert.equal(s.rewards.starlight,0);
});

test('학생 공개 상태는 화이트리스트이며 정답·PIN·해설·감사 기록이 없다',()=>{
 const s=startTimer(boot());s.admin={pin:'1234'};s.audit=[{sensitive:'teacher-note'}];s.attempts['attempt-01'].answer='비공개 정답';
 const json=JSON.stringify(publicProjection(s,INITIAL+310));
 for(const secret of ['1234','비공개 정답','teacher-note','admin','audit','answer','explanation'])assert.equal(json.includes(secret),false,secret);
});

test('정해진 시각 이전의 이벤트는 거부 (PC 시각 변경을 무시하지 않음)',()=>{
 const s=lesson(boot());expectCode(()=>apply(s,'SESSION_PAUSED',INITIAL+99),'CLOCK_BACKWARD');
});

test('변조된 JSON 백업과 호환되지 않는 버전은 복원 전에 거부한다',async()=>{
 let s=boot();s=lesson(s);
 const ev=s.eventLog.map(e=>({...e}));
 const backup=await makeBackup({state:s,events:ev},{exportedAt:INITIAL+200});
 assert.equal((await verifyBackup(backup)).state.meta.revision,2);
 const changed=structuredClone(backup);changed.state.rewards.keys=999;
 await assert.rejects(verifyBackup(changed),e=>e.code==='BACKUP_CHECKSUM_INVALID');
 const altered=structuredClone(backup);altered.schemaVersion=22;
 await assert.rejects(verifyBackup(altered),e=>e.code==='BACKUP_CHECKSUM_INVALID');
});

test('차시 일시정지는 실행 중 타이머까지 같은 이벤트로 정지, 재개는 교사 명령 두 번 필요',()=>{
 let s=startTimer(boot());
 s=apply(s,'SESSION_PAUSED',INITIAL+5_300);
 assert.equal(s.sessions[0].phase,'PAUSED');
 assert.equal(s.attempts['attempt-01'].timer.phase,'PAUSED');
 assert.equal(s.attempts['attempt-01'].timer.remainingMs,55000);
 expectCode(()=>apply(s,'TIMER_RESUMED',INITIAL+5_400),'SESSION_NOT_ACTIVE');
 s=apply(s,'SESSION_RESUMED',INITIAL+5_400);
 assert.equal(s.attempts['attempt-01'].timer.phase,'PAUSED');
 s=apply(s,'TIMER_RESUMED',INITIAL+5_500);
 assert.equal(s.attempts['attempt-01'].timer.phase,'RUNNING');
});

test('해금되지 않은 시간의 모래는 별빛이 있어도 사용하지 못함',()=>{
 const s=startTimer(boot());s.rewards.starlight=4;
 expectCode(()=>apply(s,'TIME_SAND_USED',INITIAL+1_500),'MAGIC_LOCKED');
});
