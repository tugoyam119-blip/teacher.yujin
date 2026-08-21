'use strict';

const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const APPS = path.join(ROOT, 'apps');
const DATA = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA, 'hub-state.json');
const REGISTRY_FILE = path.join(DATA, 'registry.seed.json');
const PORT = Number(process.env.PORT || 3000);
const TEACHER_PIN = String(process.env.TEACHER_PIN || '123456');
const COOKIE_SECRET = String(process.env.COOKIE_SECRET || 'dev-secret-change-me');
const DATABASE_URL = process.env.DATABASE_URL || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_API = process.env.GITHUB_API_URL || 'https://api.github.com';
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || '';
const RAILWAY_PROJECT_ID = process.env.RAILWAY_PROJECT_ID || '';
const RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || '';
const RAILWAY_HUB_SERVICE_ID = process.env.RAILWAY_HUB_SERVICE_ID || process.env.RAILWAY_SERVICE_ID || '';
const RAILWAY_API = process.env.RAILWAY_API_URL || 'https://backboard.railway.com/graphql/v2';
const REPO_FULL = GITHUB_OWNER && GITHUB_REPO ? `${GITHUB_OWNER}/${GITHUB_REPO}` : '';

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(APPS, { recursive: true });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 }
});
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

let pg = null;
let fileState = null;
let fileWrite = Promise.resolve();

const iso = () => new Date().toISOString();
const clone = x => JSON.parse(JSON.stringify(x));
const parse = (s, fallback = null) => { try { return JSON.parse(s); } catch { return fallback; } };
const text = (v, n = 500) => String(v ?? '').trim().slice(0, n);
const bool = v => v === true || v === 1 || v === '1' || v === 'true';
const slugify = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
const safeName = s => String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
const b64 = b => Buffer.from(b).toString('base64');
const stableUrl = a => `/go/${a.slug}`;

function defaultRegistry() {
  const fallback = [
    { id: 'social2-unit1', name: '통합사회2 1단원 교사설명용', slug: 'social2', kind: '수업자료', subject: '통합사회2', audience: 'teacher', description: '통합사회2 1단원 교사용 설명 자료', icon: '📘', deploy_type: 'static', repo_path: 'classroom-hub/apps/social2', target_url: '/apps/social2/', manage_url: '', published: true, sort_order: 10 },
    { id: 'international-relations', name: '국제 관계와 국제기구 교사설명용', slug: 'international-relations', kind: '수업자료', subject: '국제 관계와 국제기구', audience: 'teacher', description: '국제 관계와 국제기구 교사용 설명 자료', icon: '🌐', deploy_type: 'static', repo_path: 'classroom-hub/apps/international-relations', target_url: '/apps/international-relations/', manage_url: '', published: true, sort_order: 20 },
    { id: 'boardgame', name: '학습 보드게임', slug: 'boardgame', kind: '학습게임', subject: '공통', audience: 'both', description: '45칸 학습 보드게임', icon: '🎲', deploy_type: 'static', repo_path: 'classroom-hub/apps/boardgame', target_url: '/apps/boardgame/', manage_url: '', published: true, sort_order: 30 },
    { id: 'human-rights', name: '인권도시 정책결정 수행평가', slug: 'human-rights', kind: '수행평가', subject: '통합사회2', audience: 'student', description: '새봄시 지하철 엘리베이터 우선 설치 정책결정 수행평가', icon: '🏛️', deploy_type: 'server', repo_path: 'services/human-rights', target_url: process.env.PROJECT_HUMAN_RIGHTS_URL || '', manage_url: process.env.PROJECT_HUMAN_RIGHTS_MANAGE_URL || '', railway_service_id: process.env.PROJECT_HUMAN_RIGHTS_SERVICE_ID || '', published: true, sort_order: 40 }
  ];
  if (fs.existsSync(REGISTRY_FILE)) {
    const x = parse(fs.readFileSync(REGISTRY_FILE, 'utf8'), null);
    if (Array.isArray(x) && x.length) return x;
  }
  return fallback;
}

function normalizeActivity(x = {}, existing = {}) {
  const deployType = ['static', 'server', 'external'].includes(x.deploy_type) ? x.deploy_type : (existing.deploy_type || 'static');
  const slug = slugify(x.slug || existing.slug || x.name || existing.name);
  return {
    id: text(existing.id || x.id || crypto.randomUUID(), 100),
    name: text(x.name ?? existing.name, 120),
    slug,
    kind: text(x.kind ?? existing.kind ?? '기타', 40),
    subject: text(x.subject ?? existing.subject ?? '공통', 80),
    audience: ['teacher', 'student', 'both'].includes(x.audience) ? x.audience : (existing.audience || 'both'),
    description: text(x.description ?? existing.description, 500),
    icon: text(x.icon ?? existing.icon ?? '🔗', 8),
    published: x.published === undefined ? !!existing.published : bool(x.published),
    sort_order: Number.isFinite(Number(x.sort_order)) ? Number(x.sort_order) : Number(existing.sort_order || 100),
    deploy_type: deployType,
    repo_path: text(x.repo_path ?? existing.repo_path ?? (deployType === 'static' ? `classroom-hub/apps/${slug}` : `services/${slug}`), 300),
    target_url: text(x.target_url ?? existing.target_url ?? (deployType === 'static' ? `/apps/${slug}/` : ''), 1000),
    manage_url: text(x.manage_url ?? existing.manage_url, 1000),
    railway_service_id: text(x.railway_service_id ?? existing.railway_service_id, 200),
    railway_domain: text(x.railway_domain ?? existing.railway_domain, 500),
    railway_volume_id: text(x.railway_volume_id ?? existing.railway_volume_id, 200),
    version: Math.max(1, Number(x.version ?? existing.version ?? 1)),
    version_label: text(x.version_label ?? existing.version_label ?? ('v'+Math.max(1, Number(x.version ?? existing.version ?? 1))), 40),
    update_mode: text(x.update_mode ?? existing.update_mode ?? (deployType === 'external' ? 'external' : 'chatgpt'), 30),
    deploy_status: text(x.deploy_status ?? existing.deploy_status ?? 'ready', 40),
    last_commit_sha: text(x.last_commit_sha ?? existing.last_commit_sha, 80),
    last_deployment_id: text(x.last_deployment_id ?? existing.last_deployment_id, 200),
    histories: Array.isArray(existing.histories) ? existing.histories.slice(-20) : (Array.isArray(x.histories) ? x.histories.slice(-20) : []),
    created_at: existing.created_at || x.created_at || iso(),
    updated_at: iso()
  };
}

