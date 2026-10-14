/**
 * PHASE 2 / STEP 2-1: immutable adapter for the ACTUAL YQBank 1.0.0 pack.
 * No draw order, scoring reward, timer, IndexedDB, DOM or student broadcast lives here.
 * Only teacher-side snapshots contain answer/rubric/explanation.
 */
import {clone, insist, requireId, validTimestamp} from '../engine/model.js';

export const SUPPORTED_QUESTION_TYPES = Object.freeze([
  'single_choice','true_false','matching','ordering','manual','categorization','short_text'
]);
const TYPES = new Set(SUPPORTED_QUESTION_TYPES);
const mustText = (s, name) => insist(typeof s === 'string' && s.trim().length > 0, 'PACK_INVALID', `${name}이(가) 비어 있습니다.`);
const keyList = (items, name) => {
  insist(Array.isArray(items) && items.length > 0, 'PACK_INVALID', `${name} 선택지가 없습니다.`);
  const keys = [];
  for (const item of items) {
    mustText(item?.key, `${name} 키`);
    mustText(item?.text, `${name} 내용`);
    keys.push(item.key);
  }
  insist(new Set(keys).size === keys.length, 'PACK_INVALID', `${name} 키가 중복되었습니다.`);
  return keys;
};
function sameSet(values, expected) {
  return values.length === expected.length && new Set(values).size === values.length &&
    values.every(value => expected.includes(value));
}
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const safeObject = value => value && typeof value === 'object' && !Array.isArray(value);

/** Checks all seven source formats and never fabricates missing fields. */
export function validateQuestionPack(rawPack) {
  insist(safeObject(rawPack) && safeObject(rawPack.pack) && Array.isArray(rawPack.questions),'PACK_INVALID','문제팩 구조가 올바르지 않습니다.');
  const {pack, questions} = rawPack;
  mustText(pack.id,'팩 ID'); mustText(pack.pack_version,'팩 버전');
  insist(questions.length === 60,'PACK_COUNT','v1.0.0 공식 문제팩의 문항 수는 60개여야 합니다.');
  const ids = new Set(); const counts = Object.fromEntries(SUPPORTED_QUESTION_TYPES.map(k=>[k,0]));
  let missingSource = 0;
  for (const q of questions) {
    mustText(q?.id,'문항 ID');
    insist(!ids.has(q.id),'PACK_DUPLICATE_ID',`문항 ID가 중복되었습니다: ${q.id}`);
    ids.add(q.id);
    insist(TYPES.has(q.type),'PACK_UNSUPPORTED_TYPE',`지원하지 않는 유형입니다: ${q.type}`);
    counts[q.type]++;
    mustText(q.question,`${q.id} 문제`);
    mustText(q.explanation,`${q.id} 해설`);
    insist(Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 5,'PACK_INVALID',`${q.id} 난도 오류`);
    insist(Number.isInteger(q.meta?.revision) && q.meta.revision >= 1,'PACK_INVALID',`${q.id} 수정 버전 오류`);
    insist(Array.isArray(q.meta?.concepts),'PACK_INVALID',`${q.id} 개념 태그 오류`);
    insist(safeObject(q.answer),'PACK_INVALID',`${q.id} 정답 오류`);
    if (q.source == null && q.meta?.source == null) missingSource++;
    const ans = q.answer;
    if (['single_choice','true_false','ordering'].includes(q.type)) {
      const options = keyList(q.options, q.id);
      if (q.type === 'single_choice') insist(Array.isArray(ans.correct) && ans.correct.length === 1 && options.includes(ans.correct[0]),'PACK_INVALID',`${q.id} 객관식 정답 오류`);
      if (q.type === 'true_false') insist(typeof ans.correct === 'boolean' && options.includes('O') && options.includes('X'),'PACK_INVALID',`${q.id} 진위형 정답 오류`);
      if (q.type === 'ordering') insist(Array.isArray(ans.order) && sameSet(ans.order,options),'PACK_INVALID',`${q.id} 순서형 정답 오류`);
    } else if (q.type === 'matching') {
      const left = keyList(q.options?.left, `${q.id} 왼쪽`);
      const right = keyList(q.options?.right, `${q.id} 오른쪽`);
      insist(Array.isArray(ans.pairs) && ans.pairs.every(p=>Array.isArray(p)&&p.length===2) &&
        sameSet(ans.pairs.map(p=>p[0]),left) && ans.pairs.every(p=>right.includes(p[1])),'PACK_INVALID',`${q.id} 연결형 정답 오류`);
    } else if (q.type === 'categorization') {
      const items = keyList(q.options?.items,`${q.id} 분류 항목`);
      const cats = keyList(q.options?.categories,`${q.id} 분류 범주`);
      insist(safeObject(ans.assignments) && sameSet(Object.keys(ans.assignments),items) &&
        Object.values(ans.assignments).every(value=>cats.includes(value)),'PACK_INVALID',`${q.id} 분류형 정답 오류`);
    } else if (q.type === 'short_text') {
      insist(Array.isArray(ans.accepted) && ans.accepted.length > 0 && ans.accepted.every(s=>typeof s==='string'&&s.trim()) && typeof ans.case_sensitive==='boolean','PACK_INVALID',`${q.id} 단답형 정답 오류`);
      insist(Array.isArray(q.options),'PACK_INVALID',`${q.id} 단답형 선택지 오류`);
    } else if (q.type === 'manual') {
      insist(Array.isArray(ans.rubric) && ans.rubric.length>0 && ans.rubric.every(s=>typeof s==='string'&&s.trim()),'PACK_INVALID',`${q.id} 서술형 기준 오류`);
      insist(Array.isArray(q.options),'PACK_INVALID',`${q.id} 서술형 선택지 오류`);
    }
  }
  return {packId:pack.id,packVersion:pack.pack_version,count:questions.length,uniqueIdCount:ids.size,counts,missingExplicitSourceCount:missingSource};
}

