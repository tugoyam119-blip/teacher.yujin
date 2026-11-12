import { env } from "cloudflare:workers";
import { makeupSetting, touchVisit } from "../operations";
import { ensureRuntimeSchema as init } from "../schema";
import { expiryStatement } from "../expiry";
import {participationDelta} from "../participation";
import {
  findRepeatedNarrative,
  REPETITION_MESSAGE,
} from "../../answer-validation";
function studentSetting(setting, attempt, allowStart = false) {
  if (!attempt?.restart_authorized_at || !['ready','progress'].includes(attempt.status)) return setting;
  return {...setting,status:attempt.paused_at?'paused':'open',duration_minutes:attempt.duration_minutes,
    exam_started_at:attempt.started_at || (allowStart ? attempt.restart_authorized_at : null),started_at:attempt.started_at || null,
    paused_at:attempt.paused_at,paused_seconds:attempt.paused_seconds || 0,
    deadline:attempt.started_at ? Number(attempt.started_at)+Number(attempt.duration_minutes)*60000+Number(attempt.paused_seconds||0)*1000 : null};
}
function score(a) {
  let s = 0;
  if (a.won === "\uD558\uB77D") s += 7;
  if (a.dollar === "\uC0C1\uC2B9") s += 7;
  if (a.cost === "\uC99D\uAC00") s += 7;
  const g = {
    exporter: "\uC720\uB9AC",
    importer: "\uBD88\uB9AC",
    traveler: "\uBD88\uB9AC",
    student: "\uBD88\uB9AC",
    shop: "\uC720\uB9AC",
    debt: "\uBD88\uB9AC",
    consumer: "\uBD88\uB9AC",
    mixed: "\uC0C1\uD669\uC5D0 \uB530\uB77C \uB2E4\uB984",
  };
  Object.entries(g).forEach(([k, v]) => {
    if (a.groups?.[k] === v) s += 3.5;
  });
  const validEffects = new Set([
    "\uC218\uC785 \uBB3C\uAC00 \uC0C1\uC2B9",
    "\uB2EC\uB7EC \uD45C\uC2DC \uBD80\uCC44 \uBD80\uB2F4 \uC99D\uAC00",
    "\uC678\uD654 \uBD80\uC871 \uC2EC\uD654",
  ]);
  for (const x of a.effects || []) if (validEffects.has(x)) s += 7;
  if (a.policies?.length === 2) s += 7;
  return Math.min(70, Math.round(s));
}
function missing(a) {
  const m = [];
  if (!a.won || !a.dollar || !a.cost)
    m.push("1\uB2E8\uACC4 \uD658\uC728 \uD310\uB2E8");
  if (
    Object.keys(a.groups || {}).length < 8 ||
    String(a.exportReason || "").trim().length < 20 ||
    String(a.importReason || "").trim().length < 20
  )
    m.push("2\uB2E8\uACC4 \uC774\uC720 \uAC01\uAC01 \uCD5C\uC18C 20\uC790");
  if (!Array.isArray(a.effects) || a.effects.length !== 2)
    m.push("3\uB2E8\uACC4 \uC601\uD5A5 2\uAC1C");
  if (
    !Array.isArray(a.policies) ||
    a.policies.length !== 2 ||
    String(a.policyEffect || "").trim().length < 30 ||
    String(a.policyRisk || "").trim().length < 30
  )
    m.push(
      "4\uB2E8\uACC4 \uD6A8\uACFC\xB7\uBD80\uC791\uC6A9 \uAC01\uAC01 \uCD5C\uC18C 30\uC790",
    );
  const reportLength = String(a.report || "").trim().length;
  if (reportLength < 120)
    m.push(
      "5\uB2E8\uACC4 \uCD5C\uC885 \uBCF4\uACE0\uC11C \uCD5C\uC18C 120\uC790",
    );
  return m;
}
async function GET(request) {
  const id = new URL(request.url).searchParams.get("studentId");
  await init();
  if (!id) return Response.json({setting: await env.DB.prepare("SELECT * FROM settings WHERE id=1").first()}, {headers:{"Cache-Control":"no-store"}});
  const results = await env.DB.batch([
    expiryStatement(id),
    env.DB.prepare("SELECT * FROM settings WHERE id=1"),
    env.DB.prepare("SELECT * FROM attempts WHERE student_id=?").bind(id),
    env.DB.prepare("SELECT * FROM roster WHERE student_id=?").bind(id),
    id === '000000'
      ? env.DB.prepare("SELECT * FROM class_sessions WHERE class_name<>'교사용 시범' AND status IN ('open','paused') ORDER BY updated_at DESC LIMIT 1")
      : env.DB.prepare("SELECT * FROM class_sessions WHERE class_name=COALESCE((SELECT class_name FROM attempts WHERE student_id=?),(SELECT class_name FROM roster WHERE student_id=?))").bind(id,id),
    id === '000000'
      ? env.DB.prepare("SELECT * FROM class_sessions WHERE class_name='교사용 시범'")
      : env.DB.prepare("SELECT m.*,1 is_makeup FROM makeup_rounds m JOIN makeup_roster r ON r.class_name=m.class_name WHERE r.student_id=? AND m.status<>'closed'").bind(id),
  ]);
  const [, fallbackRows, attemptRows, rosterRows, regularRows, makeupRows] = results;
  const fallback=fallbackRows.results[0], x=attemptRows.results[0], listed=rosterRows.results[0], regular=regularRows.results[0], makeup=makeupRows.results[0];
  const setting = studentSetting(regular && regular.status !== 'closed' ? regular : makeup || regular || fallback,x);
  if (listed) await touchVisit(id,listed.name,listed.class_name,x?.started_at ? x.status || 'progress' : 'preview');
  return Response.json({setting,attempt:x ? {...x,answers:JSON.parse(x.answers || '{}')} : null}, {headers:{"Cache-Control":"no-store"}});
}
async function POST(request) {
  const b = await request.json(), now = Date.now();
  await init();
  if (b.studentId) await expiryStatement(String(b.studentId).trim()).run();
  if (b.action === "login") {
    const id = String(b.studentId || "").trim(),
      name = String(b.name || "").trim();
    if (!id || !name)
      return Response.json(
        {
          error:
            "\uD559\uBC88\uACFC \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694.",
        },
        { status: 400 },
      );
    if (id === "000000") {
      await env.DB.prepare(
        "DELETE FROM attempts WHERE student_id='000000'",
      ).run();
      await env.DB.prepare(
        "INSERT OR REPLACE INTO class_sessions (class_name,status,duration_minutes,started_at,exam_started_at,paused_at,paused_seconds,updated_at) VALUES ('\uAD50\uC0AC\uC6A9 \uC2DC\uBC94','open',45,?,?,NULL,0,?)",
      )
        .bind(now, now, now)
        .run();
      const activeClass = await env.DB.prepare(
          "SELECT * FROM class_sessions WHERE class_name<>'\uAD50\uC0AC\uC6A9 \uC2DC\uBC94' AND status IN ('open','paused') ORDER BY updated_at DESC LIMIT 1",
        ).first(),
        demo = await env.DB.prepare(
          "SELECT * FROM class_sessions WHERE class_name='\uAD50\uC0AC\uC6A9 \uC2DC\uBC94'",
        ).first(),
        setting2 = activeClass || demo;
      return Response.json({
        attempt: {
          student_id: id,
          name,
          class_name: "\uAD50\uC0AC\uC6A9 \uC2DC\uBC94",
          status: "ready",
          current_step: 0,
          answers: {},
          started_at: null,
          duration_minutes: Number(setting2?.duration_minutes || 45),
        },
        setting: setting2,
        demo: true,
      });
    }
    const rows=await env.DB.batch([
      env.DB.prepare("SELECT * FROM roster WHERE student_id=?").bind(id),
      env.DB.prepare("SELECT COUNT(*) c FROM roster"),
      env.DB.prepare("SELECT * FROM settings WHERE id=1"),
      env.DB.prepare("SELECT * FROM class_sessions WHERE class_name=(SELECT class_name FROM roster WHERE student_id=?)").bind(id),
      env.DB.prepare("SELECT m.*,1 is_makeup FROM makeup_rounds m JOIN makeup_roster r ON r.class_name=m.class_name WHERE r.student_id=? AND m.status<>'closed'").bind(id),
      env.DB.prepare("SELECT * FROM attempts WHERE student_id=?").bind(id),
    ]);
    const [listed,count,fallback,regular,makeup,x]=rows.map(row=>row.results[0]);
    if (Number(count?.c) > 0 && (!listed || listed.name !== name))
      return Response.json(
        {
          error:
            "\uBA85\uB2E8\uC758 \uD559\uBC88\uACFC \uC774\uB984\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        },
        { status: 403 },
      );
    const setting = studentSetting(regular && regular.status !== 'closed' ? regular : makeup || regular || fallback,x,true);
    // 명단에 등록된 학생은 수행 시작 전에도 로그인하여 대기 화면에
    // 들어갈 수 있다. 실제 답안 생성과 타이머 시작은 action="start"에서만
    // 처리하므로, 닫힌 상태에서의 사전 로그인은 수행 시작으로 간주되지 않는다.
    if (!setting || (!listed && setting.status === "closed"))
      return Response.json(
        {
          error: listed?.class_name
            ? `${listed.class_name} \uC218\uD589\uD3C9\uAC00\uAC00 \uC544\uC9C1 \uC2DC\uC791\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.`
            : "\uC544\uC9C1 \uC218\uD589\uD3C9\uAC00\uAC00 \uC5F4\uB9AC\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
        },
        { status: 403 },
      );
    await touchVisit(id, name, listed?.class_name || "", "preview", true);
    return Response.json({
      attempt: x
        ? { ...x, answers: JSON.parse(x.answers || "{}") }
        : {
            student_id: id,
            name,
            class_name: listed?.class_name || "",
            status: "ready",
            current_step: 0,
            answers: {},
            started_at: null,
            duration_minutes: Number(setting.duration_minutes || 45),
          },
      setting,
    });
  }
  if (b.action === "start") {
    const id = String(b.studentId || "").trim(),
      name = String(b.name || "").trim();
    const listed =
      id === "000000"
        ? {
            student_id: id,
            name,
            class_name: "\uAD50\uC0AC\uC6A9 \uC2DC\uBC94",
          }
        : await env.DB.prepare("SELECT * FROM roster WHERE student_id=?")
            .bind(id)
            .first();
    if (!listed || listed.name !== name)
      return Response.json(
        {
          error:
            "\uBA85\uB2E8\uC758 \uD559\uBC88\uACFC \uC774\uB984\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
        },
        { status: 403 },
      );
    const restart=await env.DB.prepare("SELECT * FROM attempts WHERE student_id=? AND restart_authorized_at IS NOT NULL").bind(id).first();
    if(restart && ['ready','progress'].includes(restart.status)) {
      await env.DB.prepare("UPDATE attempts SET started_at=?,status='progress',current_step=1,updated_at=? WHERE student_id=? AND status='ready' AND started_at=0 AND restart_authorized_at IS NOT NULL").bind(now,now,id).run();
      const x=await env.DB.prepare("SELECT * FROM attempts WHERE student_id=?").bind(id).first();
      await touchVisit(id,x.name,x.class_name,'progress');
      return Response.json({attempt:{...x,answers:JSON.parse(x.answers||'{}')},setting:studentSetting(null,x)});
    }
    const regular = await env.DB.prepare(
        "SELECT * FROM class_sessions WHERE class_name=?",
      )
        .bind(listed.class_name)
        .first(),
      makeup = id === "000000" ? null : await makeupSetting(id),
      setting =
        regular && regular.status !== "closed" ? regular : makeup || regular;
    if (!setting || setting.status === "closed")
      return Response.json(
        {
          error:
            "\uC218\uD589\uD3C9\uAC00 \uC11C\uBC84\uAC00 \uB2EB\uD600 \uC788\uC2B5\uB2C8\uB2E4.",
        },
        { status: 403 },
      );
    const commonStart =
      id === "000000" ? now : Number(setting.exam_started_at || 0);
    if (!commonStart)
      return Response.json(
        {
          error:
            "\uAD50\uC0AC\uAC00 \uC544\uC9C1 \uD3C9\uAC00 \uD0C0\uC774\uBA38\uB97C \uC2DC\uC791\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
        },
        { status: 409 },
      );
    await env.DB.prepare(
      "INSERT OR IGNORE INTO attempts (student_id,name,class_name,started_at,duration_minutes,paused_at,paused_seconds,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        name,
        listed.class_name,
        commonStart,
        id === "000000" ? 45 : Number(setting.duration_minutes || 45),
        setting.status === "paused" ? Number(setting.paused_at || now) : null,
        Number(setting.paused_seconds || 0),
        now,
      )
      .run();
    await touchVisit(
      id,
      name,
      listed.class_name,
      makeup ? "makeup" : "progress",
    );
    const x = await env.DB.prepare("SELECT * FROM attempts WHERE student_id=?")
      .bind(id)
      .first();
    return Response.json({
      attempt: { ...x, answers: JSON.parse(x.answers || "{}") },
      setting,
    });
  }
  if (b.action === "reopen_self") {
    const id = String(b.studentId || "").trim(),
      name = String(b.name || "").trim(),
      x = await env.DB.prepare("SELECT * FROM attempts WHERE student_id=?")
        .bind(id)
        .first();
    if (!x || x.name !== name)
      return Response.json(
        {
          error:
            "\uC751\uC2DC \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
        },
        { status: 403 },
      );
    const rawSession = await env.DB.prepare(
      "SELECT * FROM class_sessions WHERE class_name=?",
    )
      .bind(x.class_name)
      .first();
    const session=studentSetting(rawSession,x);
    if (!session || session.status === "closed")
      return Response.json(
        {
          error:
            "\uBC18 \uC11C\uBC84\uAC00 \uB9C8\uAC10\uB418\uC5B4 \uB2F5\uC548\uC744 \uB2E4\uC2DC \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
        },
        { status: 409 },
      );
    const sharedPaused =
        Number(session.paused_seconds || 0) +
        (session.status === "paused"
          ? Math.floor((now - Number(session.paused_at || now)) / 1e3)
          : 0),
      deadline =
        Number(x.started_at) +
        (Number(x.duration_minutes) + Number(x.extra_granted_minutes || 0)) *
          6e4 +
        sharedPaused * 1e3;
    if (session.status !== "paused" && Date.now() >= deadline)
      return Response.json(
        {
          error:
            "\uC218\uD589\uC2DC\uAC04\uC774 \uC885\uB8CC\uB418\uC5B4 \uB2F5\uC548\uC744 \uB2E4\uC2DC \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
        },
        { status: 409 },
      );
    await env.DB.prepare(
      "UPDATE attempts SET status='progress',submitted_at=NULL,submission_type=NULL,paused_at=?,paused_seconds=?,updated_at=? WHERE student_id=?",
    )
      .bind(
        session.status === "paused" ? Number(session.paused_at || now) : null,
        Number(session.paused_seconds || 0),
        now,
        id,
      )
      .run();
    const reopened = await env.DB.prepare(
      "SELECT * FROM attempts WHERE student_id=?",
    )
      .bind(id)
      .first();
    return Response.json({
      ok: true,
      attempt: { ...reopened, answers: JSON.parse(reopened.answers || "{}") },
      setting: session,
    });
  }
  if (b.action === "save" || b.action === "submit") {
    const id = String(b.studentId || ""),
      x = await env.DB.prepare("SELECT * FROM attempts WHERE student_id=?")
        .bind(id)
        .first();
    if (!x)
      return Response.json(
        {
          error:
            "\uC751\uC2DC \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
        },
        { status: 404 },
      );
    if (x.status === "submitted")
      return Response.json(
        {
          error:
            "\uC774\uBBF8 \uC81C\uCD9C\uB41C \uB2F5\uC548\uC785\uB2C8\uB2E4.",
        },
        { status: 409 },
      );
    const a = b.answers || {},
      submit = b.action === "submit";
    const normalSubmit = submit && (b.submissionType || "normal") === "normal";
    const missingItems = normalSubmit ? missing(a) : [];
    if (normalSubmit && missingItems.length)
      return Response.json(
        {
          error:
            "\uC544\uC9C1 \uC791\uC131\uD558\uC9C0 \uC54A\uC740 \uD56D\uBAA9\uC774 \uC788\uC2B5\uB2C8\uB2E4.",
          missing: missingItems,
        },
        { status: 400 },
      );
    const repeated = normalSubmit ? findRepeatedNarrative(a) : null;
    if (repeated)
      return Response.json(
        { error: REPETITION_MESSAGE, repeated },
        { status: 400 },
      );
    const activity=participationDelta(x,a,now);
    const saved = await env.DB.prepare(
      "UPDATE attempts SET writing_changes=writing_changes+?,writing_seconds=writing_seconds+?,last_writing_at=?,writing_pause_seconds=?,answers=?,current_step=?,auto_score=?,status=?,updated_at=?,submitted_at=?,submission_type=? WHERE student_id=? AND status='progress' AND answers=?",
    )
      .bind(
        activity.changes,activity.seconds,activity.last,Number(x.paused_seconds||0),
        JSON.stringify(a),
        Number(b.currentStep || 1),
        score(a),
        submit ? "submitted" : "progress",
        now,
        submit ? now : null,
        submit ? b.submissionType || "normal" : null,
        id,
        x.answers,
      )
      .run();
    if (!saved.meta.changes)
      return Response.json({error:"답안 저장 상태가 바뀌었습니다. 잠시 후 다시 저장·제출해 주세요."}, {status:409});
    await touchVisit(
      id,
      x.name,
      x.class_name,
      submit ? "submitted" : "progress",
    );
    return Response.json({ ok: true, savedAt: now, score: score(a) });
  }
  return Response.json(
    {
      error:
        "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC694\uCCAD\uC785\uB2C8\uB2E4.",
    },
    { status: 400 },
  );
}
export { GET, POST };
