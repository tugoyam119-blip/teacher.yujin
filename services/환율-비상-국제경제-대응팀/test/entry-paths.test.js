'use strict';
// All fixtures, names, answers and stores in this suite are synthetic. The
// spawned service is contacted only over 127.0.0.1 and never uses production data.
const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { validId, deadline, writeBlock, studentView, createAccess } = require('../lib/student-access');

const SERVICE_DIR = path.resolve(__dirname, '..');
const PIN = 'synthetic-teacher-pin';
const CLASS = '3학년 1반';
const STUDENTS = [
  { studentId: '30101', name: '합성학생가' },
  { studentId: '30102', name: '합성학생나' },
];
const CSV = '반,학번,이름\n' + STUDENTS.map(s => `1,${s.studentId},${s.name}`).join('\n');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function fixture(t, { teacherPin = PIN, nodeEnv = 'test' } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exchange-synthetic-test-'));
  const port = await freePort();
  const storeFile = path.join(dataDir, 'exchange-crisis.json');
  let server;
  let logs = '';
  function request(pathname, { method = 'GET', body, cookie = '', headers = {} } = {}) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method,
        headers: { ...(raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {}),
          ...(cookie ? { Cookie: cookie } : {}), ...headers } }, res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', c => { text += c; });
        res.on('end', () => {
          let json;
          if ((res.headers['content-type'] || '').startsWith('application/json')) json = JSON.parse(text);
          resolve({ status: res.statusCode, headers: res.headers, body: text, json,
            cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
        });
      });
      req.setTimeout(5000, () => req.destroy(new Error('Synthetic request timed out')));
      req.on('error', reject);
      req.end(raw);
    });
  }
  const post = (pathname, body, cookie) => request(pathname, { method: 'POST', body, cookie });
  const admin = (action, options = {}) => post('/api/admin', { code: PIN, action, ...options });
  async function start() {
    logs = '';
    server = spawn(process.execPath, ['server.js'], { cwd: SERVICE_DIR,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, TEACHER_PIN: teacherPin, MIGRATION_TOKEN: '', NODE_ENV: nodeEnv },
      stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', c => { logs += c; });
    server.stderr.on('data', c => { logs += c; });
    for (let i = 0; i < 200; i++) {
      if (server.exitCode !== null) throw new Error(`Synthetic server exited: ${logs}`);
      try { if ((await request('/health')).status === 200) return; } catch {}
      await delay(10);
    }
    throw new Error(`Synthetic server failed to start: ${logs}`);
  }
  async function stop() {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
  }
  t.after(async () => { await stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  await start();
  const readStore = () => JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const mutateStore = fn => {
    const store = readStore();
    fn(store);
    fs.writeFileSync(storeFile, JSON.stringify(store));
    return store;
  };
  async function login(student, accessCode, cookie) {
    return post('/api/exam', { action: 'login', ...student, accessCode }, cookie);
  }
  async function setup({ started = true } = {}) {
    expectStatus(await admin('import_roster', { csvText: CSV }), 200);
    const actors = [];
    for (const student of STUDENTS) {
      const issued = expectStatus(await admin('issue_student_code', { studentId: student.studentId }), 200);
      actors.push({ ...student, accessCode: issued.json.accessCode });
    }
    expectStatus(await admin('open_class', { className: CLASS }), 200);
    for (const actor of actors) {
      const loggedIn = expectStatus(await login(actor, actor.accessCode), 200);
      actor.cookie = loggedIn.cookie;
    }
    if (started) expectStatus(await admin('start_class', { className: CLASS }), 200);
    return actors;
  }
  // Hold back the end of a request body while another completed request changes
  // the store. This reproduces the stale-read/write race without external load.
  async function delayedPost(pathname, body, cookie) {
    const raw = Buffer.from(JSON.stringify(body));
    let req;
    const result = new Promise((resolve, reject) => {
      req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': raw.length, Cookie: cookie } }, res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text), body: text }));
      });
      req.setTimeout(5000, () => req.destroy(new Error('Delayed synthetic request timed out')));
      req.on('error', reject);
      req.write(raw.subarray(0, raw.length - 1));
    });
    await delay(25);
    return { finish: async () => { req.end(raw.subarray(raw.length - 1)); return result; } };
  }
  return { request, post, admin, login, setup, readStore, mutateStore, dataDir, delayedPost,
    restart: async () => { await stop(); await start(); } };
}

function expectStatus(response, expected, context = '') {
  assert.equal(response.status, expected, `${context}: ${response.body}`);
  return response;
}
function exam(actor, action, extra = {}) { return { action, studentId: actor.studentId, ...extra }; }
const GRADE_FIELDS = ['ai_score', 'ai_feedback', 'ai_breakdown', 'ai_graded_at', 'teacher_score', 'teacher_breakdown', 'feedback', 'grade_history', 'visit', 'extra_penalty'];
function assertStudentView(attempt) {
  assert.ok(attempt, 'Expected an attempt');
  for (const field of GRADE_FIELDS) assert.equal(Object.hasOwn(attempt, field), false, `Student response disclosed ${field}`);
}

test('standalone pages, health, and teacher authentication', async t => {
  const f = await fixture(t);
  const health = expectStatus(await f.request('/health'), 200);
  assert.equal(health.json.mode, 'standalone');
  for (const pathname of ['/', '/student', '/student/']) {
    assert.match(expectStatus(await f.request(pathname), 200).body, /환율 비상!/);
  }
  assert.match(expectStatus(await f.request('/teacher'), 200).body, /교사 관리실/);
  expectStatus(await f.request('/api/admin'), 401);
  expectStatus(await f.post('/api/admin', { code: 'wrong', action: 'open_class', className: CLASS }), 401);
});

