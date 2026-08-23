const $=s=>document.querySelector(s);let key='',sessions=[];
const actorRoleLabels={negotiation:'국가 간 협상·합의 조정',finance:'재정·기술 지원',implementation:'정책·기술의 실제 이행',monitoring:'이행 감시·정보 공개',representation:'피해 집단·시민 의견 반영'};
const countryLabels={hanbit:'한빛국',saebom:'새봄국',pureun:'푸른섬국',taeyang:'태양국'};
const priorityLabels={growth:'경제 성장',reduction:'온실가스 감축',energy:'에너지 안정',damage:'기후위기 피해 감소',responsibility:'국제적 책임'};
const budgets={renewable:'재생에너지',disaster:'기후재난',tech:'친환경 기술',forest:'산림',transition:'산업 전환'};
const agreementLabels={A:'A안 동일책임',B:'B안 차등책임',C:'C안 자율감축'};
const actorLabels={state:'개별 국가',un:'UN',org:'국제환경기구',business:'기업',ngo:'NGO',citizen:'시민'};
const evidenceLabels={responsibility:'배출 책임',vulnerability:'기후피해',energy:'에너지·전환'};
const rubricGuides={
 dataAnalysis:{label:'자료 분석',max:15,levels:{15:'선택한 자료의 핵심 사실을 정확히 파악하고 국가 판단과 구체적으로 연결함.',10:'자료의 핵심 사실은 파악했으나 국가 판단과의 연결이 일부 부족함.',5:'자료를 언급했지만 핵심 사실이나 연결이 매우 단순함.',0:'미작성 또는 자료를 근거로 사용하지 않음.'}},
 nationalDecision:{label:'국가 입장 결정',max:15,levels:{15:'국가의 경제·에너지·기후 조건과 우선순위가 일관되며 1차 입장이 분명함.',10:'국가 조건과 우선순위가 대체로 연결되나 일부 설명이 약함.',5:'우선순위는 제시했으나 국가 조건과의 연결이 부족함.',0:'미작성 또는 국가 입장을 확인하기 어려움.'}},
 budgetTradeoff:{label:'예산·TRADE-OFF',max:20,levels:{20:'예산에서 뚜렷한 우선순위가 드러나며 최우선 투자와 감액 판단이 국가 조건과 일관되게 연결됨.',15:'예산과 이유가 대체로 타당하며 감액 판단도 설명했으나 일부 근거가 약함.',10:'예산은 배분했으나 우선순위 또는 감액 판단의 논리가 충분히 드러나지 않음.',5:'형식적으로 배분했으며 이유가 매우 단순함.',0:'미수행.'}},
 international:{label:'국제관계 이해',max:15,levels:{15:'상대 국가의 구체적 산업·에너지·피해 조건을 근거로 이해관계 충돌을 정확히 분석함.',10:'상대 국가의 이해관계를 대체로 설명했으나 근거가 일부 부족함.',5:'반대 국가를 선택했지만 이유가 일반적이거나 추측 수준임.',0:'미작성 또는 상대국 이해관계를 분석하지 못함.'}},
 compromise:{label:'갈등 조정',max:15,levels:{15:'우리 국가와 상대 국가가 각각 양보·수용할 내용을 포함한 현실적인 절충안을 제시함.',10:'절충 방향은 타당하지만 한쪽의 양보·이익만 강조하거나 구체성이 부족함.',5:'협력 필요성만 제시하고 실제 조정 내용이 약함.',0:'미작성 또는 절충안이 없음.'}},
 governance:{label:'국제협력 이해',max:10,levels:{10:'서로 다른 두 주체를 선택하고 각 주체의 성격에 맞는 다른 역할과 협력 필요성을 설명함.',5:'주체와 역할은 제시했으나 역할 구분 또는 협력 이유가 다소 부족함.',0:'미작성 또는 주체·역할의 연결이 부적절함.'}},
 reflection:{label:'재판단·최종합의',max:10,levels:{10:'협상에서 새롭게 고려한 요소가 유지·수정 판단과 최종 합의에 논리적으로 반영됨.',5:'최종 입장은 제시했으나 협상 전후 변화 또는 새 고려 요소가 약하게 드러남.',0:'미작성 또는 앞 답안의 단순 반복에 그침.'}}
};
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function load(){const r=await fetch('/api/teacher/submissions',{headers:{'x-teacher-key':key}});if(!r.ok){alert('비밀번호를 확인하세요.');return false}const j=await r.json();sessions=j.sessions;renderStats();renderRows();return true}
function renderStats(){$('#sAll').textContent=sessions.length;$('#sSubmitted').textContent=sessions.filter(s=>s.status==='submitted').length;$('#sProgress').textContent=sessions.filter(s=>s.status==='in_progress').length;$('#sScored').textContent=sessions.filter(s=>s.score).length}
function renderRows(){const q=$('#search').value.trim().toLowerCase(),f=$('#statusFilter').value;const list=sessions.filter(s=>(f==='all'||s.status===f)&&(!q||s.studentId.includes(q)||s.name.toLowerCase().includes(q)));$('#rows').innerHTML=list.map(s=>`<tr><td>${esc(s.studentId)}</td><td><b>${esc(s.name)}</b></td><td>${countryLabels[s.country]}</td><td><span class="badge ${s.status==='submitted'?'submitted':''}">${s.status==='submitted'?'제출 완료':'진행 중'}</span></td><td>${s.progress||0}%</td><td>${s.score?.total??'-'} / 100</td><td><button class="ghost" onclick="openDetail('${s.sessionId}')">상세·채점</button></td></tr>`).join('')||'<tr><td colspan="7">표시할 학생이 없습니다.</td></tr>'}
function ans(title,body){return `<div class="answer-block"><b>${title}</b><div>${body||'-'}</div></div>`}
function scoreInput(k,v){const r=rubricGuides[k],choices=Object.keys(r.levels).map(Number).sort((a,b)=>b-a);return `<div class="score-item"><div class="score-title"><b>${r.label}</b><span>/ ${r.max}</span></div><div class="score-buttons">${choices.map(n=>`<button type="button" class="score-chip ${Number(v)===n?'selected':''}" data-score-key="${k}" data-score-value="${n}">${n}</button>`).join('')}</div><input id="score-${k}" type="hidden" value="${v??''}"><details class="rubric-detail"><summary>점수 기준 보기</summary>${choices.map(n=>`<div><b>${n}점</b><span>${r.levels[n]}</span></div>`).join('')}</details></div>`}
window.openDetail=function(id){const s=sessions.find(x=>x.sessionId===id),d=s.data||{},b=d.budget||{},sc=s.score||{};$('#detail').classList.remove('hidden');$('#detail').innerHTML=`<div class="step-title"><span class="step-num">✓</span><h2>${esc(s.studentId)} ${esc(s.name)} · ${countryLabels[s.country]}</h2></div><p class="sub">${s.status==='submitted'?'제출 완료':'진행 중'} · 진행률 ${s.progress||0}% · 시작 ${new Date(s.startedAt).toLocaleString('ko-KR')}</p>
<div class="teacher-reading-tip"><b>채점 순서 팁</b><span>① 자료·국가 조건 → ② 예산의 우선순위 → ③ 상대국 충돌 → ④ 절충 → ⑤ 최종 판단 순으로 읽으면 학생의 논리가 빠르게 보입니다.</span></div>
<h3>1차시 · 근거와 국가 입장</h3>${ans('선택 자료',(d.evidenceSources||[]).map(x=>evidenceLabels[x]).join(', '))}${ans('자료에서 확인한 사실',esc(d.evidenceReason))}${ans('우선순위',`${priorityLabels[d.priority1]||'-'} → ${priorityLabels[d.priority2]||'-'}<br>${esc(d.priorityReason)}`)}${ans('100억 예산',Object.entries(b).map(([k,v])=>`${budgets[k]} ${v}억`).join(' / '))}${ans('예산 TRADE-OFF',`최우선 투자 이유: ${esc(d.budgetHighReason)}<br>70억일 때 우선 감액: ${budgets[d.budgetCut]||'-'} · ${esc(d.budgetCutReason)}`)}${ans('협상 전 1차 입장',esc(d.initialPosition))}
<h3>2차시 · 국제협상</h3>${ans('국제기후협약',`${agreementLabels[d.agreement]||'-'}<br>${esc(d.agreementReason)}<br><br>가장 불리한 협약: ${agreementLabels[d.unfavorableAgreement]||'-'} · ${esc(d.unfavorableReason)}`)}${ans('반대 예상 국가',`${countryLabels[d.opposingCountry]||'-'}<br>${esc(d.oppositionReason)}`)}${ans('절충안',`조정 요소: ${esc(d.compromiseDimension)}<br>${esc(d.compromise)}`)}${ans('글로벌 거버넌스',(d.actors||[]).map(x=>`${actorLabels[x]} → ${actorRoleLabels[d.actorAssignments?.[x]]||'-'}`).join('<br>')+`<br><br>협력 이유: ${esc(d.actorReason)}`)}${ans('협상 후 최종 판단',`${d.reconsiderChoice==='revise'?'입장 수정':'입장 유지'}<br>${esc(d.finalDeclaration)}`)}
<h3>100점 루브릭 채점</h3><p class="sub">숫자를 직접 입력하지 않아도 됩니다. 각 요소의 점수를 클릭하고 기준이 애매할 때만 ‘점수 기준 보기’를 펼치세요.</p><div class="score-grid">${Object.keys(rubricGuides).map(k=>scoreInput(k,sc[k])).join('')}</div><div class="field" style="margin-top:12px"><label>교사 메모</label><textarea id="teacherNote">${esc(s.teacherNote||'')}</textarea></div><div class="actions"><button class="danger-btn" onclick="resetStudent('${s.sessionId}')">학생 응시 초기화</button><div class="right"><button class="primary" onclick="saveScore('${s.sessionId}')">채점 저장</button></div></div>`;
 document.querySelectorAll('.score-chip').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.scoreKey,n=Number(btn.dataset.scoreValue);document.getElementById(`score-${k}`).value=n;document.querySelectorAll(`[data-score-key="${k}"]`).forEach(x=>x.classList.toggle('selected',x===btn))}));
 $('#detail').scrollIntoView({behavior:'smooth',block:'start'})
}
window.saveScore=async function(id){const fields=Object.keys(rubricGuides);const score={};for(const f of fields){const v=$(`#score-${f}`).value;if(v==='')return alert('모든 평가 요소에 점수를 선택하세요.');score[f]=Number(v)}const r=await fetch('/api/teacher/score',{method:'POST',headers:{'Content-Type':'application/json','x-teacher-key':key},body:JSON.stringify({sessionId:id,score,teacherNote:$('#teacherNote').value})});const j=await r.json();if(!r.ok)return alert(j.error||'저장 실패');alert(`채점 저장 완료: ${j.score.total} / 100점`);await load();openDetail(id)}
window.resetStudent=async function(id){if(!confirm('이 학생의 현재 응시를 초기화할까요?\n\n초기화하면 학생은 처음부터 다시 응시하게 됩니다. 단순 답안 수정에는 사용하지 마세요.'))return;const r=await fetch('/api/teacher/reset',{method:'POST',headers:{'Content-Type':'application/json','x-teacher-key':key},body:JSON.stringify({sessionId:id})});if(!r.ok)return alert('초기화 실패');$('#detail').classList.add('hidden');await load()}

