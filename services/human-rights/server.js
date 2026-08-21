'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const SEED_DIR = path.join(ROOT, 'seed');
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(ROOT, 'data'));
const STUDENTS_DIR = path.join(DATA_DIR, 'students');
const PROGRESS_DIR = path.join(DATA_DIR, 'progress');
const GRADES_DIR = path.join(DATA_DIR, 'grades');
const PRESENCE_DIR = path.join(DATA_DIR, 'presence');
const TIME_DIR = path.join(DATA_DIR, 'time');
const CONTROL_FILE = path.join(DATA_DIR, 'control.json');
const ROSTER_FILE = path.join(DATA_DIR, 'roster.json');
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai_config.json');
const MONITOR_TOKEN_FILE = path.join(DATA_DIR, 'monitor_token.txt');
const RESET_EPOCH_FILE = path.join(DATA_DIR, 'reset_epoch.txt');
const DEFAULT_ROSTER_FILE = path.join(SEED_DIR, 'default_roster.json');

for (const d of [DATA_DIR, STUDENTS_DIR, PROGRESS_DIR, GRADES_DIR, PRESENCE_DIR, TIME_DIR]) fs.mkdirSync(d, { recursive: true });

const PORT = Number(process.env.PORT || 3000);
const TEACHER_PIN = String(process.env.TEACHER_PIN || '1234');
let openAIKey = String(process.env.OPENAI_API_KEY || '').trim();
let openAIModel = String(process.env.OPENAI_GRADING_MODEL || 'gpt-5.6-luna').trim();

const InitialCosts = { central: 24, welfare: 18, hospital: 39, market: 20, park: 18, school: 8 };
const FinalCosts = { central: 30, welfare: 11, hospital: 39, market: 20, park: 18, school: 8 };
const ScoreMap = {
  rights: { A: 25, B: 21, C: 16, D: 10 },
  evidence: { A: 25, B: 21, C: 16, D: 10 },
  logic: { A: 20, B: 17, C: 13, D: 8 },
  limitations: { A: 15, B: 12, C: 9, D: 5 },
  revision: { A: 15, B: 12, C: 9, D: 5 },
};

function nowIso() { return new Date().toISOString(); }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
function safeStudentId(id) {
  const x = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(x)) throw new Error('학번 형식이 올바르지 않습니다.');
  return x;
}
function studentFile(id) { return path.join(STUDENTS_DIR, safeStudentId(id) + '.json'); }
function progressFile(id) { return path.join(PROGRESS_DIR, safeStudentId(id) + '.json'); }
function gradeFile(id) { return path.join(GRADES_DIR, safeStudentId(id) + '.json'); }
function presenceFile(id) { return path.join(PRESENCE_DIR, safeStudentId(id) + '.json'); }
function timeFile(id) { return path.join(TIME_DIR, safeStudentId(id) + '.json'); }

function resetGradesOnRevision(sid) {
  const f = gradeFile(sid); const g = readJson(f); if (!g) return;
  Object.assign(g, { ai_grade: null, ai_updated_at: null, teacher_grade: null, teacher_comment: '', teacher_updated_at: null, invalidated_at: nowIso() });
  writeJson(f, g);
}

function getControl() {
  let c = readJson(CONTROL_FILE);
  if (!c || !Object.prototype.hasOwnProperty.call(c, 'period_type')) {
    c = { is_open: 0, class_no: 0, period_type: '', session_id: '', opened_at: null, timer_running: false, remaining_seconds: 0, closes_at: null };
    writeJson(CONTROL_FILE, c);
  }
  return c;
}

function getStudentClassNo(sid) {
  if (sid === '000000') return 0;
  const m = String(sid).match(/^1(0[1-7])[0-9]{2}$/);
  if (m) return Number(m[1]);
  if (String(sid).startsWith('SIM')) {
    const st = readJson(studentFile(sid));
    const cn = Number(st?.class_no || 1); return cn >= 1 && cn <= 7 ? cn : 1;
  }
  return 0;
}

function getTimeRecord(sid, createIfMissing = true) {
  const f = timeFile(sid); let t = readJson(f);
  const defaults = {
    student_id: sid, period1_used: 0, period2_used: 0, period1_attended: false, period2_attended: false,
    period1_segment_id: '', period2_segment_id: '', period1_active_seconds: 0, period2_active_seconds: 0,
    period1_last_heartbeat: null, period2_last_heartbeat: null, period1_confirmed: false, period2_confirmed: false,
    makeup_used: 0, makeup_segment_id: '', makeup_active_seconds: 0, makeup_last_heartbeat: null, makeup_confirmed: false,
    extra_used: 0, penalty_exempt: false,
  };
  if (!t) { t = { ...defaults }; if (createIfMissing) writeJson(f, t); }
  else { for (const [k, v] of Object.entries(defaults)) if (!(k in t)) t[k] = v; }
  return t;
}
function getResetEpoch() {
  try { return Math.max(0, Number(fs.readFileSync(RESET_EPOCH_FILE, 'utf8').trim()) || 0); } catch { return 0; }
}
function bumpResetEpoch() { const v = Date.now(); fs.writeFileSync(RESET_EPOCH_FILE, String(v)); return v; }
function clearDirectoryJson(dir) { for (const f of listJson(dir)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} } }
function clearAllActivityData() {
  for (const dir of [STUDENTS_DIR, PROGRESS_DIR, GRADES_DIR, PRESENCE_DIR, TIME_DIR]) clearDirectoryJson(dir);
  writeJson(CONTROL_FILE,{is_open:0,class_no:0,period_type:'',session_id:'',opened_at:null,timer_running:false,remaining_seconds:0,closes_at:nowIso()});
  return bumpResetEpoch();
}
function saveTimeRecord(sid, t) { writeJson(timeFile(sid), t); }
function resetTestStudentData() {
  const sid = '000000';
  for (const f of [progressFile(sid), gradeFile(sid), presenceFile(sid), timeFile(sid), studentFile(sid)]) { try { fs.unlinkSync(f); } catch {} }
}
function regularUsed(t) { return Math.min(5400, Math.max(0, Number(t.period1_used || 0) + Number(t.period2_used || 0) + Number(t.makeup_used || 0))); }
function liveHeartbeatDelta(last) {
  if (!last) return 0;
  const d = Math.floor((Date.now() - new Date(last).getTime()) / 1000);
  return Math.min(15, Math.max(0, Number.isFinite(d) ? d : 0));
}
function studentTimeIsLive(sid) {
  const p = readJson(presenceFile(sid));
  if (!p || !p.active || p.submitted || !p.last_seen) return false;
  return Date.now() - new Date(p.last_seen).getTime() <= 20000;
}
function getTimePenalty(extraSeconds) {
  const x = Number(extraSeconds || 0); if (x <= 0) return 0; if (x <= 600) return 2; if (x <= 1200) return 4; return 6;
}

