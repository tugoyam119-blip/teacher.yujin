'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APP_VERSION = 'v12.5';

function patchFile(relPath, replacements) {
  const file = path.join(ROOT, relPath);
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  let next = text;
  for (const [from, to] of replacements) next = next.replace(from, to);
  if (next !== text) fs.writeFileSync(file, next, 'utf8');
}

// 배포 컨테이너에서 실행 직전에 버전 표기를 한 값으로 통일한다.
// 기존 학생 답안/명단/채점/볼륨 데이터에는 손대지 않는다.
patchFile('server.js', [[/v12\.4/g, APP_VERSION]]);
patchFile('public/student_1.js', [[/const VERSION='v12\.4';/, `const VERSION='${APP_VERSION}';`]]);
patchFile('public/student.html', [[/인권도시 정책결정 수행평가 v12\.0/g, `인권도시 정책결정 수행평가 ${APP_VERSION}`]]);

require('./server.js');
