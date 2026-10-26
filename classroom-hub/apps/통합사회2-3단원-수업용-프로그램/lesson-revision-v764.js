// v7.64 priority 4: consolidate duplicate explanations while retaining source-specific additions.
(function consolidate764(){
'use strict';
if(slides.length!==116)throw Error('v7.64 requires the reviewed 116-page curriculum');
const before=slides.slice(),at=n=>before[n-1],removed=new Map([[at(16),at(14)],[at(19),at(18)],[at(21),at(20)]]);
const p=s=>'<p>'+s+'</p>',q=s=>'<p class="question">'+s+'</p>';
const table=(head,rows)=>'<table class="board-table"><thead><tr>'+head.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const edit=(n,fn)=>{const s=at(n),d=document.createElement('div');d.innerHTML=s.body;fn(d);s.body=d.innerHTML;delete window.unit3GuidePlan?.[s.title];delete window.unit3BeginnerGuides?.[s.title];};
const removeP=(d,test)=>{for(const el of [...d.querySelectorAll('p')])if(test(el.textContent.trim()))el.remove();};
// A definition appears once; its following explanation supplies different information.
edit(6,d=>{const card=[...d.querySelectorAll('.board-card')].find(x=>x.textContent.includes('商品')||x.textContent.includes('상품의 유통 과정에서 이윤 추구'));if(card)card.remove();});
edit(11,d=>{removeP(d,t=>t.startsWith('빵을 만드는 일을')||t.startsWith('한 업체만 남거나'));d.insertAdjacentHTML('beforeend',q('반죽·굽기·포장을 나누어 맡을 때 생산성이 높아지는 까닭과 단순 반복 노동의 한계를 설명해 보자.'));});
// One diagram for the depression feedback, followed only by the worksheet's additional implication.
edit(14,d=>{removeP(d,t=>t.startsWith('1929년 미국 주가 폭락'));const t=[...d.querySelectorAll('table')][0];if(t)t.insertAdjacentHTML('afterend',p('1929년 미국의 주가 폭락을 계기로 발생한 대공황은 세계 여러 나라의 심각한 경제 불황으로 이어졌다.'));d.insertAdjacentHTML('beforeend',p('<b>보충 학습지 3-1 ④</b> · 개인이 지출을 줄이는 절약 행동도 사회 전체의 소비 감소로 이어지면 불황을 심화시킬 수 있다.'));});
// New Deal's three categories already occur once on this page. Keep the textbook definition and big-government paragraph.
at(18).body=at(18).body.replace('1933년 이후미국','1933년 이후 미국');
// Keep the detailed oil table and its source photograph on the single retained page.
const oilSource=document.createElement('div');oilSource.innerHTML=at(20).body;
at(20).body=at(21).body;
for(const link of oilSource.querySelectorAll('a'))if(!at(20).body.includes(link.getAttribute('href')))at(20).body+=link.outerHTML;
// Friedman belongs beside Hayek; the definition/policy page no longer repeats it.
edit(22,d=>removeP(d,t=>t.startsWith('보충 학습지 3-1 ⑦')));
edit(23,d=>{for(const el of d.querySelectorAll('p'))if(el.textContent.startsWith('프리드먼:'))el.textContent='프리드먼: 통화량과 물가의 관계, 통화량의 안정적 관리·경쟁의 역할·정부 개입의 한계를 강조하였다.';});
// The process table supplies the explanation; the textbook definition is not repeated beneath it.
edit(84,d=>{const ps=[...d.querySelectorAll('p')];if(ps[0])ps[0].textContent='개인이나 가계의 경제생활 목표를 이루기 위해 자산을 효율적으로 관리하는 것이 재무 설계이다.';removeP(d,t=>t==='생애 주기에 따른 수입·지출 변화와 목표를 함께 고려합니다.');});
// Keep textbook definitions and worksheet comparison conditions, without a second definition table.
edit(97,d=>{d.querySelector('table')?.remove();});
edit(108,d=>{const t=d.querySelector('table');if(t)t.outerHTML=table(['보충 학습지 3-5 ④','확인할 내용'],[['국가의 총이익','무역으로 생긴 경제 전체의 이익'],['국내 분배','그 이익이 모든 산업·노동자에게 자동으로 공정하게 돌아가는 것은 아님']]);});
edit(109,d=>removeP(d,t=>t==='공정 무역은 불공정한 무역 관행을 개선하여 노동 인권 보호·불평등 해소·환경 보전을 추구합니다.'));
// Carry the source reference to the retained lesson; the badge points to a worksheet item, not another copy of its text.
for(const [from,to] of removed){const refs=[...(worksheetRefs760[to.title]||[]),...(worksheetRefs760[from.title]||[])];worksheetRefs760[to.title]=refs.filter((x,i,a)=>a.findIndex(y=>y.label===x.label&&y.title===x.title)===i);delete worksheetRefs760[from.title];delete window.unit3GuidePlan?.[to.title];delete window.unit3BeginnerGuides?.[to.title];}
for(const n of [18,20]){delete window.unit3GuidePlan?.[at(n).title];delete window.unit3BeginnerGuides?.[at(n).title];}
const resolve=s=>removed.get(s)||s,final=before.filter(s=>!removed.has(s));
const locate=record=>{let s=before.find(x=>x.id760===record.lessonId760)||before.find(x=>x.title===record.title);if(!s&&Number.isInteger(record.slide))s=before[record.slide];return s?final.indexOf(resolve(s)):-1;};
// Earlier revision passes operate in the 116-page space on every boot. Stable IDs restore the final 113-page records here.
try{const key='social2_u3_progress_v2',data=JSON.parse(localStorage.getItem(key)||'{}');for(const record of Object.values(data)){const i=locate(record);if(i>=0)Object.assign(record,{lessonId760:final[i].id760,title:final[i].title,slide:i,page:i+1,topic:final[i].t});}localStorage.setItem(key,JSON.stringify(data));}catch{}
if(localStorage.getItem('social2_u3_compaction_version')!=='7.64'){const s=before[current];const i=s?final.indexOf(resolve(s)):-1;current=i>=0?i:0;localStorage.setItem('social2_u3_compaction_version','7.64');}
slides.splice(0,slides.length,...final);current=Math.min(Math.max(0,current),slides.length-1);localStorage.setItem('social2_u3_slide_v2',String(current));
if(slides.length!==113||new Set(slides.map(s=>s.id760)).size!==113)throw Error('Invalid consolidated lesson map');
document.title='통합사회2 3단원 · Spotlight 플레이어 v7.64';document.documentElement.dataset.curriculumVersion='7.64';
})();
