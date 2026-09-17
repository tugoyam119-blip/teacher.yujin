'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function registerActivityDownload(app, { needTeacher, getState, appsRoot }) {
  app.get('/api/admin/activities/:id/download', needTeacher, async (req, res, next) => {
    try {
      const state = await getState();
      const activity = state.activities.find(a => a.id === req.params.id && !a.archived);
      if (!activity || activity.deploy_type !== 'static') return res.status(404).send('다운로드할 수업 도구가 없습니다.');
      const root = await fs.realpath(appsRoot);
      const folder = path.resolve(root, activity.slug);
      if (!folder.startsWith(root + path.sep)) return res.status(404).send('다운로드할 수업 도구가 없습니다.');
      const file = await fs.realpath(path.join(folder, 'index.html'));
      if (!file.startsWith(folder + path.sep)) return res.status(404).send('다운로드할 수업 도구가 없습니다.');
      // Read each request from the deployed app, so patches immediately replace the download.
      const content = await fs.readFile(file);
      const title = content.subarray(0, 8192).toString('utf8').match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '';
      const version = title.match(/\bv(?:er)?\s*(\d+(?:\.\d+)+)/i)?.[1] || String(activity.version_label || activity.version || 'latest');
      const clean = value => String(value).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').slice(0, 100);
      res.set('Cache-Control', 'no-store');
      res.type('html').attachment(`${clean(activity.name)}_${clean(version)}.html`).send(content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return res.status(404).send('아직 실행 파일이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
      next(error);
    }
  });
};
