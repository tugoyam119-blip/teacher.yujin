const http = require('http');

const PORT = Number(process.env.PORT || 3000);
const BASE = 'https://exchange-crisis-team.tugoyam119.chatgpt.site';

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end('{"ok":true}');
  }
  // Older classroom registrations use /?teacher=1 as their management URL.
  // This selects the login screen only; the destination still authenticates teachers.
  const teacher = pathname === '/teacher' ||
    (pathname === '/' && url.searchParams.get('teacher') === '1');
  res.writeHead(302, {
    Location: `${BASE}/${teacher ? 'teacher' : 'student'}`,
    'Cache-Control': 'no-store'
  });
  res.end();
}).listen(PORT, '0.0.0.0');