function studentSessionView(sid, createTimeIfMissing = true) {
  const c = getControl(), t = getTimeRecord(sid, createTimeIfMissing), classNo = getStudentClassNo(sid), timeIsLive = studentTimeIsLive(sid);
  const baseRegular = regularUsed(t); let pendingRegular = 0, pendingExtra = 0, segmentRemaining = 0, canAccess = false;
  let msg = '현재 이 학생의 반 활동이 열려 있지 않습니다.';
  if (Number(c.is_open) === 1 && (sid === '000000' || Number(c.class_no) === 0 || classNo === Number(c.class_no))) {
    canAccess = true; msg = '';
    if (String(c.period_type) === '1') {
      const allow = Math.min(Math.max(0, 2700 - Number(t.period1_used)), Math.max(0, 5400 - baseRegular));
      if (String(t.period1_segment_id) === String(c.session_id)) {
        const live = timeIsLive ? liveHeartbeatDelta(t.period1_last_heartbeat) : 0;
        pendingRegular = Math.min(Number(t.period1_active_seconds) + live, allow); segmentRemaining = Math.max(0, allow - pendingRegular);
      } else segmentRemaining = allow;
      if (allow <= 0) { canAccess = false; msg = '1차시 활동시간을 이미 모두 사용했습니다.'; }
    } else if (String(c.period_type) === '2') {
      const allow = Math.min(Math.max(0, 2700 - Number(t.period2_used)), Math.max(0, 5400 - baseRegular));
      if (String(t.period2_segment_id) === String(c.session_id)) {
        const live = timeIsLive ? liveHeartbeatDelta(t.period2_last_heartbeat) : 0;
        pendingRegular = Math.min(Number(t.period2_active_seconds) + live, allow); segmentRemaining = Math.max(0, allow - pendingRegular);
      } else segmentRemaining = allow;
      if (allow <= 0) { canAccess = false; msg = '2차시 활동시간을 이미 모두 사용했습니다.'; }
    } else if (String(c.period_type) === 'makeup') {
      let active = 0;
      if (String(t.makeup_segment_id) === String(c.session_id)) active = Math.max(0, Number(t.makeup_active_seconds) + (timeIsLive ? liveHeartbeatDelta(t.makeup_last_heartbeat) : 0));
      const regularRemain = Math.max(0, 5400 - baseRegular);
      pendingRegular = Math.min(active, regularRemain); pendingExtra = Math.max(0, active - pendingRegular); segmentRemaining = Math.max(0, regularRemain - pendingRegular);
    }
  }
  const remaining = Math.max(0, 5400 - baseRegular - pendingRegular);
  const extra = Math.max(0, Number(t.extra_used || 0) + pendingExtra);
  const rawPenalty = getTimePenalty(extra), effectivePenalty = t.penalty_exempt ? 0 : rawPenalty;
  const p1Started = String(c.period_type) === '1' && String(t.period1_segment_id) === String(c.session_id);
  const p2Started = String(c.period_type) === '2' && String(t.period2_segment_id) === String(c.session_id);
  const p1Live = p1Started && !!t.period1_confirmed, p2Live = p2Started && !!t.period2_confirmed;
  return {
    is_open: canAccess ? 1 : 0, server_is_open: Number(c.is_open), class_no: Number(c.class_no), period_type: String(c.period_type), session_id: String(c.session_id), timer_running: canAccess,
    remaining_seconds: remaining, segment_remaining_seconds: segmentRemaining, regular_used_seconds: Math.max(0, 5400 - remaining), extra_seconds: extra,
    total_used_seconds: Math.max(0, 5400 - remaining) + extra, time_penalty: effectivePenalty, time_penalty_raw: rawPenalty, penalty_exempt: !!t.penalty_exempt,
    period1_used: Number(t.period1_used), period2_used: Number(t.period2_used), period1_attended: !!t.period1_attended || p1Live, period2_attended: !!t.period2_attended || p2Live,
    period1_in_progress: p1Started && !(!!t.period1_attended || p1Live), period2_in_progress: p2Started && !(!!t.period2_attended || p2Live), message: msg,
  };
}

function ensureTimeSegment(sid, meaningful, heartbeatActive) {
  const c = getControl(); if (Number(c.is_open) !== 1) return;
  const classNo = getStudentClassNo(sid); if (sid !== '000000' && Number(c.class_no) !== 0 && classNo !== Number(c.class_no)) return;
  const t = getTimeRecord(sid), now = nowIso();
  const update = (prefix) => {
    const seg = prefix + '_segment_id', act = prefix + '_active_seconds', hb = prefix + '_last_heartbeat', conf = prefix + '_confirmed';
    if (String(t[seg]) !== String(c.session_id)) { t[seg] = String(c.session_id); t[act] = 0; t[hb] = now; t[conf] = false; }
    if (heartbeatActive && t[hb]) t[act] = Number(t[act] || 0) + liveHeartbeatDelta(t[hb]);
    t[hb] = now; if (meaningful || Number(t[act]) >= 180) t[conf] = true;
  };
  if (String(c.period_type) === '1') update('period1');
  else if (String(c.period_type) === '2') update('period2');
  else if (String(c.period_type) === 'makeup') update('makeup');
  saveTimeRecord(sid, t);
}

