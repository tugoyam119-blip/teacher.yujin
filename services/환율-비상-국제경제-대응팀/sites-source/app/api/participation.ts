/* eslint-disable @typescript-eslint/no-explicit-any */
import {isMeaninglessRepetition} from '../answer-validation';

const fields=['exportReason','importReason','policyEffect','policyRisk','report'];
export const GRADING_VERSION='participation-v1';

// Evidence of changes is not a measurement of attention. Never count idle heartbeats.
export function participationDelta(row:any, answers:any, now:number){
 if(row.paused_at)return {changes:0,seconds:0,last:row.last_writing_at||null};
 let old:any={};try{old=JSON.parse(row.answers||'{}')}catch{}
 const changed=fields.filter(k=>String(old[k]||'').trim()!==String(answers[k]||'').trim() && String(answers[k]||'').trim() && !isMeaninglessRepetition(answers[k]));
 const gap=now-Number(row.last_writing_at||now);
 return {changes:changed.length?1:0,seconds:changed.length&&row.last_writing_at&&Number(row.writing_pause_seconds||0)===Number(row.paused_seconds||0)&&gap>0&&gap<=120000?Math.floor(gap/1000):0,last:changed.length?now:row.last_writing_at||null};
}

export function participationReview(row:any, answers:any, completion:number){
 const valid=fields.filter(k=>String(answers[k]||'').trim().length>=4&&!isMeaninglessRepetition(answers[k])&&!/^(모름|모르겠다|없음|해당 없음|노력해야 한다)[.! ]*$/.test(String(answers[k]).trim()));
 const flags:string[]=[];
 const elapsed=row.started_at&&row.submitted_at?Math.max(0,Math.floor((Number(row.submitted_at)-Number(row.started_at))/1000)-Number(row.paused_seconds||0)):null;
 const changes=Number(row.writing_changes||0),seconds=Number(row.writing_seconds||0);
 if(!changes)flags.push('작성 변경 이력 없음: 기존 답안 또는 기록 부족이며 미참여로 단정하지 않음');
 if(elapsed!==null&&elapsed>=1200&&valid.length<3)flags.push('경과 시간에 비해 실제 작성 근거가 부족함: 켜둔 시간만으로 참여점수를 부여하지 않음');
 if(Number(row.paused_seconds||0)>0||row.paused_at)flags.push('일시중단 기록 확인: 중단 시간을 참여 부족으로 감점하지 않음');
 if(Number(row.extra_granted_minutes||0)>0)flags.push(row.extra_penalty_exempt?'추가시간 감점 면제 적용':'추가시간 사용: 사유 및 기존 시간 준수 배점 확인');
 if(['teacher_close','makeup_close','timeout'].includes(row.submission_type))flags.push('자동·교사 마감 답안: 미완성 사유 확인');
 if(row.submission_type==='mock')flags.push('모의 답안: 실제 학생 평가와 구분');
 // Only the existing 4-point completion area may recognize corroborated process evidence.
 // No duration threshold, minimum total, rank or target average is used.
 const corroborated=changes>=3&&seconds>0&&Number(row.current_step)>=5&&valid.length===5;
 return {completion:corroborated?Math.max(completion,4):completion,flags,evidence:{elapsedSeconds:elapsed,writingChanges:changes,writingIntervalSeconds:seconds,validNarratives:valid.length,corroborated,limitation:'서버에 저장된 작성 변경 사이의 제한된 구간이며 실제 집중 시간이나 답안의 질을 보증하지 않음'}};
}