function blankState() {
  return { schema_version: 3, activities: defaultRegistry().map(x => normalizeActivity(x, x)), created_at: iso(), updated_at: iso() };
}

async function initStore() {
  if (DATABASE_URL) {
    const { Pool } = require('pg');
    pg = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
    await pg.query('CREATE TABLE IF NOT EXISTS yujint_v3_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const r = await pg.query('SELECT value FROM yujint_v3_kv WHERE key=$1', ['state']);
    if (!r.rows.length) await pg.query('INSERT INTO yujint_v3_kv(key,value) VALUES($1,$2::jsonb)', ['state', JSON.stringify(blankState())]);
  } else {
    fileState = fs.existsSync(STATE_FILE) ? parse(fs.readFileSync(STATE_FILE, 'utf8'), blankState()) : blankState();
    await saveState(fileState);
  }
  await mergeRegistry();
}

async function getState() {
  if (pg) {
    const r = await pg.query('SELECT value FROM yujint_v3_kv WHERE key=$1', ['state']);
    return r.rows[0]?.value || blankState();
  }
  return clone(fileState || blankState());
}

async function saveState(s) {
  s.updated_at = iso();
  if (pg) {
    await pg.query('INSERT INTO yujint_v3_kv(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()', ['state', JSON.stringify(s)]);
    return;
  }
  fileState = clone(s);
  fileWrite = fileWrite.then(async () => {
    const tmp = STATE_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(fileState, null, 2));
    await fsp.rename(tmp, STATE_FILE);
  });
  return fileWrite;
}

async function mergeRegistry() {
  const s = await getState();
  const seeds = defaultRegistry();
  let changed = false;
  for (const seed of seeds) {
    const i = s.activities.findIndex(a => a.id === seed.id || a.slug === seed.slug);
    if (i < 0) { s.activities.push(normalizeActivity(seed, seed)); changed = true; }
    else {
      const cur=s.activities[i], seedVersion=Number(seed.version||1), curVersion=Number(cur.version||1);
      if (seedVersion>curVersion || (seed.updated_at && String(seed.updated_at)>String(cur.updated_at||''))) {
        // Registry metadata may intentionally omit runtime deployment addresses.
        // Never erase a working Railway binding just because the seed has an empty string.
        const merged={...seed};
        for (const k of ['target_url','manage_url','railway_service_id','railway_domain','railway_volume_id','last_deployment_id']) {
          if (!String(merged[k]||'').trim() && String(cur[k]||'').trim()) merged[k]=cur[k];
        }
        s.activities[i]=normalizeActivity(merged, cur);
        s.activities[i].version=seedVersion;
        s.activities[i].histories=Array.isArray(seed.histories)?seed.histories:cur.histories||[];
        changed=true;
      }
    }
  }
  // Self-heal server URLs after upgrades: Railway domain is the source of truth.
  for (const a of s.activities) {
    if (a.deploy_type==='server' && !String(a.target_url||'').trim() && String(a.railway_domain||'').trim()) {
      a.target_url=`https://${a.railway_domain}`;
      changed=true;
    }
  }
  if (changed) await saveState(s);
}

function signedSession() {
  const payload = Buffer.from(JSON.stringify({ role: 'teacher', exp: Date.now() + 86400000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', COOKIE_SECRET).update(payload).digest('base64url');
}

function isTeacher(req) {
  const raw = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('yt3_teacher='));
  if (!raw) return false;
  const v = decodeURIComponent(raw.slice('yt3_teacher='.length));
  const i = v.lastIndexOf('.'); if (i < 1) return false;
  const p = v.slice(0, i), sig = v.slice(i + 1), expected = crypto.createHmac('sha256', COOKIE_SECRET).update(p).digest('base64url');
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.role === 'teacher' && Date.now() < d.exp;
  } catch { return false; }
}

function sessionCookie(req, value, maxAge = 86400) {
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `yt3_teacher=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function needTeacher(req, res, next) {
  if (!isTeacher(req)) return res.status(401).json({ error: '교사 로그인이 필요합니다.' });
  next();
}

function githubConfigured() { return !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO); }
function railwayConfigured() { return !!(RAILWAY_TOKEN && RAILWAY_PROJECT_ID && RAILWAY_ENVIRONMENT_ID); }

async function gh(method, endpoint, body) {
  if (!githubConfigured()) throw new Error('GitHub 자동연결 환경변수가 설정되지 않았습니다.');
  const r = await fetch(`${GITHUB_API}${endpoint}`, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'yujint-classroom-v3'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || '요청 실패'}`);
  return j;
}

