'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const UNIT3 = '통합사회2-3단원-수업용-프로그램';
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
  const index = await fs.readFile(file);
  const version = versionFromHtml(index) || String(activity.version_label || activity.version || 'latest');
  let content = index;
  if (activity.slug === UNIT3) {
    const source = index.toString('utf8');
    // Single-file versions need no bundling. Reject unrecognized loaders rather than silently exporting a broken file.
    if (/\bfetch\s*\(/.test(source)) {
      const list = source.match(/Promise\.all\(\s*\[([^\]]+)\]\.map\(async\s+path\s*=>\s*\{\s*const\s+r\s*=\s*await\s+fetch\(path/);
      const markerMatch = source.match(/const\s+marker\s*=\s*'([^']+)'\s*;/);
      const target = source.match(/<meta\s+name="unit3-curriculum-version"\s+content="([\d.]+)"/i)?.[1];
      const names = list && [...list[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
      const leftover = list && list[1].replace(/'[^']+'|[\s,]/g, '');
      if (!names || names.length < 1 || leftover || !markerMatch || !target || !/^player-base-v\d+\.html$/.test(names[0]) || names.slice(1).some(n => !/^lesson-revision-v\d+\.js$/.test(n))) throw Object.assign(new Error('수업 파일 구성이 변경되어 오프라인 파일을 만들 수 없습니다.'), { code: 'OFFLINE_UNSUPPORTED' });
      const parts = await Promise.all(names.map(async name => {
        const real = await fs.realpath(path.join(folder, name));
        if (!real.startsWith(folder + path.sep)) throw missing();
        return fs.readFile(real, 'utf8');
      }));
      const marker = markerMatch[1];
      if (parts[0].split(marker).length !== 2) throw Object.assign(new Error('수업 파일의 결합 위치를 확인할 수 없습니다.'), { code: 'OFFLINE_UNSUPPORTED' });
      const baseVersion = versionFromHtml(Buffer.from(parts[0])).replace(/^v/, '');
      let html = parts[0].replace(marker, () => parts.slice(1).join('\n') + '\n' + marker);
      if (baseVersion && target) html = html.split(`v${baseVersion}`).join(`v${target}`);
      // Match the loader's explicit second legacy version replacement, if present.
      const legacy = source.match(/\.replace\(\/ver(\d+)\\\.(\d+)\/g,\s*'ver([\d.]+)'\)/);
      if (legacy) html = html.split(`ver${legacy[1]}.${legacy[2]}`).join(`ver${legacy[3]}`);
      content = Buffer.from(html, 'utf8');
    }
  }
  return { content, version, build: createHash('sha256').update(content).digest('hex') };
}
async function withArtifactVersion(appsRoot, activity) {
  if (activity.deploy_type !== 'static' || activity.archived) return activity;
  try { const artifact = await readArtifact(appsRoot, activity); return { ...activity, release_version_label: artifact.version, release_build: artifact.build }; }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'OFFLINE_UNSUPPORTED') return activity; throw error; }
}
module.exports = { versionFromHtml, readArtifact, withArtifactVersion };