/** Read-only API: all returned records are detached copies. */
export function createQuestionEngine(rawPack) {
  const provenance = validateQuestionPack(rawPack);
  const pack = clone(rawPack);
  const map = new Map(pack.questions.map(q=>[q.id,q]));
  function original(questionId) {
    requireId(questionId,'문항');
    insist(map.has(questionId),'QUESTION_UNKNOWN',`존재하지 않는 문항 ID입니다: ${questionId}`);
    return map.get(questionId);
  }
  const engine = {
    info:()=>clone(provenance),
    ids:()=>[...map.keys()],
    getOriginal: id=>clone(original(id)),
    getNormalized: id=>normalizeQuestion(original(id),pack.pack),
    getPublic: id=>publicQuestionView(normalizeQuestion(original(id),pack.pack)),
    snapshot: ({questionId,attemptId,issuedAt,choiceOrder=null})=>{
      requireId(attemptId,'시도');validTimestamp(issuedAt);
      const normalized=normalizeQuestion(original(questionId),pack.pack);
      // Preserve the original separately from the exact question as it was displayed.
      const issued=clone(normalized);
      if (choiceOrder !== null) {
        insist(Array.isArray(issued.choices),'ORDER_NOT_SUPPORTED','이 유형은 단일 선택지 순서를 변경할 수 없습니다.');
        const keys=issued.choices.map(x=>x.key);
        insist(Array.isArray(choiceOrder) && sameSet(choiceOrder,keys),'ORDER_INVALID','실제 표시 순서가 원본 선택지의 순열이 아닙니다.');
        const byKey=new Map(issued.choices.map(c=>[c.key,c]));
        issued.choices=choiceOrder.map(k=>byKey.get(k));
      }
      return {
        attemptId,questionId,issuedAt,packId:pack.pack.id,packVersion:pack.pack.pack_version,
        questionRevision:normalized.revision,
        originalSnapshot:normalizeQuestion(original(questionId),pack.pack),
        issuedSnapshot:issued
      };
    }
  };
  return Object.freeze(engine);
}

export function normalizeQuestion(q,packMeta) {
  insist(safeObject(q) && safeObject(packMeta),'PACK_INVALID','문항과 팩 메타데이터가 필요합니다.');
  return {
    questionId:q.id,type:q.type,stem:q.question,stimulus:q.stimulus??'',
    choices:clone(q.options),answer:clone(q.answer),answerDisplay:q.answer_display??null,
    explanation:q.explanation,conceptTags:clone(q.meta.concepts),difficulty:q.difficulty,
    source:q.source??q.meta.source??null,
    revision:q.meta.revision,packId:packMeta.id,packVersion:packMeta.pack_version,
    standards:clone(q.meta.standards??[]),
    // Non-lossy source version without rewriting any approved question text or answer.
    original:clone(q)
  };
}

/** Public projection is an explicit allowlist, NEVER a spread of a teacher object. */
export function publicQuestionView(questionOrSnapshot) {
  const q=questionOrSnapshot?.issuedSnapshot??questionOrSnapshot;
  insist(q && typeof q.questionId==='string' && TYPES.has(q.type) && q.choices!==undefined,'QUESTION_INVALID','공개할 문항이 없습니다.');
  return {
    questionId:q.questionId,type:q.type,stem:q.stem,stimulus:q.stimulus,
    choices:clone(q.choices),difficulty:q.difficulty,
    packId:q.packId,packVersion:q.packVersion,revision:q.revision
  };
}

