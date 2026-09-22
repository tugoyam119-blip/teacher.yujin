'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const { versionFromHtml, withArtifactVersion } = require('../activity-artifact');
const registerDownload = require('../activity-download');

test('integer and dotted release versions are read from the title', () => {
  for (const version of ['63', '12.5', '1.2.3']) {
    assert.equal(versionFromHtml(Buffer.from(`<title id="pageTitle">Game v${version}</title>`)), `v${version}`);
  }
  assert.equal(versionFromHtml('<title>Game</title>'), '');
});

test('stale registry cannot change displayed or downloaded release; stale links are rejected', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'classroom-version-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'game'));
  const file = path.join(root, 'game', 'index.html');
  const content = '<title>Boardgame v63</title><h1>Game</h1>';
  await fs.writeFile(file, content);
  const activity = { id: 'boardgame', slug: 'game', name: 'Boardgame', deploy_type: 'static', version_label: 'v51' };
  const displayed = await withArtifactVersion(root, activity);
  assert.equal(displayed.release_version_label, 'v63');
  assert.equal(activity.version_label, 'v51'); // Deployment revision metadata stays separate.
  const app = express();
  registerDownload(app, { needTeacher: (_req, _res, next) => next(), getState: async () => ({ activities: [activity] }), appsRoot: root });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/activities/boardgame/download`;
  const response = await fetch(`${url}?build=${displayed.release_build}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /Boardgame_v63\.html/);
  assert.equal(response.headers.get('x-activity-version'), displayed.release_version_label);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), content);
  await fs.writeFile(file, content.replace('v63', 'v64'));
  assert.equal((await fetch(`${url}?build=${displayed.release_build}`)).status, 409);
  const updated = await withArtifactVersion(root, activity);
  const latest = await fetch(`${url}?build=${updated.release_build}`);
  assert.equal(latest.headers.get('x-activity-version'), 'v64');
  assert.match(await latest.text(), /v64/);
  const escaped = await withArtifactVersion(root, { ...activity, slug: '../outside' });
  assert.equal(escaped.release_build, undefined);
});
