// 인권도시 수행평가 · 1학년 반별 일정 공지 패치 (2026-09-07)
(function(){
  const HUMAN_RIGHTS_SCHEDULE = [
    {className:'1-1', sessions:[
      {label:'1차시', date:'2026-09-16', display:'9/16(수) 3교시'},
      {label:'2차시', date:'2026-09-17', display:'9/17(목) 6교시'}
    ]},
    {className:'1-2', sessions:[
      {label:'1차시', date:'2026-09-15', display:'9/15(화) 2교시'},
      {label:'2차시', date:'2026-09-18', display:'9/18(금) 3교시'}
    ]},
    {className:'1-3', sessions:[
      {label:'1차시', date:'2026-09-17', display:'9/17(목) 5교시'},
      {label:'2차시', date:'2026-09-18', display:'9/18(금) 5교시'}
    ]},
    {className:'1-4', sessions:[
      {label:'1차시', date:'2026-09-16', display:'9/16(수) 1교시'},
      {label:'2차시', date:'2026-09-17', display:'9/17(목) 1교시'}
    ]},
    {className:'1-5', sessions:[
      {label:'1차시', date:'2026-09-22', display:'9/22(화) 3교시'},
      {label:'2차시', date:'2026-09-29', display:'9/29(화) 3교시'}
    ]},
    {className:'1-6', sessions:[
      {label:'1차시', date:'2026-09-23', display:'9/23(수) 5교시'},
      {label:'2차시', date:'2026-09-30', display:'9/30(수) 5교시'}
    ]},
    {className:'1-7', sessions:[
      {label:'1차시', date:'2026-09-22', display:'9/22(화) 5교시'},
      {label:'2차시', date:'2026-09-29', display:'9/29(화) 5교시'}
    ]}
  ];

  function todayInSeoul(){
    const parts = new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Seoul',
      year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function scheduleHtml(){
    const today = todayInSeoul();
    const rows = HUMAN_RIGHTS_SCHEDULE.map(row=>{
      const hasToday = row.sessions.some(s=>s.date===today);
      const cells = row.sessions.map(s=>{
        const isToday = s.date===today;
        return `<div class="hrScheduleCell ${isToday?'isToday':''}">
          <span class="hrScheduleSession">${s.label}</span>
          <strong>${s.display}</strong>
          ${isToday?'<span class="hrTodayBadge">● 오늘 수행평가</span>':''}
        </div>`;
      }).join('');
      return `<div class="hrScheduleRow ${hasToday?'hasToday':''}">
        <div class="hrScheduleClass">${row.className}</div>${cells}
      </div>`;
    }).join('');

    return `<section class="card hrScheduleCard" aria-label="1학년 통합사회 인권 도시 수행평가 일정">
      <div class="hrScheduleHead">
        <div>
          <div class="kicker">📅 수행평가 일정 안내</div>
          <h2>1학년 통합사회 · 인권 도시 수행평가</h2>
        </div>
        <span class="hrScheduleGuide">자신의 반 일정을 확인하세요.</span>
      </div>
      <div class="hrScheduleTable">
        <div class="hrScheduleHeader">
          <span>반</span><span>1차시</span><span>2차시</span>
        </div>
        ${rows}
      </div>
      <p class="hrScheduleFoot">※ 수행평가는 선생님의 안내에 따라 시작하세요. 당일 일정은 자동으로 강조됩니다.</p>
    </section>`;
  }

  function installStyles(){
    if(document.getElementById('hrScheduleStyles')) return;
    const style = document.createElement('style');
    style.id = 'hrScheduleStyles';
    style.textContent = `
      .hrScheduleCard{border:1px solid #cbdaf0;background:linear-gradient(180deg,#fff 0%,#f8fbff 100%)}
      .hrScheduleHead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}
      .hrScheduleHead h2{margin:4px 0 0;color:#17345f}
      .hrScheduleGuide{font-size:13px;color:#64748b;white-space:nowrap}
      .hrScheduleTable{border:1px solid #d9e3f0;border-radius:14px;overflow:hidden;background:#fff}
      .hrScheduleHeader,.hrScheduleRow{display:grid;grid-template-columns:88px minmax(0,1fr) minmax(0,1fr)}
      .hrScheduleHeader{background:#eef4fb;color:#475569;font-size:12px;font-weight:800}
      .hrScheduleHeader span{padding:10px 12px;text-align:center}
      .hrScheduleRow{border-top:1px solid #e6edf5;transition:.2s ease}
      .hrScheduleClass{display:flex;align-items:center;justify-content:center;font-weight:900;color:#17345f;background:#fbfdff}
      .hrScheduleCell{position:relative;display:flex;align-items:center;gap:8px;min-height:52px;padding:9px 12px;border-left:1px solid #edf2f7;color:#334155}
      .hrScheduleCell strong{font-size:15px}
      .hrScheduleSession{font-size:11px;font-weight:800;color:#5b6f8c;background:#f1f5f9;border-radius:999px;padding:4px 7px;white-space:nowrap}
      .hrScheduleRow.hasToday{outline:2px solid #f59e0b;outline-offset:-2px;background:#fff9eb;box-shadow:inset 4px 0 0 #f59e0b}
      .hrScheduleRow.hasToday .hrScheduleClass{background:#fff5d8;color:#9a4c00}
      .hrScheduleCell.isToday{background:#fff3cd;color:#9a4c00}
      .hrScheduleCell.isToday strong{color:#b45309;font-weight:900}
      .hrScheduleCell.isToday .hrScheduleSession{background:#f59e0b;color:#fff}
      .hrTodayBadge{margin-left:auto;font-size:11px;font-weight:900;color:#b45309;background:#fff;border:1px solid #f59e0b;border-radius:999px;padding:4px 7px;white-space:nowrap}
      .hrScheduleFoot{margin:10px 0 0;font-size:12px;color:#64748b}
      @media(max-width:620px){
        .hrScheduleHead{display:block}
        .hrScheduleGuide{display:block;margin-top:6px}
        .hrScheduleHeader{display:none}
        .hrScheduleTable{border:0;background:transparent;overflow:visible}
        .hrScheduleRow{grid-template-columns:58px 1fr;grid-template-areas:"class first" "class second";margin-top:8px;border:1px solid #dfe7f1;border-radius:12px;overflow:hidden;background:#fff}
        .hrScheduleClass{grid-area:class}
        .hrScheduleCell{min-height:48px;border-left:1px solid #edf2f7}
        .hrScheduleCell:nth-of-type(2){grid-area:first}
        .hrScheduleCell:nth-of-type(3){grid-area:second;border-top:1px solid #edf2f7}
        .hrTodayBadge{font-size:10px;padding:3px 6px}
        .hrScheduleCell strong{font-size:14px}
      }
      @media(max-width:390px){
        .hrScheduleCell{gap:5px;padding:8px}
        .hrScheduleSession{font-size:10px;padding:3px 5px}
        .hrTodayBadge{display:block;margin-left:0}
      }`;
    document.head.appendChild(style);
  }

  if(typeof loginView!=='function') return;
  installStyles();
  const originalLoginView = loginView;
  loginView = function(){
    originalLoginView();
    const loginCard = document.getElementById('sid')?.closest('.card');
    if(loginCard && !document.querySelector('.hrScheduleCard')){
      loginCard.insertAdjacentHTML('beforebegin',scheduleHtml());
    }
  };
})();