async function githubConnectionCheck() {
  if (!githubConfigured()) return { ok: false, detail: '환경변수 미설정' };
  try {
    const repo = await gh('GET', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}`);
    return { ok: true, detail: `${repo.full_name} · 기본 브랜치 ${repo.default_branch}` };
  } catch (e) { return { ok: false, detail: e.message }; }
}

async function getGithubHead() {
  const owner = encodeURIComponent(GITHUB_OWNER), repo = encodeURIComponent(GITHUB_REPO), branch = encodeURIComponent(GITHUB_BRANCH);
  const ref = await gh('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const commit = await gh('GET', `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  return { sha: ref.object.sha, treeSha: commit.tree.sha };
}

async function getTree(sha) {
  return gh('GET', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/trees/${encodeURIComponent(sha)}?recursive=1`);
}

async function commitFiles({ files, replacePrefix = '', message }) {
  if (!githubConfigured()) throw new Error('GitHub이 연결되지 않아 자동 커밋을 할 수 없습니다.');
  const head = await getGithubHead();
  const baseTree = await getTree(head.treeSha);
  const filePaths = new Set(Object.keys(files).map(p => p.replace(/^\/+/, '')));
  const treeEntries = [];
  if (replacePrefix) {
    const prefix = replacePrefix.replace(/^\/+|\/+$/g, '') + '/';
    for (const e of baseTree.tree || []) {
      if (e.type === 'blob' && e.path.startsWith(prefix) && !filePaths.has(e.path)) {
        treeEntries.push({ path: e.path, mode: '100644', type: 'blob', sha: null });
      }
    }
  }
  for (const [repoPath, buffer] of Object.entries(files)) {
    const blob = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/blobs`, { content: b64(buffer), encoding: 'base64' });
    treeEntries.push({ path: repoPath.replace(/^\/+/, ''), mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/trees`, { base_tree: head.treeSha, tree: treeEntries });
  const commit = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/commits`, { message, tree: newTree.sha, parents: [head.sha] });
  await gh('PATCH', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/refs/heads/${encodeURIComponent(GITHUB_BRANCH)}`, { sha: commit.sha, force: false });
  return commit.sha;
}

async function filesFromGithubPrefix(commitSha, prefix) {
  const commit = await gh('GET', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/commits/${encodeURIComponent(commitSha)}`);
  const tree = await getTree(commit.tree.sha);
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '') + '/';
  const files = {};
  for (const e of tree.tree || []) {
    if (e.type !== 'blob' || !e.path.startsWith(cleanPrefix)) continue;
    const blob = await gh('GET', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/blobs/${e.sha}`);
    files[e.path] = Buffer.from(String(blob.content || '').replace(/\n/g, ''), 'base64');
  }
  if (!Object.keys(files).length) throw new Error('선택한 이전 버전에서 프로그램 파일을 찾지 못했습니다.');
  return files;
}

async function syncRegistryToGithub(s, message = '유진T 클래스룸: 프로그램 목록 동기화') {
  if (!githubConfigured()) return '';
  const rows = (s.activities || []).map(a => ({ ...a, histories: (a.histories || []).slice(-10) }));
  return commitFiles({ files: { 'classroom-hub/data/registry.seed.json': Buffer.from(JSON.stringify(rows, null, 2), 'utf8') }, message });
}

async function railwayGraphql(query, variables = {}) {
  if (!RAILWAY_TOKEN) throw new Error('Railway API 토큰이 설정되지 않았습니다.');
  const r = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RAILWAY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors?.length) throw new Error(`Railway: ${j.errors?.map(x => x.message).join(' / ') || r.status}`);
  return j.data;
}

async function railwayConnectionCheck() {
  if (!RAILWAY_TOKEN) return { ok: false, detail: '토큰 미설정' };
  try {
    const d = await railwayGraphql('query { me { id name email } }');
    return { ok: true, detail: d.me?.email || d.me?.name || '연결됨' };
  } catch (e) { return { ok: false, detail: e.message }; }
}

function parseAppManifest(filesOrPath) {
  let raw = null;
  try {
    if (typeof filesOrPath === 'string') {
      const f = path.join(filesOrPath, 'yujint.app.json');
      if (fs.existsSync(f)) raw = fs.readFileSync(f, 'utf8');
    } else if (filesOrPath && filesOrPath['yujint.app.json']) raw = Buffer.from(filesOrPath['yujint.app.json']).toString('utf8');
  } catch {}
  const m = parse(raw || '{}', {}) || {};
  return {
    healthcheck_path: text(m.healthcheck_path || '/health', 120),
    manage_path: text(m.manage_path || '/?teacher=1', 300),
    inherit_env: Array.isArray(m.inherit_env) ? m.inherit_env.map(x=>text(x,80)).filter(Boolean).slice(0,20) : ['TEACHER_PIN'],
    variables: m.variables && typeof m.variables === 'object' && !Array.isArray(m.variables) ? m.variables : {},
    volume_mount_path: text(m.volume_mount_path || '', 200)
  };
}

async function railwaySetVariables(serviceId, manifest = {}) {
  const vars = {};
  const allowedInherited = { TEACHER_PIN, DATABASE_URL };
  for (const k of manifest.inherit_env || []) if (Object.prototype.hasOwnProperty.call(allowedInherited, k) && allowedInherited[k]) vars[k] = String(allowedInherited[k]);
  for (const [k,v] of Object.entries(manifest.variables || {})) if (/^[A-Z][A-Z0-9_]{0,79}$/.test(k) && typeof v !== 'object') vars[k] = String(v);
  if (!Object.keys(vars).length) return { count: 0 };
  const q = `mutation variableCollectionUpsert($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}`;
  await railwayGraphql(q, { input: { projectId: RAILWAY_PROJECT_ID, environmentId: RAILWAY_ENVIRONMENT_ID, serviceId, variables: vars } });
  return { count: Object.keys(vars).length, names: Object.keys(vars) };
}

async function railwayCreateVolume(serviceId, mountPath) {
  const mp = text(mountPath || '', 200);
  if (!mp) return { volumeId: '' };
  const q = `mutation volumeCreate($input:VolumeCreateInput!){volumeCreate(input:$input){id}}`;
  const d = await railwayGraphql(q, { input: { projectId: RAILWAY_PROJECT_ID, serviceId, mountPath: mp } });
  return { volumeId: d.volumeCreate?.id || '', mountPath: mp };
}

async function railwaySyncInfrastructure(serviceId, slug, manifest = {}, existingVolumeId = '') {
  const qUpdate = `mutation serviceInstanceUpdate($serviceId:String!,$environmentId:String!,$input:ServiceInstanceUpdateInput!){serviceInstanceUpdate(serviceId:$serviceId,environmentId:$environmentId,input:$input)}`;
  await railwayGraphql(qUpdate, { serviceId, environmentId: RAILWAY_ENVIRONMENT_ID, input: { rootDirectory: `/services/${slug}`, healthcheckPath: manifest.healthcheck_path || '/health' } });
  let variableInfo={count:0}, volumeInfo={volumeId:existingVolumeId||'',mountPath:manifest.volume_mount_path||''}, warnings=[];
  try { variableInfo=await railwaySetVariables(serviceId, manifest); } catch(e) { warnings.push('환경변수: '+e.message); }
  if (manifest.volume_mount_path && !existingVolumeId) {
    try { volumeInfo=await railwayCreateVolume(serviceId, manifest.volume_mount_path); } catch(e) { warnings.push('영구 저장소: '+e.message); }
  }
  return { variableInfo, volumeInfo, warning:warnings.join(' / ') };
}

async function railwayCreateService(slug, commitSha, manifest = {}) {
  if (!railwayConfigured()) throw new Error('Railway 자동 생성에 필요한 PROJECT/ENVIRONMENT 정보가 없습니다.');
  if (!REPO_FULL) throw new Error('GitHub 저장소 정보가 없습니다.');
  const qCreate = `mutation serviceCreate($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`;
  const created = await railwayGraphql(qCreate, { input: { projectId: RAILWAY_PROJECT_ID, environmentId: RAILWAY_ENVIRONMENT_ID, name: `yt-${slug}`, source: { repo: REPO_FULL } } });
  const serviceId = created.serviceCreate.id;
  const infra = await railwaySyncInfrastructure(serviceId, slug, manifest, '');
  const variableInfo = infra.variableInfo;
  const volumeInfo = infra.volumeInfo;
  const qDomain = `mutation serviceDomainCreate($input:ServiceDomainCreateInput!){serviceDomainCreate(input:$input){id domain}}`;
  const domainData = await railwayGraphql(qDomain, { input: { serviceId, environmentId: RAILWAY_ENVIRONMENT_ID } });
  let deploymentId = '';
  try {
    const qDeploy = `mutation serviceInstanceDeployV2($serviceId:String!,$environmentId:String!,$commitSha:String){serviceInstanceDeployV2(serviceId:$serviceId,environmentId:$environmentId,commitSha:$commitSha)}`;
    const d = await railwayGraphql(qDeploy, { serviceId, environmentId: RAILWAY_ENVIRONMENT_ID, commitSha: commitSha || null });
    deploymentId = d.serviceInstanceDeployV2 || '';
  } catch (e) {
    // GitHub auto deploy may already be queued. Keep service/domain and surface detail to UI.
    return { serviceId, domain: domainData.serviceDomainCreate.domain, deploymentId: '', warning: [infra.warning,e.message].filter(Boolean).join(' / '), variableInfo, volumeInfo, managePath: manifest.manage_path || '/?teacher=1' };
  }
  return { serviceId, domain: domainData.serviceDomainCreate.domain, deploymentId, warning: infra.warning || '', variableInfo, volumeInfo, managePath: manifest.manage_path || '/?teacher=1' };
}

async function railwayDeployExisting(serviceId, commitSha) {
  if (!serviceId || !railwayConfigured()) return { skipped: true };
  const q = `mutation serviceInstanceDeployV2($serviceId:String!,$environmentId:String!,$commitSha:String){serviceInstanceDeployV2(serviceId:$serviceId,environmentId:$environmentId,commitSha:$commitSha)}`;
  const d = await railwayGraphql(q, { serviceId, environmentId: RAILWAY_ENVIRONMENT_ID, commitSha: commitSha || null });
  return { deploymentId: d.serviceInstanceDeployV2 || '' };
}

async function deploymentStatus(deploymentId) {
  if (!deploymentId || !RAILWAY_TOKEN) return null;
  try {
    const d = await railwayGraphql(`query deployment($id:String!){deployment(id:$id){id status createdAt updatedAt}}`, { id: deploymentId });
    return d.deployment || null;
  } catch { return null; }
}

function ensureIpadHtml(buffer) {
  let s = Buffer.from(buffer).toString('utf8');
  if (!/<head[\s>]/i.test(s)) return buffer;
  if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(s)) {
    s = s.replace(/<meta([^>]+name=["']viewport["'][^>]+content=["'])([^"']*)(["'][^>]*)>/i, (m,a,c,z) => {
      if (/viewport-fit\s*=\s*cover/i.test(c)) return m;
      return `<meta${a}${c.replace(/\s*,?\s*$/,'')}, viewport-fit=cover${z}>`;
    });
  } else {
    s = s.replace(/<head([^>]*)>/i, `<head$1><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`);
  }
  const additions=[];
  if (!/apple-mobile-web-app-capable/i.test(s)) additions.push('<meta name="apple-mobile-web-app-capable" content="yes">');
  if (!/format-detection/i.test(s)) additions.push('<meta name="format-detection" content="telephone=no">');
  if (additions.length) s=s.replace(/<head([^>]*)>/i, m=>m+additions.join(''));
  return Buffer.from(s,'utf8');
}

function normalizeArchiveEntries(file, mode) {
  const allowedStatic = new Set(['.html','.htm','.css','.js','.mjs','.json','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.txt','.csv','.xlsx','.woff','.woff2','.mp3','.wav','.mp4','.webm','.pdf']);
  const files = {};
  const add = (name, data) => {
    let p = String(name || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (!p || p.endsWith('/')) return;
    if (p.startsWith('/') || p.includes('../') || p.split('/').includes('.git') || p.split('/').includes('node_modules')) throw new Error(`허용되지 않은 경로: ${p}`);
    const low = p.toLowerCase();
    if (low === '.env' || low.endsWith('/.env') || low.includes('secret') || low.includes('credential')) throw new Error(`비밀정보로 보이는 파일은 업로드할 수 없습니다: ${p}`);
    if (mode === 'static' && !allowedStatic.has(path.extname(p).toLowerCase())) throw new Error(`정적 프로그램에서 지원하지 않는 파일 형식입니다: ${p}`);
    files[p] = Buffer.from(data);
  };
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.html' || ext === '.htm') {
    if (mode !== 'static') throw new Error('서버형 프로그램은 ZIP으로 올려주세요.');
    add('index.html', file.buffer);
    return files;
  }
  if (ext !== '.zip') throw new Error('HTML 또는 ZIP 파일만 업로드할 수 있습니다.');
  const zip = new AdmZip(file.buffer);
  const entries = zip.getEntries().filter(e => !e.isDirectory);
  if (!entries.length) throw new Error('ZIP 안에 파일이 없습니다.');
  let total = 0;
  const names = entries.map(e => e.entryName.replace(/\\/g, '/')).filter(Boolean);
  const firstSeg = names[0]?.split('/')[0];
  const strip = firstSeg && names.every(n => n.startsWith(firstSeg + '/')) ? firstSeg + '/' : '';
  for (const e of entries) {
    let n = e.entryName.replace(/\\/g, '/');
    if (strip && n.startsWith(strip)) n = n.slice(strip.length);
    const data = e.getData(); total += data.length;
    if (total > 45 * 1024 * 1024) throw new Error('압축을 푼 전체 크기가 45MB를 넘습니다.');
    add(n, data);
  }
  if (mode === 'static') {
    if (!files['index.html']) {
      const htmls = Object.keys(files).filter(x => /\.html?$/i.test(x) && !x.includes('/'));
      if (htmls.length === 1) { files['index.html'] = files[htmls[0]]; if (htmls[0] !== 'index.html') delete files[htmls[0]]; }
      else throw new Error('정적 프로그램 ZIP의 최상위에 index.html이 필요합니다.');
    }
  } else {
    if (!files['package.json']) throw new Error('서버형 프로그램 ZIP의 최상위에 package.json이 필요합니다.');
    const pkg = parse(files['package.json'].toString('utf8'), null);
    if (!pkg || !pkg.scripts?.start) throw new Error('서버형 package.json에 scripts.start가 필요합니다.');
  }
  return files;
}

function repoFileMap(prefix, uploadedFiles) {
  const out = {};
  const clean = prefix.replace(/^\/+|\/+$/g, '');
  for (const [p, b] of Object.entries(uploadedFiles)) out[`${clean}/${p}`] = b;
  return out;
}

async function writeLocalStatic(slug, uploadedFiles) {
  const dest = path.join(APPS, slug);
  await fsp.rm(dest, { recursive: true, force: true });
  for (const [rel, buf] of Object.entries(uploadedFiles)) {
    const target = path.join(dest, rel);
    const resolved = path.resolve(target), base = path.resolve(dest) + path.sep;
    if (!resolved.startsWith(base)) throw new Error('잘못된 파일 경로입니다.');
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, buf);
  }
}

function historyItem(a, action, commitSha, note = '') {
  return { version: a.version, action, commit_sha: commitSha || '', at: iso(), note: text(note, 300) };
}

async function deployUpload({ existing, fields, file }) {
  const mode = fields.deploy_type === 'server' ? 'server' : 'static';
  const slug = slugify(fields.slug || existing?.slug || fields.name);
  if (!slug) throw new Error('프로그램 주소 이름이 필요합니다.');
  const uploaded = normalizeArchiveEntries(file, mode);
  const appManifest = mode === 'server' ? parseAppManifest(uploaded) : {};
  if (mode === 'static' && uploaded['index.html']) uploaded['index.html'] = ensureIpadHtml(uploaded['index.html']);
  const prefix = mode === 'static' ? `classroom-hub/apps/${slug}` : `services/${slug}`;
  if (mode === 'static') await writeLocalStatic(slug, uploaded);
  const files = repoFileMap(prefix, uploaded);
  let commitSha = '', githubNote = '';
  if (githubConfigured()) {
    commitSha = await commitFiles({ files, replacePrefix: prefix, message: `유진T 클래스룸: ${existing ? '패치' : '추가'} ${fields.name || existing?.name || slug}` });
  } else {
    githubNote = 'GitHub 미연결: 현재 실행 환경에만 반영됨';
    if (mode === 'server') throw new Error('서버형 프로그램 자동 배포는 GitHub 연결이 필요합니다.');
  }
  let railway = null;
  if (mode === 'server') {
    if (existing?.railway_service_id) {
      const infra = await railwaySyncInfrastructure(existing.railway_service_id, slug, appManifest, existing.railway_volume_id || '');
      railway = await railwayDeployExisting(existing.railway_service_id, commitSha);
      railway.warning = [infra.warning, railway.warning].filter(Boolean).join(' / ');
      railway.volumeInfo = infra.volumeInfo;
      railway.variableInfo = infra.variableInfo;
      railway.managePath = appManifest.manage_path || '/?teacher=1';
    } else railway = await railwayCreateService(slug, commitSha, appManifest);
  } else if (RAILWAY_HUB_SERVICE_ID && railwayConfigured() && commitSha) {
    try { railway = await railwayDeployExisting(RAILWAY_HUB_SERVICE_ID, commitSha); } catch (e) { railway = { warning: e.message }; }
  }
  return { slug, prefix, commitSha, githubNote, railway, appManifest };
}

function publicActivity(a) {
  return { id: a.id, name: a.name, slug: a.slug, kind: a.kind, subject: a.subject, audience: a.audience, description: a.description, icon: a.icon, stable_url: stableUrl(a), deploy_status: a.deploy_status };
}

// static assets and embedded apps
app.use('/assets', express.static(PUBLIC, { maxAge: '5m', setHeaders: res => { res.setHeader('X-Content-Type-Options', 'nosniff'); } }));
app.use('/apps', express.static(APPS, { index: 'index.html', maxAge: '1m', setHeaders: res => { res.setHeader('Content-Disposition', 'inline'); res.setHeader('X-Content-Type-Options', 'nosniff'); } }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/teacher', (req, res) => isTeacher(req) ? res.sendFile(path.join(PUBLIC, 'teacher.html')) : res.redirect('/'));
app.get('/student', (req, res) => res.sendFile(path.join(PUBLIC, 'student.html')));
app.get('/health', (req, res) => res.json({ ok: true, name: '유진T 클래스룸', version: '3.0.0', storage: pg ? 'postgres' : 'json', github: githubConfigured(), railway: railwayConfigured(), time: iso() }));

app.post('/api/auth/login', (req, res) => {
  if (String(req.body.pin || '') !== TEACHER_PIN) return res.status(401).json({ error: '교사 PIN이 올바르지 않습니다.' });
  res.setHeader('Set-Cookie', sessionCookie(req, signedSession()));
  res.json({ ok: true });
});
app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', sessionCookie(req, '', 0)); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => res.json({ teacher: isTeacher(req) }));

app.get('/api/public/activities', async (req, res, next) => {
  try { const s = await getState(); res.json({ activities: s.activities.filter(a => a.published && (a.audience === 'student' || a.audience === 'both')).sort((a,b)=>a.sort_order-b.sort_order).map(publicActivity) }); } catch (e) { next(e); }
});

app.get('/go/:slug', async (req, res, next) => {
  try {
    const s = await getState(); const a = s.activities.find(x => x.slug === req.params.slug);
    if (!a || !a.published) return res.status(404).send('활동을 찾을 수 없습니다.');
    if (a.audience === 'teacher' && !isTeacher(req)) return res.status(403).send('교사 전용 활동입니다.');
    const target = a.target_url || (a.deploy_type==='server' && a.railway_domain ? `https://${a.railway_domain}` : '');
    if (!target) return res.status(503).send('아직 배포 주소가 준비되지 않았습니다.');
    res.redirect(target);
  } catch (e) { next(e); }
});
app.get('/open/:slug', needTeacher, async (req, res, next) => { try { const s = await getState(); const a = s.activities.find(x => x.slug === req.params.slug); if (!a) return res.status(404).send('없음'); res.redirect(a.target_url || stableUrl(a)); } catch(e){next(e);} });
app.get('/manage/:slug', needTeacher, async (req, res, next) => { try { const s = await getState(); const a = s.activities.find(x => x.slug === req.params.slug); if (!a) return res.status(404).send('없음'); res.redirect(a.manage_url || a.target_url || '/teacher'); } catch(e){next(e);} });

app.get('/api/admin/system', needTeacher, async (req, res) => {
  const [github, railway] = await Promise.all([githubConnectionCheck(), railwayConnectionCheck()]);
  res.json({
    github: { ...github, configured: githubConfigured(), repo: REPO_FULL || null, branch: GITHUB_BRANCH },
    railway: { ...railway, configured: railwayConfigured(), project_id: RAILWAY_PROJECT_ID ? '설정됨' : null, environment_id: RAILWAY_ENVIRONMENT_ID ? '설정됨' : null, hub_service_id: RAILWAY_HUB_SERVICE_ID ? '설정됨' : null },
    database: { ok: !!pg, detail: pg ? 'PostgreSQL 연결됨' : 'JSON 로컬 저장 (Railway 운영 시 PostgreSQL 권장)' },
    upload: { max_mb: 30, static: 'HTML/ZIP', server: 'ZIP(package.json + start script)' }
  });
});

app.get('/api/admin/activities', needTeacher, async (req, res, next) => { try { const s = await getState(); for (const a of s.activities) { if (a.last_deployment_id) { const st = await deploymentStatus(a.last_deployment_id); if (st?.status) { const ds=String(st.status).toLowerCase(); /* Railway는 새 배포가 생기면 이전 deployment를 REMOVED로 표시할 수 있다. 오래된 deployment id 때문에 프로그램 자체가 제거된 것처럼 보이지 않도록 REMOVED는 무시한다. */ if (ds !== 'removed') a.deploy_status = ds; } } } res.json({ activities: s.activities.sort((a,b)=>a.sort_order-b.sort_order), updated_at: s.updated_at }); } catch(e){next(e);} });

app.post('/api/admin/activities/external', needTeacher, async (req, res, next) => {
  try {
    const s = await getState(); const a = normalizeActivity({ ...req.body, deploy_type: 'external' });
    if (!a.name || !a.slug || !a.target_url) return res.status(400).json({ error: '활동명, 고정 주소, 실제 주소가 필요합니다.' });
    if (s.activities.some(x => x.slug === a.slug)) return res.status(409).json({ error: '이미 사용 중인 주소입니다.' });
    s.activities.push(a); await saveState(s); try { await syncRegistryToGithub(s, `유진T 클래스룸: 외부 활동 등록 ${a.name}`); } catch(e) { a.deploy_status='warning'; } res.status(201).json({ ok: true, activity: a });
  } catch(e){next(e);}
});

app.post('/api/admin/deploy/new', needTeacher, upload.single('package'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'HTML 또는 ZIP 파일을 선택하세요.' });
    const fields = req.body; const s = await getState(); const slug = slugify(fields.slug || fields.name);
    if (!slug) return res.status(400).json({ error: '고정 주소 이름이 필요합니다.' });
    if (s.activities.some(a => a.slug === slug)) return res.status(409).json({ error: '이미 사용 중인 프로그램 주소입니다.' });
    const result = await deployUpload({ existing: null, fields: { ...fields, slug }, file: req.file });
    const a = normalizeActivity({
      ...fields, slug, deploy_type: fields.deploy_type === 'server' ? 'server' : 'static', repo_path: result.prefix,
      target_url: fields.deploy_type === 'server' ? (result.railway?.domain ? `https://${result.railway.domain}` : '') : `/apps/${slug}/`,
      manage_url: fields.deploy_type === 'server' && result.railway?.domain ? `https://${result.railway.domain}${result.railway.managePath || '/?teacher=1'}` : '',
      railway_service_id: result.railway?.serviceId || '', railway_domain: result.railway?.domain || '', railway_volume_id: result.railway?.volumeInfo?.volumeId || '',
      last_commit_sha: result.commitSha, last_deployment_id: result.railway?.deploymentId || '', deploy_status: result.railway?.warning ? 'warning' : (result.railway?.deploymentId ? 'deploying' : 'ready'), version: 1
    });
    a.histories.push(historyItem(a, 'create', result.commitSha, result.githubNote || result.railway?.warning || ''));
    s.activities.push(a); await saveState(s);
    try { const registrySha=await syncRegistryToGithub(s, `유진T 클래스룸: 프로그램 등록 정보 ${a.name}`); if(registrySha) a.last_commit_sha=registrySha; } catch(e) { a.deploy_status='warning'; result.registryWarning=e.message; }
    await saveState(s);
    res.status(201).json({ ok: true, activity: a, result });
  } catch(e){next(e);}
});