test('roster, teacher-issued code, authenticated submission and teacher grading flow', async t => {
  const f = await fixture(t);
  expectStatus(await f.post('/api/roster/validate', { csvText: CSV }), 200);
  expectStatus(await f.admin('import_roster', { csvText: CSV }), 200);
  const a = STUDENTS[0];
  const issued = expectStatus(await f.admin('issue_student_code', { studentId: a.studentId }), 200);
  expectStatus(await f.login(a, issued.json.accessCode), 423);
  expectStatus(await f.admin('open_class', { className: CLASS }), 200);
  const login = expectStatus(await f.login(a, issued.json.accessCode), 200);
  assert.equal(login.json.attempt.status, 'waiting');
  assert.match(login.headers['set-cookie'][0], /; HttpOnly(?:;|$)/);
  assert.match(login.headers['set-cookie'][0], /; SameSite=Strict(?:;|$)/);
  assert.match(login.headers['set-cookie'][0], /; Path=\/(?:;|$)/);
  assertStudentView(login.json.attempt);
  expectStatus(await f.admin('start_class', { className: CLASS }), 200);
  const answers = { won: '하락', dollar: '상승', cost: '증가', exportReason: '합성 수출기업 설명', importReason: '합성 수입기업 설명', policies: ['외환시장에 달러 공급', '수입기업 긴급대출'], policyEffect: '합성 효과', policyRisk: '합성 위험', report: '합성 보고서 내용. '.repeat(20) };
  const saved = expectStatus(await f.post('/api/exam', exam(a, 'save', { currentStep: 5, answers }), login.cookie), 200);
  assert.deepEqual(saved.json.attempt.answers, answers);
  assertStudentView(saved.json.attempt);
  const submitted = expectStatus(await f.post('/api/exam', exam(a, 'submit', { currentStep: 5, submissionType: 'manual' }), login.cookie), 200);
  assert.equal(submitted.json.attempt.status, 'submitted');
  assert.deepEqual(submitted.json.attempt.answers, answers);
  assertStudentView(submitted.json.attempt);
  const grade = expectStatus(await f.admin('ai_grade', { studentId: a.studentId }), 200).json.grade;
  assert.equal(typeof grade.total, 'number');
  assert.equal(grade.time, 6);
  const graded = expectStatus(await f.admin('grade', { studentId: a.studentId, rubric: { economy: 25, policy: 25, organization: 20, cooperation: 20, completion: 4, time: 999 }, feedback: '합성 교사 전용 피드백' }), 200);
  assert.equal(graded.json.score, 100, 'Time score must be computed by the teacher API');
  const detail = expectStatus(await f.request(`/api/admin?code=${PIN}&studentId=${a.studentId}`), 200).json.attempt;
  assert.equal(detail.teacher_score, 100);
  assert.equal(detail.grade_history.length, 1);
  const student = expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: login.cookie }), 200);
  assertStudentView(student.json.attempt);
  assert.equal(student.body.includes('합성 교사 전용 피드백'), false);
  assertStudentView(expectStatus(await f.login(a, issued.json.accessCode), 200).json.attempt);
});

test('name-only, spoofed, unregistered and malformed identities cannot enter', async t => {
  const f = await fixture(t);
  const [a, b] = await f.setup();
  expectStatus(await f.post('/api/exam', exam(a, 'login', { name: a.name })), 401, 'Name-only login');
  expectStatus(await f.login({ studentId: a.studentId, name: b.name }, a.accessCode), 401, 'Wrong name');
  expectStatus(await f.login(a, b.accessCode), 401, 'Other student code');
  expectStatus(await f.login({ studentId: '39999', name: '미등록합성학생' }, a.accessCode), 401);
  expectStatus(await f.admin('issue_student_code', { studentId: '39999' }), 404);
  for (const studentId of ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', '__defineGetter__', '../30101', '']) {
    expectStatus(await f.post('/api/exam', { action: 'login', studentId, name: a.name, accessCode: a.accessCode }), 400);
  }
  assert.equal(f.readStore().roster.length, 2);
  assert.equal(Object.hasOwn(f.readStore().attempts, '39999'), false);
});

test('every student route rejects anonymous and A-to-B identity substitution', async t => {
  const f = await fixture(t);
  const [a, b] = await f.setup();
  expectStatus(await f.post('/api/exam', exam(b, 'save', { answers: { report: 'B-private-answer' } }), b.cookie), 200);
  expectStatus(await f.post('/api/help', exam(b, 'request', { message: 'B-private-help' }), b.cookie), 200);
  const before = f.readStore();
  for (const cookie of ['', 'exchange_student=fabricated', a.cookie]) {
    for (const pathname of [`/api/exam?studentId=${b.studentId}`, `/api/help?studentId=${b.studentId}`]) {
      const r = expectStatus(await f.request(pathname, { cookie }), 401, pathname);
      assert.equal(/B-private-(answer|help)/.test(r.body), false);
    }
    for (const action of ['start', 'save', 'submit', 'reopen_self', 'logout']) {
      expectStatus(await f.post('/api/exam', exam(b, action, { answers: { report: 'intrusion' } }), cookie), 401, action);
    }
    for (const pathname of ['/api/help', '/api/extra']) {
      expectStatus(await f.post(pathname, exam(b, 'request', { message: 'intrusion' }), cookie), 401, pathname);
    }
  }
  expectStatus(await f.request('/api/exam', { cookie: a.cookie }), 401);
  expectStatus(await f.request('/api/help', { cookie: a.cookie }), 401);
  for (const pathname of ['/api/admin', '/api/help']) {
    expectStatus(await f.request(`${pathname}?code=wrong&studentId=${b.studentId}`, { cookie: a.cookie }), 401);
  }
  expectStatus(await f.post('/api/help', exam(b, 'resolve'), a.cookie), 401);
  expectStatus(await f.post('/api/extra', exam(b, 'approve', { minutes: 10 }), a.cookie), 401);
  assert.deepEqual(f.readStore(), before, 'Denied requests must not mutate the store');
  const aRead = expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 200);
  assert.deepEqual(aRead.json.attempt.answers, {});
  assert.equal(expectStatus(await f.request(`/api/help?studentId=${a.studentId}`, { cookie: a.cookie }), 200).json.help, null);
  assert.equal(expectStatus(await f.request(`/api/help?studentId=${b.studentId}`, { cookie: b.cookie }), 200).json.help.message, 'B-private-help');
});

