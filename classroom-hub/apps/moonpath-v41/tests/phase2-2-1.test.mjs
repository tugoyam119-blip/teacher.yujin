import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SUPPORTED_QUESTION_TYPES, validateQuestionPack, createQuestionEngine,
  normalizeQuestion, publicQuestionView, gradeQuestionResponse
} from '../src/questions/engine.js';

const raw = JSON.parse(readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url),'utf8'));
const engine = createQuestionEngine(raw);
const questions = raw.questions;
const get = id => engine.getNormalized(id);
const fullAnswer = q => {
  const a=q.answer;
  switch(q.type){
    case 'single_choice':return a.correct[0];
    case 'true_false':return a.correct;
    case 'matching':return Object.fromEntries([...a.pairs].reverse());
    case 'ordering':return [...a.order];
    case 'categorization':return {...a.assignments};
    case 'short_text':return a.accepted[0];
    case 'manual':return '교사의 실질적 평가가 필요한 답변입니다.';
  }
};
const wrongAnswer = q=>{
  switch(q.type){
    case 'single_choice':return q.options.find(x=>x.key!==q.answer.correct[0]).key;
    case 'true_false':return !q.answer.correct;
    case 'matching':{
      const res=Object.fromEntries(q.answer.pairs);
      const [l1,l2]=Object.keys(res);
      [res[l1],res[l2]]=[res[l2],res[l1]];
      return res;
    }
    case 'ordering':return [...q.answer.order].reverse();
    case 'categorization':{
      const res={...q.answer.assignments};
      const id=Object.keys(res)[0];
      res[id]=q.options.categories.find(x=>x.key!==res[id]).key;
      return res;
    }
    case 'short_text':return '미등록 응답';
    case 'manual':return '관련 내용을 서술한 후 교사에게 제출합니다.';
  }
};
const status = (id,value)=>gradeQuestionResponse(get(id),value).status;

test('PHASE 2 계획과 공식 60문항 7종 원본 요약',()=>{
  const info=engine.info();
  assert.equal(info.count,60);
  assert.equal(info.uniqueIdCount,60);
  assert.equal(info.packId,'KR-HS-IS2-U01');
  assert.equal(info.packVersion,'1.0.0');
  assert.equal(info.missingExplicitSourceCount,60);
  assert.deepEqual(info.counts,{single_choice:25,true_false:8,matching:7,ordering:3,manual:8,categorization:6,short_text:3});
  assert.equal(SUPPORTED_QUESTION_TYPES.length,7);
});

test('원본 pack은 엔진 생성, 정규화, 답안 판정으로 변경되지 않음',()=>{
  const before=JSON.stringify(raw);
  for(const q of questions){engine.getOriginal(q.id);get(q.id);engine.getPublic(q.id);}
  assert.equal(JSON.stringify(raw),before);
  assert.deepEqual(engine.ids(),questions.map(q=>q.id));
});

test('반환한 문제 사본의 수정은 후속 원본 요청에 영향을 주지 않음',()=>{
  const a=engine.getNormalized('IS2-U01-A01');
  a.choices[0].text='임의 수정';a.answer.correct[0]='Z';a.original.question='임의 수정';
  const b=engine.getNormalized('IS2-U01-A01');
  assert.notEqual(b.choices[0].text,'임의 수정');
  assert.equal(b.answer.correct[0],'B');
  assert.notEqual(b.original.question,'임의 수정');
  const info=engine.info();info.counts.single_choice=0;
  assert.equal(engine.info().counts.single_choice,25);
});

test('학생 공개 문제에는 해설, 정답, 루브릭, 원문 메타 포함 금지',()=>{
  for(const q of questions){
    const pub=engine.getPublic(q.id);
    assert.deepEqual(Object.keys(pub).sort(),['questionId','type','stem','stimulus','choices','difficulty','packId','packVersion','revision'].sort());
    assert.equal(pub.questionId,q.id);
    assert.equal(pub.stem,q.question);
    assert.equal(pub.explanation,undefined);
    assert.equal(pub.answer,undefined);
    assert.equal(pub.original,undefined);
    assert.equal(pub.standards,undefined);
    assert.equal(pub.source,undefined);
    assert.ok(!Object.keys(pub).some(x=>/answer|rubric|solution|audit|pin/i.test(x)));
  }
  const teacher=get('IS2-U01-A01');
  teacher.choices[0].internalAnswer='DO_NOT_EXPOSE';
  assert.deepEqual(Object.keys(publicQuestionView(teacher).choices[0]).sort(),['key','text']);
  const match=get('IS2-U01-A05');
  match.choices.left[0].privateRubric='DO_NOT_EXPOSE';
  assert.deepEqual(Object.keys(publicQuestionView(match).choices.left[0]).sort(),['key','text']);
  const cat=get('IS2-U01-C05');
  cat.choices.items[0].internalAnswer='DO_NOT_EXPOSE';
  assert.deepEqual(Object.keys(publicQuestionView(cat).choices.items[0]).sort(),['key','text']);
});