app.post('/api/admin/deploy/:id/provision', needTeacher, async (req, res, next) => {
  try {
    const s = await getState(); const i = s.activities.findIndex(a => a.id === req.params.id); if (i < 0) return res.status(404).json({ error: '프로그램을 찾지 못했습니다.' });
    const a = s.activities[i]; if (a.deploy_type !== 'server') return res.status(400).json({ error: '서버형 프로그램만 자동 서버 연결을 사용할 수 있습니다.' });
    if (a.railway_service_id) return res.status(409).json({ error: '이미 Railway 서비스가 연결되어 있습니다.' });
    if (!githubConfigured() || !railwayConfigured()) return res.status(400).json({ error: 'GitHub와 Railway 자동연결 설정이 먼저 필요합니다.' });
    const head = await getGithubHead();
    const localManifest = parseAppManifest(path.join(ROOT, '..', a.repo_path));
    const rw = await railwayCreateService(a.slug, head.sha, localManifest);
    const nextA = normalizeActivity({ ...a, railway_service_id: rw.serviceId, railway_domain: rw.domain, railway_volume_id: rw.volumeInfo?.volumeId || '', target_url: `https://${rw.domain}`, manage_url: `https://${rw.domain}${rw.managePath || '/?teacher=1'}`, last_commit_sha: head.sha, last_deployment_id: rw.deploymentId || '', deploy_status: rw.warning ? 'warning' : (rw.deploymentId ? 'deploying' : 'ready') }, a);
    nextA.histories = [...(a.histories || []), historyItem(nextA, 'provision', head.sha, rw.warning || 'Railway 서비스 자동 생성')].slice(-20);
    s.activities[i] = nextA; await saveState(s);
    try { const registrySha = await syncRegistryToGithub(s, `유진T 클래스룸: 서버 연결 ${nextA.name}`); if (registrySha) nextA.last_commit_sha = registrySha; } catch(e) { nextA.deploy_status = 'warning'; }
    await saveState(s); res.json({ ok: true, activity: nextA, railway: rw });
  } catch(e) { next(e); }
});

