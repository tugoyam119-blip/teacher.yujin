const http = require('http');

const PORT = Number(process.env.PORT || 3000);
const BASE = 'https://exchange-crisis-team.tugoyam119.chatgpt.site';

const page = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>환율 비상! 국제경제 대응팀</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f2ea;color:#102f4a;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}.card{width:min(92vw,620px);padding:42px 32px;border:1px solid #d8e2e7;border-radius:24px;background:#fff;box-shadow:0 18px 45px #173d5920;text-align:center}.tag{font-weight:800;color:#16836e}.card h1{margin:12px 0;font-size:clamp(30px,6vw,46px)}p{line-height:1.7;color:#496273}.buttons{display:grid;gap:12px;margin-top:28px}a{display:block;padding:17px;border-radius:13px;text-decoration:none;font-weight:800}.student{background:#10334f;color:#fff}.teacher{border:1px solid #10334f;color:#10334f}.note{margin-top:22px;font-size:13px;color:#71838f}
  </style>
</head>
<body><main class="card"><div class="tag">국제 관계와 국제기구 수행평가</div><h1>환율 비상!<br>국제경제 대응팀</h1><p>환율 급등 상황을 분석하고 국제경제 대응 정책을 선택하는 개인형 서버 수행평가입니다.</p><div class="buttons"><a class="student" href="${BASE}/student">학생용 수행평가 입장</a><a class="teacher" href="${BASE}/teacher">교사 관리실 입장</a></div><div class="note">교사 관리실 비밀번호: 000000</div></main></body></html>`;

http.createServer((req, res) => {
  if (req.url === '/student') {
    res.writeHead(302, { Location: `${BASE}/student` });
    return res.end();
  }
  if (req.url === '/teacher') {
    res.writeHead(302, { Location: `${BASE}/teacher` });
    return res.end();
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end('{"ok":true}');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(PORT, '0.0.0.0');