function setGuideTab(name){document.querySelectorAll('.guide-tab').forEach(b=>b.classList.toggle('active',b.dataset.guideTab===name));document.querySelectorAll('[data-guide-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.guidePanel!==name))}
function openGuide(){localStorage.setItem('climateTeacherGuideSeen','1');$('#teacherGuide').classList.remove('hidden');setGuideTab('before');$('#teacherGuide').scrollIntoView({behavior:'smooth',block:'start'})}
function restoreChecklist(){document.querySelectorAll('[data-preflight]').forEach(cb=>{cb.checked=localStorage.getItem(`climatePreflight:${cb.dataset.preflight}`)==='1';cb.addEventListener('change',()=>localStorage.setItem(`climatePreflight:${cb.dataset.preflight}`,cb.checked?'1':'0'))})}

async function teacherLogin(){
 key=$('#teacherPassword').value.trim();
 const msg=$('#teacherLoginMessage'); msg.classList.add('hidden');
 if(!key){msg.textContent='교사용 비밀번호를 입력하세요.';msg.classList.remove('hidden');return}
 try{
  const auth=await fetch('/api/teacher/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:key})});
  const aj=await auth.json().catch(()=>({}));
  if(!auth.ok){msg.textContent=aj.error||'교사용 비밀번호가 올바르지 않습니다.';msg.classList.remove('hidden');return}
  if(await load()){$('#teacherLogin').classList.add('hidden');$('#dashboard').classList.remove('hidden');restoreChecklist();if(localStorage.getItem('climateTeacherGuideSeen')!=='1')openGuide()}
 }catch(e){msg.textContent='교사용 서버에 연결하지 못했습니다. 잠시 후 새로고침하거나 배포 상태를 확인하세요.';msg.classList.remove('hidden')}
}
$('#loginTeacher').onclick=teacherLogin;
$('#teacherPassword').addEventListener('keydown',e=>{if(e.key==='Enter')teacherLogin()});
$('#refresh').onclick=load;$('#search').oninput=renderRows;$('#statusFilter').onchange=renderRows;$('#exportCsv').onclick=()=>{window.location=`/api/teacher/export.csv?password=${encodeURIComponent(key)}`};
$('#openGuide').onclick=openGuide;$('#closeGuide').onclick=()=>$('#teacherGuide').classList.add('hidden');
document.querySelectorAll('.guide-tab').forEach(b=>b.addEventListener('click',()=>setGuideTab(b.dataset.guideTab)));
document.querySelectorAll('.copy-script').forEach(b=>b.addEventListener('click',async()=>{const t=document.getElementById(b.dataset.copyTarget)?.value||'';try{await navigator.clipboard.writeText(t);const old=b.textContent;b.textContent='복사 완료';setTimeout(()=>b.textContent=old,1200)}catch{alert(t)}}));