test('valid saves preserve student identity and cannot inject teacher-only fields', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const answers = { report: 'Own synthetic answer', policies: ['외환시장에 달러 공급'] };
  const saved = expectStatus(await f.post('/api/exam', exam(a, 'save', { answers, currentStep: 4, teacher_score: 999, ai_score: 999, feedback: 'spoof', name: 'wrong', class_name: 'other', status: 'submitted', extra_status: 'approved' }), a.cookie), 200);
  assert.deepEqual(saved.json.attempt.answers, answers);
  assert.equal(saved.json.attempt.name, a.name);
  assert.equal(saved.json.attempt.class_name, CLASS);
  assert.equal(saved.json.attempt.status, 'in_progress');
  assert.equal(saved.json.attempt.extra_status, 'none');
  assert.equal(saved.json.attempt.current_step, 4);
  assertStudentView(saved.json.attempt);
  const stored = f.readStore().attempts[a.studentId];
  assert.equal(stored.teacher_score, null);
  assert.equal(stored.ai_score, null);
  assert.deepEqual(expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 200).json.attempt.answers, answers);
});

test('submitted attempts are immutable and only the authenticated teacher can reopen', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const finalAnswer = { report: 'Immutable synthetic final answer' };
  expectStatus(await f.post('/api/exam', exam(a, 'submit', { answers: finalAnswer }), a.cookie), 200);
  const before = f.readStore().attempts[a.studentId];
  for (const action of ['start', 'save', 'submit']) {
    expectStatus(await f.post('/api/exam', exam(a, action, { answers: { report: 'overwrite' } }), a.cookie), 423);
  }
  expectStatus(await f.post('/api/exam', exam(a, 'reopen_self'), a.cookie), 403);
  expectStatus(await f.post('/api/extra', exam(a, 'request'), a.cookie), 423);
  expectStatus(await f.post('/api/admin', exam(a, 'reopen_attempt'), a.cookie), 401);
  assert.deepEqual(f.readStore().attempts[a.studentId], before);
  expectStatus(await f.admin('reopen_attempt', { studentId: a.studentId }), 200);
  const reopened = expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 200).json.attempt;
  assert.equal(reopened.status, 'in_progress');
  assert.equal(reopened.submitted_at, null);
  assert.equal(reopened.submission_type, null);
  assert.deepEqual(reopened.answers, finalAnswer);
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: { report: 'Teacher-authorized revision' } }), a.cookie), 200);
});

for (const state of ['not-started', 'paused', 'closed', 'expired']) {
  test(`${state} class blocks all answer mutations and teacher reopening`, async t => {
    const f = await fixture(t);
    const [a] = await f.setup({ started: state !== 'not-started' });
    if (state === 'paused') expectStatus(await f.admin('pause_class', { className: CLASS }), 200);
    if (state === 'closed') expectStatus(await f.admin('close_class', { className: CLASS }), 200);
    if (state === 'expired') f.mutateStore(s => { s.classes[CLASS].deadline = Date.now() - 1000; });
    const before = f.readStore();
    for (const action of ['start', 'save', 'submit']) {
      expectStatus(await f.post('/api/exam', exam(a, action, { answers: { report: 'blocked' } }), a.cookie), 423, action);
    }
    expectStatus(await f.admin('reopen_attempt', { studentId: a.studentId }), 423);
    assert.deepEqual(f.readStore(), before);
    const read = expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 200);
    assert.equal(typeof read.json.attempt.write_block, 'string');
    assertStudentView(read.json.attempt);
  });
}

test('approved extra time extends the later deadline and does not shorten base time', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const base = f.readStore().classes[CLASS].deadline;
  expectStatus(await f.post('/api/extra', exam(a, 'request'), a.cookie), 200);
  expectStatus(await f.post('/api/extra', { code: PIN, action: 'approve', studentId: a.studentId, minutes: 5, exempt: false }), 200);
  let read = expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 200);
  assert.equal(read.json.attempt.effective_deadline, base);
  assert.equal(expectStatus(await f.admin('ai_grade', { studentId: a.studentId }), 200).json.grade.time, 4);
  expectStatus(await f.post('/api/extra', exam(a, 'request'), a.cookie), 409);
  f.mutateStore(s => { s.classes[CLASS].deadline = Date.now() - 1000; });
  read = expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 200);
  assert.equal(read.json.attempt.effective_deadline, read.json.attempt.extra_started_at + 5 * 60000);
  assert.equal(read.json.attempt.write_block, null);
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: { report: 'Allowed extra-time answer' } }), a.cookie), 200);
  f.mutateStore(s => { s.attempts[a.studentId].extra_started_at = Date.now() - 6 * 60000; });
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: {} }), a.cookie), 423);
  expectStatus(await f.admin('reopen_attempt', { studentId: a.studentId }), 423);
  expectStatus(await f.post('/api/extra', { code: PIN, action: 'approve', studentId: a.studentId, minutes: 10, exempt: false }), 200);
  assert.equal(expectStatus(await f.admin('ai_grade', { studentId: a.studentId }), 200).json.grade.time, 2);
  expectStatus(await f.post('/api/extra', { code: PIN, action: 'approve', studentId: a.studentId, minutes: 5, exempt: true }), 200);
  assert.equal(expectStatus(await f.admin('ai_grade', { studentId: a.studentId }), 200).json.grade.time, 6);
});