function listJson(dir) { try { return fs.readdirSync(dir).filter(x => x.endsWith('.json')); } catch { return []; } }
function finalizeCurrentSession() {
  const c = getControl(); if (Number(c.is_open) !== 1) return;
  for (const name of listJson(TIME_DIR)) {
    const t = readJson(path.join(TIME_DIR, name)); if (!t) continue; const sid = String(t.student_id || name.replace(/\.json$/, ''));
    if (sid !== '000000' && Number(c.class_no) !== 0 && getStudentClassNo(sid) !== Number(c.class_no)) continue;
    if (String(c.period_type) === '1' && String(t.period1_segment_id) === String(c.session_id)) {
      if (t.period1_confirmed) { const add = Math.min(Math.max(0, Number(t.period1_active_seconds)), Math.max(0, 2700 - Number(t.period1_used)), Math.max(0, 5400 - regularUsed(t))); t.period1_used = Number(t.period1_used) + add; if (add > 0) t.period1_attended = true; }
      Object.assign(t, { period1_segment_id: '', period1_active_seconds: 0, period1_confirmed: false, period1_last_heartbeat: null });
    } else if (String(c.period_type) === '2' && String(t.period2_segment_id) === String(c.session_id)) {
      if (t.period2_confirmed) { const add = Math.min(Math.max(0, Number(t.period2_active_seconds)), Math.max(0, 2700 - Number(t.period2_used)), Math.max(0, 5400 - regularUsed(t))); t.period2_used = Number(t.period2_used) + add; if (add > 0) t.period2_attended = true; }
      Object.assign(t, { period2_segment_id: '', period2_active_seconds: 0, period2_confirmed: false, period2_last_heartbeat: null });
    } else if (String(c.period_type) === 'makeup' && String(t.makeup_segment_id) === String(c.session_id)) {
      if (t.makeup_confirmed) { const active = Math.max(0, Number(t.makeup_active_seconds)); const regularRemain = Math.max(0, 5400 - regularUsed(t)); const addRegular = Math.min(active, regularRemain), addExtra = Math.max(0, active - addRegular); t.makeup_used = Number(t.makeup_used) + addRegular; t.extra_used = Number(t.extra_used) + addExtra; }
      Object.assign(t, { makeup_segment_id: '', makeup_active_seconds: 0, makeup_confirmed: false, makeup_last_heartbeat: null });
    }
    saveTimeRecord(sid, t);
  }
}

function resetStudentPeriod(sid, period) { const t = getTimeRecord(sid); if (period === '1') { t.period1_used = 0; t.period1_attended = false; } else if (period === '2') { t.period2_used = 0; t.period2_attended = false; } saveTimeRecord(sid, t); return studentSessionView(sid); }
function setTimePenaltyExempt(sid, exempt) { const t = getTimeRecord(sid); t.penalty_exempt = !!exempt; saveTimeRecord(sid, t); return studentSessionView(sid); }

function getRoster() {
  let r = readJson(ROSTER_FILE);
  if (!r) { const seed = readJson(DEFAULT_ROSTER_FILE); r = seed?.rows?.length ? { enabled: true, rows: seed.rows } : { enabled: false, rows: [] }; writeJson(ROSTER_FILE, r); }
  if (!Array.isArray(r.rows)) r.rows = [];
  return r;
}
function getAllStudentRefs() {
  const out = [], seen = new Set();
  for (const x of getRoster().rows) { const sid = String(x.student_id || '').trim(), name = String(x.name || '').trim(); if (sid && name && !seen.has(sid)) { out.push({ student_id: sid, name }); seen.add(sid); } }
  for (const f of listJson(STUDENTS_DIR)) { const st = readJson(path.join(STUDENTS_DIR, f)); const sid = String(st?.student_id || ''); if (sid && !seen.has(sid)) { out.push({ student_id: sid, name: String(st.name || '') }); seen.add(sid); } }
  return out;
}
function validateStudentIdentity(sid, name) {
  if (sid === '000000') return { ok: true, name: '교사용테스트', test: true };
  if (!String(name || '').trim()) return { ok: false, error: '학번과 이름을 입력해 주세요.' };
  const r = getRoster(); if (r.enabled) { const m = r.rows.find(x => String(x.student_id) === sid); if (!m || String(m.name).trim() !== String(name).trim()) return { ok: false, error: '명단에 없는 학번이거나 이름이 일치하지 않습니다. 학번과 이름을 다시 확인해 주세요.' }; }
  return { ok: true, name: String(name).trim(), test: false };
}
function saveStudent(sid, name) {
  const f = studentFile(sid), old = readJson(f); if (old && String(old.name).trim() !== String(name).trim()) throw new Error('이 학번은 다른 이름으로 이미 기록되어 있습니다. 학번을 확인하세요.');
  if (!old) writeJson(f, { student_id: sid, name, created_at: nowIso() });
}

