const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const outDir=path.resolve(process.env.POPUP_TEST_OUTPUT||path.join(process.cwd(),'outputs','popup-v2'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep))throw Error('path');if((await fs.stat(p)).isDirectory())p=path.join(p,'index.html');res.writeHead(200,{'Content-Type':mime[path.extname(p)]??'application/octet-stream'});res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
(async()=>{
 await fs.mkdir(outDir,{recursive:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/moonpath-v41/home-b/`;
 const browser=await webkit.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();
 const errors=[],failures=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url(),status:r.status()});});
 try{
  await page.goto(url,{waitUntil:'networkidle'});
  assert.equal(await page.locator('.menu-button').count(),7);checks.push('Seven HOME buttons rendered');
  const homeBefore=await page.locator('#stage').evaluate(el=>el.outerHTML);await page.locator('#stage').screenshot({path:path.join(outDir,'STEP05-HOME-local.png')});
  await page.getByRole('button',{name:'새로운 탐험',exact:true}).click();
  await page.locator('#panel-actions button').last().waitFor();
  assert.equal(await page.locator('#panel-footer #panel-message').count(),1);
  const geometry=await page.locator('#panel').evaluate(el=>{const r=el.getBoundingClientRect();const body=document.querySelector('#panel-body').getBoundingClientRect();return {width:r.width,height:r.height,bodyWidth:body.width,bodyHeight:body.height,bodyLeft:body.left-r.left,bodyTop:body.top-r.top};});
  assert.ok(Math.abs(geometry.width-820*4/3)<1);assert.ok(Math.abs(geometry.height-500*4/3)<1);checks.push({desktopGeometry:geometry});
  await page.screenshot({path:path.join(outDir,'STEP05-desktop-new.png')});
  await page.locator('#setup-pack-status').filter({hasText:'검증 완료'}).waitFor();
  assert.equal(await page.locator('#team-count').inputValue(),'6');
  await page.locator('input[name="lesson-minutes"][value="25"]').check();
  await page.locator('input[name="participation"][value="COOPERATIVE"]').check();
  assert.ok((await page.locator('#preparation-summary').innerText()).includes('25분'));
  assert.ok((await page.locator('#preparation-summary').innerText()).includes('완전 협동'));
  checks.push('One screen setup updates actual duration, cooperation and people summary');
  await page.screenshot({path:path.join(outDir,'STEP05-desktop-settings.png')});
  const scroll=await page.locator('.preparation-settings').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));assert.ok(scroll.scroll>scroll.client);checks.push({settingsScroll:scroll});
  await page.locator('#close-panel').click();await page.waitForFunction(()=>document.activeElement===document.querySelector('#menu-new'));checks.push('Close restores HOME trigger focus');
  for(const [id,title] of [['continue','이어하기'],['journal','탐험 일지'],['settings','설정'],['records','기록'],['help','도움말'],['exit','나가기']]){
   await page.locator(`#menu-${id}`).click();await page.locator('#panel-actions button').first().waitFor();
   assert.equal(await page.locator('#panel-title').innerText(),title);await page.locator('#close-panel').press('Escape');
   assert.equal(await page.locator('#panel').evaluate(el=>el.open),false);checks.push(`${id}: open, footer, Escape close`);
  }
  assert.equal(await page.locator('#stage').evaluate(el=>el.outerHTML),homeBefore);checks.push('HOME DOM, image paths and coordinates unchanged after popup interactions (focus outline excluded)');
  await page.setViewportSize({width:390,height:844});await page.locator('#menu-new').click();await page.locator('#panel.compact').waitFor();await page.locator('#panel-actions button').last().waitFor();
  await page.screenshot({path:path.join(outDir,'STEP05-mobile-new.png')});
  const mobile=await page.evaluate(()=>{const p=document.querySelector('#panel'),r=p.getBoundingClientRect();const buttons=[...document.querySelectorAll('#panel-actions button')].map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,bottom:r.bottom};});return {width:innerWidth,height:innerHeight,panel:{x:r.x,y:r.y,width:r.width,height:r.height},buttons,bodyFont:getComputedStyle(document.querySelector('#panel-body')).fontSize};});
  assert.equal(mobile.bodyFont,'16px');for(const b of mobile.buttons){assert.ok(b.height>=44);assert.ok(b.right<=390);assert.ok(b.bottom<=844);}checks.push({mobileGeometry:mobile});
  await page.locator('#close-panel').click();await page.setViewportSize({width:844,height:390});await page.locator('#menu-new').click();
  await page.locator('#panel-actions button').last().waitFor();await page.screenshot({path:path.join(outDir,'STEP05-short-landscape.png')});assert.equal(await page.locator('#panel.short').count(),1);checks.push('Short landscape enables combined content/footer scroll');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);checks.push('No browser page errors or HTTP >=400 responses');
  await fs.writeFile(path.join(outDir,'STEP05-browser-results.json'),JSON.stringify({browser:'Playwright WebKit, fresh isolated browser context; not Windows Chrome/Edge or physical mobile',url,checks,errors,failures,storageScope:'Only ephemeral local test origin; no production origin or existing data accessed'},null,2));
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
 }catch(e){await page.screenshot({path:path.join(outDir,'STEP05-browser-failure.png')});console.error(e);process.exitCode=1;}
 finally{await context.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