test('an expired student can request assistance and approved extra time without bypassing submission lock', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  f.mutateStore(s => { s.classes[CLASS].deadline = Date.now() - 1000; });
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: {} }), a.cookie), 423);
  expectStatus(await f.post('/api/help', exam(a, 'request', { message: '합성 기술문제' }), a.cookie), 200);
  expectStatus(await f.post('/api/extra', exam(a, 'request'), a.cookie), 200);
  expectStatus(await f.post('/api/extra', { code: PIN, action: 'approve', studentId: a.studentId, minutes: 5 }), 200);
  expectStatus(await f.post('/api/exam', exam(a, 'submit', { answers: { report: 'Extra time final answer' } }), a.cookie), 200);
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: {} }), a.cookie), 423);
  expectStatus(await f.admin('reopen_attempt', { studentId: a.studentId }), 200);
});

test('resume compensates both the base deadline and approved extra-time clock', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  expectStatus(await f.post('/api/extra', { code: PIN, action: 'approve', studentId: a.studentId, minutes: 5 }), 200);
  const pausedAt = Date.now() - 90000;
  const extraAt = pausedAt - 30000;
  const base = Date.now() - 1000;
  f.mutateStore(s => { s.classes[CLASS].deadline = base; s.classes[CLASS].paused_at = pausedAt; s.attempts[a.studentId].extra_started_at = extraAt; });
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: {} }), a.cookie), 423);
  const before = Date.now();
  expectStatus(await f.admin('resume_class', { className: CLASS }), 200);
  const after = Date.now();
  const store = f.readStore();
  assert.equal(store.classes[CLASS].paused_at, null);
  const baseShift = store.classes[CLASS].deadline - base;
  const extraShift = store.attempts[a.studentId].extra_started_at - extraAt;
  assert.ok(baseShift >= before - pausedAt && baseShift <= after - pausedAt);
  assert.ok(extraShift >= before - pausedAt && extraShift <= after - pausedAt);
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: { report: 'Resumed answer' } }), a.cookie), 200);
});

test('reissuing a code revokes all old sessions and stores only its hash', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const secondSession = expectStatus(await f.login(a, a.accessCode), 200).cookie;
  const reissued = expectStatus(await f.admin('issue_student_code', { studentId: a.studentId }), 200).json.accessCode;
  assert.notEqual(reissued, a.accessCode);
  for (const cookie of [a.cookie, secondSession]) expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie }), 401);
  expectStatus(await f.login(a, a.accessCode), 401);
  const valid = expectStatus(await f.login(a, reissued), 200);
  expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: valid.cookie }), 200);
  const credentialsText = fs.readFileSync(path.join(f.dataDir, 'student-access.json'), 'utf8');
  assert.equal(credentialsText.includes(reissued), false);
  assert.equal(credentialsText.includes(a.accessCode), false);
  assert.equal(JSON.parse(credentialsText)[a.studentId].hash, crypto.createHash('sha256').update(reissued).digest('hex'));
  const publicRead = expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: valid.cookie }), 200);
  assert.equal(publicRead.body.includes('accessCode'), false);
  assert.equal(publicRead.body.includes(JSON.parse(credentialsText)[a.studentId].hash), false);
});

test('process restart drops sessions but preserves codes, answers and teacher grades', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: { report: 'Persisted synthetic answer' } }), a.cookie), 200);
  expectStatus(await f.admin('grade', { studentId: a.studentId, rubric: { economy: 20 }, feedback: 'Persisted teacher feedback' }), 200);
  await f.restart();
  expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 401);
  const login = expectStatus(await f.login(a, a.accessCode), 200);
  assert.equal(login.json.attempt.answers.report, 'Persisted synthetic answer');
  assertStudentView(login.json.attempt);
  assert.equal(expectStatus(await f.request(`/api/admin?code=${PIN}&studentId=${a.studentId}`), 200).json.attempt.feedback, 'Persisted teacher feedback');
});

test('logout and shared-browser account switching invalidate the prior cookie', async t => {
  const f = await fixture(t);
  const [a, b] = await f.setup();
  const logout = expectStatus(await f.post('/api/exam', exam(a, 'logout'), a.cookie), 200);
  assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
  expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 401);
  const aAgain = expectStatus(await f.login(a, a.accessCode), 200);
  const switched = expectStatus(await f.login(b, b.accessCode, aAgain.cookie), 200);
  expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: aAgain.cookie }), 401);
  expectStatus(await f.request(`/api/exam?studentId=${b.studentId}`, { cookie: switched.cookie }), 200);
  expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: switched.cookie }), 401);
});

