const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const outDir=path.resolve(process.env.POPUP_TEST_OUTPUT||path.join(process.cwd(),'outputs','popup-v2'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep))throw Error('path');if((await fs.stat(p)).isDirectory())p=path.join(p,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(p)]??'application/octet-stream'});res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});

(async()=>{
 await fs.mkdir(outDir,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/moonpath-v41/',browser=await webkit.launch({headless:true});const checks=[];
 try{for(const mode of ['CAREFUL','STANDARD','QUICK']){
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const read=()=>page.evaluate(async()=>{const m=await import('/moonpath-v41/src/storage/indexeddb.js');const db=await m.openEngineDatabase({open:(_n,v)=>indexedDB.open('moonpath-v411-phase29-smoke-db-v1',v)});try{return (await db.read(1)).state;}finally{db.close();}});
  await page.goto(base+'home-b/',{waitUntil:'networkidle'});await page.locator('#menu-new').click();await page.locator('#panel-actions button').last().waitFor();
  await page.locator('input[name="confirmation"][value="'+mode+'"]').check();await page.locator('input[name="participation"][value="COOPERATIVE"]').check();await page.locator('#expedition-seed').fill('browser-class');
  await page.getByRole('button',{name:'탐험 시작',exact:true}).click();await page.waitForURL('**/journey/?slot=1');await page.locator('#journey-guide[open]').waitFor();await page.locator('#guide-map').click();await page.locator('.map-destination').first().waitFor();
  let state=await read();assert.equal(state.settings.preparation.confirmation,mode);assert.equal(state.teams.length,6);assert.equal(state.teams[0].members.length,4);assert.equal(state.settings.interception,false);assert.equal(state.activeSessionId,null);
  await page.locator('.map-destination').first().click();await page.locator('button.region').first().click();
  if(mode==='CAREFUL'){await page.getByRole('button',{name:'이 지역 진입 확인',exact:true}).click();await page.locator('#message').filter({hasText:'수업 시작'}).waitFor();assert.equal((await read()).activeSessionId,null);await page.getByRole('button',{name:'수업 시작 확인',exact:true}).click();}
  await page.getByRole('button',{name:mode==='QUICK'?'지역·첫 문제 시작':'이 지역 진입 확인',exact:true}).click();await page.waitForURL('**/dist/**');await page.locator('#engine-availability').filter({hasText:'시험 DB 준비됨'}).waitFor();await page.waitForFunction(()=>document.querySelector('#lesson-phase').textContent==='ACTIVE');
  state=await read();assert.equal(state.sessions.at(-1).phase,'ACTIVE');
  if(mode==='QUICK'){assert.equal(state.attempts[state.activeAttemptId].timer.phase,'RUNNING');assert.equal(state.participation.assignments.length,1);}else{assert.equal(state.activeAttemptId,null);await page.locator('#draw-question').click();await page.waitForFunction(()=>document.querySelector('#question-clock').textContent.includes('PREPARED'));state=await read();assert.equal(state.attempts[state.activeAttemptId].timer.phase,'PREPARED');}
  assert.equal(await page.locator('#intercept-open').isVisible(),false);
  await page.reload({waitUntil:'networkidle'});if(await page.locator('#retry-expedition').count()){await page.waitForTimeout(31000);await page.locator('#retry-expedition').click();}await page.waitForFunction(()=>document.querySelector('#lesson-phase').textContent==='PAUSED',{},{timeout:5000}).catch(async e=>{console.error(JSON.stringify({mode,errors,text:await page.locator('#message').innerText(),phase:await page.locator('#lesson-phase').innerText()}));throw e;});state=await read();assert.equal(state.sessions.at(-1).phase,'PAUSED');assert.notEqual(state.attempts[state.activeAttemptId].timer.phase,'RUNNING');assert.equal(state.settings.preparation.seed,'browser-class');assert.deepEqual(errors,[]);checks.push(mode+': settings, roster, entry confirmation, first question, refresh paused');
  await context.close();
 }
 console.log(JSON.stringify({passed:checks.length,checks},null,2));await fs.writeFile(path.join(outDir,'preparation-flow-results.json'),JSON.stringify({browser:'Playwright WebKit; isolated local contexts',checks},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});



