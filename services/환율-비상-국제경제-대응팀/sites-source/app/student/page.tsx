"use client";
import { useEffect, useRef, useState } from "react";
import {startPolling} from "../polling.mjs";
import {
  findRepeatedNarrative,
  isMeaninglessRepetition,
  REPETITION_MESSAGE,
} from "../answer-validation";
const groupItems = [
  [
    "exporter",
    "\uBBF8\uAD6D\uC5D0 \uC0C1\uD488\uC744 \uC218\uCD9C\uD558\uB294 \uAE30\uC5C5",
  ],
  [
    "importer",
    "\uC678\uAD6D \uC6D0\uC790\uC7AC\uB97C \uC218\uC785\uD558\uB294 \uAE30\uC5C5",
  ],
  [
    "traveler",
    "\uD574\uC678\uC5EC\uD589\uC744 \uC900\uBE44\uD558\uB294 \uC0AC\uB78C",
  ],
  [
    "student",
    "\uD574\uC678\uC5D0\uC11C \uC0DD\uD65C\uBE44\uB97C \uBC1B\uB294 \uC720\uD559\uC0DD",
  ],
  [
    "shop",
    "\uC678\uAD6D\uC778 \uAD00\uAD11\uAC1D\uC744 \uC0C1\uB300\uD558\uB294 \uAD6D\uB0B4 \uC0C1\uC810",
  ],
  ["debt", "\uB2EC\uB7EC\uB85C \uBE5A\uC744 \uC9C4 \uAD6D\uB0B4 \uAE30\uC5C5"],
  [
    "consumer",
    "\uC218\uC785 \uC2DD\uD488\uC744 \uAD6C\uB9E4\uD558\uB294 \uC18C\uBE44\uC790",
  ],
  [
    "mixed",
    "\uC218\uCD9C\uACFC \uC218\uC785\uC744 \uBAA8\uB450 \uB9CE\uC774 \uD558\uB294 \uAE30\uC5C5",
  ],
];
const policyItems = [
  "\uC678\uD658\uC2DC\uC7A5\uC5D0 \uB2EC\uB7EC \uACF5\uAE09",
  "\uAE30\uC900\uAE08\uB9AC \uC778\uC0C1",
  "\uC218\uC785 \uC0DD\uD544\uD488 \uAC00\uACA9 \uC9C0\uC6D0",
  "\uC218\uCD9C\uAE30\uC5C5 \uC9C0\uC6D0 \uD655\uB300",
  "\uC218\uC785\uAE30\uC5C5 \uAE34\uAE09\uB300\uCD9C",
  "\uBAA8\uB4E0 \uC218\uC785\uD488 \uC218\uC785 \uAE08\uC9C0",
];
const empty = { groups: {}, policies: [] };
function Student() {
  const [id, setId] = useState(""),
    [name, setName] = useState(""),
    [logged, setLogged] = useState(false),
    [answers, setAnswers] = useState(empty),
    [step, setStep] = useState(1),
    [setting, setSetting] = useState(null),
    [attempt, setAttempt] = useState(null),
    [message, setMessage] = useState(""),
    [validationMessage, setValidationMessage] = useState(""),
    [saved, setSaved] = useState(""),
    [left, setLeft] = useState(-1),
    [moving, setMoving] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [loggingIn, setLoggingIn] = useState(false);
  const loginPending = useRef(false), saveTimer = useRef(null),
    starting = useRef(false);
  const submitted = attempt?.status === "submitted",
    examStarted = Number(setting?.exam_started_at) > 0;
  const [helpOpen, setHelpOpen] = useState(false),
    [helpChoice, setHelpChoice] = useState(""),
    [helpActive, setHelpActive] = useState(false);
  useEffect(() => {
    if (!logged) return;
    const poll = startPolling(async signal => {
      const r = await fetch('/api/exam?studentId='+encodeURIComponent(id), {cache:'no-store',signal});
      if (!r.ok) throw new Error('status unavailable');
      const d = await r.json();
      if (signal.aborted) return;
      setSetting(d.setting);
      if (d.attempt) setAttempt(d.attempt);
    }, {delay: examStarted ? 5000 : 3000});
    const syncOnResume = () => {if (document.visibilityState === 'visible') poll.refresh();};
    document.addEventListener('visibilitychange', syncOnResume);
    window.addEventListener('focus', syncOnResume);
    window.addEventListener('pageshow', syncOnResume);
    window.addEventListener('online', syncOnResume);
    return () => {
      poll.stop();
      document.removeEventListener('visibilitychange', syncOnResume);
      window.removeEventListener('focus', syncOnResume);
      window.removeEventListener('pageshow', syncOnResume);
      window.removeEventListener('online', syncOnResume);
    };
  }, [logged, id, examStarted]);
  useEffect(() => {
    if (!logged || submitted || !attempt?.started_at) return;
    const poll = startPolling(async signal => {
      const r=await fetch('/api/help?studentId='+encodeURIComponent(id), {signal});
      if (!r.ok) throw new Error('help unavailable');
      const d=await r.json();
      if (!signal.aborted) setHelpActive(Boolean(d.help));
    }, {delay:15000});
    return () => poll.stop();
  }, [logged,id,submitted,Boolean(attempt?.started_at)]);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);
  useEffect(() => {
    if (!attempt?.started_at) {
      const t2 = setTimeout(() => setLeft(-1), 0);
      return () => clearTimeout(t2);
    }
    const tick = () => {
      const end = attempt.extra_started_at
        ? Number(attempt.extra_started_at) +
          Number(attempt.extra_granted_minutes || 0) * 6e4
        : Number(attempt.started_at) +
          (Number(attempt.duration_minutes) +
            Number(attempt.extra_granted_minutes || 0)) *
            6e4 +
          Number(attempt.paused_seconds || 0) * 1e3;
      const now = attempt.paused_at || Date.now();
      setLeft(Math.max(0, Math.floor((end - now) / 1e3)));
    };
    const t = setTimeout(tick, 0),
      x = setInterval(tick, 1e3);
    return () => {
      clearTimeout(t);
      clearInterval(x);
    };
  }, [attempt]);
  useEffect(() => {
    if (logged && !submitted && left === 0 && setting?.status === "open")
      submit("timeout");
  }, [left]);
  useEffect(() => {
    const shouldStart =
      logged &&
      !attempt?.started_at &&
      setting?.status === "open" &&
      examStarted;
    if (!shouldStart) return;

    // 시작 신호를 받은 직후의 일시적인 통신 실패 때문에 학생이 대기
    // 화면에 남지 않도록, 응시 기록이 만들어질 때까지 안전하게 재시도한다.
    startExam();
    const retry = setInterval(startExam, 1500);
    return () => clearInterval(retry);
  }, [logged, id, name, attempt?.started_at, setting?.status, examStarted]);
  async function login(e) {
    e.preventDefault();
    if (loginPending.current) return;
    loginPending.current=true;
    setLoggingIn(true);
    setMessage("");
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try {
    const r = await fetch("/api/exam", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "login", studentId: id, name }),
    });
    const d = await r.json();
    if (!r.ok) return setMessage(d.error);
    setLogged(true);
    setAttempt(d.attempt);
    setAnswers({
      ...empty,
      ...d.attempt.answers,
      groups: d.attempt.answers.groups || {},
      policies: d.attempt.answers.policies || [],
    });
    setStep(Math.min(5, Math.max(1, d.attempt.current_step || 1)));
    setSetting(d.setting);
    if (d.setting?.status === "open" && Number(d.setting?.exam_started_at) > 0)
      await startExam();
    } catch {
      setMessage('서버 연결이 지연되고 있습니다. 잠시 후 다시 입장해 주세요.');
    } finally {
      clearTimeout(timeout);
      loginPending.current=false;
      setLoggingIn(false);
    }
  }
  async function startExam() {
    if (starting.current) return;
    starting.current = true;
    try {
      const r = await fetch("/api/exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", studentId: id, name }),
      });
      const d = await r.json();
      if (!r.ok) return setMessage(d.error);
      setAttempt(d.attempt);
      setSetting(d.setting);
      setStep(d.attempt.current_step || 1);
      setMessage("");
    } catch {
      setMessage("시작 화면에 연결하고 있습니다. 잠시만 기다려 주세요.");
    } finally {
      starting.current = false;
    }
  }
  async function save(a = answers, s = step) {
    if (submitted) return;
    const r = await fetch("/api/exam", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        studentId: id,
        answers: a,
        currentStep: s,
      }),
    });
    if (r.ok)
      setSaved(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
  }
  async function requestHelp() {
    const r = await fetch("/api/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request",
          studentId: id,
          message: helpChoice,
        }),
      }),
      d = await r.json();
    if (!r.ok) {
      setMessage(d.error);
      return;
    }
    setHelpActive(true);
    setHelpOpen(false);
    setHelpChoice("");
    setMessage(d.message);
  }
  async function requestExtra() {
    if (
      !confirm(
        "\uCD94\uAC00\uC2DC\uAC04\uC744 \uC2E4\uC81C\uB85C \uC0AC\uC6A9\uD558\uBA74 5\uBD84 \uC774\uB0B4 2\uC810, 10\uBD84 \uC774\uB0B4 4\uC810\uC774 \uAC10\uC810\uB429\uB2C8\uB2E4. \uCD94\uAC00\uC2DC\uAC04\uC744 \uC694\uCCAD\uD560\uAE4C\uC694?",
      )
    )
      return;
    const r = await fetch("/api/extra", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", studentId: id }),
      }),
      d = await r.json();
    setMessage(d.message || d.error);
    if (r.ok)
      setAttempt({
        ...attempt,
        extra_status: "pending",
        extra_requested_at: Date.now(),
      });
  }
  function stepMissing(s) {
    const items = [];
    if (s === 1) {
      if (!answers.won) items.push("‘원화 가치’ 버튼을 선택하세요.");
      if (!answers.dollar) items.push("‘달러 가치’ 버튼을 선택하세요.");
      if (!answers.cost) items.push("‘100달러 상품 구매 비용’ 버튼을 선택하세요.");
    }
    if (s === 2) {
      const groupCount = Object.keys(answers.groups || {}).length;
      if (groupCount < 8) items.push(`집단 분류 버튼이 ${8-groupCount}개 남았습니다.`);
      const exportCount = String(answers.exportReason || "").trim().length;
      const importCount = String(answers.importReason || "").trim().length;
      if (exportCount < 30) items.push(`수출기업 이유가 ${30-exportCount}자 부족합니다. (현재 ${exportCount}/30자)`);
      if (importCount < 30) items.push(`수입기업 이유가 ${30-importCount}자 부족합니다. (현재 ${importCount}/30자)`);
    }
    if (s === 3 && answers.effects?.length !== 2)
      items.push(`경제적 영향 버튼을 정확히 2개 선택하세요. (현재 ${answers.effects?.length || 0}개)`);
    if (s === 4) {
      if (answers.policies?.length !== 2) items.push(`정책 버튼을 정확히 2개 선택하세요. (현재 ${answers.policies?.length || 0}개)`);
      const effectCount = String(answers.policyEffect || "").trim().length;
      const riskCount = String(answers.policyRisk || "").trim().length;
      if (effectCount < 30) items.push(`정책의 기대 효과가 ${30-effectCount}자 부족합니다. (현재 ${effectCount}/30자)`);
      if (riskCount < 30) items.push(`정책의 부작용이 ${30-riskCount}자 부족합니다. (현재 ${riskCount}/30자)`);
    }
    if (s === 5) {
      const reportCount = String(answers.report || "").trim().length;
      if (reportCount < 120) items.push(`최종 대응 보고서가 ${120-reportCount}자 부족합니다. (현재 ${reportCount}/120자)`);
    }
    return items;
  }
  function change(k, v) {
    const a = { ...answers, [k]: v };
    setAnswers(a);
    setValidationMessage("");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => save(a, step), 700);
  }
  function nested(k, id2, v) {
    change(k, { ...(answers[k] || {}), [id2]: v });
  }
  function next() {
    if (moving || submitting) return;
    const missing = stepMissing(step);
    if (missing.length) {
      setValidationMessage(`다음 단계로 넘어가려면 아래 항목을 확인하세요.\n• ${missing.join("\n• ")}`);
      return;
    }
    const invalid = findRepeatedNarrative(answers, step);
    if (invalid) {
      showRepeatProblem(invalid);
      return;
    }
    setMoving(true);
    setValidationMessage("");
    const n = Math.min(5, step + 1);
    setStep(n);
    window.clearTimeout(saveTimer.current);
    save(answers, n);
    scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setMoving(false), 400);
  }
  function back() {
    setValidationMessage("");
    setStep(Math.max(1, step - 1));
    scrollTo({ top: 0, behavior: "smooth" });
  }
  function showRepeatProblem(problem) {
    setStep(problem.step);
    setValidationMessage(`${problem.label}: ${REPETITION_MESSAGE}`);
    setTimeout(() => {
      const el = document.querySelector(
        `[data-answer-field="${problem.field}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 80);
  }
  async function submit(type = "normal") {
    if (submitting) return;
    if (type === "normal") {
      for (let s = 1; s <= 5; s++) {
        const missing = stepMissing(s);
        if (missing.length) {
          setStep(s);
          setValidationMessage(`${s}단계 확인:\n• ${missing.join("\n• ")}`);
          scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
      const repeated = findRepeatedNarrative(answers);
      if (repeated) {
        showRepeatProblem(repeated);
        return;
      }
      if (
        !confirm(
          "\uBAA8\uB4E0 \uD544\uC218 \uD56D\uBAA9\uC744 \uC791\uC131\uD588\uC2B5\uB2C8\uB2E4. \uC81C\uCD9C \uD6C4\uC5D0\uB3C4 \uC218\uD589\uC2DC\uAC04 \uC548\uC5D0\uB294 \uB2E4\uC2DC \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC81C\uCD9C\uD560\uAE4C\uC694?",
        )
      )
        return;
    }
    window.clearTimeout(saveTimer.current);
    setSubmitting(true);
    setMessage(
      "\uB2F5\uC548\uC744 \uC81C\uCD9C\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824 \uC8FC\uC138\uC694.",
    );
    try {
      const r = await fetch("/api/exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          studentId: id,
          answers,
          currentStep: 5,
          submissionType: type,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setAttempt({
          ...attempt,
          status: "submitted",
          submitted_at: Date.now(),
          submission_type: type,
        });
        setMessage("");
      } else if (d.repeated) showRepeatProblem(d.repeated);
      else
        setMessage(
          d.missing?.length
            ? `\uBBF8\uC644\uC131: ${d.missing.join(", ")}`
            : d.error,
        );
    } finally {
      setSubmitting(false);
    }
  }
  async function editAfterSubmit() {
    const r = await fetch("/api/exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reopen_self", studentId: id, name }),
      }),
      d = await r.json();
    if (!r.ok) return setMessage(d.error);
    setAttempt(d.attempt);
    setStep(Math.min(5, Math.max(1, d.attempt.current_step || 5)));
    setMessage(
      "\uC81C\uCD9C\uD55C \uB2F5\uC548\uC744 \uB2E4\uC2DC \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    );
  }
  const progress = Math.round((step / 5) * 100),
    clock =
      left < 0
        ? "\uACC4\uC0B0 \uC911"
        : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`,
    helpOptions = {
      1: [
        "\uD658\uC728\uC774 \uC624\uB97C \uB54C \uC6D0\uD654\uC640 \uB2EC\uB7EC \uAC00\uCE58\uAC00 \uD5F7\uAC08\uB824\uC694",
        "\uC0C1\uD488 \uAD6C\uB9E4 \uBE44\uC6A9 \uACC4\uC0B0\uC774 \uC5B4\uB824\uC6CC\uC694",
        "\uBB38\uD56D\uC758 \uB73B\uC744 \uC774\uD574\uD558\uAE30 \uC5B4\uB824\uC6CC\uC694",
      ],
      2: [
        "\uC720\uB9AC\uD55C \uC9D1\uB2E8\uACFC \uBD88\uB9AC\uD55C \uC9D1\uB2E8\uC744 \uAD6C\uBD84\uD558\uAE30 \uC5B4\uB824\uC6CC\uC694",
        "\uC218\uCD9C\uAE30\uC5C5\uC774 \uC720\uB9AC\uD55C \uC774\uC720\uB97C \uC4F0\uAE30 \uC5B4\uB824\uC6CC\uC694",
        "\uC218\uC785\uAE30\uC5C5\uC774 \uBD88\uB9AC\uD55C \uC774\uC720\uB97C \uC4F0\uAE30 \uC5B4\uB824\uC6CC\uC694",
      ],
      3: [
        "\uACBD\uC81C\uC801 \uC601\uD5A5\uC774 \uC774\uC5B4\uC9C0\uB294 \uC21C\uC11C\uB97C \uC774\uD574\uD558\uAE30 \uC5B4\uB824\uC6CC\uC694",
        "\uD575\uC2EC \uACB0\uACFC \uB450 \uAC00\uC9C0\uB97C \uACE0\uB974\uAE30 \uC5B4\uB824\uC6CC\uC694",
      ],
      4: [
        "\uC815\uCC45 \uB450 \uAC00\uC9C0\uB97C \uC120\uD0DD\uD558\uAE30 \uC5B4\uB824\uC6CC\uC694",
        "\uC815\uCC45\uC758 \uAE30\uB300 \uD6A8\uACFC\uB97C \uC4F0\uAE30 \uC5B4\uB824\uC6CC\uC694",
        "\uC815\uCC45\uC758 \uBD80\uC791\uC6A9\uC744 \uC4F0\uAE30 \uC5B4\uB824\uC6CC\uC694",
      ],
      5: [
        "\uBCF4\uACE0\uC11C\uC758 \uC2DC\uC791 \uBB38\uC7A5\uC744 \uC4F0\uAE30 \uC5B4\uB824\uC6CC\uC694",
        "\uC815\uCC45\uACFC \uC774\uC720\uB97C \uC5F0\uACB0\uD558\uAE30 \uC5B4\uB824\uC6CC\uC694",
        "\uD6A8\uACFC\uC640 \uBD80\uC791\uC6A9\uC744 \uD568\uAED8 \uC815\uB9AC\uD558\uAE30 \uC5B4\uB824\uC6CC\uC694",
      ],
    };
  if (!logged)
    return (
      <main className="app-shell">
        <div className="login-card">
          <a href="/" className="backlink">
            ← 처음으로
          </a>
          <div className="eyebrow">학생용 · v3.0</div>
          <h1>
            환율 비상!
            <br />
            국제경제 대응팀
          </h1>
          <p>
            교사가 서버를 연 뒤 학번과 이름으로 입장하세요. 활동 미리보기와
            설명을 확인한 후, 교사가 모든 학생의 수행평가를 동시에 시작합니다.
          </p>
          <form onSubmit={login}>
            <label>
              학번
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="예: 30101"
              />
            </label>
            <label>
              이름
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름"
              />
            </label>
            <button className="primary" type="submit" disabled={loggingIn} aria-busy={loggingIn}>
              {loggingIn ? "입장 확인 중…" : "입장하고 대기하기"}
            </button>
          </form>
          {message && <div className="error">{message}</div>}
        </div>
      </main>
    );
  if (!attempt?.started_at)
    return (
      <main className="preview-shell">
        <section className="preview-card waiting-card" aria-live="polite">
          <div className="waiting-status">
            <span className="waiting-pulse" aria-hidden="true" />
            입장 완료 · 교사 설명 듣는 중
          </div>
          <div className="eyebrow">학생 대기 화면 · v3.0</div>
          <h1>잠시만 기다려 주세요</h1>
          <p className="preview-lead">
            <b>
              {id === "000000"
                ? `\uAD50\uC0AC \uC2DC\uBC94 \xB7 ${name}`
                : `${id} ${name}`}
            </b>
            <br />
            로그인이 완료되었습니다. 화면을 그대로 두고 선생님의 설명을
            들어주세요.
          </p>
          <div className="waiting-guide">
            <article className="done">
              <span>1</span>
              <div><b>로그인 완료</b><small>학번과 이름이 확인되었습니다.</small></div>
            </article>
            <article className="now">
              <span>2</span>
              <div><b>교사 설명 듣기</b><small>수행 방법과 주의사항을 확인하세요.</small></div>
            </article>
            <article>
              <span>3</span>
              <div><b>수행평가 시작</b><small>교사가 시작하면 자동으로 화면이 전환됩니다.</small></div>
            </article>
          </div>
          <div className="preview-time">
            <span>
              {setting?.is_makeup
                ? "\uBCF4\uCDA9\uD3C9\uAC00 \uC218\uD589\uC2DC\uAC04"
                : "\uACF5\uD1B5 \uC218\uD589\uC2DC\uAC04"}
            </span>
            <b>{setting?.duration_minutes || 45}분</b>
            <small>
              교사가 수행 시작 버튼을 누르기 전에는 시간이 줄지 않습니다.
            </small>
          </div>
          <div className="preview-scenario">
            <b>오늘의 활동</b>
            <p>
              한빛국의 원·달러 환율이 급등한 상황에서 경제적 영향을 판단하고,
              정부 정책을 결정하여 대응 보고서를 작성합니다.
            </p>
          </div>
          <div className="preview-steps">
            <article>
              <b>1</b>
              <span>환율 변화 판단</span>
            </article>
            <article>
              <b>2</b>
              <span>집단별 유리·불리 분석</span>
            </article>
            <article>
              <b>3</b>
              <span>경제적 영향 연결</span>
            </article>
            <article>
              <b>4</b>
              <span>정부 정책 2개 결정</span>
            </article>
            <article>
              <b>5</b>
              <span>최종 대응 보고서 작성</span>
            </article>
          </div>
          <div className="preview-notes">
            <p>✓ 교사가 시작하면 반 학생 모두의 시간이 동시에 줄어듭니다.</p>
            <p>✓ 늦게 입장하더라도 추가 시간이 주어지지 않습니다.</p>
            <p>
              ✓ 새로고침하거나 다시 접속해도 공통 시작 시각과 답안이 유지됩니다.
            </p>
            <p>
              ✓ 종료 5분 전부터 추가시간을 요청할 수 있으며, 실제 사용 시 감점될
              수 있습니다.
            </p>
            <p>
              ✓ 최종 보고서는 120자 이상이며, 180자를 넘어도 작성할 수 있습니다.
            </p>
          </div>
          <button className="primary preview-start" disabled>
            {setting?.status === "paused"
              ? "\uC218\uC5C5 \uC77C\uC2DC\uC815\uC9C0 \uC911"
              : "선생님의 시작 신호를 기다리는 중…"}
          </button>
          {message && <div className="error">{message}</div>}
        </section>
      </main>
    );
  if (submitted)
    return (
      <main className="app-shell">
        <div className="login-card success">
          <div className="coin-mark">✓</div>
          <h1>
            {attempt?.extra_status === "pending"
              ? "\uAE30\uBCF8\uC2DC\uAC04 \uB2F5\uC548\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4"
              : "\uC81C\uCD9C\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4"}
          </h1>
          <p>
            {attempt?.extra_status === "pending"
              ? "\uCD94\uAC00\uC2DC\uAC04 \uC2B9\uC778 \uC694\uCCAD\uC744 \uAD50\uC0AC\uAC00 \uD655\uC778 \uC911\uC785\uB2C8\uB2E4. \uC2B9\uC778\uB418\uBA74 \uC774 \uD654\uBA74\uC774 \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC5F4\uB9BD\uB2C8\uB2E4."
              : `${name} \uD559\uC0DD\uC758 \uB2F5\uC548\uC774 \uC11C\uBC84\uC5D0 \uC548\uC804\uD558\uAC8C \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`}
          </p>
          <small>
            {Number(attempt?.extra_penalty) > 0
              ? `\uCD94\uAC00\uC2DC\uAC04 \uC0AC\uC6A9 \uAC10\uC810: -${attempt.extra_penalty}\uC810`
              : attempt?.extra_penalty_exempt
                ? "\uAE30\uC220 \uBB38\uC81C \uBCF4\uC0C1\uC2DC\uAC04\uC73C\uB85C \uAC10\uC810\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."
                : "\uC218\uD589\uC2DC\uAC04\uC774 \uB0A8\uC544 \uC788\uACE0 \uBC18 \uC11C\uBC84\uAC00 \uC5F4\uB824 \uC788\uC73C\uBA74 \uC81C\uCD9C\uD55C \uB2F5\uC548\uC744 \uB2E4\uC2DC \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}
          </small>
          {attempt?.extra_status !== "pending" && (
            <button
              className="primary edit-after-submit"
              onClick={editAfterSubmit}
            >
              제출한 답안 다시 수정하기
            </button>
          )}
          {message && <div className="error">{message}</div>}
        </div>
      </main>
    );
  return (
    <main className="student-shell">
      <header className="student-top">
        <div>
          <b>환율 비상!</b>
          <span>
            {id === "000000"
              ? `\uAD50\uC0AC \uC2DC\uBC94 \xB7 ${name}`
              : `${id} ${name}`}
          </span>
        </div>
        <div className={"timer " + (left < 300 ? "danger" : "")}>
          {setting?.status === "paused" ? "\uC77C\uC2DC\uC815\uC9C0" : clock}
        </div>
      </header>
      <div className="progress">
        <i style={{ width: progress + "%" }} />
        <span>
          {step}/5단계 · {progress}%
        </span>
      </div>
      <section className="scenario">
        <b>한빛국 경제 브리핑</b>
        <p>
          최근 1달러당 1,380원 안팎이던 원·달러 환율이 짧은 기간에 1,550원까지
          급등했습니다. 해외 자금 유출로 달러 수요가 커지고, 석유와 원자재의
          원화 환산 가격이 오르면서 기업의 생산비와 국내 물가도 상승하고
          있습니다.
        </p>
      </section>
      <section className="task-card">
        {step === 1 && (
          <>
            <Step n="1" title="환율 변화 읽기" />
            <p className="guide">
              1달러당 1,380원에서 1,550원으로 오른 상황을 기준으로 각 문장을
              완성하세요.
            </p>
            <Choice
              q="원화 가치는"
              v={answers.won}
              set={(v) => change("won", v)}
              opts={["\uC0C1\uC2B9", "\uD558\uB77D"]}
            />
            <Choice
              q="달러 가치는"
              v={answers.dollar}
              set={(v) => change("dollar", v)}
              opts={["\uC0C1\uC2B9", "\uD558\uB77D"]}
            />
            <Choice
              q="100달러 상품 구매에 필요한 원화는"
              v={answers.cost}
              set={(v) => change("cost", v)}
              opts={[
                "\uC99D\uAC00",
                "\uAC10\uC18C",
                "\uBCC0\uD654 \uC5C6\uC74C",
              ]}
            />
          </>
        )}
        {step === 2 && (
          <>
            <Step n="2" title="누가 유리하고 불리할까?" />
            <p className="guide">환율 상승의 영향을 분류하세요.</p>
            {groupItems.map(([k, t]) => (
              <Choice
                key={k}
                q={t}
                v={answers.groups[k]}
                set={(v) => nested("groups", k, v)}
                opts={[
                  "\uC720\uB9AC",
                  "\uBD88\uB9AC",
                  "\uC0C1\uD669\uC5D0 \uB530\uB77C \uB2E4\uB984",
                ]}
              />
            ))}
            <Text
              field="exportReason"
              q="수출기업이 유리해질 수 있는 이유"
              v={answers.exportReason || ""}
              set={(v) => change("exportReason", v)}
              min={30}
            />
            <Text
              field="importReason"
              q="수입기업이 불리해질 수 있는 이유"
              v={answers.importReason || ""}
              set={(v) => change("importReason", v)}
              min={30}
            />
          </>
        )}
        {step === 3 && (
          <>
            <Step n="3" title="영향의 흐름 연결하기" />
            <p className="guide">
              아래 흐름을 읽고 핵심 결과 2개를 선택하세요.
            </p>
            <div className="flow">
              환율 상승 → 수입 원자재 가격 상승 → 기업 생산비 증가 → 국내 물가
              상승 → 소비자 부담 증가
            </div>
            {[
              "\uC218\uC785 \uBB3C\uAC00 \uC0C1\uC2B9",
              "\uB2EC\uB7EC \uD45C\uC2DC \uBD80\uCC44 \uBD80\uB2F4 \uC99D\uAC00",
              "\uBAA8\uB4E0 \uAE30\uC5C5\uC758 \uC218\uC775 \uC99D\uAC00",
              "\uD574\uC678\uC5EC\uD589 \uBE44\uC6A9 \uAC10\uC18C",
              "\uC678\uD654 \uBD80\uC871 \uC2EC\uD654",
            ].map((x) => (
              <Check
                key={x}
                text={x}
                checked={(answers.effects || []).includes(x)}
                set={() => {
                  const z = answers.effects || [];
                  change(
                    "effects",
                    z.includes(x)
                      ? z.filter((v) => v !== x)
                      : z.length < 2
                        ? [...z, x]
                        : z,
                  );
                }}
              />
            ))}
          </>
        )}
        {step === 4 && (
          <>
            <Step n="4" title="정부 대응책 결정하기" />
            <p className="guide">
              가장 필요하다고 판단한 정책을 정확히 2개 선택하세요.
            </p>
            {policyItems.map((x) => (
              <Check
                key={x}
                text={x}
                checked={answers.policies.includes(x)}
                set={() => {
                  const z = answers.policies;
                  change(
                    "policies",
                    z.includes(x)
                      ? z.filter((v) => v !== x)
                      : z.length < 2
                        ? [...z, x]
                        : z,
                  );
                }}
              />
            ))}
            <Text
              field="policyEffect"
              q="선택한 정책의 기대 효과"
              v={answers.policyEffect || ""}
              set={(v) => change("policyEffect", v)}
              min={30}
            />
            <Text
              field="policyRisk"
              q="발생할 수 있는 부작용"
              v={answers.policyRisk || ""}
              set={(v) => change("policyRisk", v)}
              min={30}
            />
          </>
        )}
        {step === 5 && (
          <>
            <Step n="5" title="최종 검토 및 대응 보고서" />
            <details className="answer-review" open>
              <summary>나의 결정 전체보기</summary>
              <div>
                <p>
                  <b>환율 판단:</b> 원화 {answers.won || "\uBBF8\uC120\uD0DD"} ·
                  달러 {answers.dollar || "\uBBF8\uC120\uD0DD"} · 구매비용{" "}
                  {answers.cost || "\uBBF8\uC120\uD0DD"}
                </p>
                <p>
                  <b>집단 판단:</b>{" "}
                  {Object.entries(answers.groups || {})
                    .map(
                      ([k, v]) =>
                        `${groupItems.find((x) => x[0] === k)?.[1] || k}(${v})`,
                    )
                    .join(", ") || "\uBBF8\uC120\uD0DD"}
                </p>
                <p>
                  <b>경제 영향:</b>{" "}
                  {(answers.effects || []).join(", ") || "\uBBF8\uC120\uD0DD"}
                </p>
                <p>
                  <b>정책:</b>{" "}
                  {answers.policies.join(", ") || "\uBBF8\uC120\uD0DD"}
                </p>
                <p>
                  <b>기대 효과:</b>{" "}
                  {answers.policyEffect || "\uBBF8\uC791\uC131"}
                </p>
                <p>
                  <b>부작용:</b> {answers.policyRisk || "\uBBF8\uC791\uC131"}
                </p>
              </div>
            </details>
            <Text
              field="report"
              q="최종 대응 보고서"
              v={answers.report || ""}
              set={(v) => change("report", v)}
              min={120}
              rows={7}
              placeholder="최소 120자 이상 작성하세요. 180자를 넘어도 계속 입력하고 제출할 수 있습니다."
            />
            <div className="self-check">
              <b>제출 전 스스로 확인하세요</b>
              <p>
                보고서에 실제로 포함했을 때만 직접 체크하세요. 체크 여부는
                내용의 정확성을 자동 판정하지 않습니다.
              </p>
              {[
                [
                  "problem",
                  "\uD658\uC728 \uBCC0\uD654\uC640 \uAC00\uC7A5 \uC2DC\uAE09\uD55C \uBB38\uC81C\uB97C \uC124\uBA85\uD588\uB2E4",
                ],
                [
                  "policies",
                  "\uC120\uD0DD\uD55C \uC815\uCC45 2\uAC1C\uC640 \uC120\uD0DD \uC774\uC720\uB97C \uC37C\uB2E4",
                ],
                [
                  "tradeoff",
                  "\uAE30\uB300 \uD6A8\uACFC\uC640 \uC608\uC0C1 \uBD80\uC791\uC6A9\uC744 \uD568\uAED8 \uC37C\uB2E4",
                ],
              ].map(([k, t]) => (
                <Check
                  key={k}
                  text={t}
                  checked={Boolean(answers.reportChecklist?.[k])}
                  set={() =>
                    nested("reportChecklist", k, !answers.reportChecklist?.[k])
                  }
                />
              ))}
            </div>
          </>
        )}
      </section>
      <div className="student-fabs">
        {id !== "000000" &&
          left >= 0 &&
          left <= 300 &&
          (!attempt?.extra_status || attempt.extra_status === "none") && (
            <button className="extra-time-fab" onClick={requestExtra}>
              추가시간 요청<small>사용 시 -2점/-4점</small>
            </button>
          )}
        {attempt?.extra_status === "pending" && (
          <button className="extra-time-fab pending" disabled>
            추가시간 승인 대기
          </button>
        )}
        {attempt?.extra_status === "approved" && (
          <span className="extra-approved">
            추가 {attempt.extra_granted_minutes}분 승인 ·{" "}
            {attempt.extra_penalty_exempt
              ? "\uAC10\uC810 \uC5C6\uC74C"
              : "\uC0AC\uC6A9 \uC2DC \uAC10\uC810"}
          </span>
        )}
        <button
          className={"help-fab " + (helpActive ? "active" : "")}
          onClick={() => {
            setHelpChoice("");
            setHelpOpen(true);
          }}
        >
          {helpActive
            ? "\uB3C4\uC6C0 \uC694\uCCAD \uC804\uB2EC\uB428"
            : "\uB3C4\uC6C0 \uC694\uCCAD"}
        </button>
      </div>
      <footer className="student-actions">
        <button onClick={back} disabled={step === 1 || moving || submitting}>
          이전
        </button>
        <span>
          {submitting
            ? "\uC81C\uCD9C \uCC98\uB9AC \uC911\u2026"
            : saved
              ? `${saved} \uC800\uC7A5 \uC644\uB8CC`
              : "\uC790\uB3D9 \uC800\uC7A5 \uC911"}
        </span>
        {step < 5 ? (
          <button
            className="primary"
            disabled={moving || submitting}
            aria-busy={moving}
            onClick={next}
          >
            {moving ? "처리 중…" : "다음"}
          </button>
        ) : (
          <button
            className="submit"
            disabled={moving || submitting}
            aria-busy={moving || submitting}
            onClick={() => submit()}
          >
            {moving
              ? "처리 중…"
              : submitting
              ? "\uC81C\uCD9C \uC911\u2026"
              : "\uCD5C\uC885 \uC81C\uCD9C"}
          </button>
        )}
      </footer>
      {validationMessage && (
        <div className="validation-notice" role="alert">
          <button type="button" aria-label="안내 닫기" onClick={() => setValidationMessage("")}>×</button>
          {validationMessage}
        </div>
      )}
      {helpOpen && (
        <div className="help-modal">
          <div>
            <h2>교사에게 도움 요청</h2>
            <p>
              현재 <b>{step}단계</b>에서 가장 가까운 어려움을 선택하세요.
            </p>
            <div className="help-choice-list">
              {helpOptions[step].map((x) => (
                <button
                  type="button"
                  className={helpChoice === x ? "selected" : ""}
                  onClick={() => setHelpChoice(x)}
                  key={x}
                >
                  {x}
                </button>
              ))}
            </div>
            <section>
              <button onClick={() => setHelpOpen(false)}>취소</button>
              <button
                className="primary"
                disabled={!helpChoice}
                onClick={requestHelp}
              >
                교사에게 보내기
              </button>
            </section>
          </div>
        </div>
      )}
      {message && <div className="toast">{message}</div>}
    </main>
  );
}
function Step({ n, title }) {
  const help = {
    "1": (
      <>
        <b>먼저 알아둘 개념</b>
        <p>
          <strong>환율</strong>은 서로 다른 두 나라의 돈을 바꾸는 비율입니다.
          원·달러 환율이 1,380원이라는 말은 1달러를 얻는 데 1,380원이 필요하다는
          뜻입니다.
        </p>
        <div className="example">
          <span>숫자로 보기</span>
          <p>
            100달러 상품은 환율이 1,380원일 때 13만 8천 원이지만, 1,550원이 되면
            15만 5천 원이 필요합니다. 같은 상품을 사는 데 원화가 1만 7천 원 더
            필요해진 것입니다.
          </p>
        </div>
        <p>
          <strong>화폐 가치</strong>는 그 돈으로 다른 나라의 돈이나 물건을
          얼마나 살 수 있는지를 나타냅니다. 환율 숫자가 1,380원에서 1,550원으로
          오르면 1달러를 사는 데 더 많은 원화가 필요하므로 원화 가치는 하락하고
          달러 가치는 상승한 것으로 판단합니다.
        </p>
      </>
    ),
    "2": (
      <>
        <b>유리함과 불리함을 판단하는 방법</b>
        <p>
          <strong>수출</strong>은 국내 상품을 외국에 파는 것이고,{" "}
          <strong>수입</strong>은 외국 상품이나 원자재를 국내로 들여오는
          것입니다. 달러로 돈을 받는 집단인지, 달러를 지급해야 하는 집단인지
          먼저 확인하세요.
        </p>
        <div className="example">
          <span>생활 속 예시</span>
          <p>
            해외여행객과 유학생은 현지에서 쓸 달러가 필요합니다. 반면 외국인
            관광객은 달러를 원화로 바꿔 사용합니다. 기업도 수출만 하는지, 수입
            원료도 함께 사용하는지에 따라 결과가 달라질 수 있습니다.
          </p>
        </div>
      </>
    ),
    "3": (
      <>
        <b>경제 현상은 차례로 이어집니다</b>
        <p>
          <strong>원자재</strong>는 상품을 만드는 데 필요한 석유·철광석·곡물
          같은 재료입니다. 이를 해외에서 들여오는 비용이 오르면 기업의 생산비가
          증가하고, 그 부담이 상품 가격과 소비자에게 이어질 수 있습니다.
        </p>
        <p>
          <strong>외화 부족</strong>은 달러처럼 국제거래에 필요한 외국 돈이
          충분하지 않은 상태입니다. 달러로 빌린 돈은 갚을 때도 달러가 필요하므로
          환율 변화가 상환 부담에 영향을 줍니다.
        </p>
      </>
    ),
    "4": (
      <>
        <b>좋은 정책에도 비용과 부작용이 있습니다</b>
        <p>
          <strong>외환시장</strong>은 원화와 달러 같은 여러 나라의 돈이 거래되는
          시장입니다. 정부가 달러를 공급하면 급격한 환율 변화를 완화할 수 있지만
          보유한 달러가 줄 수 있습니다.
        </p>
        <div className="term-grid">
          <p>
            <strong>기준금리 인상</strong>
            <br />
            자금 유출을 줄이는 데 도움이 될 수 있지만 가계와 기업의 이자 부담이
            커질 수 있습니다.
          </p>
          <p>
            <strong>가격 지원</strong>
            <br />
            소비자의 생활비 부담을 낮출 수 있지만 정부 재정이 더 필요합니다.
          </p>
          <p>
            <strong>기업 긴급대출</strong>
            <br />
            기업의 당장 필요한 자금을 돕지만 빚이 늘어날 수 있습니다.
          </p>
          <p>
            <strong>수입 제한</strong>
            <br />
            외화 지출을 줄일 수 있지만 물품 부족과 무역 갈등이 발생할 수
            있습니다.
          </p>
        </div>
        <p>
          정책을 고를 때는 “누가 도움을 받는가?”와 “그 대신 어떤 부담이
          생기는가?”를 함께 살펴보세요.
        </p>
      </>
    ),
    "5": (
      <>
        <b>보고서는 판단의 연결이 중요합니다</b>
        <p>
          길게 쓰는 것보다 <strong>문제 → 정책 → 기대 효과 → 부작용</strong>이
          자연스럽게 이어지도록 작성하세요. 앞에서 선택한 내용을 그대로 나열하지
          말고, 왜 그 선택이 필요한지 한 문장씩 연결하면 됩니다.
        </p>
        <div className="example">
          <span>작성 순서</span>
          <p>
            ① 가장 시급한 문제를 밝힙니다. ② 선택한 정책 두 가지와 이유를
            씁니다. ③ 도움을 받는 집단과 예상되는 부작용을 씁니다. ④ 정책들이
            문제 해결에 어떻게 연결되는지 정리합니다.
          </p>
        </div>
      </>
    ),
  };
  return (
    <>
      <div className="step-title">
        <span>{n}</span>
        <h2>{title}</h2>
      </div>
      <LearningSupport step={n} />
    </>
  );
}
function LearningSupport({ step }) {
  const [hintCount, setHintCount] = useState(0);
  useEffect(() => setHintCount(0), [step]);
  const cards = {
    "1": {
      concept:
        "환율 상승은 같은 1달러를 사기 위해 더 많은 원화가 필요해졌다는 뜻입니다. 달러의 원화 가격과 두 화폐의 가치 변화를 구분해 보세요.",
      hints: [
        "1달러를 사는 데 필요한 원화가 이전보다 늘었는지 먼저 비교하세요.",
        "달러의 원화 가격이 올랐다면 달러로 살 수 있는 원화의 양은 어떻게 달라질지 생각해 보세요.",
        "100달러 상품의 가격을 ‘100×이전 환율’과 ‘100×현재 환율’로 각각 계산해 비교하세요.",
      ],
    },
    "2": {
      concept:
        "먼저 각 집단이 달러를 받는지, 달러를 사서 지급하는지 확인하세요. 달러 수입과 달러 지출은 환율 상승의 영향을 서로 다르게 받습니다.",
      hints: [
        "해외에 물건을 파는 경우와 해외에서 물건을 사 오는 경우의 돈 이동 방향을 구분하세요.",
        "해외여행객·유학생·달러 부채 기업은 필요한 달러를 어떤 돈으로 마련하는지 생각해 보세요.",
        "수출과 수입을 모두 하는 기업은 수출 대금 증가와 수입 비용 증가를 함께 비교해야 합니다.",
      ],
    },
    "3": {
      concept:
        "환율 상승은 수입품 가격, 달러로 갚는 빚, 국내의 달러 부족에 영향을 줄 수 있습니다. 원인에서 결과로 이어지는 순서를 살펴보세요.",
      hints: [
        "수입 원자재를 사려면 달러가 필요하다는 점에서 출발하세요.",
        "원자재 비용이 오르면 기업의 생산비와 국내 상품 가격에 어떤 변화가 이어질지 생각해 보세요.",
        "달러로 빌린 돈은 갚을 때도 달러가 필요합니다. 같은 빚을 갚는 데 필요한 원화를 비교하세요.",
      ],
    },
    "4": {
      concept:
        "정책은 모든 문제를 한 번에 해결하지 못합니다. 어떤 문제를 줄이는지와 새롭게 생길 수 있는 부담을 함께 비교하세요.",
      hints: [
        "달러 공급, 금리 조정, 가격 지원, 기업 대출이 각각 가장 먼저 바꾸는 대상을 찾아보세요.",
        "각 정책으로 가장 먼저 도움을 받는 집단이 누구인지 생각해 보세요.",
        "정부 재정, 대출 이자, 기업 부채, 물품 부족 중 새롭게 커질 수 있는 부담이 있는지 확인하세요.",
      ],
    },
    "5": {
      concept:
        "최종 보고서에는 현재 환율 상황, 영향을 받는 집단, 선택한 정책의 효과와 부작용이 모두 포함되어야 합니다.",
      hints: [
        "현재 환율이 어느 방향으로 움직였는지 정확히 적었는지 확인하세요.",
        "유리한 집단과 불리한 집단을 각각 한 집단 이상 설명했는지 확인하세요.",
        "정책의 기대 효과뿐 아니라 부작용이나 부담도 포함했는지 확인하세요.",
      ],
    },
  };
  const card = cards[String(step)];
  return (
    <div className="learning-support">
      <div className="core-concept">
        <b>핵심 개념</b>
        <p>{card.concept}</p>
      </div>
      <div className="progressive-hints">
        <div>
          <b>조금 더 도움이 필요한가요?</b>
          <small>힌트는 정답을 알려주지 않고 생각할 순서만 안내합니다.</small>
        </div>
        {card.hints.slice(0, hintCount).map((hint, index) => (
          <p key={hint}>
            <span>힌트 {index + 1}</span>
            {hint}
          </p>
        ))}
        {hintCount < card.hints.length ? (
          <button
            type="button"
            className="hint-button"
            onClick={() => setHintCount((count) => count + 1)}
          >
            {hintCount === 0 ? "힌트가 필요해요" : "다음 힌트 보기"}
          </button>
        ) : (
          <small className="all-hints-open">이 단계의 힌트를 모두 확인했습니다.</small>
        )}
      </div>
    </div>
  );
}
function Choice({ q, v, set, opts }) {
  return (
    <div className="question">
      <b>{q}</b>
      <div className="choices">
        {opts.map((x) => (
          <button
            type="button"
            className={v === x ? "selected" : ""}
            onClick={() => set(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}
function Text({ field, q, v, set, min, rows = 3, placeholder }) {
  const count = v.trim().length,
    ok = count >= min,
    invalid = ok && isMeaninglessRepetition(v);
  return (
    <label className="textq">
      {q}
      <span className={"length-guide " + (invalid ? "invalid" : ok ? "met" : "short")}>
        {invalid
          ? "⚠ 의미 있는 문장으로 수정 필요"
          : ok
          ? `\u2713 \uCD5C\uC18C ${min}\uC790 \uCDA9\uC871`
          : `${count}/${min}\uC790 \xB7 \uCD5C\uC18C ${min}\uC790 \uD544\uC694`}
      </span>
      <textarea
        data-answer-field={field}
        className={invalid ? "length-invalid" : ok ? "length-met" : "length-short"}
        rows={rows}
        value={v}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder || `\uC774\uC720\uAC00 \uB4DC\uB7EC\uB098\uB3C4\uB85D \uCD5C\uC18C ${min}\uC790 \uC774\uC0C1 \uC791\uC131\uD558\uC138\uC694.`}
      />
    </label>
  );
}
function Check({ text, checked, set }) {
  return (
    <button
      type="button"
      className={"check " + (checked ? "checked" : "")}
      onClick={set}
    >
      <span>{checked ? "\u2713" : ""}</span>
      {text}
    </button>
  );
}
export { Student as default };
