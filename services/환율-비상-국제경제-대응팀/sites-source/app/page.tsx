export default function Home() {
  return <main className="home-shell"><div className="home-card">
    <div className="eyebrow">환율과 국제경제 · 4단원</div><div className="coin-mark">₩ ↔ $</div>
    <h1>환율 비상!<br/><span>국제경제 대응팀</span></h1>
    <p>환율 급등이 생활과 기업에 미치는 영향을 분석하고, 가장 적절한 정부 정책을 결정하세요.</p>
    <div className="home-actions"><a id="student-entry" className="primary" href="/student">학생용 시작하기</a><a id="teacher-entry" className="secondary" href="/teacher">교사용 관리하기</a></div>
    <small>공통 45분 타이머 · 실시간 운영 관리 · 모바일 지원 · v3.0</small>
  </div></main>;
}
