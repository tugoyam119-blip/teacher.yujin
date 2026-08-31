const http = require('http');
const {parseRoster}=require('./lib/roster-standard');

const PORT = Number(process.env.PORT || 3000);
const BASE = 'https://exchange-crisis-team.tugoyam119.chatgpt.site';

http.createServer((req, res) => {
  let pathname = '/';
  let teacherEntry = false;
  try {
    const url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
    teacherEntry = url.searchParams.get('teacher') === '1';
  } catch {}

  if(pathname==='/학생명단_템플릿.csv'){
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="yujint_roster.csv"'});
    return res.end('\uFEFF반,학번,이름\n1,10101,홍길동\n1,10102,김학생\n2,10201,이유진\n');
  }
  if(pathname==='/api/roster/validate'&&req.method==='POST'){
    let raw='';req.on('data',c=>{raw+=c;if(raw.length>2_000_000)req.destroy()});req.on('end',()=>{try{const body=JSON.parse(raw||'{}'),report=parseRoster(body.csvText||body.students||[]);res.writeHead(report.students.length?200:400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({ok:!!report.students.length,report}))}catch(e){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({ok:false,error:'명단 요청을 읽지 못했습니다.'}))}});return;
  }
  if (pathname === '/' && teacherEntry) {
    res.writeHead(302, { Location: `${BASE}/teacher` });
    return res.end();
  }
  if (pathname === '/' || pathname === '/student' || pathname === '/student/') {
    res.writeHead(302, { Location: `${BASE}/student` });
    return res.end();
  }
  if (pathname === '/teacher' || pathname === '/teacher/') {
    res.writeHead(302, { Location: `${BASE}/teacher` });
    return res.end();
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end('{"ok":true,"version":"v2.8","mode":"site-launcher"}');
  }
  res.writeHead(302, { Location: `${BASE}/student` });
  res.end();
}).listen(PORT, '0.0.0.0');
