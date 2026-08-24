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



function normalizePatchMatchText(v) {
  return String(v || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
}

function patchNameTokens(v) {
  const stop = new Set(['프로그램','패치','업데이트','버전','최종','자료','교사용','학생용','수행평가','수업자료','학습','the','and','for','app','web','html','full','patch','update','classroom','upload']);
  return String(v || '').normalize('NFKC').toLowerCase().split(/[^a-z0-9가-힣]+/g).map(x=>x.trim()).filter(x => x && x.length >= 2 && !stop.has(x));
}

function inspectPatchPackage(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const info = { filename: String(file.originalname || ''), ext, names: [], json: {}, sample: '', detected_mode: '' };
  const pushSample = (name, buf) => {
    if (info.sample.length >= 900000) return;
    if (!/\.(?:html?|js|mjs|json|txt|md|css|csv)$/i.test(name)) return;
    let t = Buffer.from(buf).toString('utf8').slice(0, 140000);
    info.sample += `\n--- ${name} ---\n${t}`;
  };
  const readJson = (name, buf) => {
    const base = path.posix.basename(name).toLowerCase();
    if (!['yujint.patch.json','yujint.app.json','package.json','manifest.json'].includes(base)) return;
    const obj = parse(Buffer.from(buf).toString('utf8'), null);
    if (obj && typeof obj === 'object') info.json[base] = obj;
  };
  if (ext === '.html' || ext === '.htm') {
    info.names = ['index.html'];
    info.detected_mode = 'static';
    pushSample('index.html', file.buffer);
    return info;
  }
  if (ext !== '.zip') throw new Error('패치는 ZIP 또는 HTML 파일만 사용할 수 있습니다.');
  const zip = new AdmZip(file.buffer);
  const entries = zip.getEntries().filter(e => !e.isDirectory);
  if (!entries.length) throw new Error('ZIP 안에 파일이 없습니다.');
  const rawNames = entries.map(e => e.entryName.replace(/\\/g, '/')).filter(Boolean);
  const firstSeg = rawNames[0]?.split('/')[0];
  const strip = firstSeg && rawNames.every(n => n.startsWith(firstSeg + '/')) ? firstSeg + '/' : '';
  let total = 0;
  for (const e of entries) {
    let n = e.entryName.replace(/\\/g, '/');
    if (strip && n.startsWith(strip)) n = n.slice(strip.length);
    if (!n) continue;
    const data = e.getData(); total += data.length;
    if (total > 45 * 1024 * 1024) throw new Error('압축을 푼 전체 크기가 45MB를 넘습니다.');
    info.names.push(n);
    readJson(n, data);
    pushSample(n, data);
  }
  const pkg = info.json['package.json'] || {};
  const appm = info.json['yujint.app.json'] || {};
  if (String(appm.type || '').toLowerCase() === 'server' || pkg?.scripts?.start) info.detected_mode = 'server';
  else if (String(appm.type || '').toLowerCase() === 'static' || info.names.some(n => /^index\.html?$/i.test(n))) info.detected_mode = 'static';
  return info;
}

function patchVersionInfo(info, existing) {
  const patch = info.json['yujint.patch.json'] || {};
  const appm = info.json['yujint.app.json'] || {};
  const pkg = info.json['package.json'] || {};
  let raw = String(patch.version || appm.version || '').trim();
  if (!raw && pkg.version && pkg.version !== '1.0.0') raw = String(pkg.version).trim();
  let version = Number(existing.version || 1) + 1;
  let version_label = '';
  if (raw) {
    version_label = /^v/i.test(raw) ? raw : `v${raw}`;
    const nums = raw.match(/\d+/g);
    if (nums?.length) {
      const candidate = Number(nums.slice(0, 3).join(''));
      if (Number.isFinite(candidate) && candidate > Number(existing.version || 0)) version = candidate;
    }
  }
  if (!version_label) version_label = `v${version}`;
  return { version, version_label };
}

function detectPatchTarget(info, activities, forcedId = '') {
  const available = (activities || []).filter(a => a.deploy_type !== 'external');
  if (forcedId) {
    const hit = available.find(a => a.id === forcedId);
    if (!hit) throw new Error('직접 선택한 대상 프로그램을 찾지 못했습니다.');
    if (info.detected_mode && hit.deploy_type !== info.detected_mode) throw new Error(`선택한 프로그램은 ${hit.deploy_type==='server'?'서버형':'정적형'}인데 업로드 파일은 ${info.detected_mode==='server'?'서버형':'정적형'}으로 보입니다.`);
    return { activity: hit, score: 9999, reason: '교사가 직접 대상 선택', candidates: [] };
  }
  const patch = info.json['yujint.patch.json'] || {};
  const appm = info.json['yujint.app.json'] || {};
  const pkg = info.json['package.json'] || {};
  const explicit = [patch.target_id, patch.app_id, patch.id, patch.slug, appm.target_id, appm.app_id, appm.id, appm.slug].filter(Boolean).map(normalizePatchMatchText);
  const source = [info.filename, ...info.names, JSON.stringify(info.json), info.sample].join('\n');
  const sourceN = normalizePatchMatchText(source);
  const fileN = normalizePatchMatchText(info.filename);
  const scored = available.map(a => {
    let score = 0; const reasons = [];
    if (info.detected_mode && a.deploy_type !== info.detected_mode) score -= 1000;
    const idN = normalizePatchMatchText(a.id), slugN = normalizePatchMatchText(a.slug), repoN = normalizePatchMatchText(a.repo_path), nameN = normalizePatchMatchText(a.name);
    if (explicit.some(x => x && [idN, slugN].includes(x))) { score += 1200; reasons.push('패치 메타데이터의 프로그램 ID/주소 일치'); }
    if (repoN && sourceN.includes(repoN)) { score += 500; reasons.push('GitHub 경로 일치'); }
    if (slugN && slugN.length >= 4 && fileN.includes(slugN)) { score += 320; reasons.push('파일명과 고정 주소 일치'); }
    if (idN && idN.length >= 4 && fileN.includes(idN)) { score += 300; reasons.push('파일명과 프로그램 ID 일치'); }
    if (slugN && slugN.length >= 4 && sourceN.includes(slugN)) { score += 180; reasons.push('패치 내부에서 고정 주소 확인'); }
    if (idN && idN.length >= 4 && sourceN.includes(idN)) { score += 170; reasons.push('패치 내부에서 프로그램 ID 확인'); }
    if (nameN && nameN.length >= 5 && sourceN.includes(nameN)) { score += 150; reasons.push('프로그램 이름 일치'); }
    let tokenHits = 0;
    for (const tok of new Set([...patchNameTokens(a.name), ...patchNameTokens(a.description)])) {
      const tn = normalizePatchMatchText(tok);
      if (tn.length >= 2 && sourceN.includes(tn)) tokenHits += 1;
    }
    if (tokenHits) { score += Math.min(120, tokenHits * 22); reasons.push(`관련 내용 ${tokenHits}개 확인`); }
    const pkgName = normalizePatchMatchText(pkg.name || '');
    if (pkgName && (pkgName.includes(slugN) || slugN.includes(pkgName))) { score += 110; reasons.push('package.json 이름 연관'); }
    return { activity: a, score, reasons };
  }).sort((a,b)=>b.score-a.score);
  const first = scored[0], second = scored[1];
  if (!first || first.score < 55) {
    const names = scored.slice(0,3).map(x=>`${x.activity.name}(${x.score})`).join(', ');
    throw new Error(`패치 대상 프로그램을 충분히 확신할 수 없습니다.${names ? ` 후보: ${names}` : ''} 아래 '자동 판단 실패 시만 직접 선택'에서 대상을 선택해 다시 올려주세요.`);
  }
  if (second && second.score > 0 && first.score - second.score < 25) {
    throw new Error(`두 프로그램이 비슷하게 감지되었습니다: ${first.activity.name}(${first.score}), ${second.activity.name}(${second.score}). 아래 '자동 판단 실패 시만 직접 선택'에서 대상을 선택해 다시 올려주세요.`);
  }
  return { activity: first.activity, score: first.score, reason: first.reasons.join(' · ') || '파일 내용 연관성', candidates: scored.slice(0,3).map(x=>({id:x.activity.id,name:x.activity.name,score:x.score})) };
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
app.get('/health', (req, res) => res.json({ ok: true, name: '유진T 클래스룸', version: '4.4.0', chatgpt_patch_receiver: true, chatgpt_patch_format: 1, storage: pg ? 'postgres' : 'json', github: githubConfigured(), railway: railwayConfigured(), time: iso() }));

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



app.post('/api/admin/deploy/auto-patch', needTeacher, upload.single('package'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '패치 파일을 선택하세요.' });
    const s = await getState();
    const info = inspectPatchPackage(req.file);
    const matched = detectPatchTarget(info, s.activities, text(req.body.target_id, 100));
    const i = s.activities.findIndex(a => a.id === matched.activity.id);
    if (i < 0) return res.status(404).json({ error: '자동으로 찾은 프로그램이 현재 목록에 없습니다.' });
    const existing = s.activities[i];
    if (existing.deploy_type === 'external') return res.status(400).json({ error: '외부 링크 활동은 파일 패치를 지원하지 않습니다.' });
    if (info.detected_mode && info.detected_mode !== existing.deploy_type) return res.status(400).json({ error: `패치 파일 형식(${info.detected_mode})과 대상 프로그램 형식(${existing.deploy_type})이 다릅니다.` });
    const fields = { ...existing, slug: existing.slug, deploy_type: existing.deploy_type };
    const result = await deployUpload({ existing, fields, file: req.file });
    const v = patchVersionInfo(info, existing);
    const updatedManageUrl = existing.deploy_type === 'server' && existing.railway_domain ? `https://${existing.railway_domain}${result.appManifest?.manage_path || '/?teacher=1'}` : existing.manage_url;
    const nextA = normalizeActivity({ ...existing, version: v.version, version_label: v.version_label, manage_url: updatedManageUrl, railway_volume_id: result.railway?.volumeInfo?.volumeId || existing.railway_volume_id || '', last_commit_sha: result.commitSha, last_deployment_id: result.railway?.deploymentId || existing.last_deployment_id, deploy_status: result.railway?.warning ? 'warning' : (result.railway?.deploymentId ? 'deploying' : 'ready') }, existing);
    nextA.version = v.version;
    nextA.version_label = v.version_label;
    nextA.histories = [...(existing.histories || []), historyItem(nextA, 'auto-patch', result.commitSha, `자동 연결: ${matched.reason}${result.githubNote ? ' · '+result.githubNote : ''}${result.railway?.warning ? ' · '+result.railway.warning : ''}`)].slice(-20);
    s.activities[i] = nextA;
    await saveState(s);
    try {
      const registrySha = await syncRegistryToGithub(s, `유진T 클래스룸: 자동 패치 ${nextA.name} ${nextA.version_label}`);
      if (registrySha) nextA.last_commit_sha = registrySha;
    } catch(e) {
      nextA.deploy_status = 'warning';
      result.registryWarning = e.message;
    }
    await saveState(s);
    res.json({
      ok: true,
      matched: { id: nextA.id, name: nextA.name, slug: nextA.slug, version: nextA.version, version_label: nextA.version_label, score: matched.score, reason: matched.reason },
      analysis: { filename: info.filename, detected_mode: info.detected_mode || existing.deploy_type, candidates: matched.candidates || [] },
      activity: nextA,
      result
    });
  } catch(e) { next(e); }
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


// === CHATGPT_PATCH_RECEIVER_V1 ================================================
// 안전한 패치 수신함: 교사 로그인 + GitHub 직전 HEAD 백업 + 실제 파일 복구
function safePatchSameFileMap(left = {}, right = {}) {
  const lk = Object.keys(left).sort(), rk = Object.keys(right).sort();
  if (lk.length !== rk.length) return false;
  for (let i = 0; i < lk.length; i++) {
    if (lk[i] !== rk[i]) return false;
    if (!Buffer.from(left[lk[i]]).equals(Buffer.from(right[rk[i]]))) return false;
  }
  return true;
}

function inspectChatgptCorePackage(file) {
  const ext = path.extname(file?.originalname || '').toLowerCase();
  if (ext !== '.zip') return null;
  const zip = new AdmZip(file.buffer);
  const entries = zip.getEntries().filter(e => !e.isDirectory);
  if (!entries.length) return null;
  const rawNames = entries.map(e => e.entryName.replace(/\\/g, '/')).filter(Boolean);
  const firstSeg = rawNames[0]?.split('/')[0];
  const strip = firstSeg && rawNames.every(n => n.startsWith(firstSeg + '/')) ? firstSeg + '/' : '';
  const normalized = [];
  for (const e of entries) {
    let n = e.entryName.replace(/\\/g, '/');
    if (strip && n.startsWith(strip)) n = n.slice(strip.length);
    if (n) normalized.push({ name: n, data: e.getData() });
  }
  const manifestEntry = normalized.find(x => x.name.toLowerCase() === 'yujint.chatgpt.patch.json');
  if (!manifestEntry) return null;
  const manifest = parse(manifestEntry.data.toString('utf8'), null);
  if (!manifest || manifest.target !== 'yujint-classroom-core') {
    throw new Error('ChatGPT 코어 패치의 target은 yujint-classroom-core 이어야 합니다.');
  }
  const allowedExact = new Set(['server.js','package.json','package-lock.json','railway.json']);
  const files = {};
  let total = 0;
  for (const item of normalized) {
    const rel = item.name.replace(/^\/+/, '');
    if (rel === 'yujint.chatgpt.patch.json') continue;
    if (!rel || rel.includes('../') || rel.startsWith('.') || rel.split('/').includes('.git') || rel.split('/').includes('node_modules')) {
      throw new Error(`허용되지 않은 코어 패치 경로: ${rel}`);
    }
    const low = rel.toLowerCase();
    if (low.includes('.env') || low.includes('secret') || low.includes('credential') || low.includes('token')) {
      throw new Error(`비밀정보로 보이는 파일은 코어 패치에 포함할 수 없습니다: ${rel}`);
    }
    const allowed = allowedExact.has(rel) || rel.startsWith('public/') || rel.startsWith('lib/');
    if (!allowed) throw new Error(`코어 패치에서 허용되지 않은 경로입니다: ${rel}`);
    total += item.data.length;
    if (total > 30 * 1024 * 1024) throw new Error('코어 패치 전체 크기는 30MB를 넘을 수 없습니다.');
    files[rel] = Buffer.from(item.data);
  }
  if (!Object.keys(files).length) throw new Error('코어 패치에 실제 변경 파일이 없습니다.');
  return {
    manifest,
    files,
    label: text(manifest.label || manifest.name || 'ChatGPT 코어 패치', 120),
    version: text(manifest.version || '', 40),
    note: text(manifest.note || '', 300)
  };
}

async function commitChatgptCoreFiles(files, message) {
  if (!githubConfigured()) throw new Error('GitHub 연결이 필요합니다.');
  const head = await getGithubHead();
  const treeEntries = [];
  const changedPaths = [];
  for (const [rel, buffer] of Object.entries(files)) {
    const repoPath = `classroom-hub/${rel}`.replace(/\/+/g, '/');
    const blob = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/blobs`, {
      content: b64(buffer),
      encoding: 'base64'
    });
    treeEntries.push({ path: repoPath, mode: '100644', type: 'blob', sha: blob.sha });
    changedPaths.push(repoPath);
  }
  const newTree = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/trees`, {
    base_tree: head.treeSha,
    tree: treeEntries
  });
  const commit = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [head.sha]
  });
  await gh('PATCH', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/refs/heads/${encodeURIComponent(GITHUB_BRANCH)}`, {
    sha: commit.sha,
    force: false
  });
  return { commitSha: commit.sha, backupSha: head.sha, files: changedPaths };
}

async function restoreChatgptCoreFiles(sourceSha, repoPaths, message) {
  if (!githubConfigured()) throw new Error('GitHub 연결이 필요합니다.');
  const head = await getGithubHead();
  const sourceCommit = await gh('GET', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/commits/${encodeURIComponent(sourceSha)}`);
  const sourceTree = await getTree(sourceCommit.tree.sha);
  const currentTree = await getTree(head.treeSha);
  const sm = new Map((sourceTree.tree || []).filter(x => x.type === 'blob').map(x => [x.path, x]));
  const cm = new Map((currentTree.tree || []).filter(x => x.type === 'blob').map(x => [x.path, x]));
  let different = false;
  const treeEntries = [];
  for (const p of repoPaths) {
    const src = sm.get(p);
    const cur = cm.get(p);
    const srcSha = src?.sha || null, curSha = cur?.sha || null;
    if (srcSha !== curSha) different = true;
    treeEntries.push({ path: p, mode: src?.mode || cur?.mode || '100644', type: 'blob', sha: srcSha });
  }
  if (!different) throw new Error('선택한 복구 원본과 현재 코어 파일이 같습니다.');
  const newTree = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/trees`, {
    base_tree: head.treeSha,
    tree: treeEntries
  });
  const commit = await gh('POST', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [head.sha]
  });
  await gh('PATCH', `/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/refs/heads/${encodeURIComponent(GITHUB_BRANCH)}`, {
    sha: commit.sha,
    force: false
  });
  return { commitSha: commit.sha, backupSha: head.sha, files: repoPaths };
}

async function deployHubAfterChatgptPatch(commitSha) {
  if (!RAILWAY_HUB_SERVICE_ID || !railwayConfigured()) return { deploymentId: '', warning: 'Railway 허브 서비스 자동배포 설정이 없어 GitHub 자동배포를 기다립니다.' };
  try {
    return await railwayDeployExisting(RAILWAY_HUB_SERVICE_ID, commitSha);
  } catch (e) {
    return { deploymentId: '', warning: e.message };
  }
}

async function applySafeActivityPatch(req) {
  if (!githubConfigured()) throw new Error('안전 패치는 GitHub 연결이 필요합니다.');
  const s = await getState();
  const info = inspectPatchPackage(req.file);
  const matched = detectPatchTarget(info, s.activities, text(req.body.target_id, 100));
  const i = s.activities.findIndex(a => a.id === matched.activity.id);
  if (i < 0) throw new Error('대상 프로그램을 현재 목록에서 찾지 못했습니다.');
  const existing = s.activities[i];
  if (existing.deploy_type === 'external') throw new Error('외부 링크는 파일 패치를 지원하지 않습니다.');
  if (info.detected_mode && info.detected_mode !== existing.deploy_type) {
    throw new Error(`패치 파일 형식(${info.detected_mode})과 대상 프로그램 형식(${existing.deploy_type})이 다릅니다.`);
  }

  const before = await getGithubHead();
  const fields = { ...existing, slug: existing.slug, deploy_type: existing.deploy_type };
  const result = await deployUpload({ existing, fields, file: req.file });
  const v = patchVersionInfo(info, existing);
  const updatedManageUrl = existing.deploy_type === 'server' && existing.railway_domain
    ? `https://${existing.railway_domain}${result.appManifest?.manage_path || '/?teacher=1'}`
    : existing.manage_url;

  const nextA = normalizeActivity({
    ...existing,
    version: v.version,
    version_label: v.version_label,
    manage_url: updatedManageUrl,
    railway_volume_id: result.railway?.volumeInfo?.volumeId || existing.railway_volume_id || '',
    last_commit_sha: result.commitSha,
    last_deployment_id: result.railway?.deploymentId || existing.last_deployment_id,
    deploy_status: result.railway?.warning ? 'warning' : (result.railway?.deploymentId ? 'deploying' : 'ready')
  }, existing);
  nextA.version = v.version;
  nextA.version_label = v.version_label;

  const h = historyItem(nextA, 'safe-patch', result.commitSha,
    `안전 패치 · 자동 연결: ${matched.reason}${result.railway?.warning ? ' · ' + result.railway.warning : ''}`);
  h.id = crypto.randomUUID();
  h.restore_commit_sha = before.sha;
  h.applied_commit_sha = result.commitSha;
  h.safe_restore = true;

  nextA.histories = [...(existing.histories || []), h].slice(-20);
  s.activities[i] = nextA;
  await saveState(s);
  try {
    const registrySha = await syncRegistryToGithub(s, `유진T 클래스룸: 안전 패치 ${nextA.name} ${nextA.version_label}`);
    if (registrySha) nextA.last_commit_sha = registrySha;
  } catch (e) {
    nextA.deploy_status = 'warning';
    result.registryWarning = e.message;
  }
  await saveState(s);
  return {
    type: 'activity',
    activity: nextA,
    matched: { id: nextA.id, name: nextA.name, version_label: nextA.version_label, reason: matched.reason },
    backup_sha: before.sha,
    result
  };
}

