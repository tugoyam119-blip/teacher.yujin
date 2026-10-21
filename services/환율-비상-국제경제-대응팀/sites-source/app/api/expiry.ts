import {env} from "cloudflare:workers";
export function expiryStatement(studentId: string) {
  const now=Date.now();
  return env.DB.prepare("UPDATE attempts SET status='submitted',submitted_at=?,submission_type='timeout',updated_at=? WHERE student_id=? AND status='progress' AND paused_at IS NULL AND (CASE WHEN extra_started_at IS NOT NULL THEN extra_started_at+(extra_granted_minutes*60000) ELSE started_at+((duration_minutes+extra_granted_minutes)*60000)+(paused_seconds*1000) END)<=?").bind(now,now,studentId,now);
}