test('발행 스냅샷은 원본/실제표시를 나누고 ID·버전·시각을 기록',()=>{
  const snap=engine.snapshot({questionId:'IS2-U01-A01',attemptId:'ATT-01',issuedAt:1000,choiceOrder:['D','B','C','A']});
  assert.deepEqual([snap.packId,snap.packVersion,snap.questionRevision],['KR-HS-IS2-U01','1.0.0',1]);
  assert.equal(snap.attemptId,'ATT-01');assert.equal(snap.issuedAt,1000);
  assert.deepEqual(snap.originalSnapshot.choices.map(x=>x.key),['A','B','C','D']);
  assert.deepEqual(snap.issuedSnapshot.choices.map(x=>x.key),['D','B','C','A']);
  assert.equal(gradeQuestionResponse(snap,'B').status,'correct');
  assert.equal(publicQuestionView(snap).answer,undefined);
});

test('스냅샷 구조는 발행 이후 원본이나 다른 스냅샷 변경과 독립',()=>{
  const snap=engine.snapshot({questionId:'IS2-U01-A01',attemptId:'ATT-02',issuedAt:1000});
  snap.originalSnapshot.answer.correct[0]='A';
  assert.equal(snap.issuedSnapshot.answer.correct[0],'B');
  assert.equal(engine.getNormalized('IS2-U01-A01').answer.correct[0],'B');
});

test('스냅샷 표시 순서는 전체 키의 중복 없는 순열이어야 함',()=>{
  const f=choiceOrder=>engine.snapshot({questionId:'IS2-U01-A01',attemptId:'ATT-03',issuedAt:1234,choiceOrder});
  assert.throws(()=>f(['A','A','C','D']),{code:'ORDER_INVALID'});
  assert.throws(()=>f(['A','B','C']),{code:'ORDER_INVALID'});
  assert.throws(()=>f(['A','B','C','Z']),{code:'ORDER_INVALID'});
  assert.throws(()=>engine.snapshot({questionId:'IS2-U01-A05',attemptId:'ATT-04',issuedAt:0,choiceOrder:['L1']}),{code:'ORDER_NOT_SUPPORTED'});
});

test('잘못된 팩/중복 ID/없는 정답 키/버전 필드 오류 차단',()=>{
  const mutator=(fn)=>{const bad=structuredClone(raw);fn(bad);return ()=>validateQuestionPack(bad);};
  assert.throws(mutator(p=>p.questions.pop()),{code:'PACK_COUNT'});
  assert.throws(mutator(p=>p.questions[1].id=p.questions[0].id),{code:'PACK_DUPLICATE_ID'});
  assert.throws(mutator(p=>p.questions[0].answer.correct[0]='Z'),{code:'PACK_INVALID'});
  assert.throws(mutator(p=>p.questions[0].meta.revision=null),{code:'PACK_INVALID'});
  assert.throws(mutator(p=>p.questions[0].type='unknown'),{code:'PACK_UNSUPPORTED_TYPE'});
  assert.throws(()=>engine.getOriginal('NOT_A_QUESTION'),{code:'QUESTION_UNKNOWN'});
});

test('부분 연결형은 교사 확인, 잘못된 키는 입력 거부',()=>{
  const q=get('IS2-U01-A05');
  assert.equal(gradeQuestionResponse(q,{L1:'R1'}).status,'needs_teacher');
  assert.equal(gradeQuestionResponse(q,{L1:'R1'}).reason,'INCOMPLETE_MATCHING');
  assert.throws(()=>gradeQuestionResponse(q,{L1:'NONE'}),{code:'RESPONSE_INVALID'});
  assert.throws(()=>gradeQuestionResponse(q,[['L1','R1'],['L1','R2']]),{code:'RESPONSE_INVALID'});
});

test('부분 분류·순서형은 자동 오답 단정 금지',()=>{
  const q=get('IS2-U01-C05');
  assert.equal(gradeQuestionResponse(q,{I1:'C1'}).status,'needs_teacher');
  assert.equal(gradeQuestionResponse(get('IS2-U01-B04'),['A','B']).status,'needs_teacher');
  assert.throws(()=>gradeQuestionResponse(get('IS2-U01-B04'),['A','A']),{code:'RESPONSE_INVALID'});
  assert.throws(()=>gradeQuestionResponse(q,{I999:'C1'}),{code:'RESPONSE_INVALID'});
});

test('단답형 원본의 허용 표기만 정확 일치 처리 (교과서 정답 임의 확대 없음)',()=>{
  assert.equal(status('IS2-U01-F06',' 시민 불복종  '),'correct');
  assert.equal(status('IS2-U01-F06','시민불복종'),'correct');
  assert.equal(status('IS2-U01-H06','30분'), 'correct');
  assert.equal(status('IS2-U01-H06','31분'), 'needs_teacher');
  assert.equal(status('IS2-U01-F06','다른 시민운동'),'needs_teacher');
  assert.equal(status('IS2-U01-F06','  '),'unanswered');
});

