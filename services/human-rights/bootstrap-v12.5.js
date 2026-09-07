'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APP_VERSION = 'v12.5.6';

function patchFile(relPath, replacements) {
  const file = path.join(ROOT, relPath);
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  let next = text;
  for (const [from, to] of replacements) next = next.replace(from, to);
  if (next !== text) fs.writeFileSync(file, next, 'utf8');
}

// 배포 컨테이너에서 실행 직전에 버전 표기와 학생 UI 수정사항을 한 값으로 통일한다.
// 기존 학생 답안/명단/채점/볼륨 데이터에는 손대지 않는다.
patchFile('server.js', [[/v12\.(?:4|5)(?:\.\d+)?/g, APP_VERSION]]);
patchFile('public/student_1.js', [[/const VERSION='v12\.(?:4|5)(?:\.\d+)?';/, `const VERSION='${APP_VERSION}';`]]);
patchFile('public/student.html', [[/인권도시 정책결정 수행평가 v12\.(?:0|5)(?:\.\d+)?/g, `인권도시 정책결정 수행평가 ${APP_VERSION}`]]);
patchFile('public/teacher.html', [
  [/교사용 v12\.(?:4|5)(?:\.\d+)?/g, `교사용 ${APP_VERSION}`],
  [/const VERSION='v12\.(?:4|5)(?:\.\d+)?';/g, `const VERSION='${APP_VERSION}';`]
]);
patchFile('public/landing.html', [
  [/v12\.5\.\d+/g, APP_VERSION],
  [/<p class="schedule-note">※ 수행평가는 선생님의 안내에 따라 시작하세요\. 당일 일정은 자동으로 강조됩니다\.<\/p>/g, '']
]);
patchFile('public/student_3.js', [
  [/이 정보는 내 정책의 무엇을 바꾸나요\?<\/h2><p class="muted">1개 이상 선택하세요\.<\/p>/g, '이 정보는 내 정책의 무엇을 바꾸나요?</h2><p class="muted">1~2개 선택하세요.</p>'],
  [/else if\(state\.newImpacts\.length<3\)state\.newImpacts\.push\(id\)/g, "else if(state.newImpacts.length<2)state.newImpacts.push(id);else return alert('최대 2개까지 선택할 수 있습니다.')"],
  [/let resourceReturnScrollY=null,resourceReturnStep=null;/, `function submittedAnswerReviewHtml(){\n let first=(state.policyStations||[]).length?(state.policyStations||[]).map(sName).join(' · '):'선택 기록 없음';\n let final=(state.finalStations||[]).length?(state.finalStations||[]).map(sName).join(' · '):'선택 기록 없음';\n return \`<section class="card"><h2>📄 내가 제출한 답안 다시 보기</h2><p class="muted">자기평가서를 작성할 때 참고할 수 있습니다. 아래 내용은 읽기 전용이며 수정할 수 없습니다.</p><details open><summary style="cursor:pointer;font-weight:850;color:var(--navy);margin:8px 0 14px">제출 답안 보기 / 접기</summary><div class="grid grid2"><div class="notice"><b>1차 정책</b><br>\${esc(first)} (\${cost(state.policyStations||[])}억)</div><div class="notice good"><b>최종 정책</b><br>\${esc(final)} (\${cost(state.finalStations||[],true)}억)</div></div><div style="height:10px"></div><div class="detailBox"><b>① 정책 선택 이유</b><p style="white-space:pre-wrap">\${esc(state.answer1||'작성 기록 없음')}</p></div><div class="detailBox"><b>② 정책 영향과 보완</b><p style="white-space:pre-wrap">\${esc(state.answer2||'작성 기록 없음')}</p></div><div class="detailBox"><b>③ 최종 판단</b><p style="white-space:pre-wrap">\${esc(state.answer3||'작성 기록 없음')}</p></div></details></section>\`;\n}\nlet resourceReturnScrollY=null,resourceReturnStep=null;`],
  [/<section class="card"><h2>📝 자기평가서<\/h2>/, '${submittedAnswerReviewHtml()}<section class="card"><h2>📝 자기평가서</h2>']
]);

require('./server.js');