app.post('/api/admin/deploy/:id/sync-infra', needTeacher, async (req, res, next) => {
  try {
    const s = await getState(); const i = s.activities.findIndex(a => a.id === req.params.id); if (i < 0) return res.status(404).json({ error: '프로그램을 찾지 못했습니다.' });
    const a = s.activities[i]; if (a.deploy_type !== 'server' || !a.railway_service_id) return res.status(400).json({ error: '연결된 서버형 프로그램만 설정 동기화를 사용할 수 있습니다.' });
    let localManifest = parseAppManifest(path.join(ROOT, '..', a.repo_path));
    // The classroom service may run with /classroom-hub as its Railway root directory,
    // so sibling service manifests are not guaranteed to exist at runtime.
    if (a.id==='human-rights') localManifest={...localManifest,healthcheck_path:'/health',manage_path:'/teacher',inherit_env:['TEACHER_PIN'],variables:{...(localManifest.variables||{}),DATA_DIR:'/data'},volume_mount_path:'/data'};
    const infra = await railwaySyncInfrastructure(a.railway_service_id, a.slug, localManifest, a.railway_volume_id || '');
    const nextA = normalizeActivity({ ...a, target_url: a.railway_domain ? `https://${a.railway_domain}` : a.target_url, railway_volume_id: infra.volumeInfo?.volumeId || a.railway_volume_id || '', manage_url: a.railway_domain ? `https://${a.railway_domain}${localManifest.manage_path || '/?teacher=1'}` : a.manage_url, deploy_status: infra.warning ? 'warning' : a.deploy_status }, a);
    s.activities[i] = nextA; await saveState(s);
    res.json({ ok:true, activity:nextA, infrastructure:infra });
  } catch(e) { next(e); }
});

