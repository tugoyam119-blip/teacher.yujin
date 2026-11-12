/* eslint-disable @typescript-eslint/no-explicit-any */
import {env} from "cloudflare:workers";

import {ensureRuntimeSchema} from "./schema";
export const ensureOperations = ensureRuntimeSchema;

export async function touchVisit(studentId:string,name:string,className:string,phase:string,login=false){
 if(!studentId||studentId==="000000")return;
 await ensureOperations();const now=Date.now();
 try { await env.DB.prepare(`INSERT INTO student_visits (student_id,name,class_name,first_seen_at,last_seen_at,login_count,last_phase) VALUES (?,?,?,?,?,?,?)
  ON CONFLICT(student_id) DO UPDATE SET name=excluded.name,class_name=excluded.class_name,last_seen_at=excluded.last_seen_at,login_count=student_visits.login_count+excluded.login_count,last_phase=excluded.last_phase WHERE excluded.login_count>0 OR student_visits.last_seen_at<=excluded.last_seen_at-30000 OR student_visits.last_phase<>excluded.last_phase`).bind(studentId,name,className,now,now,login?1:0,phase).run(); } catch (error) {
  // Presence is auxiliary. Its failure must not reject a saved answer or admission.
  console.warn("[presence] visit write failed", error instanceof Error ? error.message : String(error));
 }
}

export async function makeupSetting(studentId:string){
 await ensureOperations();return env.DB.prepare("SELECT m.*,1 is_makeup FROM makeup_rounds m JOIN makeup_roster r ON r.class_name=m.class_name WHERE r.student_id=? AND m.status<>'closed'").bind(studentId).first();
}
