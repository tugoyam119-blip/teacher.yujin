import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const pack = json('../data/YQBank_60_v1.0.0_source.json');
const world = json('../config/world.json');
const gates = json('../data/verification-v01-v22.json');
test('원본 파일 자체 SHA-256 보존', () => {
  const raw = readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json', import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),'3a2401498a73bf5afd7ed72329ef07d4dd742d58f5ab27ab966841cc67c5de7f');
});
test('원본 문제팩: 60문항과 고유 ID, 내용/정답/해설 누락 없음', () => {
  assert.equal(pack.pack.id, 'KR-HS-IS2-U01');
  assert.equal(pack.pack.pack_version, '1.0.0');
  assert.equal(pack.questions.length, 60);
  const ids = new Set(pack.questions.map(q => q.id));
  assert.equal(ids.size, 60);
  for (const q of pack.questions) {
    assert.ok(q.id && q.question && q.explanation && q.answer);
    assert.ok(Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 5);
    assert.ok(q.meta && Number.isInteger(q.meta.revision));
  }
});
test('실제 문제은행의 일곱 가지 원형을 삭제하지 않음', () => {
  const expected = {single_choice:25,true_false:8,matching:7,ordering:3,manual:8,categorization:6,short_text:3};
  const got = {};
  for (const q of pack.questions) got[q.type] = (got[q.type] ?? 0) + 1;
  assert.deepEqual(got,expected);
});
test('원본 정답 포맷 내부 참조 무결성', () => {
  for (const q of pack.questions) {
    const a=q.answer, choices=q.options;
    if (q.type==='single_choice') {
      const keys=new Set(choices.map(o=>o.key));
      assert.ok(a.correct.length>=1 && a.correct.every(x=>keys.has(x)),q.id);
    } else if (q.type==='true_false') {
      assert.equal(typeof a.correct, 'boolean',q.id);
    } else if (q.type==='matching') {
      const left=new Set(choices.left.map(o=>o.key)),right=new Set(choices.right.map(o=>o.key));
      assert.ok(a.pairs.length>0 && a.pairs.every(([l,r])=>left.has(l)&&right.has(r)),q.id);
    } else if (q.type==='ordering') {
      const keys=new Set(choices.map(o=>o.key));
      assert.ok(a.order.length>0 && a.order.every(k=>keys.has(k)),q.id);
    } else if (q.type==='categorization') {
      const items=new Set(choices.items.map(o=>o.key)),cats=new Set(choices.categories.map(o=>o.key));
      assert.ok(Object.entries(a.assignments).every(([i,k])=>items.has(i)&&cats.has(k)),q.id);
    } else if (q.type==='short_text') {
      assert.ok(Array.isArray(a.accepted)&&a.accepted.length>0,q.id);
    } else if (q.type==='manual') {
      assert.ok(Array.isArray(a.rubric)&&a.rubric.length>0,q.id);
    } else {
      assert.fail('미지원 원본 유형 '+q.type);
    }
  }
});
test('30개 지역·6개 테마와 세계 이름 검증', () => {
  assert.equal(world.themes.length,6);
  const regions=world.themes.flatMap(t=>t.regions);
  assert.equal(regions.length,30);
  assert.equal(new Set(regions.map(r=>r.id)).size,30);
  assert.equal(new Set(regions.map(r=>r.name)).size,30);
  for(const theme of world.themes)assert.deepEqual(theme.regions.map(x=>x.role),['entry','left','right','merge','final']);
});
test('22개 필수 게이트의 미검증 상태를 그대로 유지', () => {
  assert.equal(gates.length,22);
  assert.deepEqual(gates.map(v=>v.id),Array.from({length:22},(_,i)=>'V'+String(i+1).padStart(2,'0')));
  assert.ok(gates.every(v=>v.testStatus==='NOT_RUN'&&v.userApproval==='미승인'&&v.evidence.length===0));
});