app.post('/api/admin/deploy/:id/patch', needTeacher, upload.single('package'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '패치 파일을 선택하세요.' });
    const s = await getState(); const i = s.activities.findIndex(a => a.id === req.params.id); if (i < 0) return res.status(404).json({ error: '프로그램을 찾지 못했습니다.' });
    const existing = s.activities[i]; if (existing.deploy_type === 'external') return res.status(400).json({ error: '외부 링크 활동은 파일 패치를 지원하지 않습니다.' });
    const fields = { ...existing, ...req.body, slug: existing.slug, deploy_type: existing.deploy_type };
    const result = await deployUpload({ existing, fields, file: req.file });
    const updatedManageUrl = existing.deploy_type === 'server' && existing.railway_domain ? `https://${existing.railway_domain}${result.appManifest?.manage_path || '/?teacher=1'}` : existing.manage_url;
    const nextA = normalizeActivity({ ...existing, ...req.body, version: existing.version + 1, manage_url: updatedManageUrl, railway_volume_id: result.railway?.volumeInfo?.volumeId || existing.railway_volume_id || '', last_commit_sha: result.commitSha, last_deployment_id: result.railway?.deploymentId || existing.last_deployment_id, deploy_status: result.railway?.warning ? 'warning' : (result.railway?.deploymentId ? 'deploying' : 'ready') }, existing);
    nextA.version = existing.version + 1;
    nextA.histories = [...(existing.histories || []), historyItem(nextA, 'patch', result.commitSha, result.githubNote || result.railway?.warning || '')].slice(-20);
    s.activities[i] = nextA; await saveState(s);
    try { const registrySha=await syncRegistryToGithub(s, `유진T 클래스룸: 패치 정보 ${nextA.name} v${nextA.version}`); if(registrySha) nextA.last_commit_sha=registrySha; } catch(e) { nextA.deploy_status='warning'; result.registryWarning=e.message; }
    await saveState(s);
    res.json({ ok: true, activity: nextA, result });
  } catch(e){next(e);}
});