async function safeRollbackActivity(activityId, historyId) {
  if (!githubConfigured()) throw new Error('GitHub 연결이 필요합니다.');
  const s = await getState();
  const i = s.activities.findIndex(a => a.id === activityId);
  if (i < 0) throw new Error('프로그램을 찾지 못했습니다.');
  const a = s.activities[i];
  const h = (a.histories || []).find(x => x.id === historyId);
  if (!h?.restore_commit_sha) throw new Error('이 기록에는 안전 복구 원본이 없습니다.');

  const rollbackHead = await getGithubHead();
  const currentFiles = await filesFromGithubPrefix(rollbackHead.sha, a.repo_path);
  const oldFiles = await filesFromGithubPrefix(h.restore_commit_sha, a.repo_path);
  if (safePatchSameFileMap(currentFiles, oldFiles)) throw new Error('복구 원본과 현재 프로그램 파일이 같습니다.');

  const newSha = await commitFiles({
    files: oldFiles,
    replacePrefix: a.repo_path,
    message: `유진T 클래스룸: ${a.name} 안전 복구`
  });

  if (a.deploy_type === 'static') {
    const local = {};
    const prefix = a.repo_path.replace(/^\/+|\/+$/g, '') + '/';
    for (const [p,b] of Object.entries(oldFiles)) local[p.slice(prefix.length)] = b;
    await writeLocalStatic(a.slug, local);
  }

  let deploymentId = '', deployWarning = '';
  try {
    if (a.deploy_type === 'server' && a.railway_service_id) {
      deploymentId = (await railwayDeployExisting(a.railway_service_id, newSha)).deploymentId || '';
    } else if (a.deploy_type === 'static' && RAILWAY_HUB_SERVICE_ID) {
      deploymentId = (await railwayDeployExisting(RAILWAY_HUB_SERVICE_ID, newSha)).deploymentId || '';
    }
  } catch (e) {
    deployWarning = e.message;
  }

  const nextA = normalizeActivity({
    ...a,
    version: Number(a.version || 1) + 1,
    version_label: `v${Number(a.version || 1) + 1}`,
    last_commit_sha: newSha,
    last_deployment_id: deploymentId || a.last_deployment_id,
    deploy_status: deployWarning ? 'warning' : (deploymentId ? 'deploying' : 'ready')
  }, a);
  nextA.version = Number(a.version || 1) + 1;
  nextA.version_label = `v${nextA.version}`;

  const rh = historyItem(nextA, 'safe-rollback', newSha, `안전 복구 원본 ${h.restore_commit_sha.slice(0,7)}${deployWarning ? ' · ' + deployWarning : ''}`);
  rh.id = crypto.randomUUID();
  rh.restore_commit_sha = rollbackHead.sha;
  rh.applied_commit_sha = newSha;
  rh.safe_restore = true;
  nextA.histories = [...(a.histories || []), rh].slice(-20);

  s.activities[i] = nextA;
  await saveState(s);
  try {
    const registrySha = await syncRegistryToGithub(s, `유진T 클래스룸: 안전 복구 정보 ${nextA.name}`);
    if (registrySha) nextA.last_commit_sha = registrySha;
  } catch (e) {
    nextA.deploy_status = 'warning';
  }
  await saveState(s);
  return { activity: nextA, commit_sha: newSha, backup_sha: rollbackHead.sha, deployment_id: deploymentId, warning: deployWarning };
}

