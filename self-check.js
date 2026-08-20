const fs=require('fs'),path=require('path');
const root=__dirname;let fail=0;
function ok(cond,msg){console.log((cond?'✅':'❌')+' '+msg);if(!cond)fail++}
const pages=[
 ['통합사회2','classroom-hub/apps/social2/index.html'],
 ['국제관계','classroom-hub/apps/international-relations/index.html'],
 ['보드게임','classroom-hub/apps/boardgame/index.html'],
 ['인권수행평가','services/human-rights/index.html'],
 ['교사관리','classroom-hub/public/teacher.html'],
 ['학생화면','classroom-hub/public/student.html']
];
for(const [name,rel] of pages){const s=fs.readFileSync(path.join(root,rel),'utf8');ok(/viewport-fit=cover/.test(s),`${name}: iPad viewport-fit`);ok(!/file:\/\//i.test(s),`${name}: file:// 의존 없음`)}
const hr=fs.readFileSync(path.join(root,'services/human-rights/index.html'),'utf8');ok(hr.indexOf('const num=')>=0&&hr.indexOf('const num=')<hr.indexOf('const resources='),'인권수행평가: num 초기화 순서 수정 유지');
const hub=fs.readFileSync(path.join(root,'classroom-hub/server.js'),'utf8');for(const t of ['/api/admin/deploy/new','/patch','/rollback','/provision','commitFiles','railwayCreateService'])ok(hub.includes(t),`v3 배포 기능 포함: ${t}`);
const reg=JSON.parse(fs.readFileSync(path.join(root,'classroom-hub/data/registry.seed.json'),'utf8'));ok(reg.filter(x=>x.deploy_type==='static').length===3,'기존 정적 앱 3종 클래스룸 내부 통합');ok(reg.some(x=>x.slug==='human-rights'&&x.deploy_type==='server'),'인권 수행평가 서버형 유지');
for(const rel of ['classroom-hub/package.json','services/human-rights/package.json']){const p=JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));ok(!!p.scripts?.start,`${rel}: start 명령 존재`)}
console.log(`\n결과: ${fail?'FAIL '+fail:'ALL PASS'}`);process.exitCode=fail?1:0;