app.post('/api/admin/deploy/:id/rollback', needTeacher, async (req, res, next) => {
  try {
    const commitSha = text(req.body.commit_sha, 80); if (!commitSha) return res.status(400).json({ error: '복구할 GitHub 커밋이 필요합니다.' });
    const s = await getState(); const i = s.activities.findIndex(a => a.id === req.params.id); if (i < 0) return res.status(404).json({ error: '프로그램을 찾지 못했습니다.' });
    const a = s.activities[i]; if (a.deploy_type === 'external') return res.status(400).json({ error: '외부 링크는 롤백할 수 없습니다.' });
    if (!githubConfigured()) return res.status(400).json({ error: 'GitHub 연결이 필요합니다.' });
    const oldFiles = await filesFromGithubPrefix(commitSha, a.repo_path);
    const newSha = await commitFiles({ files: oldFiles, replacePrefix: a.repo_path, message: `유진T 클래스룸: ${a.name} 이전 버전 복구` });
    if (a.deploy_type === 'static') {
      const local = {}; const prefix = a.repo_path.replace(/^\/+|\/+$/g,'') + '/';
      for (const [p,b] of Object.entries(oldFiles)) local[p.slice(prefix.length)] = b;
      await writeLocalStatic(a.slug, local);
    }
    let deploymentId = '';
    try {
      if (a.deploy_type === 'server' && a.railway_service_id) deploymentId = (await railwayDeployExisting(a.railway_service_id, newSha)).deploymentId || '';
      else if (a.deploy_type === 'static' && RAILWAY_HUB_SERVICE_ID) deploymentId = (await railwayDeployExisting(RAILWAY_HUB_SERVICE_ID, newSha)).deploymentId || '';
    } catch {}
    const nextA = normalizeActivity({ ...a, version: a.version + 1, last_commit_sha: newSha, last_deployment_id: deploymentId || a.last_deployment_id, deploy_status: deploymentId ? 'deploying' : 'ready' }, a);
    nextA.version = a.version + 1;
    nextA.histories = [...(a.histories || []), historyItem(nextA, 'rollback', newSha, `복구 원본 ${commitSha.slice(0,7)}`)].slice(-20);
    s.activities[i] = nextA; await saveState(s); try { const registrySha=await syncRegistryToGithub(s, `유진T 클래스룸: 복구 정보 ${nextA.name}`); if(registrySha) nextA.last_commit_sha=registrySha; } catch(e) { nextA.deploy_status='warning'; } await saveState(s); res.json({ ok: true, activity: nextA, commit_sha: nextA.last_commit_sha || newSha });
  } catch(e){next(e);}
});