test('roster identity changes and teacher reset invalidate existing student sessions', async t => {
  const f = await fixture(t);
  const [a, b] = await f.setup();
  expectStatus(await f.admin('import_roster', { csvText: `반,학번,이름\n1,${a.studentId},합성변경이름\n1,${b.studentId},${b.name}` }), 200);
  expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 401);
  expectStatus(await f.login(a, a.accessCode), 401);
  expectStatus(await f.login({ studentId: a.studentId, name: '합성변경이름' }, a.accessCode), 401);
  expectStatus(await f.request(`/api/exam?studentId=${b.studentId}`, { cookie: b.cookie }), 200);
  expectStatus(await f.admin('reset', { studentId: b.studentId }), 200);
  expectStatus(await f.request(`/api/exam?studentId=${b.studentId}`, { cookie: b.cookie }), 401);
  assert.equal(Object.hasOwn(f.readStore().attempts, b.studentId), false);
});

test('delayed-body saves cannot overwrite another student’s completed write', async t => {
  const f = await fixture(t);
  const [a, b] = await f.setup();
  const pending = await f.delayedPost('/api/exam', exam(a, 'save', { answers: { report: 'Delayed A answer' } }), a.cookie);
  expectStatus(await f.post('/api/exam', exam(b, 'save', { answers: { report: 'Completed B answer' } }), b.cookie), 200);
  expectStatus(await pending.finish(), 200);
  const store = f.readStore();
  assert.equal(store.attempts[a.studentId].answers.report, 'Delayed A answer');
  assert.equal(store.attempts[b.studentId].answers.report, 'Completed B answer');
});

test('delayed bodies recheck submission, pause and session revocation at mutation time', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  let pending = await f.delayedPost('/api/exam', exam(a, 'save', { answers: { report: 'Stale save' } }), a.cookie);
  expectStatus(await f.post('/api/exam', exam(a, 'submit', { answers: { report: 'Committed final answer' } }), a.cookie), 200);
  expectStatus(await pending.finish(), 423);
  assert.equal(f.readStore().attempts[a.studentId].answers.report, 'Committed final answer');
  expectStatus(await f.admin('reopen_attempt', { studentId: a.studentId }), 200);
  pending = await f.delayedPost('/api/exam', exam(a, 'save', { answers: {} }), a.cookie);
  expectStatus(await f.admin('pause_class', { className: CLASS }), 200);
  expectStatus(await pending.finish(), 423);
  expectStatus(await f.admin('resume_class', { className: CLASS }), 200);
  pending = await f.delayedPost('/api/exam', exam(a, 'save', { answers: {} }), a.cookie);
  expectStatus(await f.admin('issue_student_code', { studentId: a.studentId }), 200);
  expectStatus(await pending.finish(), 401);
  assert.equal(f.readStore().attempts[a.studentId].answers.report, 'Committed final answer');
});

test('deadline calculation handles numeric/ISO timestamps and exact expiration boundaries', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const c = { status: 'open', started_at: start, deadline: start + 45 * 60000 };
  const a = { status: 'in_progress', answers: {}, extra_status: 'approved', extra_granted_minutes: 5, extra_started_at: start };
  assert.equal(deadline(a, c), c.deadline);
  assert.equal(writeBlock(a, c, c.deadline - 1), null);
  assert.equal(typeof writeBlock(a, c, c.deadline), 'string');
  a.extra_started_at = new Date(c.deadline - 60000).toISOString();
  assert.equal(deadline(a, c), c.deadline + 4 * 60000);
  assert.equal(deadline(a, { ...c, deadline: new Date(c.deadline).toISOString() }), c.deadline + 4 * 60000);
  assert.equal(typeof writeBlock(a, { ...c, deadline: 'invalid' }, start), 'string');
  assert.equal(typeof writeBlock(a, { ...c, paused_at: start + 1 }, start + 2), 'string');
  assert.equal(typeof writeBlock({ ...a, status: 'submitted' }, c, start + 1), 'string');
  assert.equal(writeBlock({ ...a, status: 'submitted' }, c, start + 1, true), null);
  const view = studentView({ ...a, ai_score: 100, teacher_score: 100, feedback: 'secret', custom_secret: 'secret' }, c);
  assertStudentView(view);
  assert.equal(Object.hasOwn(view, 'custom_secret'), false);
});

test('sessions expire in memory, production cookies are secure, and login attempts are bounded', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exchange-synthetic-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const access = createAccess(dir);
  const id = '30101', identity = JSON.stringify([id, '합성학생가', CLASS]);
  const code = access.issue(id, identity);
  const req = { headers: {}, socket: { encrypted: true } };
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; } };
  assert.equal(access.login(req, response, id, code, identity), null);
  assert.match(response.headers['Set-Cookie'], /; Secure$/);
  const cookieReq = { headers: { cookie: response.headers['Set-Cookie'].split(';')[0] }, socket: {} };
  assert.equal(access.authorized(cookieReq, id, identity), true);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 8 * 3600000 + 1;
    assert.equal(access.authorized(cookieReq, id, identity), false);
  } finally { Date.now = realNow; }
  for (let i = 0; i < 10; i++) assert.equal(access.login(req, response, id, 'incorrect', identity).status, 401);
  assert.equal(access.login(req, response, id, 'still-incorrect', identity).status, 429);
  assert.equal(access.login(req, response, id, code, identity), null, 'An attacker cannot lock out a valid code holder');
  for (let i = 0; i < 10; i++) assert.equal(access.login(req, response, id, 'incorrect-again', identity).status, 401);
  assert.equal(access.login(req, response, id, 'still-incorrect', identity).status, 429);
  try {
    Date.now = () => realNow() + 15 * 60000 + 1;
    assert.equal(access.login(req, response, id, 'incorrect-after-cooldown', identity).status, 401);
    assert.equal(access.login(req, response, id, code, identity), null);
  } finally { Date.now = realNow; }
});