function getTextQualityIssue(text) {
  const compact = String(text || '').replace(/\s+/g, ''); if (!compact) return null;
  if (/([.!?,~…;:])\1{4,}/u.test(compact)) return '온점·쉼표·느낌표 같은 기호가 지나치게 반복되고 있습니다.';
  if (/(.)\1{6,}/u.test(compact)) return '같은 문자가 지나치게 반복되고 있습니다.';
  if (/(.{2,5})\1{3,}/u.test(compact)) return '같은 짧은 글자 묶음이 반복되고 있습니다.';
  const chars = [...compact]; if (chars.length >= 30) { const punct = chars.filter(ch => /[.!?,~…;:]/u.test(ch)).length; if (punct / chars.length > .30) return '문장에 비해 기호의 비율이 지나치게 높습니다.'; }
  if (chars.length >= 40) { const c = {}; let max = 0; for (const ch of chars) { c[ch] = (c[ch] || 0) + 1; max = Math.max(max, c[ch]); } if (max / chars.length > .45) return '특정 문자 하나가 답안의 대부분을 차지하고 있습니다.'; }
  return null;
}
function validateWrittenText(text, min, label) { if (String(text || '').length < min) return `${label}은(는) ${min}자 이상이어야 합니다.`; const issue = getTextQualityIssue(text); return issue ? `${label} 답안에서 반복 입력이 확인되었습니다. ${issue} 의미 있는 문장으로 수정해 주세요.` : null; }
function getPlanCost(ids, final) { const map = final ? FinalCosts : InitialCosts; return (ids || []).reduce((s, id) => s + (map[id] ?? 999), 0); }
function validatePayload(p) {
  if (!p) return '답안 데이터가 없습니다.';
  for (const rid of ['structure', 'usage', 'map', 'voices', 'budget']) if (!p.resourceChecks?.[rid]) return '자료 확인문제 5개를 모두 통과해야 합니다.';
  let e = validateWrittenText(p.issueSummary, 80, '문제 정의'); if (e) return e;
  const rightsAllowed = ['이동권','평등권','인간의 존엄과 가치','인간다운 생활을 할 권리','교육을 받을 권리','행복추구권'];
  const criteriaAllowed = ['접근성','예산의 효율성','형평성','시급성·필수성'];
  if (!rightsAllowed.includes(p.priorityRight) || !criteriaAllowed.includes(p.priorityCriterion)) return '우선할 권리·가치와 정책 기준을 각각 선택해야 합니다.';
  const stationAllowed = ['central','welfare','hospital','market','park','school'];
  const stations = [...new Set(p.stations || [])]; if (stations.length !== (p.stations || []).length) return '같은 역이 중복 선택되어 있습니다.'; if (stations.some(x => !stationAllowed.includes(x))) return '알 수 없는 후보역이 포함되어 있습니다.'; if (stations.length < 2 || getPlanCost(stations, false) > 50) return '1차 정책 선택 조건이 충족되지 않았습니다.';
  const rs = [...new Set(p.rights || [])], cs = [...new Set(p.criteria || [])]; if (rs.length < 1 || cs.length < 1) return '권리·가치와 정책 판단 기준을 각각 하나 이상 선택해야 합니다.'; if (rs.some(x => !rightsAllowed.includes(x))) return '선택할 수 없는 권리·가치가 포함되어 있습니다.'; if (cs.some(x => !criteriaAllowed.includes(x))) return '선택할 수 없는 정책 판단 기준이 포함되어 있습니다.';
  const answers = p.answers || []; if (answers.length < 3) return '3단계 서술 답안이 부족합니다.'; for (let i = 0; i < 3; i++) { e = validateWrittenText(answers[i], 150, ['권리 보호 분석','자료·예산 분석','정책 한계·보완'][i]); if (e) return e; }
  const groups = ['휠체어·보행보조기 이용 시민','대학병원 환자·보호자','고령 전통시장 이용자','특수학급 학생·보호자','유모차 이용 가족','일반 환승 이용자']; if (!groups.includes(p.benefitGroup) || !groups.includes(p.burdenGroup)) return '정책의 수혜 집단과 불편이 남는 집단을 각각 선택해야 합니다.'; if (p.benefitGroup === p.burdenGroup) return '수혜 집단과 불편이 남는 집단은 서로 다르게 선택해야 합니다.'; e = validateWrittenText(p.impactNote, 80, '수혜·부담 집단 비교'); if (e) return e;
  const fp = [...new Set(p.finalPlan || [])]; if (fp.length !== (p.finalPlan || []).length) return '최종 정책에서 같은 역이 중복 선택되어 있습니다.'; if (fp.some(x => !stationAllowed.includes(x))) return '최종 정책에 알 수 없는 후보역이 포함되어 있습니다.'; if (fp.length < 2 || getPlanCost(fp, true) > 50) return '최종 정책 선택 조건이 충족되지 않았습니다.'; return validateWrittenText(p.finalReason, 150, '최종 재판단');
}

function checkPin(v) { return String(v || '') === TEACHER_PIN; }
function monitorToken() {
  try { const x = fs.readFileSync(MONITOR_TOKEN_FILE, 'utf8').trim(); if (x) return x; } catch {}
  const x = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(MONITOR_TOKEN_FILE, x); return x;
}
function checkMonitorToken(v) { return !!v && String(v) === monitorToken(); }