test('서술형은 단어 존재만으로 자동 정답 처리하지 않음',()=>{
  const q=get('IS2-U01-B08');
  assert.equal(gradeQuestionResponse(q,'자료 (가)는 자유와 평등을 보여 줍니다.').status,'needs_teacher');
  assert.equal(gradeQuestionResponse(q,'자료 (가)는 자유와 평등을 보여 줍니다.').isCorrect,null);
  assert.equal(gradeQuestionResponse(q,' ').status,'unanswered');
  assert.throws(()=>gradeQuestionResponse(q,{reply:'텍스트'}),{code:'RESPONSE_INVALID'});
});

test('정답 포함 교사용 원본 또는 snapshot 없이는 채점 차단',()=>{
  assert.throws(()=>gradeQuestionResponse(engine.getPublic('IS2-U01-A01'),'B'),{code:'QUESTION_INVALID'});
  assert.throws(()=>gradeQuestionResponse(null,'B'),{code:'QUESTION_INVALID'});
});

test('진위형은 boolean/O/X만 허용, 다른 암묵적 변환 금지',()=>{
  const q=get('IS2-U01-A04');
  assert.equal(gradeQuestionResponse(q,'X').status,'correct');
  assert.equal(gradeQuestionResponse(q,'O').status,'incorrect');
  assert.throws(()=>gradeQuestionResponse(q,0),{code:'RESPONSE_INVALID'});
  assert.throws(()=>gradeQuestionResponse(q,'틀림'),{code:'RESPONSE_INVALID'});
});

test('정답 판정 결과는 보상·점수·열쇠를 임의 지급하지 않음',()=>{
  for(const q of questions){
    const graded=gradeQuestionResponse(get(q.id),fullAnswer(q));
    assert.deepEqual(Object.keys(graded).sort(),['questionId','status','isCorrect','autoGraded','needsTeacherReview','reason'].sort());
    assert.equal(graded.starlight,undefined);
    assert.equal(graded.keys,undefined);
    assert.equal(graded.points,undefined);
  }
});

// Exhaustive per-question coverage: each of 60 original ID/type/revision records is executed.
for(const rawQuestion of questions){
  test(`실제 문항 ${rawQuestion.id} ${rawQuestion.type}: 정규화·원본보존·정답 판정`,()=>{
    const q=get(rawQuestion.id);
    assert.equal(q.questionId,rawQuestion.id);
    assert.equal(q.stem,rawQuestion.question);
    assert.equal(q.explanation,rawQuestion.explanation);
    assert.deepEqual(q.answer,rawQuestion.answer);
    assert.deepEqual(q.choices,rawQuestion.options);
    assert.deepEqual(q.conceptTags,rawQuestion.meta.concepts);
    assert.equal(q.revision,rawQuestion.meta.revision);
    assert.equal(q.difficulty,rawQuestion.difficulty);
    assert.equal(q.source,null); // no per-question source found in v1.0.0; not guessed
    const snap=engine.snapshot({questionId:q.questionId,attemptId:'attempt-'+q.questionId,issuedAt:20261014});
    const graded=gradeQuestionResponse(snap,fullAnswer(rawQuestion));
    if(rawQuestion.type==='manual'){
      assert.equal(graded.status,'needs_teacher');
      assert.equal(graded.autoGraded,false);
    }else{
      assert.equal(graded.status,'correct');
      assert.equal(graded.isCorrect,true);
    }
    const wrong=gradeQuestionResponse(snap,wrongAnswer(rawQuestion));
    if(rawQuestion.type==='manual'||rawQuestion.type==='short_text'){
      assert.equal(wrong.status,'needs_teacher');
    }else{
      assert.equal(wrong.status,'incorrect');
    }
    const pub=publicQuestionView(snap);
    assert.equal(pub.questionId,rawQuestion.id);
    assert.equal(pub.answer,undefined);
    assert.equal(pub.explanation,undefined);
  });
}

test('선택지 셔플 25개 객관식 및 11개 진위·순서형에서 정답 키 불변',()=>{
  let cases=0;
  for(const q of questions.filter(x=>['single_choice','true_false','ordering'].includes(x.type))){
    const originalKeys=q.options.map(x=>x.key);
    const shuffled=[...originalKeys].reverse();
    const snap=engine.snapshot({questionId:q.id,attemptId:'shuffle-'+q.id,issuedAt:1728888888,choiceOrder:shuffled});
    assert.deepEqual(snap.issuedSnapshot.choices.map(x=>x.key),shuffled);
    assert.deepEqual(snap.originalSnapshot.choices.map(x=>x.key),originalKeys);
    assert.equal(gradeQuestionResponse(snap,fullAnswer(q)).status,'correct');
    cases++;
  }
  assert.equal(cases,36);
});

test('학생 공개 발행 화면 변조는 내부 스냅샷과 정답에 영향 없음',()=>{
  for(const q of questions){
    const snap=engine.snapshot({questionId:q.id,attemptId:'public-'+q.id,issuedAt:1728888888});
    const pub=publicQuestionView(snap);
    pub.stem='학생 화면 수정';
    if (Array.isArray(pub.choices) && pub.choices.length) pub.choices[0].text='수정';
    assert.equal(gradeQuestionResponse(snap,fullAnswer(q)).status,q.type==='manual'?'needs_teacher':'correct');
    assert.notEqual(snap.issuedSnapshot.stem,'학생 화면 수정');
  }
});
