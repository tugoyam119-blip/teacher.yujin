import {env} from "cloudflare:workers";

// Cache only completed schema verification, never another request's I/O promise.
// Existing databases take one read-only batch after a Worker cold start.
let ready = false;
const tables = [
`CREATE TABLE IF NOT EXISTS grading_lock (id INTEGER PRIMARY KEY, token TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS grading_jobs (id INTEGER PRIMARY KEY, token TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS grading_items (job_token TEXT NOT NULL, student_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '', PRIMARY KEY(job_token,student_id))`,
`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY,status TEXT NOT NULL DEFAULT 'closed',duration_minutes INTEGER NOT NULL DEFAULT 45,started_at INTEGER,paused_at INTEGER,paused_seconds INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS class_sessions (class_name TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'closed',duration_minutes INTEGER NOT NULL DEFAULT 45,started_at INTEGER,exam_started_at INTEGER,paused_at INTEGER,paused_seconds INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS roster (student_id TEXT PRIMARY KEY,name TEXT NOT NULL,class_name TEXT NOT NULL DEFAULT '')`,
`CREATE TABLE IF NOT EXISTS attempts (student_id TEXT PRIMARY KEY,name TEXT NOT NULL,class_name TEXT NOT NULL DEFAULT '',answers TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'progress',current_step INTEGER NOT NULL DEFAULT 1,auto_score INTEGER NOT NULL DEFAULT 0,ai_score INTEGER,ai_feedback TEXT,ai_breakdown TEXT,ai_graded_at INTEGER,teacher_score INTEGER,feedback TEXT NOT NULL DEFAULT '',started_at INTEGER NOT NULL,duration_minutes INTEGER NOT NULL DEFAULT 45,paused_at INTEGER,paused_seconds INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,submitted_at INTEGER,submission_type TEXT)`,
`CREATE TABLE IF NOT EXISTS student_visits (student_id TEXT PRIMARY KEY,name TEXT NOT NULL,class_name TEXT NOT NULL,first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,login_count INTEGER NOT NULL DEFAULT 0,last_phase TEXT NOT NULL DEFAULT 'preview')`,
`CREATE TABLE IF NOT EXISTS makeup_rounds (class_name TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'closed',duration_minutes INTEGER NOT NULL DEFAULT 45,opened_at INTEGER,exam_started_at INTEGER,closed_at INTEGER,updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS makeup_roster (student_id TEXT PRIMARY KEY,name TEXT NOT NULL,class_name TEXT NOT NULL,added_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS grade_history (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id TEXT NOT NULL,event_type TEXT NOT NULL DEFAULT 'teacher_grade',auto_score INTEGER NOT NULL DEFAULT 0,ai_score INTEGER,extra_penalty INTEGER NOT NULL DEFAULT 0,provisional_score INTEGER,teacher_score INTEGER,feedback TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS help_requests (
  student_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  requested_at INTEGER NOT NULL,
  resolved_at INTEGER
)`,
`CREATE TABLE IF NOT EXISTS help_history (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  requested_at INTEGER NOT NULL,
  resolved_at INTEGER
)`
];
const additions: Record<string, Record<string,string>> = {
  attempts: {
    writing_changes: "INTEGER NOT NULL DEFAULT 0", writing_seconds: "INTEGER NOT NULL DEFAULT 0", last_writing_at: "INTEGER", writing_pause_seconds: "INTEGER NOT NULL DEFAULT 0",
    restart_authorized_at: "INTEGER",
    duration_minutes: "INTEGER NOT NULL DEFAULT 45", paused_at: "INTEGER",
    paused_seconds: "INTEGER NOT NULL DEFAULT 0", teacher_breakdown: "TEXT",
    extra_status: "TEXT NOT NULL DEFAULT 'none'", extra_requested_at: "INTEGER",
    extra_granted_minutes: "INTEGER NOT NULL DEFAULT 0", extra_started_at: "INTEGER",
    extra_penalty_exempt: "INTEGER NOT NULL DEFAULT 0", extra_penalty: "INTEGER NOT NULL DEFAULT 0",
    extra_decided_at: "INTEGER", extra_reason: "TEXT NOT NULL DEFAULT ''",
  },
  class_sessions: {exam_started_at: "INTEGER", deadline: "INTEGER"},
};
export async function ensureRuntimeSchema() {
  if (ready) return;
  const names = tables.map(sql => sql.match(/EXISTS (\w+)/)![1]);
  const results = await env.DB.batch([
    ...names.map(name => env.DB.prepare(`PRAGMA table_info(${name})`)),
    env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='attempts_extra_penalty_after_submit'"),
  ]);
  const changes: string[] = [];
  for (let i=0;i<names.length;i++) {
    const columns = new Set(results[i].results.map((row:any) => row.name));
    if (!columns.size) changes.push(tables[i]);
    for (const [name,type] of Object.entries(additions[names[i]] || {})) {
      // Base CREATE statements already contain some of the upgrade columns.
      if (!columns.has(name) && (columns.size || !new RegExp(`\\b${name}\\b`).test(tables[i])))
        changes.push(`ALTER TABLE ${names[i]} ADD COLUMN ${name} ${type}`);
    }
  }
  if (!results[names.length].results.length) changes.push(`CREATE TRIGGER IF NOT EXISTS attempts_extra_penalty_after_submit AFTER UPDATE OF status ON attempts
  WHEN NEW.status='submitted' AND OLD.status<>'submitted'
  BEGIN
   UPDATE attempts SET extra_penalty=CASE
    WHEN NEW.extra_penalty_exempt=1 OR NEW.extra_granted_minutes<=0 THEN 0
    WHEN (NEW.submitted_at-CASE WHEN NEW.extra_started_at IS NOT NULL THEN NEW.extra_started_at ELSE NEW.started_at+(NEW.duration_minutes*60000)+(NEW.paused_seconds*1000) END)<=0 THEN 0
    WHEN (NEW.submitted_at-CASE WHEN NEW.extra_started_at IS NOT NULL THEN NEW.extra_started_at ELSE NEW.started_at+(NEW.duration_minutes*60000)+(NEW.paused_seconds*1000) END)<=300000 THEN 2
    ELSE 4 END WHERE student_id=NEW.student_id;
  END`);
  if (!results[names.indexOf('settings')].results.length)
    changes.push("INSERT OR IGNORE INTO settings (id,status,duration_minutes,paused_seconds,updated_at) VALUES (1,'closed',45,0,0)");
  if (!results[names.indexOf('help_history')].results.length)
    changes.push("INSERT OR IGNORE INTO help_history (id,student_id,name,class_name,step,message,status,requested_at,resolved_at) SELECT student_id||'-'||requested_at,student_id,name,class_name,step,message,status,requested_at,resolved_at FROM help_requests");
  if (changes.length) await env.DB.batch(changes.map(sql => env.DB.prepare(sql)));
  ready = true;
}
