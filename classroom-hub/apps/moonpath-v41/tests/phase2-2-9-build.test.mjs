/** Static artifact tests, not evidence of Chrome file:// or native IDB support. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const artifact=new URL('../dist/phase2-9-one-region-smoke.html',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('../dist/phase2-9-build-manifest.json',import.meta.url),'utf8'));
const html=readFileSync(artifact,'utf8');
const pack=readFileSync(new URL('../data/YQBank_60_v1.0.0_source.json',import.meta.url));
test('2-9 단일 HTML 시험 파일 생성 및 무결성 SHA-256',()=>{
 assert.ok(existsSync(artifact));assert.ok(html.startsWith('<!doctype html>'));
 assert.equal(createHash('sha256').update(html).digest('hex'),manifest.buildSha256);
 assert.equal(Buffer.byteLength(html),manifest.htmlBytes);assert.equal(manifest.testOnly,true);
});
test('실제 원본 60문항은 변조되지 않고 원본 그대로 포함',()=>{
 assert.equal(createHash('sha256').update(pack).digest('hex'),'3a2401498a73bf5afd7ed72329ef07d4dd742d58f5ab27ab966841cc67c5de7f');
 const m=html.match(/<script id="mp-bundle" type="application\/json">([\s\S]*?)<\/script>/);
 assert.ok(m);const obj=JSON.parse(m[1]);
 assert.equal(obj.pack.questions.length,60);
 assert.deepEqual(obj.pack,JSON.parse(pack.toString()));
 assert.equal(obj.world.themes.length,6);
 assert.equal(Object.keys(obj.modules).length,manifest.moduleCount);
});
test('외부 네트워크/CDN/원격 글꼴 링크·fetch/XHR/외부 script 사용 금지',()=>{
 assert.equal(/<script[^>]*\bsrc=/i.test(html),false);
 assert.equal(/<link[^>]*\bhref=/i.test(html),false);
 assert.equal(/https?:\/\//i.test(html),false);
 assert.equal(/\b(?:fetch|XMLHttpRequest)\s*\(/.test(html),false);
});
test('960×540 contain·중앙 문제 팝업·교사 버튼 존재(정적 검사)',()=>{
 assert.match(html,/#canvas\{width:960px;height:540px/);
 assert.match(html,/Math\.min\(innerWidth\/960,innerHeight\/540\)/);
 assert.match(html,/#question-pane\{[^}]*top:128px;width:820px;max-height:360px/);
 for(const id of ['slot-picker','new-expedition','continue-expedition','draw-question','timer-start','submit-answer','judge-right',
  'judge-wrong','intercept-open','complete-region','next-region','recovery-call','export-json','import-json'])
  assert.ok(html.includes(`id="${id}"`),id);
});
test('독립 시험 DB, 구운영 localStorage 키와 강제 초기화 API 접근 없음',()=>{
 assert.match(html,/moonpath-v411-phase29-smoke-db-v1/);
 assert.equal(/moonpath-home-v3|moonpath\.expedition\.slot[123]|unknownPath\.pack\.v12/.test(html),false);
 assert.equal(/indexedDB\.deleteDatabase\(|\.clear\(\)|localStorage\.clear\(/.test(html),false);
});
test('단일 HTML은 시험본임을 밝히고 정식 배포 증거 없음',()=>{
 assert.ok(html.includes('검증 전용'));
 assert.ok(html.includes('새 픽셀아트 및 최종 승인 UI가 아닙니다.'));
 assert.equal(manifest.actualBrowserIdbStatus,'NOT_TESTED');
 assert.equal(manifest.offlineFileCompatibility,'NOT_TESTED');
 assert.equal(manifest.fullGameBuild,false);
});
