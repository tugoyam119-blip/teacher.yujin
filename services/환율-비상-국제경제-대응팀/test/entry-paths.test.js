const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { before, after, test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const base = 'https://exchange-crisis-team.tugoyam119.chatgpt.site';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exchange-entry-'));
const storeFile = path.join(dataDir, 'exchange-crisis.json');
const preserved = '{"attempts":{"existing":{"answers":{"report":"보존할 답안"}}}}';
fs.writeFileSync(storeFile, preserved);
let server, port;
function request(url) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: url }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}
before(async () => {
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: 'ignore'
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/health')).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Launcher did not start');
});
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});
test('legacy and canonical teacher URLs reach the teacher login', async () => {
  for (const url of ['/?teacher=1', '/?other=1&teacher=1', '/teacher', '/teacher/', '/teacher?from=hub']) {
    const result = await request(url);
    assert.equal(result.status, 302, url);
    assert.equal(result.headers.location, base + '/teacher', url);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
});
test('student URLs remain student URLs regardless of teacher query', async () => {
  for (const url of ['/', '/student', '/student/', '/student?teacher=1', '/?teacher=0', '/?teacher=false', '/unknown']) {
    assert.equal((await request(url)).headers.location, base + '/student', url);
  }
});
test('health and stored responses are unaffected by entry requests', async () => {
  const result = await request('/health?from=check');
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true });
  assert.equal(fs.readFileSync(storeFile, 'utf8'), preserved);
  assert.deepEqual(fs.readdirSync(dataDir), ['exchange-crisis.json']);
});
test('future classroom registrations use the canonical teacher URL', () => {
  const manifest = require('../yujint.app.json');
  assert.equal(manifest.manage_path, '/teacher');
  assert.equal(manifest.healthcheck_path, '/health');
});