test('missing teacher PIN fails closed instead of accepting a built-in default', async t => {
  const f = await fixture(t, { teacherPin: '' });
  for (const code of ['', '123456', '0000']) {
    expectStatus(await f.request(`/api/admin?code=${code}`), 401);
    expectStatus(await f.post('/api/admin', { code, action: 'import_roster', csvText: CSV }), 401);
    expectStatus(await f.post('/api/extra', { code, action: 'approve', studentId: STUDENTS[0].studentId }), 401);
  }
});

test('production and reverse-proxy HTTPS login cookies are Secure', async t => {
  const f = await fixture(t, { nodeEnv: 'production' });
  const [a] = await f.setup();
  const login = expectStatus(await f.login(a, a.accessCode), 200);
  assert.match(login.headers['set-cookie'][0], /; Secure(?:;|$)/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exchange-synthetic-proxy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const access = createAccess(dir);
  const code = access.issue('30101', 'synthetic-identity');
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; } };
  assert.equal(access.login({ socket: {}, headers: { 'x-forwarded-proto': 'https' } }, res, '30101', code, 'synthetic-identity'), null);
  assert.match(res.headers['Set-Cookie'], /; Secure(?:;|$)/);
});

for (const change of ['name', 'class']) {
  test(`reassigned roster ${change} cannot expose a former student’s preserved answers with a new code`, async t => {
    const f = await fixture(t);
    const [a, b] = await f.setup();
    expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: { report: 'Former-student-private-answer' } }), a.cookie), 200);
    expectStatus(await f.post('/api/help', exam(a, 'request', { message: 'Former-student-private-help' }), a.cookie), 200);
    const before = f.readStore();
    const name = change === 'name' ? '합성다른학생' : a.name;
    const classNo = change === 'class' ? '2' : '1';
    expectStatus(await f.admin('import_roster', { csvText: `반,학번,이름\n${classNo},${a.studentId},${name}\n1,${b.studentId},${b.name}` }), 200);
    const newCode = expectStatus(await f.admin('issue_student_code', { studentId: a.studentId }), 200).json.accessCode;
    const rejected = expectStatus(await f.login({ studentId: a.studentId, name }, newCode), 409);
    assert.equal(rejected.body.includes('Former-student-private'), false);
    for (const cookie of [a.cookie, rejected.cookie || '']) {
      expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie }), 401);
      expectStatus(await f.request(`/api/help?studentId=${a.studentId}`, { cookie }), 401);
      expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: {} }), cookie), 401);
      expectStatus(await f.post('/api/extra', exam(a, 'request'), cookie), 401);
    }
    assert.deepEqual(f.readStore().attempts[a.studentId], before.attempts[a.studentId]);
    assert.deepEqual(f.readStore().helps, before.helps);
    assert.equal(expectStatus(await f.request(`/api/admin?code=${PIN}&studentId=${a.studentId}`), 200).json.attempt.answers.report, 'Former-student-private-answer');
    expectStatus(await f.request(`/api/exam?studentId=${b.studentId}`, { cookie: b.cookie }), 200);
  });
}

test('ISO pause timestamps resume correctly and do not grant time before extra approval', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const pausedAt = Date.now() - 120000;
  const extraAt = pausedAt + 60000; // Approved one minute into the pause.
  const base = Date.now() - 1000;
  f.mutateStore(s => {
    Object.assign(s.classes[CLASS], { paused_at: new Date(pausedAt).toISOString(), deadline: new Date(base).toISOString() });
    Object.assign(s.attempts[a.studentId], { extra_status: 'approved', extra_granted_minutes: 5, extra_started_at: new Date(extraAt).toISOString() });
  });
  const before = Date.now();
  expectStatus(await f.admin('resume_class', { className: CLASS }), 200);
  const after = Date.now();
  const store = f.readStore();
  assert.ok(store.classes[CLASS].deadline >= base + before - pausedAt);
  assert.ok(store.classes[CLASS].deadline <= base + after - pausedAt);
  assert.ok(store.attempts[a.studentId].extra_started_at >= before);
  assert.ok(store.attempts[a.studentId].extra_started_at <= after);
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: { report: 'Resumed ISO fixture' } }), a.cookie), 200);
});

test('cross-origin and non-JSON writes are denied before mutating answers', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const before = f.readStore();
  expectStatus(await f.request('/api/exam', { method: 'POST', body: exam(a, 'save', { answers: { report: 'Cross-origin write' } }), cookie: a.cookie, headers: { Origin: 'https://synthetic-attacker.invalid' } }), 403);
  expectStatus(await f.request('/api/exam', { method: 'POST', body: exam(a, 'save', { answers: {} }), cookie: a.cookie, headers: { 'Content-Type': 'text/plain' } }), 415);
  assert.deepEqual(f.readStore(), before);
});

test('a corrupted existing store fails closed without overwriting preserved bytes', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const file = path.join(f.dataDir, 'exchange-crisis.json');
  const broken = '{synthetic deliberately truncated JSON';
  fs.writeFileSync(file, broken);
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: {} }), a.cookie), 500);
  expectStatus(await f.admin('open_class', { className: CLASS }), 500);
  assert.equal(fs.readFileSync(file, 'utf8'), broken);
});