function loadAiConfig() { if (openAIKey) return; const c = readJson(AI_CONFIG_FILE); if (c?.api_key) openAIKey = String(c.api_key).trim(); if (c?.model) openAIModel = String(c.model).trim(); }
function saveAiConfig(key, model) { openAIKey = String(key || '').trim(); openAIModel = String(model || 'gpt-5.6-luna').trim(); if (!openAIKey) throw new Error('API 키를 입력하세요.'); writeJson(AI_CONFIG_FILE, { api_key: openAIKey, model: openAIModel, updated_at: nowIso() }); }
function clearAiConfig() { openAIKey = String(process.env.OPENAI_API_KEY || '').trim(); openAIModel = String(process.env.OPENAI_GRADING_MODEL || 'gpt-5.6-luna').trim(); try { fs.unlinkSync(AI_CONFIG_FILE); } catch {} }
function aiConfigured() { loadAiConfig(); return !!openAIKey && !!openAIModel; }
async function openAIRequest(body) {
  loadAiConfig(); if (!openAIKey) throw new Error('OpenAI API 키가 설정되지 않았습니다.');
  const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${openAIKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text(); let obj; try { obj = JSON.parse(txt); } catch { obj = null; }
  if (!r.ok) throw new Error(obj?.error?.message || txt || `OpenAI API 오류 ${r.status}`); return obj;
}
async function invokeAiPing(key, model) {
  const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || 'gpt-5.6-luna', input: 'Reply with OK.' }) });
  const txt = await r.text(); let obj; try { obj = JSON.parse(txt); } catch { obj = null; } if (!r.ok) throw new Error(obj?.error?.message || txt || `OpenAI API 오류 ${r.status}`); return true;
}
async function invokeAiGrade(payload) {
  const reference = {
    central:{name:'새봄중앙역',riders:18400,mobility:1850,initial_cost:24,final_cost:30,facility:'환승센터·시청'}, welfare:{name:'복지센터역',riders:8900,mobility:1620,mobility_rate:'18.2%',initial_cost:18,final_cost:11,facility:'장애인종합복지관 180m'}, hospital:{name:'대학병원역',riders:15700,mobility:2140,projected_mobility:2568,projected_change:'+20%',cost:39,facility:'대학병원 220m'}, market:{name:'전통시장역',riders:11200,mobility:1480,cost:20,facility:'전통시장 90m·노인복지관 350m'}, park:{name:'푸른공원역',riders:7200,mobility:780,cost:18,facility:'대형공원 120m'}, school:{name:'새봄고역',riders:9600,mobility:510,cost:8,facility:'고교 140m·특수학급 통학로'}
  };
  const student = { issueSummary:payload.issueSummary, priorityRight:payload.priorityRight, priorityCriterion:payload.priorityCriterion, stations:payload.stations, finalPlan:payload.finalPlan, rights:payload.rights, criteria:payload.criteria, answers:payload.answers, benefitGroup:payload.benefitGroup, burdenGroup:payload.burdenGroup, impactNote:payload.impactNote, finalReason:payload.finalReason };
  const rubric = `학생이 고른 역 자체는 정답/오답으로 평가하지 않는다. 반드시 근거의 정확성과 논리만 평가한다.\n권리·가치 25점: 문제 정의와 우선 권리 선택이 실제 시민의 이동 제약과 연결되는지 함께 본다. A=권리를 정확히 설명하고 구체적 시민·역 상황과 연결, B=관련 권리 연결은 정확하나 설명 일부 단순, C=권리 명칭은 적절하나 일반적 설명 위주, D=권리와 정책기준을 혼동하거나 핵심 연결 부족.\n자료 활용·비교 25점: A=정확한 수치 2개 이상과 역 간 비교·비율·비용을 해석, B=정확한 자료와 비교가 있으나 해석 깊이 제한, C=자료 언급은 있으나 비교/해석 약함, D=자료 거의 없거나 사실 오류 큼.\n논리성 20점: A=선택 기준과 자료가 일관되고 이해관계자 비교에서 정책의 trade-off를 분명히 설명, B=대체로 일관되며 수혜·부담 비교가 있으나 일부 연결 약함, C=결론은 있으나 비교나 근거 연결이 단순, D=선택과 근거가 모순되거나 설명 부족.\n한계·보완 15점: 3-3 한계·보완 답안을 중심으로 본다. A=미선정 역의 구체적 피해와 실현 가능한 임시·장기 대책을 제시하고 보완 방향이 정책 한계와 연결됨, B=피해와 보완책을 구체적으로 제시, C=한계 또는 보완책이 일반적, D=핵심 한계·보완 거의 없음.\n재판단 15점: A=복지센터 비용↓, 중앙역 비용↑, 대학병원 수요+20% 세 변화를 비교해 유지/변경 이유를 설명, B=새 정보 2개 이상을 적절히 반영, C=새 정보 언급은 있으나 판단 영향 설명 약함, D=새 정보를 거의 반영하지 않거나 사실과 모순.\n각 항목은 A/B/C/D 중 하나만 선택한다. 학생이 자료에 없는 사실을 만들어내면 factual_issues에 기록한다.`;
  const prompt = `당신은 대한민국 일반계 고등학교 1학년 통합사회 수행평가의 교사 보조 가채점자입니다. 최종 성적 결정자가 아닙니다. 아래 정확한 정책 자료와 루브릭을 기준으로 답안을 평가하세요. 학생 이름과 학번은 제공되지 않습니다. JSON 구조로만 응답하세요.\n\n[정확한 정책 자료]\n${JSON.stringify(reference)}\n공통조건: 예산 50억 이하, 시의회 조건으로 최소 2개 역 선택. 권리·가치와 정책 판단 기준은 구분함.\n\n[학생 답안]\n${JSON.stringify(student)}\n\n[루브릭]\n${rubric}`;
  const schema = { type:'object', additionalProperties:false, properties:{ rights_level:{type:'string',enum:['A','B','C','D']}, evidence_level:{type:'string',enum:['A','B','C','D']}, logic_level:{type:'string',enum:['A','B','C','D']}, limitations_level:{type:'string',enum:['A','B','C','D']}, revision_level:{type:'string',enum:['A','B','C','D']}, summary:{type:'string'}, strengths:{type:'array',items:{type:'string'}}, concerns:{type:'array',items:{type:'string'}}, factual_issues:{type:'array',items:{type:'string'}}, confidence:{type:'string',enum:['낮음','보통','높음']} }, required:['rights_level','evidence_level','logic_level','limitations_level','revision_level','summary','strengths','concerns','factual_issues','confidence'] };
  const resp = await openAIRequest({ model: openAIModel, input: prompt, text: { format: { type:'json_schema', name:'school_pregrade_v9', strict:true, schema } }, store:false });
  let out = resp.output_text; if (!out) for (const item of resp.output || []) for (const c of item.content || []) if (c.type === 'output_text' && c.text) out = c.text;
  if (!out) throw new Error('AI 응답에서 구조화된 결과를 찾지 못했습니다.');
  const g = JSON.parse(out); g.rights = ScoreMap.rights[g.rights_level]; g.evidence = ScoreMap.evidence[g.evidence_level]; g.logic = ScoreMap.logic[g.logic_level]; g.limitations = ScoreMap.limitations[g.limitations_level]; g.revision = ScoreMap.revision[g.revision_level]; g.total = g.rights + g.evidence + g.logic + g.limitations + g.revision; return g;
}