const result=(q,status,reason=null)=>({
  questionId:q.questionId,status,isCorrect:status==='correct'?true:status==='incorrect'?false:null,
  autoGraded:status==='correct'||status==='incorrect',
  needsTeacherReview:status==='needs_teacher',reason
});
const incomplete=(q,reason)=>result(q,'needs_teacher',reason);
const responseSet=(keys,valid,question,kind)=>{
  const arr=Array.isArray(keys)?keys:keys;
  insist(Array.isArray(arr),'RESPONSE_INVALID',`${kind} 응답 형식이 올바르지 않습니다.`);
  insist(new Set(arr).size===arr.length && arr.every(k=>typeof k==='string' && valid.includes(k)),'RESPONSE_INVALID',`${kind}에 없는 키 또는 중복 선택입니다.`);
  return arr;
};
const normalizedText=(str,caseSensitive)=>{
  const value=str.normalize('NFKC').trim().replace(/\s+/gu,' ');
  return caseSensitive?value:value.toLocaleLowerCase('ko-KR');
};

/** Auto-grades unambiguous fully specified responses; manual/ambiguous answers stay pending. */
export function gradeQuestionResponse(teacherQuestionOrSnapshot,response) {
  const q=teacherQuestionOrSnapshot?.issuedSnapshot??teacherQuestionOrSnapshot;
  insist(q && TYPES.has(q.type) && typeof q.questionId==='string' && q.answer && q.choices!==undefined,'QUESTION_INVALID','교사용 정답 스냅샷이 필요합니다.');
  if (response===null||response===undefined||response==='') return result(q,'unanswered','NO_RESPONSE');
  const a=q.answer;
  if (q.type==='manual') {
    insist(typeof response==='string','RESPONSE_INVALID','서술형 답변은 텍스트여야 합니다.');
    return response.trim()?incomplete(q,'MANUAL_RUBRIC'):result(q,'unanswered','NO_RESPONSE');
  }
  if (q.type==='short_text') {
    insist(typeof response==='string','RESPONSE_INVALID','단답형 답변은 텍스트여야 합니다.');
    const value=normalizedText(response,a.case_sensitive);
    if (!value) return result(q,'unanswered','NO_RESPONSE');
    if (a.accepted.some(s=>normalizedText(s,a.case_sensitive)===value))return result(q,'correct');
    // Unlisted spelling/synonyms are not silently treated as wrong.
    return incomplete(q,'SHORT_TEXT_NOT_EXACT');
  }
  if (q.type==='single_choice') {
    const key=Array.isArray(response)&&response.length===1?response[0]:response;
    const keys=q.choices.map(o=>o.key);
    insist(typeof key==='string'&&keys.includes(key),'RESPONSE_INVALID','객관식 응답은 유효한 선택지 키여야 합니다.');
    return result(q,key===a.correct[0]?'correct':'incorrect');
  }
  if (q.type==='true_false') {
    const truth=typeof response==='boolean'?response:response==='O'?true:response==='X'?false:null;
    insist(truth!==null,'RESPONSE_INVALID','진위형 답변은 true/false 또는 O/X여야 합니다.');
    return result(q,truth===a.correct?'correct':'incorrect');
  }
  if (q.type==='ordering') {
    const valid=q.choices.map(x=>x.key);
    responseSet(response,valid,q,'순서형');
    if (!sameSet(response,valid)) return incomplete(q,'INCOMPLETE_ORDER');
    return result(q,response.every((key,i)=>key===a.order[i])?'correct':'incorrect');
  }
  if (q.type==='matching') {
    const pairs=Array.isArray(response)?response:Object.entries(response??{});
    insist(Array.isArray(pairs)&&pairs.every(x=>Array.isArray(x)&&x.length===2),'RESPONSE_INVALID','연결형은 키 쌍으로 제출해야 합니다.');
    const left=q.choices.left.map(x=>x.key),right=q.choices.right.map(x=>x.key);
    const submitted=responseSet(pairs.map(x=>x[0]),left,q,'연결형');
    insist(pairs.every(x=>typeof x[1]==='string'&&right.includes(x[1])),'RESPONSE_INVALID','오른쪽 선택지에 없는 키가 있습니다.');
    if (!sameSet(submitted,left)) return incomplete(q,'INCOMPLETE_MATCHING');
    const expected=new Map(a.pairs);
    return result(q,pairs.every(([l,r])=>expected.get(l)===r)?'correct':'incorrect');
  }
  if (q.type==='categorization') {
    insist(safeObject(response),'RESPONSE_INVALID','분류형은 항목별 범주 키 객체로 제출해야 합니다.');
    const items=q.choices.items.map(x=>x.key), cats=q.choices.categories.map(x=>x.key);
    const submitted=responseSet(Object.keys(response),items,q,'분류형');
    insist(Object.values(response).every(k=>typeof k==='string'&&cats.includes(k)),'RESPONSE_INVALID','없는 범주 키를 선택했습니다.');
    if (!sameSet(submitted,items)) return incomplete(q,'INCOMPLETE_CATEGORIZATION');
    return result(q,items.every(i=>response[i]===a.assignments[i])?'correct':'incorrect');
  }
  insist(false,'QUESTION_UNSUPPORTED','알 수 없는 문항 유형입니다.');
}
