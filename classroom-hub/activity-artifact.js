'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

function versionFromHtml(content) {
  const title = content.toString('utf8').match(/<title\b[^>]*>([^<]*)<\/title>/i)?.[1] || '';
  const version = title.match(/\bv(?:er)?\s*(\d+(?:\.\d+)*)(?![\w.])/i)?.[1];
  return version ? `v${version}` : '';
}

async function readArtifact(appsRoot, activity) {
  const missing = () => Object.assign(new Error('Static activity file is unavailable'), { code: 'ENOENT' });
  const root = await fs.realpath(appsRoot);
  const folder = path.resolve(root, activity.slug);
  if (!folder.startsWith(root + path.sep)) throw missing();
  const file = await fs.realpath(path.join(folder, 'index.html'));
  if (!file.startsWith(folder + path.sep)) throw missing();
  const content = await fs.readFile(file);
  return {
    content,
    version: versionFromHtml(content) || String(activity.version_label || activity.version || 'latest'),
    build: createHash('sha256').update(content).digest('hex')
  };
}

async function withArtifactVersion(appsRoot, activity) {
  if (activity.deploy_type !== 'static' || activity.archived) return activity;
  try {
    const artifact = await readArtifact(appsRoot, activity);
    return { ...activity, release_version_label: artifact.version, release_build: artifact.build };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return activity;
    throw error;
  }
}

module.exports = { versionFromHtml, readArtifact, withArtifactVersion };
