'use strict';

const { readArtifact } = require('./activity-artifact');

module.exports = function registerActivityDownload(app, { needTeacher, getState, appsRoot }) {
  app.get('/api/admin/activities/:id/download', needTeacher, async (req, res, next) => {
    try {
      const state = await getState();
      const activity = state.activities.find(a => a.id === req.params.id && !a.archived);
      if (!activity || activity.deploy_type !== 'static') return res.status(404).send('다운로드할 수업 도구가 없습니다.');
      const { content, version, build } = await readArtifact(appsRoot, activity);
      res.set('Cache-Control', 'no-store');
      if (req.query.build && req.query.build !== build) {
        return res.status(409).send('게임이 업데이트되었습니다. 클래스룸 목록을 새로고침한 후 다시 다운로드해 주세요.');
      }
      const clean = value => String(value).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').slice(0, 100);
      res.set('X-Activity-Version', version);
      res.set('X-Activity-Build', build);
      res.type('html').attachment(`${clean(activity.name)}_${clean(version)}.html`).send(content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return res.status(404).send('아직 실행 파일이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
      next(error);
    }
  });
};