test('prototype property names are rejected and corrupted credentials never silently reset', t => {
  for (const key of Object.getOwnPropertyNames(Object.prototype)) assert.equal(validId(key), false, key);
  for (const key of ['30101', 'DEMO001', 'a_b-123']) assert.equal(validId(key), true, key);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exchange-synthetic-corrupt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'student-access.json');
  fs.writeFileSync(file, '{synthetic corruption');
  assert.throws(() => createAccess(dir), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{synthetic corruption');
});

test('both generated browser scripts compile and expose the secured student/teacher controls', async t => {
  const f = await fixture(t);
  for (const pathname of ['/student', '/teacher']) {
    const html = expectStatus(await f.request(pathname), 200).body;
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: pathname }));
    if (pathname === '/student') {
      assert.match(html, /id="accessCode"/);
      assert.match(html, /id="logoutBtn"/);
      assert.match(scripts[0], /effective_deadline/);
      assert.equal(scripts[0].includes('reopen_self'), false);
      assert.equal(/localStorage|sessionStorage/.test(scripts[0]), false, 'Access codes must not be persisted in browser storage');
    } else {
      assert.match(scripts[0], /issue_student_code/);
      assert.match(scripts[0], /reopen_attempt/);
    }
  }
});

// A deliberately small DOM stub exercises the delivered script's state machine.
// This is a VM smoke test, not a substitute for a real browser/rendering test.
function studentScriptHarness(html) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { value: '', checked: false, disabled: false, textContent: '', innerHTML: '', handlers: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        addEventListener(event, handler) { this.handlers[event] = handler; } });
    }
    return nodes.get(id);
  };
  for (const match of html.matchAll(/id="([^"]+)"/g)) node(match[1]);
  const inputIds = ['won', 'dollar', 'cost', 'exportReason', 'importReason', 'effects', 'policyEffect', 'policyRisk', 'report'];
  const policies = ['외환시장에 달러 공급', '기준금리 인상'].map(value => ({ value, checked: false, disabled: false }));
  const calls = [], alerts = [], timeouts = new Map();
  let nextTimer = 1;
  const context = { Date, JSON, String, Number, Error, Math, console,
    document: { getElementById: node, querySelectorAll(selector) {
      if (selector === 'input[name=pol]') return policies;
      if (selector === 'input[name=pol]:checked') return policies.filter(x => x.checked);
      if (selector === '#exam input,#exam textarea,#exam select') return [...inputIds.map(node), ...policies];
      throw new Error(`Unexpected selector: ${selector}`);
    } },
    setTimeout: (callback, ms) => { const id = nextTimer++; timeouts.set(id, { callback, ms }); return id; },
    clearTimeout: id => timeouts.delete(id), setInterval: () => nextTimer++,
    alert: text => alerts.push(text), confirm: () => true, prompt: () => null,
    location: { reload() { context.reloaded = true; } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (!context.respond) throw new Error('Unexpected VM fetch');
      return context.respond(url, options);
    } };
  context.window = context;
  vm.createContext(context);
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1], { filename: 'generated-student-ui.js' }).runInContext(context);
  return { context, node, policies, calls, alerts, timeouts,
    run: expression => vm.runInContext(expression, context),
    state(attempt, setting) {
      context.syntheticAttempt = structuredClone(attempt);
      context.syntheticSetting = structuredClone(setting);
      vm.runInContext("studentId='30101';studentName='합성학생가';attempt=syntheticAttempt;setting=syntheticSetting;fill(attempt);tick()", context);
    } };
}
const vmResponse = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });

test('student UI disables expired/submitted/paused answers and freezes the paused timer', async t => {
  const f = await fixture(t);
  const h = studentScriptHarness(expectStatus(await f.request('/student'), 200).body);
  const now = Date.now();
  const attempt = { status: 'in_progress', answers: { report: 'Saved answer' }, effective_deadline: now + 60000, write_block: null };
  const setting = { class_name: CLASS, status: 'open', started_at: now - 1000, deadline: now + 60000 };
  h.state(attempt, setting);
  assert.equal(h.node('report').disabled, false);
  assert.equal(h.node('submitBtn').disabled, false);
  h.state({ ...attempt, effective_deadline: now - 1 }, setting);
  assert.equal(h.node('report').disabled, true);
  assert.equal(h.node('submitBtn').disabled, true);
  h.state({ ...attempt, status: 'submitted', write_block: '이미 제출한 답안은 수정할 수 없습니다.' }, setting);
  assert.equal(h.node('report').disabled, true);
  assert.equal(h.node('extraBtn').disabled, true);
  const pausedAt = now - 30000;
  h.state({ ...attempt, effective_deadline: pausedAt + 60000, write_block: '수행평가가 일시정지되었습니다.' }, { ...setting, paused_at: new Date(pausedAt).toISOString() });
  assert.equal(h.node('timer').textContent, '01:00');
  assert.equal(h.node('report').disabled, true);
  assert.equal(h.node('helpBtn').disabled, false, 'Help remains available during a pause');
});

