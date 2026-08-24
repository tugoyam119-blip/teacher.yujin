const http = require('http');

const PORT = Number(process.env.PORT || 3000);
const BASE = 'https://exchange-crisis-team.tugoyam119.chatgpt.site';

http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/teacher') {
    res.writeHead(302, { Location: `${BASE}/teacher` });
    return res.end();
  }
  if (req.url === '/student') {
    res.writeHead(302, { Location: `${BASE}/student` });
    return res.end();
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end('{"ok":true}');
  }
  res.writeHead(302, { Location: `${BASE}/teacher` });
  res.end();
}).listen(PORT, '0.0.0.0');