function studentRow(st, teacherMode = false) {
  const sid = String(st.student_id), p = readJson(progressFile(sid)), g = readJson(gradeFile(sid)), pr = readJson(presenceFile(sid));
  const hadTimeRecord = fs.existsSync(timeFile(sid)), hadStudentRecord = fs.existsSync(studentFile(sid));
  let isOnline = false; if (pr?.active && pr.last_seen) isOnline = Date.now() - new Date(pr.last_seen).getTime() <= 20000;
  const answers = [0,0,0]; let finalLength = 0, activeAnswer = '';
  if (p?.payload) { const pa = p.payload.answers || []; for (let j=0;j<3;j++) answers[j] = String(pa[j] || '').length; finalLength = String(p.payload.finalReason || '').length; }
  if (pr) { if (Array.isArray(pr.answer_lengths)) for (let j=0;j<3;j++) if (pr.answer_lengths[j] != null) answers[j] = Number(pr.answer_lengths[j]) || 0; if (pr.final_length != null) finalLength = Number(pr.final_length) || 0; activeAnswer = String(pr.active_answer || ''); }
  const base = { student_id:sid, name:st.name, updated_at:p?.updated_at || null, submitted:!!p?.submitted, submitted_at:p?.submitted_at || null, first_submitted_at:p?.first_submitted_at || null, last_submitted_at:p?.last_submitted_at || p?.submitted_at || null, submission_count:Number(p?.submission_count || (p?.submitted_at ? 1 : 0)), online:isOnline, last_seen:pr?.last_seen || null, presence_step:pr?.step || null, step:pr?.step || p?.payload?.step || 1, answer_lengths:answers, final_length:finalLength, active_answer:activeAnswer, has_activity:!!p||!!pr||hadTimeRecord||hadStudentRecord, time:studentSessionView(sid,false) };
  if (teacherMode) Object.assign(base, { payload:p?.payload || null, ai_grade:g?.ai_grade ? JSON.stringify(g.ai_grade) : null, ai_updated_at:g?.ai_updated_at || null, teacher_grade:g?.teacher_grade ? JSON.stringify(g.teacher_grade) : null, teacher_comment:g?.teacher_comment || null, teacher_updated_at:g?.teacher_updated_at || null });
  else { let checks = 0; for (const v of Object.values(p?.payload?.resourceChecks || {})) if (v) checks++; base.resource_checks = checks; }
  return base;
}

