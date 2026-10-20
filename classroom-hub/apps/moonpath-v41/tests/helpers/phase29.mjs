/** PHASE 2-9 integration test helper. Uses genuine engine and real 60-question source,
 * but FakeDatabase, NOT native browser IndexedDB. NEVER ship in production build.
 */
import {readFileSync} from 'node:fs';
import {TeacherEngineSession} from '../../src/engine/session.js';
import {IndexedDbExpeditionStore} from '../../src/storage/indexeddb.js';
import {FakeDatabase} from '../support-fake-idb.mjs';
import {createQuestionEngine} from '../../src/questions/engine.js';
import {checkState} from '../../src/engine/model.js';
export const PACK=JSON.parse(readFileSync(new URL('../../data/YQBank_60_v1.0.0_source.json',import.meta.url)));
export const WORLD=JSON.parse(readFileSync(new URL('../../config/world.json',import.meta.url)));
export const QUESTIONS=createQuestionEngine(PACK);
let serial=0;
export function correctAnswer(q){
 switch(q.type){
  case 'single_choice':return q.answer.correct[0];
  case 'true_false':return q.answer.correct;
  case 'matching':return structuredClone(q.answer.pairs);
  case 'ordering':return structuredClone(q.answer.order);
  case 'categorization':return structuredClone(q.answer.assignments);
  case 'short_text':return q.answer.accepted[0];
  case 'manual':return '교과서 개념을 적용해 실제 사례와 논리적 근거를 함께 설명하였습니다.';
  default:throw new Error('Unsupported official question type '+q.type);
 }
}
export function createHarness({teamCount=2,slot=1,db=null,initialTime=1_820_000_000_000}={}){
 let time=initialTime,order=0;const key=`phase29-${++serial}`;
 const clock=()=>time;
 const newId=()=>`${key}-${++order}`;
 const database=db??new FakeDatabase();
 const store=new IndexedDbExpeditionStore(database,{clock});
 const session=new TeacherEngineSession(store,{clock,newId,heartbeatMs:0});
 return{
  teamCount,slot,database,store,session,clock,newId,
  get time(){return time;},
  advance(delta=10){time+=delta;return time;},
  async do(work,delta=10){time+=delta;return work();},
  async init({enter=true}={}){
   await this.do(()=>session.create({slot,world:WORLD,teamCount}));
   await this.do(()=>session.dispatch('SESSION_STARTED',{sessionId:newId()}));
   if(enter)await this.do(()=>session.enterRegion('T1-R1'));
   return session.getState();
  },
  async draw(teamId,{regionId='T1-R1',random=()=>0}={}){return this.do(()=>session.drawQuestion(QUESTIONS,{regionId,teamId,random}));},
  async start(){return this.do(()=>session.dispatch('TIMER_STARTED'));},
  async submitCorrect(draw){return this.do(()=>session.submitAnswer({attemptId:draw.attemptId,response:correctAnswer(QUESTIONS.getOriginal(draw.questionId))}));},
  async judge(draw,decision,{missingResponseConfirmed=false,reason='교사 최종 근거 확인'}={}){
   return this.do(()=>session.judgeAnswer({attemptId:draw.attemptId,decision,teacherConfirmed:true,missingResponseConfirmed,teacherReason:reason}));
  },
  async answerCorrect(teamId){
   const draw=await this.draw(teamId);await this.start();await this.submitCorrect(draw);await this.judge(draw,'CORRECT');return draw;
  },
  async answerWrongWithoutResponse(teamId){
   const draw=await this.draw(teamId);await this.start();await this.do(()=>session.dispatch('TIMER_PAUSED'));
   await this.judge(draw,'INCORRECT',{missingResponseConfirmed:true,reason:'교사가 미응답을 확인하여 오답 판정'});
   return draw;
  },
  async interceptCorrect(sourceAttemptId,targetTeamId,questionId){
   await this.do(()=>session.openInterception({sourceAttemptId,targetTeamId}));
   const interceptionId=session.getState().interception.activeId;
   await this.do(()=>session.controlInterception('INTERCEPTION_TIMER_STARTED',{interceptionId}));
   await this.do(()=>session.controlInterception('INTERCEPTION_ANSWER_SUBMITTED',{
    interceptionId,response:correctAnswer(QUESTIONS.getOriginal(questionId))
   }));
   await this.do(()=>session.controlInterception('INTERCEPTION_JUDGED',{
    interceptionId,decision:'CORRECT',teacherReason:'교사 가로채기 정답 확정'
   }));return interceptionId;
  },
  async firstRegion({firstWrong=false,withInterception=true}={}){
   const first=firstWrong?await this.answerWrongWithoutResponse('TEAM_01'):await this.answerCorrect('TEAM_01');
   const second=await this.answerWrongWithoutResponse('TEAM_02');
   if(withInterception)await this.interceptCorrect(second.attemptId,'TEAM_01',second.questionId);
   await this.do(()=>session.completeRegion('T1-R1'));
   const state=session.getState();checkState(state);
   return{first,second,state,result:session.getRegionResult('T1-R1')};
  },
  async recoveryNextRegion({recoveryIndex=0}={}){
   await this.do(()=>session.enterRegion('T1-R2'));
   const recovery=session.getState().recovery.pending[recoveryIndex];
   await this.do(()=>session.controlRecovery('RECOVERY_CALLED',{
    recoveryId:recovery.id,regionId:'T1-R2',mode:'NATURAL',teamId:recovery.originTeamId,
    reason:'다음 방문 지역에서 원모둠 회수 수행'
   }));
   const current=session.getState().recovery.pending.find(x=>x.id===recovery.id);
   const runId=current.activeRunId;
   await this.do(()=>session.controlRecovery('RECOVERY_TIMER_STARTED',{recoveryId:recovery.id,runId}));
   await this.do(()=>session.controlRecovery('RECOVERY_ANSWER_SUBMITTED',{
    recoveryId:recovery.id,runId,response:correctAnswer(QUESTIONS.getOriginal(recovery.questionId))
   }));
   await this.do(()=>session.controlRecovery('RECOVERY_JUDGED',{
    recoveryId:recovery.id,runId,decision:'CORRECT',teacherReason:'교사 회수 정답 확정'
   }));return recovery.id;
  }
 };
}
