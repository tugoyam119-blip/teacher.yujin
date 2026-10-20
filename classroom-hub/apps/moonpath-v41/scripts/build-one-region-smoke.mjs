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
const template=readFileSync(resolve(cwd,'src/demo/one-region-template.html'),'utf8');
const safeJSON=o=>JSON.stringify(o).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const blobMap=`<script id="mp-bundle" type="application/json">${safeJSON({modules,pack,world})}</script>\n<script id="mp-mapping">\n(()=>{\n const all=JSON.parse(document.getElementById('mp-bundle').textContent);\n window.__MP_TEST_PACK__=all.pack;window.__MP_TEST_WORLD__=all.world;\n const imports={};\n for(const [name,source] of Object.entries(all.modules)){imports[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));}\n const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);\n window.__MP_BUILD_READY__=true;\n})();\n</script>`;
const entry=`<script type="module">\nimport {bootOneRegionSmoke} from 'mp:demo/one-region-smoke.js';\nbootOneRegionSmoke({pack:window.__MP_TEST_PACK__,world:window.__MP_TEST_WORLD__}).then(api=>{window.__MP_TEST_APP__=api;window.__MP_TEST_READY__=true;}).catch(err=>{window.__MP_TEST_FATAL__=String(err);document.getElementById('message').textContent='초기화 실패: '+err.message;});\n</script>`;
const html=template.replace('<!-- MP_MODULES -->',blobMap).replace('<!-- MP_ENTRY -->',entry);
if(html===template||html.includes('<!-- MP_MODULES -->')||html.includes('<!-- MP_ENTRY -->'))throw Error('Template placeholders failed');
if(/<script[^>]*\bsrc=/.test(html)||/\b(?:fetch|XMLHttpRequest)\s*\(/.test(html))throw Error('Runtime external file access detected');
if(!html.includes('moonpath-v411-phase29-smoke-db-v1'))throw Error('Isolated DB namespace not found');
mkdirSync(resolve(cwd,'dist'),{recursive:true});
const target=resolve(cwd,'dist/phase2-9-one-region-smoke.html');
writeFileSync(target,html);
const sha=createHash('sha256').update(html).digest('hex');
const evidence={builtAt:'2026-10-16',role:'PHASE2-9 TEACHER-ONLY TEST BUILD',buildSha256:sha,htmlBytes:Buffer.byteLength(html),moduleCount:Object.keys(modules).length,questionCount:pack.questions.length,
  testOnly:true,actualBrowserIdbStatus:'NOT_TESTED',offlineFileCompatibility:'NOT_TESTED',fullGameBuild:false};
writeFileSync(resolve(cwd,'dist/phase2-9-build-manifest.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
