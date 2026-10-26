// v7.61 priority 1: unit 3-1 omissions and textbook wording only.
(function reviseUnit31Priority1(){
 'use strict';
 if(slides.length!==116)throw Error('v7.61 requires the reviewed 116-page curriculum');
 const byTitle=t=>{const list=slides.filter(s=>s.t===1&&s.title===t);if(list.length!==1)throw Error('Missing v7.61 target: '+t);return list[0];};
 const p=x=>'<p>'+x+'</p>';
 const cards=rows=>'<div class="board-grid">'+rows.map(([h,b])=>'<div class="board-card"><b>'+h+'</b>'+p(b)+'</div>').join('')+'</div>';
 const table=(h,rows)=>'<table class="board-table"><thead><tr>'+h.map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 const clear=s=>{delete window.unit3GuidePlan?.[s.title];delete window.unit3BeginnerGuides?.[s.title];};
 const edit=(title,body,notes,terms=[])=>{const s=byTitle(title);clear(s);s.body=body;s.p=notes;s.c=[...new Set([...(s.c||[]),...terms])];return s;};
 const firstParagraph=(s,html)=>{const d=document.createElement('div');d.innerHTML=s.body;const first=d.querySelector('p');if(!first)throw Error('Missing first paragraph: '+s.title);first.outerHTML=html;s.body=d.innerHTML;clear(s);};
 const literal=(s,from,to)=>{if(!s.body.includes(from))throw Error('Missing v7.61 wording: '+from);s.body=s.body.replaceAll(from,to);clear(s);};
 // A worksheet reference must accompany its explanation, not an unrelated definition.
 delete worksheetRefs760[byTitle('① 상업 자본주의의 의미와 특징').title];
 const routes=byTitle('바닷길이 세계 시장을 연결하다');
 routes.body+='<section class="source-note761"><h2>보충 학습지 3-1 ② · 상업 자본 축적의 이면</h2>'+p('신항로 개척 이후 유럽의 부 축적에는 식민지 지배, 노예 무역, 원주민 착취가 연결되어 있었다.')+p('교역 확대와 상업 자본의 성장을 살필 때 유럽에 축적된 부와 함께 그 과정에서 발생한 지배와 착취도 고려할 필요가 있다.')+'</section>';
 routes.p=['교과서 69쪽의 교역망 확대를 먼저 확인한 뒤 보충 학습지 3-1 ②의 지배와 착취를 연결한다.','항구 그림은 앞 화면, 교역망 지도는 이 화면의 시각 자료이다.'];
 clear(routes);
 worksheetRefs760[routes.title]=[{label:'3-1 ②',title:'상업 자본 축적의 이면',book:'69쪽',focus:'신항로 개척 이후 유럽의 부 축적과 식민지 지배·노예 무역·원주민 착취의 연결을 함께 확인한다.'}];
 // Textbook p69: the start of the Industrial Revolution is the mid-18th century.
 const industrial=byTitle('산업 혁명과 산업 자본주의');
 firstParagraph(industrial,p('<span class="date-tag">18세기 중반</span> 영국에서 시작된 산업 혁명은 자본주의 경제를 획기적으로 발전시켰다.'));
 industrial.p=['교과서 69쪽에 따라 시작 시점을 18세기 중반 영국으로 제시한다.','산업 혁명 → 공장제 기계 공업과 대량 생산 → 제조업을 바탕으로 한 이윤 창출 순서로 설명한다.'];
 const history=byTitle('자본주의 발달과 정부 역할 비교');
 literal(history,'18세기 후반 이후','18세기 중반 이후');
 literal(history,'15~18세기','16세기 이후');
 const division=byTitle('애덤 스미스의 분업과 경쟁');
 division.body+='<section class="source-note761"><h2>보충 학습지 3-1 ③ · 분업의 효과와 한계</h2>'+p('반죽·굽기·포장을 나누어 맡으면 작업을 반복하면서 숙련이 높아지고 작업 전환에 드는 시간을 줄일 수 있다. 분업의 생산성 효과와 함께 단순 반복 노동의 한계도 살펴볼 필요가 있다.')+'</section>';
 division.p=['교과서 69쪽의 애덤 스미스 설명과 보충 학습지 3-1 ③을 연결한다.','학습지에 제시된 숙련·작업 전환 시간·단순 반복 노동의 한계 범위에서 다룬다.'];clear(division);
 edit('애덤 스미스와 보이지 않는 손',
 p('애덤 스미스는 개인의 자유로운 경제활동을 옹호하였다. 《국부론》에서 자원의 효율적 배분을 끌어내는 시장의 기능을 ‘보이지 않는 손’에 비유하였다.')+
 cards([['자신의 이익 추구','정육점 주인, 양조장 주인, 빵집 주인이 자기 이익을 중시하는 경제활동을 하는 과정에서 우리가 저녁 식사를 할 수 있게 된다.'],['사회 전체의 이익','개인은 자신의 이익을 추구하는 과정에서 의도하지 않았던 사회 전체의 이익도 증진할 수 있다.']])+
 '<p class="question">개인의 이익을 자유롭게 추구하는 행위가 가져오는 긍정적인 결과는 무엇일까?</p>',
 ['교과서 69쪽 《국부론》 발췌의 뜻을 설명한 뒤 다음 화면의 자유방임주의로 연결한다.'],['보이지 않는 손']);
 edit('자유방임주의와 시장의 기능',
 p('시장에서 개인의 자유로운 경제활동이 보장될 때 사회 전체의 이익도 커진다는 주장은 자유방임주의로 이어졌다.')+
 p('<b>자유방임주의</b>는 시장에 대한 국가의 개입을 최소한으로 제한하고 개인의 경제적 자유를 최대한으로 보장하려는 경제 사상 및 정책이다.')+
 cards([['작은 정부','산업 자본주의가 발달하는 과정에서 많은 국가가 자유방임주의에 기반하여 정부의 시장 개입을 최소화하는 작은 정부를 지향하였다.']]),
 ['교과서 69쪽: 자유방임주의의 정의와 작은 정부를 구분하여 설명한다.'],['자유방임주의','작은 정부']);
 const crisis=byTitle('대공황의 악순환을 한눈에 보기');
 const d=document.createElement('div');d.innerHTML=crisis.body;const firstTable=d.querySelector('table');if(!firstTable)throw Error('Missing crisis comparison table');
 const socialism=document.createElement('p');socialism.className='history-note';socialism.innerHTML='<b>사회주의</b>는 생산 수단의 사회적 소유와 관리, 계획적인 생산과 평등한 분배를 주장하는 사상이다. (교과서 70쪽)';firstTable.after(socialism);crisis.body=d.innerHTML;crisis.c=[...new Set([...(crisis.c||[]),'사회주의'])];clear(crisis);
 edit('케인스: 불황에는 정부가 수요를 보완해야 한다',
 p('대공황과 같은 경기 침체 상황에서 정부의 적극적인 재정 지출로 일자리를 창출하고 소비를 증진하여 불황을 극복해야 한다는 케인스의 주장이 주목을 받게 되었다.')+
 cards([['정부의 적극적인 재정 지출','공공사업 등을 통해 일자리를 늘리고 소득을 보장하여 경기 침체를 극복하고자 하였다.'],['유효 수요','실제 구매 능력을 갖춘 수요이다. 실업자가 일자리를 얻고 그로 인해 임금을 받게 되면 실제 구매 능력을 갖춘 유효 수요가 만들어진다.']])+
 '<p class="question">공공사업으로 만들어진 일자리와 임금은 소비에 어떤 영향을 미칠까?</p>',
 ['교과서 70쪽의 케인스 주장과 유효 수요 설명을 사용한다.','케인스는 주장을 제시한 경제학자이고 루스벨트는 뉴딜 정책을 시행한 미국 대통령이다.'],['케인스','유효 수요']);
 const newdeal=byTitle('루스벨트와 뉴딜 정책');
 firstParagraph(newdeal,p('정부가 시장에 개입하여 시장 실패를 해결해야 한다는 주장 또는 정책을 <b>수정 자본주의</b>라고 한다.'));
 newdeal.body+='<section class="source-note761"><h2>큰 정부와 혼합 경제 체제</h2>'+p('대공황과 제2차 세계 대전을 거치며 많은 나라가 정부의 역할을 강화하면서 공공사업을 벌이거나 사회 보장 제도를 확충하는 등 큰 정부를 지향하였다. 이에 따라 시장경제 체제를 기본으로 하면서 계획경제 체제의 요소가 섞인 혼합 경제 체제가 나타났다.')+'</section>';
 newdeal.p=['수정 자본주의의 정의와 큰 정부·혼합 경제 체제는 교과서 70쪽 표현을 따른다.','구호·회복·개혁의 세 구분은 보충 학습지 3-1 ⑤의 설명이다.'];newdeal.c=[...new Set([...(newdeal.c||[]),'큰 정부','혼합 경제 체제'])];clear(newdeal);
 edit('프리드먼과 신자유주의의 확산',
 cards([['정부 실패','시장의 문제점 개선을 위한 정부 개입이 문제를 충분히 해결하지 못하거나 오히려 악화시키는 현상이다.'],['신자유주의','정부의 지나친 시장 개입을 비판하고 시장에 의한 경제 문제 해결을 옹호한다.']])+
 p('1970년대 석유 파동 이후 스태그플레이션이 발생하면서 정부의 경제 정책이 효과를 보지 못하는 상황이 나타났고, 신자유주의가 지지를 얻기 시작하였다.')+
 table(['교과서 71쪽','내용'],[['정책','세금 감면, 복지 축소, 공기업 민영화, 기업 규제 완화, 노동 시장 유연화'],['결과와 비판','시장의 효율성은 살아났지만 정부 규제와 사회 안전망을 지나치게 약화시켜 사회 계층의 양극화 심화, 경제의 불안정성 증대 등의 문제를 일으켰다는 비판도 있다.']])+
 p('<b>보충 학습지 3-1 ⑦</b> · 프리드먼은 통화량과 물가의 관계, 통화량의 안정적 관리·경쟁의 역할·정부 개입의 한계를 강조하였다.'),
 ['정의·등장 배경·정책·결과는 교과서 71쪽을 따른다.','프리드먼과 하이에크의 구분은 보충 학습지 3-1 ⑦과 다음 인물 화면에서 확인한다.','석유 파동을 정부 개입 자체가 일으킨 사건으로 설명하지 않는다.'],['정부 실패','신자유주의']);
 // The popovers and the lesson body must give the same textbook definitions.
 const definitions={
  '산업 혁명':['産業革命','18세기 중반 영국에서 시작되었으며 공장제 기계 공업과 대량 생산을 가능하게 하여 자본주의 경제를 획기적으로 발전시켰다.'],
  '산업 자본주의':['産業資本主義','산업 혁명을 거치며 공장제 기계 공업이 발달하고 대량 생산이 가능해짐에 따라 제조업을 바탕으로 이윤을 창출하는 자본주의이다.'],
  '보이지 않는 손':['','애덤 스미스가 《국부론》에서 자원의 효율적 배분을 끌어내는 시장의 기능을 비유한 말이다.'],
  '자유방임주의':['自由放任主義','시장에 대한 국가의 개입을 최소한으로 제한하고 개인의 경제적 자유를 최대한으로 보장하려는 경제 사상 및 정책이다.'],
  '수정 자본주의':['修正資本主義','정부가 시장에 개입하여 시장 실패를 해결해야 한다는 주장 또는 정책이다.'],
  '사회주의':['社會主義','생산 수단의 사회적 소유와 관리, 계획적인 생산과 평등한 분배를 주장하는 사상이다.'],
  '유효 수요':['有效需要','실제 구매 능력을 갖춘 수요이다. 실업자가 일자리를 얻고 그로 인해 임금을 받게 되면 유효 수요가 만들어진다.'],
  '정부 실패':['政府失敗','시장의 문제점 개선을 위한 정부 개입이 문제를 충분히 해결하지 못하거나 오히려 악화시키는 현상이다.'],
  '신자유주의':['新自由主義','정부의 지나친 시장 개입을 비판하고 시장에 의한 경제 문제 해결을 옹호하는 주장이다.'],
  '작은 정부':['','자유방임주의에 기반하여 시장 개입을 최소화하는 정부이다.'],
  '큰 정부':['','정부의 역할을 강화하면서 공공사업을 벌이거나 사회 보장 제도를 확충하는 정부이다.'],
  '혼합 경제 체제':['混合經濟體制','시장경제 체제를 기본으로 하면서 계획경제 체제의 요소가 섞인 경제 체제이다.']
 };
 Object.assign(defs,definitions);
 if(window.unit3ConceptTips)for(const [term,value]of Object.entries(definitions))window.unit3ConceptTips[term]=value[1];
 // Preserve the existing page objects and their saved identities: no page insertion or reorder.
 document.title='통합사회2 3단원 · Spotlight 플레이어 v7.61';
 document.documentElement.dataset.curriculumVersion='7.61';
 const css=document.createElement('style');css.textContent='.source-note761{margin-top:14px;padding:12px 16px;border-left:5px solid var(--pink);background:#fff6fa;border-radius:10px}.source-note761 h2{font-size:1em;margin:0 0 8px}.source-note761 p{margin:6px 0;line-height:1.45}';document.head.append(css);
})();