app.put('/api/admin/activities/:id', needTeacher, async (req, res, next) => {
  try {
    const s = await getState(); const i = s.activities.findIndex(a => a.id === req.params.id); if (i < 0) return res.status(404).json({ error: '활동을 찾지 못했습니다.' });
    const old = s.activities[i]; const a = normalizeActivity(req.body, old); a.slug = old.slug; a.repo_path = old.repo_path; a.deploy_type = old.deploy_type; a.histories = old.histories || [];
    s.activities[i] = a; await saveState(s); try { await syncRegistryToGithub(s, `유진T 클래스룸: 설정 변경 ${a.name}`); } catch(e) { a.deploy_status='warning'; await saveState(s); } res.json({ ok: true, activity: a });
  } catch(e){next(e);}
});

app.delete('/api/admin/activities/:id', needTeacher, async (req, res, next) => {
  try { const s = await getState(); const before = s.activities.length; s.activities = s.activities.filter(a => a.id !== req.params.id); if (before === s.activities.length) return res.status(404).json({ error: '활동을 찾지 못했습니다.' }); await saveState(s); try { await syncRegistryToGithub(s, '유진T 클래스룸: 프로그램 목록 정리'); } catch {} res.json({ ok: true, note: '목록에서만 제거했습니다. GitHub/Railway 원본은 안전을 위해 자동 삭제하지 않습니다.' }); } catch(e){next(e);} 
});

app.get('/api/admin/check/:id', needTeacher, async (req, res, next) => {
  try {
    const s = await getState(); const a = s.activities.find(x => x.id === req.params.id); if (!a) return res.status(404).json({ error: '없음' });
    const rawUrl = a.target_url || (a.deploy_type==='server' && a.railway_domain ? `https://${a.railway_domain}` : '');
    const url = rawUrl?.startsWith('/') ? `${req.protocol}://${req.get('host')}${rawUrl}` : rawUrl;
    if (!url) return res.json({ ok: false, detail: '배포 주소가 등록되지 않았습니다.' });
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(7000) });
    res.json({ ok: r.status >= 200 && r.status < 400, status: r.status, url });
  } catch(e){res.json({ok:false,detail:e.message});}
});

app.get('/api/admin/export', needTeacher, async (req,res,next)=>{try{const s=await getState();res.setHeader('Content-Disposition','attachment; filename="yujint-v3-registry.json"');res.json(s.activities);}catch(e){next(e);}});

app.use((err, req, res, next) => {
  console.error('[v3]', err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '파일은 최대 30MB까지 업로드할 수 있습니다.' : err.message });
  res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
});

initStore().then(() => app.listen(PORT, '0.0.0.0', () => console.log(`유진T 클래스룸 v3 : http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