test('student UI preserves dirty input while polling and queues edits made during an in-flight save', async t => {
  const f = await fixture(t);
  const h = studentScriptHarness(expectStatus(await f.request('/student'), 200).body);
  const setting = { class_name: CLASS, status: 'open', started_at: Date.now(), deadline: Date.now() + 60000 };
  const attempt = { status: 'in_progress', answers: { report: 'Old saved answer' }, effective_deadline: setting.deadline, write_block: null };
  h.state(attempt, setting);
  h.node('report').value = 'Unsaved draft';
  h.node('exam').handlers.input();
  assert.equal(h.run('dirty'), true);
  h.context.respond = async () => vmResponse(200, { attempt: { ...attempt, write_block: 'Paused' }, setting: { ...setting, paused_at: Date.now() } });
  await h.run('poll()');
  assert.equal(h.node('report').value, 'Unsaved draft', 'Polling must not refill stale server answers');
  assert.equal(h.run('dirty'), true);
  assert.equal(h.node('report').disabled, true);
  h.run('attempt.write_block=null; setting.paused_at=null; tick()');
  let finishSave;
  h.context.respond = async (_url, options) => {
    assert.equal(JSON.parse(options.body).answers.report, 'Unsaved draft');
    return new Promise(resolve => { finishSave = () => resolve(vmResponse(200, { attempt: { ...attempt, answers: { report: 'Unsaved draft' } }, setting })); });
  };
  const inFlight = h.run('save()');
  assert.equal(h.run('busy'), true);
  const requestCount = h.calls.length;
  await h.run('save()');
  await h.node('submitBtn').onclick();
  assert.equal(h.calls.length, requestCount, 'No second save or submit while the first save is in flight');
  h.node('report').value = 'Newer typing while save runs';
  h.node('exam').handlers.input();
  finishSave();
  await inFlight;
  assert.equal(h.run('busy'), false);
  assert.equal(h.run('dirty'), true, 'Save of an older snapshot must not mark newer input clean');
  assert.equal(h.node('report').value, 'Newer typing while save runs');
  h.context.respond = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.answers.report, 'Newer typing while save runs');
    return vmResponse(200, { attempt: { ...attempt, answers: body.answers }, setting });
  };
  await h.run('save()');
  assert.equal(h.run('dirty'), false);
});

test('student UI submits current code, clears it, and returns to login on a revoked session', async t => {
  const f = await fixture(t);
  const h = studentScriptHarness(expectStatus(await f.request('/student'), 200).body);
  const setting = { class_name: CLASS, status: 'open', started_at: Date.now(), deadline: Date.now() + 60000 };
  const attempt = { status: 'in_progress', answers: {}, effective_deadline: setting.deadline, write_block: null };
  h.node('sid').value = '30101';
  h.node('sname').value = '합성학생가';
  h.node('accessCode').value = 'synthetic-code-only';
  h.context.respond = async (_url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body);
      assert.equal(body.action, 'login');
      assert.equal(body.accessCode, 'synthetic-code-only');
    }
    return vmResponse(200, { attempt, setting });
  };
  await h.node('loginForm').onsubmit({ preventDefault() {} });
  assert.equal(h.node('accessCode').value, '');
  assert.equal(h.node('login').classList.contains('hidden'), true);
  assert.equal(h.node('exam').classList.contains('hidden'), false);
  h.context.respond = async () => vmResponse(401, { error: 'Synthetic session revoked' });
  await h.run('poll()');
  assert.equal(h.node('login').classList.contains('hidden'), false);
  assert.equal(h.node('exam').classList.contains('hidden'), true);
  assert.equal(h.node('msg').textContent, 'Synthetic session revoked');
  assert.equal(h.run('attempt'), null);
});

test('teacher header authentication works and shared route throttling ignores spoofed forwarded IPs', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  for (let i = 0; i < 9; i++) expectStatus(await f.request('/api/admin', { headers: { 'x-teacher-code': 'wrong' } }), 401);
  expectStatus(await f.request('/api/admin', { headers: { 'x-teacher-code': PIN } }), 200, 'A valid login before the threshold clears failures');
  expectStatus(await f.request(`/api/admin?studentId=${a.studentId}`, { headers: { 'x-teacher-code': PIN } }), 200);
  expectStatus(await f.request('/api/help', { headers: { 'x-teacher-code': PIN } }), 200);
  const before = f.readStore();
  const invalidAttempts = [
    () => f.request('/api/admin'),
    () => f.post('/api/admin', { code: 'wrong', action: 'issue_student_code', studentId: a.studentId }),
    () => f.request('/api/help?code=wrong'),
    () => f.post('/api/help', { code: 'wrong', action: 'resolve', studentId: a.studentId }),
    () => f.post('/api/extra', { code: 'wrong', action: 'approve', studentId: a.studentId }),
    () => f.post('/api/extra', { code: 'wrong', action: 'deny', studentId: a.studentId }),
    () => f.post('/api/admin', { code: 'wrong', action: 'import_snapshot', snapshot: {} }),
    () => f.post('/api/admin', { code: 'wrong', action: 'import_detail', studentId: a.studentId, detail: {} }),
    () => f.request('/api/admin', { headers: { 'x-teacher-code': 'wrong' } }),
    () => f.post('/api/admin', { code: 'wrong', action: 'reopen_attempt', studentId: a.studentId }),
  ];
  for (const attempt of invalidAttempts) expectStatus(await attempt(), 401);
  expectStatus(await f.request('/api/admin', { headers: { 'x-teacher-code': PIN } }), 429);
  expectStatus(await f.request('/api/help?code=wrong', { headers: { 'X-Forwarded-For': '192.0.2.123', 'X-Real-IP': '192.0.2.124' } }), 429);
  expectStatus(await f.post('/api/extra', { code: PIN, action: 'approve', studentId: a.studentId }), 429);
  assert.deepEqual(f.readStore(), before, 'All throttled/invalid teacher requests must leave the store unchanged');
  expectStatus(await f.request(`/api/exam?studentId=${a.studentId}`, { cookie: a.cookie }), 200);
  expectStatus(await f.post('/api/exam', exam(a, 'save', { answers: { report: 'Student can work while teacher authentication is throttled' } }), a.cookie), 200);
});

test('malformed JSON values are rejected without modifying the store', async t => {
  const f = await fixture(t);
  const [a] = await f.setup();
  const before = f.readStore();
  for (const body of [null, [], 'synthetic string', 42]) {
    expectStatus(await f.post('/api/exam', body, a.cookie), 400);
  }
  assert.deepEqual(f.readStore(), before);
});