function sendJson(res, obj, code=200) { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':b.length, 'Cache-Control':'no-store' }); res.end(b); }
function sendError(res, msg, code=400, extra={}) { sendJson(res, { error:msg, ...extra }, code); }
function serveStatic(res, pathname) {
  let rel = pathname === '/' ? 'student.html' : pathname.replace(/^\/+/, '');
  const allowed = new Set(['student.html','manifest.json','sw.js','resource_01_structure.webp','resource_02_usage.webp','resource_03_map.webp','resource_04_voices.webp','resource_05_budget.webp']);
  if (!allowed.has(rel)) return sendError(res, '없는 요청', 404);
  const f = path.join(PUBLIC_DIR, rel); if (!fs.existsSync(f)) return sendError(res, '파일 없음', 404);
  const ext = path.extname(f); const ct = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.json' ? 'application/manifest+json; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
  const b = fs.readFileSync(f); res.writeHead(200, { 'Content-Type':ct, 'Content-Length':b.length, 'Cache-Control':'no-store' }); res.end(b);
}
async function readBody(req) { return await new Promise((resolve, reject) => { let s=''; req.on('data', c => { s += c; if (s.length > 5_000_000) req.destroy(); }); req.on('end', () => { if (!s) return resolve({}); try { resolve(JSON.parse(s)); } catch { reject(new Error('JSON 형식 오류')); } }); req.on('error', reject); }); }

async function handleGet(req, res, u) {
  const q = Object.fromEntries(u.searchParams.entries());
  if (u.pathname === '/teacher') { res.writeHead(302,{Location:'/student.html?teacher=1'}); return res.end(); }
  if (u.pathname === '/student') { res.writeHead(302,{Location:'/student.html'}); return res.end(); }
  if (u.pathname === '/health') return sendJson(res, { ok:true, version:'v9.2' });
  if (u.pathname === '/api/bootstrap') {
    const sid = String(q.student_id || '').trim(); const sv = sid ? studentSessionView(safeStudentId(sid)) : (()=>{ const c=getControl(); return { is_open:Number(c.is_open), server_is_open:Number(c.is_open), class_no:Number(c.class_no), period_type:String(c.period_type), session_id:String(c.session_id), timer_running:Number(c.is_open)===1, remaining_seconds:5400, segment_remaining_seconds:0, message:'' }; })(); return sendJson(res, { session:sv, reset_epoch:getResetEpoch() });
  }
  if (u.pathname === '/api/progress') {
    let sid; try { sid=safeStudentId(q.student_id); } catch(e){ return sendError(res,e.message,400); }
    const p=readJson(progressFile(sid)); if(!p) return sendJson(res,{payload:null,updated_at:null,submitted:false,submitted_at:null,first_submitted_at:null,last_submitted_at:null,submission_count:0,extra_seconds_at_submit:0,time_penalty_at_submit:0,penalty_exempt_at_submit:false,time:studentSessionView(sid),reset_epoch:getResetEpoch()});
    return sendJson(res,{payload:p.payload,updated_at:p.updated_at,submitted:!!p.submitted,submitted_at:p.submitted_at,first_submitted_at:p.first_submitted_at,last_submitted_at:p.last_submitted_at||p.submitted_at,submission_count:Number(p.submission_count||(p.submitted_at?1:0)),extra_seconds_at_submit:Number(p.extra_seconds_at_submit||0),time_penalty_at_submit:Number(p.time_penalty_at_submit||0),penalty_exempt_at_submit:!!p.penalty_exempt_at_submit,time:studentSessionView(sid),reset_epoch:getResetEpoch()});
  }
  if (u.pathname === '/api/monitor/submissions') {
    if(!checkMonitorToken(q.token)) return sendError(res,'교실 모니터 주소가 올바르지 않습니다.',403);
    const c=getControl(), rows=[]; for(const st of getAllStudentRefs().sort((a,b)=>a.student_id.localeCompare(b.student_id))){ const sid=String(st.student_id); if(sid==='000000')continue; if(Number(c.is_open)===1&&Number(c.class_no)!==0&&getStudentClassNo(sid)!==Number(c.class_no))continue; rows.push(studentRow(st,false)); }
    return sendJson(res,{rows,session:{is_open:Number(c.is_open),class_no:Number(c.class_no),period_type:String(c.period_type)}});
  }
  if (u.pathname === '/api/teacher/submissions') {
    if(!checkPin(q.pin)) return sendError(res,'PIN 오류',403);
    const c=getControl(), rows=[]; for(const st of getAllStudentRefs().sort((a,b)=>a.student_id.localeCompare(b.student_id))){ const sid=String(st.student_id); if(sid==='000000')continue; if(Number(c.is_open)===1&&Number(c.class_no)!==0&&getStudentClassNo(sid)!==Number(c.class_no))continue; rows.push(studentRow(st,true)); }
    const r=getRoster(); return sendJson(res,{rows,roster:{enabled:!!r.enabled,count:r.rows.length},ai_configured:aiConfigured(),ai_model:openAIModel,monitor_token:monitorToken(),session:{is_open:Number(c.is_open),class_no:Number(c.class_no),period_type:String(c.period_type),session_id:String(c.session_id)}});
  }
  return serveStatic(res,u.pathname);
}

async function handlePost(req,res,u,b){
  if(u.pathname==='/api/login'){
    let sid;try{sid=safeStudentId(b.student_id)}catch{return sendError(res,'학번 형식이 올바르지 않습니다. 학번을 다시 확인해 주세요.',400)}; const chk=validateStudentIdentity(sid,b.name); if(!chk.ok)return sendError(res,chk.error,403,{code:'ROSTER_MISMATCH'}); const name=chk.name; if(sid==='000000'&&!b.resume)resetTestStudentData(); try{saveStudent(sid,name)}catch(e){return sendError(res,e.message,409)}; let sv=studentSessionView(sid); if(Number(sv.is_open)!==1){if(b.resume)return sendJson(res,{ok:1,name,test:!!chk.test,session:sv});return sendError(res,sv.message,403,{code:'SESSION_NOT_OPEN'})} ensureTimeSegment(sid,false,false);sv=studentSessionView(sid);return sendJson(res,{ok:1,name,test:!!chk.test,session:sv});
  }
  if(u.pathname==='/api/heartbeat'){
    let sid;try{sid=safeStudentId(b.student_id)}catch(e){return sendError(res,e.message,400)}; let step=Math.max(1,Math.min(6,Number(b.step||1))), active=b.active==null?true:!!b.active; const al=[0,0,0]; if(Array.isArray(b.answer_lengths))for(let j=0;j<3;j++)al[j]=Math.max(0,Number(b.answer_lengths[j]||0)); const finalLength=Math.max(0,Number(b.final_length||0)), issueLength=Math.max(0,Number(b.issue_length||0)), impactLength=Math.max(0,Number(b.impact_length||0)); let activeAnswer=String(b.active_answer||'').trim(); if(!['issue','a0','a1','a2','impact','final'].includes(activeAnswer))activeAnswer=''; ensureTimeSegment(sid,false,active&&!b.submitted); writeJson(presenceFile(sid),{student_id:sid,last_seen:nowIso(),step,submitted:!!b.submitted,active,answer_lengths:al,final_length:finalLength,issue_length:issueLength,impact_length:impactLength,active_answer:activeAnswer}); return sendJson(res,{ok:1});
  }
  if(u.pathname==='/api/save'){
    let sid;try{sid=safeStudentId(b.student_id)}catch(e){return sendError(res,e.message,400)}; const chk=validateStudentIdentity(sid,b.name);if(!chk.ok)return sendError(res,chk.error,403,{code:'ROSTER_MISMATCH'}); const sv=studentSessionView(sid);if(Number(sv.is_open)!==1)return sendError(res,sv.message,403);if(Number(sv.segment_remaining_seconds)<=0&&String(sv.period_type)!=='makeup')return sendError(res,'이번 차시의 45분 활동시간이 끝났습니다. 다음 차시 또는 보충·추가시간에서 이어서 작성하세요.',403);ensureTimeSegment(sid,true,true);const old=readJson(progressFile(sid));if(old?.submitted)resetGradesOnRevision(sid);try{saveStudent(sid,chk.name)}catch(e){return sendError(res,e.message,409)};const first=old?.first_submitted_at||old?.submitted_at||null,last=old?.last_submitted_at||old?.submitted_at||null,count=Number(old?.submission_count||(old?.submitted_at?1:0));writeJson(progressFile(sid),{student_id:sid,payload:b.payload,updated_at:nowIso(),submitted:false,submitted_at:null,first_submitted_at:first,last_submitted_at:last,submission_count:count});return sendJson(res,{ok:1});
  }
  if(u.pathname==='/api/submit'){
    let sid;try{sid=safeStudentId(b.student_id)}catch(e){return sendError(res,e.message,400)};const chk=validateStudentIdentity(sid,b.name);if(!chk.ok)return sendError(res,chk.error,403,{code:'ROSTER_MISMATCH'});const err=validatePayload(b.payload);if(err)return sendError(res,err,400);let sv=studentSessionView(sid);if(Number(sv.is_open)!==1)return sendError(res,sv.message,403);ensureTimeSegment(sid,true,true);sv=studentSessionView(sid);try{saveStudent(sid,chk.name)}catch(e){return sendError(res,e.message,409)};const old=readJson(progressFile(sid));if(old?.submitted)resetGradesOnRevision(sid);const ts=nowIso(),first=old?.first_submitted_at||old?.submitted_at||ts,count=Number(old?.submission_count||((old?.submitted_at||old?.last_submitted_at)?1:0))+1;const payload={...b.payload,submitted:true,submitPending:false,receiptTime:ts};writeJson(progressFile(sid),{student_id:sid,payload,updated_at:ts,submitted:true,submitted_at:ts,first_submitted_at:first,last_submitted_at:ts,submission_count:count,extra_seconds_at_submit:Number(sv.extra_seconds),time_penalty_at_submit:Number(sv.time_penalty),time_penalty_raw_at_submit:Number(sv.time_penalty_raw),penalty_exempt_at_submit:!!sv.penalty_exempt});return sendJson(res,{ok:1,submitted_at:ts,first_submitted_at:first,last_submitted_at:ts,submission_count:count,extra_seconds:Number(sv.extra_seconds),time_penalty:Number(sv.time_penalty),time_penalty_raw:Number(sv.time_penalty_raw),penalty_exempt:!!sv.penalty_exempt});
  }
  if(u.pathname.startsWith('/api/teacher/')&&!checkPin(b.pin))return sendError(res,'PIN 오류',403);
  if(u.pathname==='/api/teacher/reset-activity'){if(Number(getControl().is_open)===1)return sendError(res,'수업이 열려 있는 동안에는 전체 초기화를 할 수 없습니다. 먼저 현재 수업을 닫아 주세요.',409);const epoch=clearAllActivityData();return sendJson(res,{ok:1,reset_epoch:epoch});}
  if(u.pathname==='/api/teacher/open'){let cls=Number(b.class_no||0);if(cls<0||cls>7)return sendError(res,'수업 반은 전체반 또는 1~7반 중에서 선택하세요.',400);const period=String(b.period_type||'').trim();if(!['1','2','makeup'].includes(period))return sendError(res,'1차시, 2차시 또는 보충·추가시간을 선택하세요.',400);const old=getControl();if(Number(old.is_open)===1)finalizeCurrentSession();writeJson(CONTROL_FILE,{is_open:1,class_no:cls,period_type:period,session_id:crypto.randomBytes(16).toString('hex'),opened_at:nowIso(),timer_running:true,remaining_seconds:0,closes_at:null});return sendJson(res,{ok:1,class_no:cls,period_type:period});}
  if(u.pathname==='/api/teacher/close'){const c=getControl();if(Number(c.is_open)===1)finalizeCurrentSession();writeJson(CONTROL_FILE,{is_open:0,class_no:0,period_type:'',session_id:'',opened_at:null,timer_running:false,remaining_seconds:0,closes_at:nowIso()});return sendJson(res,{ok:1});}
  if(u.pathname==='/api/teacher/time-reset'){let sid;try{sid=safeStudentId(b.student_id)}catch(e){return sendError(res,e.message,400)};const period=String(b.period||'');if(!['1','2'].includes(period))return sendError(res,'차시 값 오류',400);return sendJson(res,{ok:1,time:resetStudentPeriod(sid,period)});}
  if(u.pathname==='/api/teacher/time-exempt'){let sid;try{sid=safeStudentId(b.student_id)}catch(e){return sendError(res,e.message,400)};return sendJson(res,{ok:1,time:setTimePenaltyExempt(sid,!!b.exempt)});}
  if(u.pathname==='/api/teacher/roster/import'){const rows=[];for(const x of b.rows||[]){try{const sid=safeStudentId(x.student_id),name=String(x.name||'').trim();if(sid&&name)rows.push({student_id:sid,name})}catch{}}const r=getRoster();writeJson(ROSTER_FILE,{enabled:!!r.enabled,rows});return sendJson(res,{ok:1,count:rows.length});}
  if(u.pathname==='/api/teacher/roster/toggle'){const r=getRoster();writeJson(ROSTER_FILE,{enabled:!!b.enabled,rows:r.rows});return sendJson(res,{ok:1,enabled:!!b.enabled});}
  if(u.pathname==='/api/teacher/grade'){let sid;try{sid=safeStudentId(b.student_id)}catch(e){return sendError(res,e.message,400)};const g=readJson(gradeFile(sid))||{};Object.assign(g,{student_id:sid,teacher_grade:b.grade,teacher_comment:String(b.comment||''),teacher_updated_at:nowIso()});writeJson(gradeFile(sid),g);return sendJson(res,{ok:1});}
  if(u.pathname==='/api/teacher/ai-config'){if(Number(getControl().is_open)===1)return sendError(res,'학생 활동 중에는 API 연결 확인을 실행하지 않습니다. 현재 수업을 닫은 뒤 설정해 주세요.',409);const key=String(b.api_key||'').trim(),model=String(b.model||'gpt-5.6-luna').trim();if(!key)return sendError(res,'OpenAI API 키를 입력하세요.',400);try{await invokeAiPing(key,model);saveAiConfig(key,model)}catch(e){return sendError(res,'API 연결 확인 실패: '+e.message,502)}return sendJson(res,{ok:1,configured:true,model:openAIModel});}
  if(u.pathname==='/api/teacher/ai-clear'){clearAiConfig();return sendJson(res,{ok:1,configured:aiConfigured(),model:openAIModel});}
  if(u.pathname==='/api/teacher/ai-grade'){if(Number(getControl().is_open)===1)return sendError(res,'학생 활동 중에는 AI 가채점을 실행하지 않습니다. 현재 수업을 닫은 뒤 진행해 주세요.',409);let sid;try{sid=safeStudentId(b.student_id)}catch(e){return sendError(res,e.message,400)};const p=readJson(progressFile(sid));if(!p)return sendError(res,'학생 답안을 찾지 못했습니다.',404);if(!p.submitted)return sendError(res,'최종 제출된 답안만 AI 가채점할 수 있습니다.',400);try{const grade=await invokeAiGrade(p.payload),g=readJson(gradeFile(sid))||{};Object.assign(g,{student_id:sid,ai_grade:grade,ai_updated_at:nowIso()});writeJson(gradeFile(sid),g);return sendJson(res,{ok:1,grade})}catch(e){return sendError(res,e.message,502)}}
  return sendError(res,'없는 요청',404);
}

const server = http.createServer(async (req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(req.method==='GET')return await handleGet(req,res,u);
    if(req.method==='POST'){const b=await readBody(req);return await handlePost(req,res,u,b)}
    return sendError(res,'지원하지 않는 요청',405);
  }catch(e){console.error(e);if(!res.headersSent)sendError(res,'서버 처리 오류: '+e.message,500);else res.end();}
});

loadAiConfig(); getControl(); getRoster(); monitorToken();
server.listen(PORT,'0.0.0.0',()=>console.log(`HR CITY v9.2 listening on ${PORT}; data=${DATA_DIR}`));
