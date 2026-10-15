/**
 * PHASE 2-3 — Immutable answer intake + teacher-confirmed final judgement.
 * A suggestion NEVER grants resources or finalizes a question by itself.
 * This module is pure: no DOM, storage, wall clock, or network access.
 */
import {clone,insist,validTimestamp} from '../engine/model.js';
import {gradeQuestionResponse} from './engine.js';

export const JUDGEMENTS=Object.freeze(['CORRECT','INCORRECT']);
const MAX_RESPONSE_JSON_CHARS=20000;
const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

function assertAnswerSize(response){
  let json;
  try{json=JSON.stringify(response);}catch{insist(false,'RESPONSE_INVALID','답안은 직렬화 가능한 자료여야 합니다.');}
  insist(typeof json==='string'&&json.length<=MAX_RESPONSE_JSON_CHARS,'RESPONSE_TOO_LARGE','답안의 최대 저장 크기를 초과했습니다.');
}

/** Validate and grade exclusively from the persisted, private issued snapshot. */
export function assessAnswer(attempt,response){
  insist(attempt?.questionSnapshot?.issuedSnapshot?.answer && attempt.questionSnapshot.issuedSnapshot.questionId===attempt.questionId,
    'QUESTION_SNAPSHOT_MISSING','기록된 교사용 발행 문항 스냅샷이 필요합니다.');
  insist(response!==null&&response!==undefined&&response!=='','ANSWER_EMPTY','답변을 입력하지 않은 경우 교사의 미응답 판정 절차를 사용하세요.');
  assertAnswerSize(response);
  const suggestion=gradeQuestionResponse(attempt.questionSnapshot,response);
  insist(suggestion.status!=='unanswered','ANSWER_EMPTY','빈 응답은 답변 접수로 처리하지 않습니다.');
  return {response:clone(response),suggestion:clone(suggestion)};
}

/** Final judgement can override an automatic suggestion only with a written reason. */
export function validateTeacherJudgement(attempt,{decision,teacherConfirmed,teacherReason=null,missingResponseConfirmed=false}={},at){
  validTimestamp(at);
  insist(attempt?.questionSnapshot,'QUESTION_SNAPSHOT_MISSING','공식 문항 출제 기록이 없는 시도는 교과 판정을 할 수 없습니다.');
  insist(teacherConfirmed===true,'TEACHER_REQUIRED','교사의 최종 판정 확인이 필요합니다.');
  insist(JUDGEMENTS.includes(decision),'JUDGEMENT_INVALID','최종 판정은 CORRECT 또는 INCORRECT만 가능합니다.');
  insist(attempt.timer.phase!=='RESOLVED' && !attempt.judgement,'ALREADY_JUDGED','이미 확정된 판정은 2-7 정정 절차가 필요합니다.');
  insist(teacherReason===null || (typeof teacherReason==='string'&&teacherReason.length<=2000),'REASON_INVALID','교사 판정 사유 형식이 올바르지 않습니다.');
  const reason=typeof teacherReason==='string'?teacherReason.trim():'';
  if(!attempt.answer){
    insist(decision==='INCORRECT' && missingResponseConfirmed===true,
      'NO_ANSWER_CONFIRMATION','답변이 없을 때는 교사가 미응답을 명시적으로 확인한 경우에만 오답 처리할 수 있습니다.');
    insist(['PAUSED','EXPIRED_AWAITING_TEACHER'].includes(attempt.timer.phase)&&attempt.timer.startedAt!==undefined,
      'NO_ANSWER_CONFIRMATION','문제를 시작한 뒤 타이머가 정지하거나 만료되어야 미응답 판정이 가능합니다.');
    insist(reason.length>0,'JUDGEMENT_REASON_REQUIRED','미응답 판정에는 사유를 기록해야 합니다.');
  }else{
    const auto=attempt.answer.suggestion;
    const expected=auto.status==='correct'?'CORRECT':auto.status==='incorrect'?'INCORRECT':null;
    if(expected!==decision || auto.needsTeacherReview)insist(reason.length>0,'JUDGEMENT_REASON_REQUIRED','자동 권고와 다른 판정이나 교사검토 대상은 판단 근거를 기록해야 합니다.');
  }
  return {decision,teacherReason:reason||null,missingResponse:!attempt.answer};
}
