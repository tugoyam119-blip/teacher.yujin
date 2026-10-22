export default {
  fetch() {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>GitHub Build Lab - RECOVERED C</title></head><body style="background:#112b23;color:white;font:24px system-ui;padding:60px"><h1>GITHUB RECOVERED C</h1><p>Successful automatic deployment after the failed GitHub build.</p><p>LAB-GIT-C-03</p></body></html>';
    return new Response(html, {headers: {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-lab-version':'GIT-C','x-robots-tag':'noindex'}});
  }
};
