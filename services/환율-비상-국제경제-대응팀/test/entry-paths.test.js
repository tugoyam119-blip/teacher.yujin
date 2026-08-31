const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BASE = 'https://exchange-crisis-team.tugoyam119.chatgpt.site';
const PORT = 41000 + Math.floor(Math.random() * 1000);
const SERVICE_DIR = path.resolve(__dirname, '..');
let server;

function request(pathname, { method = 'GET', body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: pathname,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      } : {},
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location,
        headers: res.headers,
        body: data,
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: SERVICE_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await request('/health');
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('테스트 서버가 시작되지 않았습니다.');
});

after(() => {
  if (server && !server.killed) server.kill();
});

test('핵심 진입 경로를 pathname 기준으로 반복 판정한다', async () => {
  const cases = [
    ['/', `${BASE}/student`],
    ['/student', `${BASE}/student`],
    ['/student?cache=1', `${BASE}/student`],
    ['/student/', `${BASE}/student`],
    ['/teacher', `${BASE}/teacher`],
    ['/teacher?cache=1', `${BASE}/teacher`],
    ['/teacher/', `${BASE}/teacher`],
    ['/unknown', `${BASE}/student`],
    ['/unknown?teacher=1', `${BASE}/student`],
  ];

  for (let repetition = 0; repetition < 5; repetition += 1) {
    for (const [pathname, location] of cases) {
      const response = await request(pathname);
      assert.equal(response.status, 302, `${pathname} 반복 ${repetition + 1}`);
      assert.equal(response.location, location, `${pathname} 반복 ${repetition + 1}`);
    }
  }
});

test('/health를 유지한다', async () => {
  const response = await request('/health?cache=1');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true, version: 'v2.8', mode: 'site-launcher' });
});

test('학생명단 CSV와 검증 API를 유지한다', async () => {
  const csv = await request(`/${encodeURIComponent('학생명단_템플릿.csv')}?download=1`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /^text\/csv/);
  assert.match(csv.body, /반,학번,이름/);

  const valid = await request('/api/roster/validate?cache=1', {
    method: 'POST',
    body: JSON.stringify({ csvText: '반,학번,이름\n1,10101,홍길동' }),
  });
  assert.equal(valid.status, 200);
  assert.equal(JSON.parse(valid.body).ok, true);

  const invalid = await request('/api/roster/validate', {
    method: 'POST',
    body: JSON.stringify({ csvText: '반,학번,이름' }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(JSON.parse(invalid.body).ok, false);
});
