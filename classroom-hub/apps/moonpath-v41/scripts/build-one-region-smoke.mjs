/** Build a SINGLE isolated test HTML, with no URL/CDN/runtime network imports.
 * This is NOT the approved game art nor the v4.1.1 production offline build.
 */
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const cwd=resolve(import.meta.dirname,'..');
const root=resolve(cwd,'src');
const normalize=p=>p.replaceAll('\\','/');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=resolve(dir,e.name);return e.isDirectory()?walk(p):e.name.endsWith('.js')?[p]:[];
 });}
const modules={};
for(const abs of walk(root)){
 const name='mp:'+normalize(relative(root,abs));
 const original=readFileSync(abs,'utf8');
 modules[name]=original.replace(/\bfrom\s*(['"])(\.\.?\/[^'"\n]+)\1/g,(_match,_quote,imp)=>{
  const target=resolve(dirname(abs),imp);
  const local=relative(root,target);
  if(local==='..'||local.startsWith('../')||local.startsWith('..\\')||isAbsolute(local)||!target.endsWith('.js'))throw Error(`Unexpected external import: ${abs} ${imp}`);
  return `from '${'mp:'+normalize(relative(root,target))}'`;
 });
}
const pack=JSON.parse(readFileSync(resolve(cwd,'data/YQBank_60_v1.0.0_source.json'),'utf8'));
const world=JSON.parse(readFileSync(resolve(cwd,'config/world.json'),'utf8'));
if(pack.questions.length!==60||world.themes.length!==6)throw Error('Official pack or world invalid');
const artwork=new Map();
const approved=JSON.parse(readFileSync(resolve(cwd,'data/home-popup-v2-assets.json'),'utf8')).assets;
const embedArt=source=>source.replace(/mp-art:([a-z0-9-]+)/g,(_m,name)=>{
 const assetPath='assets/home/popup-v2/'+name+'.png';
 const record=approved.find(x=>x.path===assetPath);if(!record)throw Error('Unregistered popup artwork: '+name);
 const bytes=readFileSync(resolve(cwd,assetPath)),sha=createHash('sha256').update(bytes).digest('hex');
 if(sha!==record.sha256)throw Error('Approved artwork bytes changed: '+name);
 artwork.set(assetPath,{path:assetPath,sha256:sha,bytes:bytes.length});
 return 'data:image/png;base64,'+bytes.toString('base64');
});
const popupCSS=embedArt(readFileSync(resolve(cwd,'src/demo/question-popup.css'),'utf8'));
const backgroundPath='assets/home/assembly/background-original.png',homeAsset=JSON.parse(readFileSync(resolve(cwd,'data/home-b-assembly-assets.json'),'utf8')).assets.find(a=>a.path===backgroundPath);
const background=readFileSync(resolve(cwd,backgroundPath)),backgroundHash=createHash('sha256').update(background).digest('hex');
if(!homeAsset||backgroundHash!==homeAsset.sha256)throw Error('HOME background bytes changed');
const sceneCSS=embedArt(readFileSync(resolve(cwd,'src/demo/region-scene.css'),'utf8')).replaceAll('mp-scene:home-background','data:image/png;base64,'+background.toString('base64'));
const template=readFileSync(resolve(cwd,'src/demo/one-region-template.html'),'utf8');
const safeJSON=o=>JSON.stringify(o).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const blobMap=`<script id="mp-bundle" type="application/json">${safeJSON({modules,pack,world})}</script>\n<script id="mp-mapping">\n(()=>{\n const all=JSON.parse(document.getElementById('mp-bundle').textContent);\n window.__MP_TEST_PACK__=all.pack;window.__MP_TEST_WORLD__=all.world;\n const imports={};\n for(const [name,source] of Object.entries(all.modules)){imports[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));}\n const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);\n window.__MP_BUILD_READY__=true;\n})();\n</script>`;
const entry=`<script type="module">\nimport {bootOneRegionSmoke} from 'mp:demo/one-region-smoke.js';\nbootOneRegionSmoke({pack:window.__MP_TEST_PACK__,world:window.__MP_TEST_WORLD__}).then(api=>{window.__MP_TEST_APP__=api;window.__MP_TEST_READY__=true;}).catch(err=>{window.__MP_TEST_FATAL__=String(err);document.getElementById('message').textContent='초기화 실패: '+err.message;});\n</script>`;
const html=template.replace('<!-- MP_SCENE_STYLE -->',sceneCSS).replace('<!-- MP_QUESTION_STYLE -->',popupCSS).replace('<!-- MP_MODULES -->',blobMap).replace('<!-- MP_ENTRY -->',entry).replaceAll('\r\n','\n');
if(html===template||html.includes('<!-- MP_MODULES -->')||html.includes('<!-- MP_ENTRY -->'))throw Error('Template placeholders failed');
if(/<script[^>]*\bsrc=/.test(html)||/\b(?:fetch|XMLHttpRequest)\s*\(/.test(html))throw Error('Runtime external file access detected');
if(!html.includes('moonpath-v411-phase29-smoke-db-v1'))throw Error('Isolated DB namespace not found');
mkdirSync(resolve(cwd,'dist'),{recursive:true});
const target=resolve(cwd,'dist/phase2-9-one-region-smoke.html');
writeFileSync(target,html);
const sha=createHash('sha256').update(html).digest('hex');
const evidence={builtAt:new Date().toISOString(),role:'PHASE2-9 TEACHER-ONLY TEST BUILD',buildSha256:sha,htmlBytes:Buffer.byteLength(html),moduleCount:Object.keys(modules).length,questionCount:pack.questions.length,
  embeddedPopupArtwork:[...artwork.values()],embeddedSceneBackground:{path:backgroundPath,sha256:backgroundHash,bytes:background.length},testOnly:true,actualBrowserIdbStatus:'NOT_TESTED',offlineFileCompatibility:'NOT_TESTED',fullGameBuild:false};
writeFileSync(resolve(cwd,'dist/phase2-9-build-manifest.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
