export default {
  fetch() {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>GitHub Build Lab - STABLE A</title></head><body style="background:#112b23;color:white;font:24px system-ui;padding:60px"><h1>GITHUB STABLE A</h1><p>GitHub push automatic deployment baseline.</p><p>LAB-GIT-A-01</p></body></html>';
    return new Response(html, {headers: {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-lab-version':'GIT-A','x-robots-tag':'noindex'}});
  }
};