function chatgptPatchPageHtml() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>유진T 클래스룸 · ChatGPT 패치함</title>
<style>
body{margin:0;background:#f4f6fa;color:#1f2937;font-family:Pretendard,"Noto Sans KR",system-ui,sans-serif}
.wrap{max-width:1000px;margin:auto;padding:18px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
h1{margin:0;font-size:24px}.muted{color:#64748b;font-size:13px}.card{background:#fff;border:1px solid #dbe2ee;border-radius:18px;padding:18px;margin:12px 0;box-shadow:0 8px 24px rgba(15,23,42,.06)}
.notice{padding:12px 14px;border-radius:12px;background:#eef6ff;border:1px solid #bfdbfe;line-height:1.6}.safe{background:#ecfdf3;border-color:#bbf7d0}
.drop{padding:22px;border:2px dashed #b8c4d5;border-radius:14px;text-align:center;background:#f8fafc}.drop input{margin-top:12px;max-width:100%}
select,button,a.btn{font:inherit}.row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-top:12px}
select{width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff}.btn,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;padding:10px 14px;background:#17365f;color:#fff;font-weight:800;text-decoration:none;cursor:pointer}
.btn.secondary,button.secondary{background:#e9eef5;color:#24364f}.btn.danger,button.danger{background:#fee2e2;color:#991b1b}
button:disabled{opacity:.55;cursor:wait}.result{display:none;margin-top:12px;padding:12px;border-radius:12px;background:#f8fafc;border:1px solid #dbe2ee;white-space:pre-wrap}
.hist{display:flex;flex-direction:column;gap:9px}.item{border:1px solid #e2e8f0;border-radius:12px;padding:12px;display:flex;justify-content:space-between;gap:12px;align-items:center}
.item b{display:block}.item p{margin:4px 0 0;color:#64748b;font-size:12px}.actions{display:flex;gap:7px;flex-wrap:wrap}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.tabs button{background:#eef2f7;color:#334155}.tabs button.active{background:#17365f;color:#fff}
@media(max-width:700px){.row{grid-template-columns:1fr}.item{align-items:flex-start;flex-direction:column}.top{align-items:flex-start;flex-direction:column}}
</style></head><body><div class="wrap">
<div class="top"><div><h1>🤖 ChatGPT 패치함</h1><div class="muted">패치 적용 전 원본을 자동 저장하고, 실제 GitHub 파일과 Railway 배포까지 안전하게 관리합니다.</div></div><a class="btn secondary" href="/teacher">← 교사 화면</a></div>

<div class="notice safe"><b>앞으로는 콘솔이나 BAT 파일이 필요 없습니다.</b><br>
ChatGPT가 만들어 준 ZIP/HTML 파일을 아래에 넣고 한 번만 누르세요. 일반 프로그램 패치와 유진T 클래스룸 자체 코어 패치를 자동으로 구분합니다.</div>

<div class="card"><h2>패치 적용</h2>
<div class="drop"><b>ChatGPT가 만들어 준 패치 ZIP 또는 HTML</b><br><span class="muted">코어 패치는 yujint.chatgpt.patch.json을 포함한 ZIP으로 자동 인식됩니다.</span><br>
<input type="file" id="file" accept=".zip,.html,.htm"></div>
<div class="row"><div><div class="muted" style="margin-bottom:5px">일반 프로그램 자동 판단이 애매할 때만 직접 선택</div><select id="target"><option value="">자동으로 판단</option></select></div>
<button id="apply">안전 백업 후 패치 적용</button></div>
<div class="result" id="result"></div></div>

<div class="card" id="history"><h2>안전 복구 기록</h2>
<div class="tabs"><button id="tabApps" class="active">프로그램</button><button id="tabCore">클래스룸 코어</button></div>
<div id="appChooser"><select id="histTarget"></select></div>
<div class="hist" id="hist" style="margin-top:10px"></div></div>
</div>
<script>
const $=s=>document.querySelector(s);let acts=[],historyData=null,mode='apps';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function api(u,o={}){const r=await fetch(u,o);const j=await r.json().catch(()=>({}));if(r.status===401){location.href='/';throw Error('로그인이 필요합니다.')}if(!r.ok)throw Error(j.error||'요청 실패');return j}
async function load(){
 const a=await api('/api/admin/activities');acts=a.activities||[];
 $('#target').innerHTML='<option value="">자동으로 판단</option>'+acts.filter(x=>x.deploy_type!=='external').map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(x.version_label||('v'+x.version))+'</option>').join('');
 $('#histTarget').innerHTML=acts.filter(x=>x.deploy_type!=='external').map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
 historyData=await api('/api/admin/chatgpt/history');renderHistory();
}
function when(x){try{return new Date(x).toLocaleString('ko-KR')}catch{return x||''}}
function renderHistory(){
 const box=$('#hist');$('#appChooser').style.display=mode==='apps'?'block':'none';
 if(mode==='core'){
  const h=[...(historyData?.core_histories||[])].reverse();
  box.innerHTML=h.length?h.map(x=>'<div class="item"><div><b>'+esc(x.label||x.action||'코어 작업')+'</b><p>'+esc(when(x.at))+' · 적용 '+esc((x.commit_sha||'').slice(0,10))+' · 원본 '+esc((x.backup_sha||'').slice(0,10))+'</p></div><div class="actions">'+(x.backup_sha?'<button class="danger" onclick="coreRollback(\\''+esc(x.id)+'\\')">이 작업 직전으로 복구</button>':'')+'</div></div>').join(''):'<div class="muted">아직 코어 안전 기록이 없습니다.</div>';
  return;
 }
 const id=$('#histTarget').value||acts.find(x=>x.deploy_type!=='external')?.id;
 const a=historyData?.activities?.find(x=>x.id===id);
 const h=[...(a?.histories||[])].filter(x=>x.restore_commit_sha).reverse();
 box.innerHTML=h.length?h.map(x=>'<div class="item"><div><b>'+esc(a.name)+' · '+esc(x.action)+'</b><p>'+esc(when(x.at))+' · 적용 '+esc((x.applied_commit_sha||x.commit_sha||'').slice(0,10))+' · 직전 원본 '+esc((x.restore_commit_sha||'').slice(0,10))+'</p></div><div class="actions"><button class="danger" onclick="appRollback(\\''+esc(a.id)+'\\',\\''+esc(x.id)+'\\')">패치 직전으로 복구</button></div></div>').join(''):'<div class="muted">이 프로그램에는 아직 새 안전 패치 기록이 없습니다. 다음 패치부터 자동 저장됩니다.</div>';
}
$('#histTarget').onchange=renderHistory;
$('#tabApps').onclick=()=>{mode='apps';$('#tabApps').classList.add('active');$('#tabCore').classList.remove('active');renderHistory()};
$('#tabCore').onclick=()=>{mode='core';$('#tabCore').classList.add('active');$('#tabApps').classList.remove('active');renderHistory()};
$('#apply').onclick=async()=>{
 const f=$('#file').files?.[0];if(!f)return alert('패치 파일을 선택하세요.');
 const fd=new FormData();fd.append('package',f);if($('#target').value)fd.append('target_id',$('#target').value);
 const b=$('#apply'),r=$('#result');b.disabled=true;r.style.display='block';r.textContent='원본 백업 → 패치 적용 → GitHub 커밋 → Railway 재배포를 진행하고 있습니다...';
 try{
  const j=await api('/api/admin/chatgpt/patch',{method:'POST',body:fd});
  r.textContent=(j.type==='core'?'클래스룸 코어 패치 완료':'프로그램 안전 패치 완료')+'\\n원본 백업: '+(j.backup_sha||'-')+'\\n새 커밋: '+(j.commit_sha||j.result?.commitSha||'-')+'\\n'+(j.warning||'');
  $('#file').value='';await load();
 }catch(e){r.textContent='적용하지 않았습니다.\\n'+e.message}
 finally{b.disabled=false}
};
window.appRollback=async(id,hid)=>{
 if(!confirm('이 패치가 적용되기 직전의 실제 파일로 복구할까요?\\n학생 링크는 그대로 유지됩니다.'))return;
 try{await api('/api/admin/chatgpt/app-rollback/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({history_id:hid})});alert('안전 복구와 재배포를 요청했습니다.');await load()}catch(e){alert(e.message)}
};
window.coreRollback=async(hid)=>{
 if(!confirm('이 코어 작업 직전 상태로 실제 파일을 복구할까요?'))return;
 try{await api('/api/admin/chatgpt/core-rollback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({history_id:hid})});alert('코어 안전 복구와 재배포를 요청했습니다.');await load()}catch(e){alert(e.message)}
};
load().catch(e=>$('#result').textContent=e.message);
</script></body></html>`;
}

app.get('/teacher/chatgpt-patch', (req, res) => {
  if (!isTeacher(req)) return res.redirect('/');
  res.setHeader('Cache-Control', 'no-store');
  res.send(chatgptPatchPageHtml());
});

app.get('/api/admin/chatgpt/history', needTeacher, async (req, res, next) => {
  try {
    const s = await getState();
    res.json({
      core_histories: Array.isArray(s.core_histories) ? s.core_histories.slice(-20) : [],
      activities: (s.activities || []).map(a => ({
        id: a.id, name: a.name, version: a.version, version_label: a.version_label,
        histories: (a.histories || []).filter(h => h.restore_commit_sha).slice(-20)
      }))
    });
  } catch (e) { next(e); }
});

app.post('/api/admin/chatgpt/patch', needTeacher, upload.single('package'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '패치 ZIP 또는 HTML을 선택하세요.' });
    const core = inspectChatgptCorePackage(req.file);
    if (!core) {
      const out = await applySafeActivityPatch(req);
      return res.json({ ok: true, ...out, commit_sha: out.result?.commitSha || '' });
    }

    const commit = await commitChatgptCoreFiles(core.files, `유진T 클래스룸: ChatGPT 코어 패치 ${core.label}${core.version ? ' ' + core.version : ''}`);
    const deploy = await deployHubAfterChatgptPatch(commit.commitSha);
    const s = await getState();
    const h = {
      id: crypto.randomUUID(),
      action: 'core-patch',
      label: core.label,
      version: core.version,
      note: core.note,
      commit_sha: commit.commitSha,
      backup_sha: commit.backupSha,
      files: commit.files,
      deployment_id: deploy.deploymentId || '',
      at: iso()
    };
    s.core_histories = [...(Array.isArray(s.core_histories) ? s.core_histories : []), h].slice(-20);
    await saveState(s);
    res.json({
      ok: true,
      type: 'core',
      label: core.label,
      version: core.version,
      backup_sha: commit.backupSha,
      commit_sha: commit.commitSha,
      deployment_id: deploy.deploymentId || '',
      warning: deploy.warning || ''
    });
  } catch (e) { next(e); }
});

app.post('/api/admin/chatgpt/app-rollback/:id', needTeacher, async (req, res, next) => {
  try {
    const historyId = text(req.body.history_id, 100);
    if (!historyId) return res.status(400).json({ error: '복구 기록 ID가 필요합니다.' });
    const out = await safeRollbackActivity(req.params.id, historyId);
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

app.post('/api/admin/chatgpt/core-rollback', needTeacher, async (req, res, next) => {
  try {
    const historyId = text(req.body.history_id, 100);
    if (!historyId) return res.status(400).json({ error: '복구 기록 ID가 필요합니다.' });
    const s = await getState();
    const histories = Array.isArray(s.core_histories) ? s.core_histories : [];
    const h = histories.find(x => x.id === historyId);
    if (!h?.backup_sha || !Array.isArray(h.files) || !h.files.length) {
      return res.status(400).json({ error: '이 기록에는 복구 가능한 코어 원본이 없습니다.' });
    }
    const restored = await restoreChatgptCoreFiles(h.backup_sha, h.files, `유진T 클래스룸: 코어 안전 복구 (${h.label || h.action || '이전 상태'})`);
    const deploy = await deployHubAfterChatgptPatch(restored.commitSha);
    const rh = {
      id: crypto.randomUUID(),
      action: 'core-rollback',
      label: `복구: ${h.label || h.action || '이전 상태'}`,
      version: '',
      note: `복구 원본 ${h.backup_sha.slice(0,7)}`,
      commit_sha: restored.commitSha,
      backup_sha: restored.backupSha,
      files: restored.files,
      deployment_id: deploy.deploymentId || '',
      at: iso()
    };
    s.core_histories = [...histories, rh].slice(-20);
    await saveState(s);
    res.json({
      ok: true,
      type: 'core-rollback',
      backup_sha: restored.backupSha,
      commit_sha: restored.commitSha,
      deployment_id: deploy.deploymentId || '',
      warning: deploy.warning || ''
    });
  } catch (e) { next(e); }
});
// === /CHATGPT_PATCH_RECEIVER_V1 ===============================================


app.use((err, req, res, next) => {
  console.error('[v3]', err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '파일은 최대 30MB까지 업로드할 수 있습니다.' : err.message });
  res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
});

initStore().then(() => app.listen(PORT, '0.0.0.0', () => console.log(`유진T 클래스룸 v3 : http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
