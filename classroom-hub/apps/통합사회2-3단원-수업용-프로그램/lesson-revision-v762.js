// v7.62 priority 2: one learning-note hierarchy for headings, breadcrumbs and summaries.
(function alignLearningNote762(){
 'use strict';
 if(slides.length!==116)throw Error('v7.62 requires the reviewed 116-page curriculum');
 const schema={
  1:{title:'자본주의의 발달과 시장경제',book:'68~73쪽',sections:{
   1:{title:'자본주의의 의미와 특징',sub:{1:'의미',2:'특징'}},
   2:{title:'자본주의의 역사적 전개 과정',sub:{1:'상업 자본주의',2:'산업 자본주의',3:'수정 자본주의',4:'신자유주의'}},
   3:{title:'경제 체제의 분류',sub:{}}}},
  2:{title:'합리적 선택의 의미와 한계',book:'74~77쪽',sections:{
   1:{title:'합리적 선택',sub:{1:'기회비용이 적은 선택',2:'편익이 큰 선택',3:'편익을 극대화하는 선택'}},
   2:{title:'합리적 선택의 한계로 나타나는 시장 실패',sub:{1:'시장 실패의 의미',2:'시장 실패의 특징'}},
   3:{title:'시장 실패의 요인',sub:{1:'독과점 문제',2:'공공재 공급 부족',3:'외부 효과 발생'}}}},
  3:{title:'지속가능발전을 위한 시장 참여자의 역할과 책임',book:'78~83쪽',sections:{
   1:{title:'정부의 바람직한 역할',sub:{1:'불공정 거래 행위 규제',2:'공공재 생산',3:'외부 효과 개선'}},
   2:{title:'기업의 바람직한 역할',sub:{1:'재화나 서비스의 생산·공급',2:'기업의 사회적 책임',3:'기업가 정신'}},
   3:{title:'노동자의 바람직한 역할',sub:{1:'노동자',2:'생산성 향상과 상생하는 노사 관계',3:'노동자 권익을 보장받기 위한 노력'}},
   4:{title:'소비자의 바람직한 역할',sub:{1:'합리적 소비',2:'윤리적 소비'}}}},
  4:{title:'자산 관리와 금융 생활 설계',book:'84~89쪽',sections:{
   1:{title:'자산과 자산 관리',sub:{1:'자산',2:'자산 관리',3:'자산 관리의 원칙'}},
   2:{title:'금융 자산의 종류와 특징',sub:{}},
   3:{title:'미래의 금융 생활 설계',sub:{1:'생애 주기',2:'생애 주기를 고려한 금융 생활 설계',3:'재무 설계 과정',4:'거시적 변화 요인을 고려한 금융 생활 설계'}}}},
  5:{title:'국제 분업과 무역',book:'90~97쪽',sections:{
   1:{title:'무역과 국제 분업',sub:{1:'무역',2:'국제 분업'}},
   2:{title:'국제 분업과 무역의 필요성',sub:{1:'생산 요소의 지역 분포 차이',2:'절대 우위와 비교 우위'}},
   3:{title:'지속가능발전에 이바지하는 국제 무역의 방안',sub:{1:'국제 무역의 영향',2:'지속가능발전에 이바지하는 국제 무역의 방안'}}}}
 };
 const circ=n=>'①②③④⑤⑥⑦⑧⑨⑩'[n-1];
 const assignments=new Map(), aliases=new Map(), original=slides.map(s=>({id:s.id760,title:s.title,body:s.body,kind:s.kind,t:s.t}));
 function assign(pages,path,book,role='core',extra=''){
  for(const page of pages){if(assignments.has(page))throw Error('Duplicate note assignment '+page);assignments.set(page,{path,book,role,extra});}
 }
 // Only the curriculum location changes; the order, page count and calculators stay intact.
 assign([1],null,'66~67쪽','intro');
 assign([2],null,'68~73쪽','outline');assign([3],'1','68쪽');assign([4],'1.2','68쪽','visual');
 assign([5,6,7,8],'2.1','69쪽');assign([9,10,11,12,13],'2.2','69쪽');
 assign([14,15,16,17,18,19],'2.3','70쪽');assign([20,21,22,23,24],'2.4','71쪽');assign([25],'2','69~71쪽','review');
 assign([26,27,31],'3','72쪽');assign([28,29,30],null,'73쪽','activity');assign([32],null,'68~73쪽','summary');
 assign([33],null,'74~77쪽','outline');assign([34],'1','74쪽','note-material','학습 자료 1 희소성');
 assign([35,36],'1.1','74~75쪽');assign([37],'1','75쪽','core','② 편익이 큰 선택 · ③ 편익을 극대화하는 선택');
 assign([38],'1.3','74~75쪽','practice');assign([39],'1','75쪽','note-material','학습 자료 2 매몰 비용');
 assign([40,41],'1.3','74~75쪽','practice');assign([42],'2','75쪽');assign([43],'3','76쪽','overview');
 assign([44],'3.2','76쪽','note-material','학습 자료 3 비경합성과 비배제성');assign([45,46,47],'3.2','76쪽');
 assign([48,49,50],'3.3','76쪽');assign([51],'3','75~77쪽','extension','정보 비대칭');
 assign([52],null,'77쪽','activity');assign([53],null,'74~77쪽','summary');
 assign([54],null,'78~83쪽','outline');assign([55],null,'78~82쪽','overview','학습노트 1~4 연결');
 assign([56],'1','78~79쪽');assign([57],'1.1','78쪽');assign([58],'1.3','79쪽');
 assign([59],'2.1','79쪽');assign([60,62],'2.2','80쪽');assign([61,63,64],'2.3','80쪽');
 assign([65],'3','81쪽');assign([66],'3.3','81쪽','inquiry');assign([67],'4','82쪽');assign([68],'4.2','82쪽','inquiry');
 assign([69,70],null,'83쪽','activity');assign([71],null,'78~82쪽','application','학습노트 1~4 연결');assign([72],null,'78~83쪽','summary');
 assign([73],null,'84~89쪽','outline');assign([74],'1','84쪽');assign([75,76],'1.3','84쪽');
 assign([77,78,79],'2','85쪽');assign([80],'2','86쪽','note-material','학습 자료 2 금융 자산');
 assign([81],'2','86쪽','note-material','학습 자료 3 포트폴리오 투자');
 assign([82],'3.1','87쪽');assign([83],'3.2','87쪽');assign([84,88],'3.3','87쪽');assign([85,86,87],'3.4','88쪽');
 assign([89],null,'89쪽','activity');assign([90],null,'84~89쪽','summary');
 assign([91],null,'90~97쪽','outline');assign([92],'1','90쪽');assign([93,94],'2.1','90~91쪽');
 assign([95],'2.1','91쪽','note-material','학습 자료 1 우리나라 5대 수입품');assign([96],'2.1','91쪽','supplement');
 assign([97,98,99,100,101,102,103,104,105,106,107],'2.2','92쪽');
 assign([108],'3.1','93쪽');assign([109,110],'3.2','93쪽');assign([111,112,113],null,'94~95쪽','activity');
 assign([114],null,'96~97쪽','project');assign([115],null,'90~97쪽','summary');assign([116],null,'98~99쪽','final');
 if(assignments.size!==116)throw Error('Incomplete learning-note map');
 const titles={
  3:'1 자본주의의 의미와 특징',4:'② 자본주의의 특징: 시장 가격',
  5:'① 상업 자본주의: 등장 배경',6:'① 상업 자본주의: 의미와 특징',7:'① 상업 자본주의: 신항로 개척',8:'① 상업 자본주의: 교역망과 자본 축적',
  9:'② 산업 자본주의: 산업 혁명',10:'② 산업 자본주의: 의미와 특징',11:'② 산업 자본주의: 분업과 경쟁',12:'② 산업 자본주의: 보이지 않는 손',13:'② 산업 자본주의: 자유방임주의와 작은 정부',
  14:'③ 수정 자본주의: 등장 배경과 대공황',15:'③ 수정 자본주의: 케인스와 유효 수요',16:'③ 수정 자본주의: 대공황의 되먹임 구조',17:'③ 수정 자본주의: 정부의 재정 지출',18:'③ 수정 자본주의: 루스벨트와 뉴딜 정책',19:'③ 수정 자본주의: 뉴딜의 세 가지 구분',
  20:'④ 신자유주의: 석유 파동과 스태그플레이션',21:'④ 신자유주의: 석유 금수 조치와 정책 딜레마',22:'④ 신자유주의: 의미와 특징',23:'④ 신자유주의: 하이에크와 프리드먼',24:'④ 신자유주의: 금융 위기와 정부의 역할',25:'2 자본주의의 역사적 전개 과정: 비교 정리',
  26:'3 경제 체제의 분류',27:'3 경제 체제의 분류: 두 기준',31:'3 경제 체제의 분류: 시장과 정부의 보완',32:'3-1 학습노트 정리: 자본주의의 발달과 시장경제',
  34:'학습 자료 1 희소성',35:'① 기회비용이 적은 선택: 포기한 최선의 대안',36:'① 기회비용이 적은 선택: 명시적·암묵적 비용',37:'1 합리적 선택: 편익과 순편익',38:'③ 편익을 극대화하는 선택: 영화 관람 사례',39:'학습 자료 2 매몰 비용',40:'③ 편익을 극대화하는 선택: 두 대안 계산',41:'③ 편익을 극대화하는 선택: 세 대안 계산',42:'2 합리적 선택의 한계로 나타나는 시장 실패',43:'3 시장 실패의 요인',44:'② 공공재 공급 부족: 비경합성과 비배제성',45:'② 공공재 공급 부족과 무임승차',46:'② 공공재 공급 부족: 재화의 분류',47:'② 공공재 공급 부족과 공유 자원의 과잉 이용',48:'③ 외부 효과 발생',49:'③ 외부 효과 발생: 부정적 외부 효과',50:'③ 외부 효과 발생: 긍정적 외부 효과',51:'추가 학습: 정보 비대칭',53:'3-2 학습노트 정리: 합리적 선택의 의미와 한계',
  55:'시장 참여자의 역할과 책임',56:'1 정부의 바람직한 역할',57:'① 불공정 거래 행위 규제: 교복 담합 사례',58:'③ 외부 효과 개선: 내부화',59:'2 기업의 바람직한 역할',60:'② 기업의 사회적 책임',61:'③ 기업가 정신',62:'② 기업의 사회적 책임: ESG 경영',63:'③ 기업가 정신: 혁신의 대상',64:'③ 기업가 정신: 혁신의 실행과 검증',65:'3 노동자의 바람직한 역할',66:'③ 노동자 권익을 보장받기 위한 노력: 연결되지 않을 권리',67:'4 소비자의 바람직한 역할',68:'② 윤리적 소비: 신념에 따른 소비',71:'시장 참여자의 역할 적용',72:'3-3 학습노트 정리: 시장 참여자의 역할과 책임',
  74:'1 자산과 자산 관리',75:'③ 자산 관리의 원칙',76:'③ 자산 관리의 원칙: 안전성과 수익성',77:'2 금융 자산의 종류와 특징: 예금',78:'2 금융 자산의 종류와 특징: 예금의 구분',79:'2 금융 자산의 종류와 특징: 주식과 채권',80:'학습 자료 2 금융 자산: 펀드·보험·연금',81:'학습 자료 3 포트폴리오 투자',82:'① 생애 주기',83:'② 생애 주기를 고려한 금융 생활 설계',84:'③ 재무 설계 과정',85:'④ 거시적 변화 요인을 고려한 금융 생활 설계',86:'④ 거시적 변화 요인: 금리·환율·국제 관계',87:'④ 거시적 변화 요인: 물가와 구매력',88:'③ 재무 설계 과정: 월별 계획 사례',90:'3-4 학습노트 정리: 자산 관리와 금융 생활 설계',
  92:'1 무역과 국제 분업',93:'① 생산 요소의 지역 분포 차이: 세계의 교역',94:'① 생산 요소의 지역 분포 차이와 무역',95:'학습 자료 1 우리나라 5대 수입품',96:'① 생산 요소의 지역 분포 차이: 글로벌 가치 사슬',97:'② 절대 우위와 비교 우위',98:'② 절대 우위와 비교 우위: 특화와 교환',99:'② 절대 우위와 비교 우위: 생산량 그래프',100:'② 절대 우위와 비교 우위: 리카도',101:'② 절대 우위와 비교 우위: 자료별 계산식',102:'② 절대 우위와 비교 우위: 생산량 계산',103:'② 절대 우위와 비교 우위: 노동시간 계산',104:'② 절대 우위와 비교 우위: 모두 절대 우위인 경우',105:'② 절대 우위와 비교 우위: 교역 조건',106:'② 절대 우위와 비교 우위: 교역 조건·그래프',107:'② 절대 우위와 비교 우위: 그래프 심화',108:'① 국제 무역의 영향',109:'② 지속가능한 국제 무역: 공정 무역의 원칙',110:'② 지속가능한 국제 무역: 자유 무역과 공정 무역',115:'3-5 학습노트 정리: 국제 분업과 무역'
 };
 const roleNames={intro:'단원 도입',outline:'학습노트 목차',summary:'학습노트 정리',activity:'교과서 활동',project:'교과서 프로젝트',final:'단원 정리',practice:'보충 계산 연습',visual:'시각 자료',overview:'개관',review:'비교 정리',extension:'추가 학습',inquiry:'자료 탐구',application:'역할 적용',supplement:'보충 자료'};
 function relocateTitle(s,next){
  const prev=s.title;if(prev===next)return;
  aliases.set(prev,next);
  for(const key of ['unit3GuidePlan','unit3BeginnerGuides'])if(window[key]?.[prev]){window[key][next]=window[key][prev];delete window[key][prev];}
  if(worksheetRefs760[prev]){worksheetRefs760[next]=worksheetRefs760[prev];delete worksheetRefs760[prev];}
  s.title=next;
 }
 function location(t,path){
  if(!path)return '';
  const [major,minor]=path.split('.').map(Number),section=schema[t].sections[major];
  if(!section||minor&&!section.sub[minor])throw Error('Unknown learning-note path '+t+'/'+path);
  return major+' '+section.title+(minor?' · '+circ(minor)+' '+section.sub[minor]:'');
 }
 for(const [page,m]of assignments){
  const s=slides[page-1];if(!schema[s.t])throw Error('Unknown unit');
  if(titles[page])relocateTitle(s,titles[page]);
  const parts=['3-'+s.t,location(s.t,m.path),roleNames[m.role],m.extra,'교과서 '+m.book].filter(Boolean);
  s.k=parts.join(' · ');s.notePath762=m.path;s.noteRole762=m.role;
 }
 const p=x=>'<p>'+x+'</p>';
 const table=(heads,rows)=>'<table class="board-table"><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 function rewrite(page,body){const s=slides[page-1];s.body=body;delete window.unit3GuidePlan?.[s.title];delete window.unit3BeginnerGuides?.[s.title];}
 // Each outline and each recap is generated from the same canonical major headings.
 for(const [t,page]of [[1,2],[2,33],[3,54],[4,73],[5,91]]){
  const rows=Object.entries(schema[t].sections).map(([n,section])=>[n,section.title,Object.entries(section.sub).map(([i,title])=>circ(+i)+' '+title).join('<br>')||'기본적인 경제 문제를 해결하는 방식에 따른 분류']);
  if(t===4)rows[1][2]='예금 · 주식 · 채권';
  rows.push(['활동','교과서 활동',({1:'시장과 정부의 관계',2:'합리적 선택의 한계',3:'패스트 패션에 관한 신호등 토론',4:'나의 미래 금융 생활 설계하기',5:'지속가능발전을 위한 국제 분업과 무역 · 바나나 무역 게임'})[t]]);
  rewrite(page,table(['번호','학습노트 항목','세부 항목'],rows)+p('학습노트의 항목과 번호를 기준으로 교과서 개념, 관련 자료와 활동을 연결합니다.'));
 }
 rewrite(32,table(['학습노트 번호·항목','핵심 정리'],[
  ['1 자본주의의 의미와 특징','① 의미: 사유 재산 제도를 바탕으로 시장에서 자유로운 경제활동을 보장하는 경제 체제<br>② 특징: 사유 재산권 보장, 경제활동의 자유 및 사적 이익 추구 인정, 시장경제 체제와 결합'],
  ['2 자본주의의 역사적 전개 과정','① 상업 자본주의: 상품 유통에서 이윤 추구<br>② 산업 자본주의: 제조업에서 이윤 창출, 자유방임주의<br>③ 수정 자본주의: 시장 실패를 해결하기 위한 정부 개입<br>④ 신자유주의: 정부 역할을 줄이고 시장에 의한 문제 해결 강조'],
  ['3 경제 체제의 분류','기본적인 경제 문제를 해결하는 방식에 따라 시장경제 체제와 계획경제 체제로 분류한다. 시장경제를 기본으로 계획경제 요소가 섞인 혼합 경제 체제도 살펴본다.'],
  ['교과서 활동 · 73쪽','시장과 정부의 관계를 개인과 사회에 미칠 영향으로 비교·평가한다.']
 ]));
 rewrite(53,table(['학습노트 번호·항목','핵심 정리'],[
  ['1 합리적 선택','① 기회비용이 적은 선택: 기회비용은 명시적 비용과 암묵적 비용의 합<br>② 편익이 큰 선택: 만족이나 이득에는 금전적·비금전적 편익이 포함됨<br>③ 편익을 극대화하는 선택: 편익과 기회비용을 함께 고려하여 순편익을 극대화'],
  ['2 합리적 선택의 한계로 나타나는 시장 실패','① 시장 실패의 의미: 시장이 자원을 효율적으로 배분하지 못하는 상태<br>② 시장 실패의 특징: 사회적 최적 수준보다 과다 또는 과소 생산·소비'],
  ['3 시장 실패의 요인','① 독과점 문제<br>② 공공재 공급 부족: 비경합성·비배제성 → 무임승차 → 공급 부족<br>③ 외부 효과 발생: 제3자의 영향이 대가에 반영되지 않아 과다·과소 생산 또는 소비'],
  ['학습 자료','1 희소성 · 2 매몰 비용 · 3 비경합성과 비배제성'],
  ['보충 학습지 · 계산','순편익 = 편익 − 기회비용. 포기한 대안들의 편익−명시적 비용 중 최댓값을 암묵적 비용으로 보며, 이미 지출해 회수할 수 없는 매몰 비용은 제외한다.'],
  ['교과서 활동 · 77쪽','비만세 도입과 댐 건설의 비용·편익을 시장 실패 개념으로 분석한다.']
 ]));
 rewrite(72,table(['학습노트 번호·항목','핵심 정리'],[
  ['1 정부의 바람직한 역할','① 불공정 거래 행위 규제<br>② 공공재 생산: 생산·공급·관리<br>③ 외부 효과 개선: 보조금·세금 감면·과징금·세금 등으로 적정 수준 유도'],
  ['2 기업의 바람직한 역할','① 재화나 서비스를 생산·공급하고 생산 요소의 대가 지급<br>② 기업의 사회적 책임: 건전한 이윤과 환경·소비자·노동자·공정 경쟁 고려<br>③ 기업가 정신: 위험과 불확실성을 무릅쓰고 창의적인 혁신 추구'],
  ['3 노동자의 바람직한 역할','① 노동자: 노동을 제공하고 임금을 받는 경제 주체<br>② 생산성 향상과 상생하는 노사 관계 형성<br>③ 노동자 권익을 보장받기 위한 노력: 권리 인식, 노동 3권, 근로 조건 보장'],
  ['4 소비자의 바람직한 역할','① 합리적 소비: 개인의 편익 증대와 기업 생산 활동의 원동력<br>② 윤리적 소비: 생산·유통 등 전 과정과 생명·인권·동물·환경·공동체 배려'],
  ['교과서 활동 · 83쪽','패스트 패션에 관한 신호등 토론: 찬성 파란색 · 반대 빨간색 · 중립 노란색']
 ]));
 rewrite(90,table(['학습노트 번호·항목','핵심 정리'],[
  ['1 자산과 자산 관리','① 자산: 경제 주체가 소유한 유·무형의 재산, 금융 자산과 실물 자산<br>② 자산 관리: 저축과 투자를 통한 취득·보유·처분<br>③ 자산 관리의 원칙: 안전성·수익성·유동성'],
  ['2 금융 자산의 종류와 특징','예금: 금융 기관에 돈을 맡기고 이자를 받음. 요구불 예금과 저축성 예금<br>주식: 회사에 대한 지분, 배당·시세 차익<br>채권: 자금 조달을 위해 발행하는 차용 증서, 이자·시세 차익'],
  ['3 미래의 금융 생활 설계','① 생애 주기<br>② 생애 주기를 고려한 금융 생활 설계<br>③ 재무 설계 과정: 재무 목표 설정 → 재무 상태 분석 → 재무 설계안 작성 → 재무 설계안 실행 → 재무 실행 평가와 수정<br>④ 거시적 변화 요인을 고려한 금융 생활 설계: 금리·물가·환율·경기 변동·정부 정책·국제 관계 변화'],
  ['학습 자료 · 보충','학습 자료 2 금융 자산: 펀드·보험·연금<br>학습 자료 3 포트폴리오 투자: 위험을 나누지만 원금·수익을 보장하지는 않음'],
  ['교과서 활동 · 89쪽','연령대별 주요 과업과 재무 목표를 작성하고 가상의 재무 설계를 한다.']
 ]));
 rewrite(115,table(['학습노트 번호·항목','핵심 정리'],[
  ['1 무역과 국제 분업','① 무역: 나라 사이에 상품·서비스·생산 요소 등을 거래<br>② 국제 분업: 각 나라가 무역에 유리한 것을 특화하여 생산'],
  ['2 국제 분업과 무역의 필요성','① 생산 요소의 지역 분포 차이: 자원·노동·자본의 차이로 적합한 상품이 다름<br>② 절대 우위와 비교 우위: 생산 비용의 절대적 차이와 기회비용의 상대적 차이를 구분하고 비교 우위에 따라 특화'],
  ['3 지속가능발전에 이바지하는 국제 무역의 방안','① 국제 무역의 영향: 소비 선택·규모의 경제·성장 / 불평등·자원 고갈·환경 파괴<br>② 지속가능발전에 이바지하는 국제 무역의 방안: 공정 무역을 통해 노동 인권 보호·불평등 해소·환경 보전 추구'],
  ['보충 학습지 · 계산','X의 기회비용: 최대 생산량 자료는 Y 생산량 ÷ X 생산량, 단위 비용·시간 자료는 X 비용(시간) ÷ Y 비용(시간). 단위는 Y이다. 같은 재화의 양국 기회비용 사이에서 교환하면 양국이 이익을 얻을 수 있다.'],
  ['교과서 활동 · 프로젝트','94~95쪽 지속가능발전을 위한 국제 분업과 무역 / 96~97쪽 바나나 무역 게임']
 ]));
 // In-body numbers for pages that cover several note subitems together.
 function bodyDoc(page,fn){const s=slides[page-1],d=document.createElement('div');d.innerHTML=s.body;fn(d);s.body=d.innerHTML;}
 bodyDoc(3,d=>{const first=d.querySelector('p');if(first)first.insertAdjacentHTML('afterbegin','<b>① 의미</b> · ');const features=[...d.querySelectorAll('b')].find(b=>b.textContent.startsWith('첫째'));if(features){const h=document.createElement('h2');h.textContent='② 특징';const box=features.closest('.board-grid')||features.closest('p');if(box)box.before(h);}});
 bodyDoc(3,d=>{if(![...d.querySelectorAll('h2')].some(h=>h.textContent==='② 특징')){const grid=d.querySelector('.board-grid');if(grid){const h=document.createElement('h2');h.textContent='② 특징';grid.before(h);}}});
 bodyDoc(56,d=>{const rows=[...d.querySelectorAll('table tr')].slice(1);const names=['① 불공정 거래 행위 규제','② 공공재 생산','③ 외부 효과 개선: 긍정적 외부 효과','③ 외부 효과 개선: 부정적 외부 효과'];rows.forEach((row,i)=>{if(row.children[1]&&names[i])row.children[1].textContent=names[i];});});
 bodyDoc(59,d=>{const first=d.querySelector('p');if(first)first.insertAdjacentHTML('beforebegin','<h2>① 재화나 서비스의 생산·공급</h2>');});
 bodyDoc(65,d=>{const first=d.querySelector('p');if(first)first.insertAdjacentHTML('afterbegin','<b>① 노동자</b> · ');const heads=d.querySelectorAll('.board-card>b');if(heads.length===3){heads[0].textContent='② 생산성 향상: 성실한 업무 수행';heads[1].textContent='② 상생하는 노사 관계 형성';heads[2].textContent='③ 노동자 권익을 보장받기 위한 노력';}});
 bodyDoc(67,d=>{const ps=[...d.children].filter(x=>x.tagName==='P');for(const [i,text]of [[0,'① 합리적 소비'],[2,'② 윤리적 소비']])if(ps[i]){const h=document.createElement('h2');h.textContent=text;ps[i].before(h);}});
 bodyDoc(74,d=>{const first=d.querySelector('p');if(first){first.innerHTML=first.innerHTML.replace('자산은','<b>① 자산</b>은').replace('자산 관리는','<b>② 자산 관리</b>는');}});
 bodyDoc(92,d=>{const ps=[...d.children].filter(x=>x.tagName==='P');if(ps[0])ps[0].insertAdjacentHTML('afterbegin','<b>① 무역</b> · ');if(ps[1])ps[1].insertAdjacentHTML('afterbegin','<b>② 국제 분업</b> · ');});
 // Keep the final synthesis linked to the same note chapters.
 bodyDoc(116,d=>{const rows=d.querySelectorAll('table tr');if(rows.length>=4){rows[0].lastElementChild.textContent='연결 개념과 학습노트 번호';rows[1].lastElementChild.innerHTML='<b>기회비용·순편익 / 비교 우위·특화</b><br>학습노트 3-2 · 1 / 3-5 · 2';rows[2].lastElementChild.innerHTML='<b>노동자의 권리·기업의 사회적 책임·공정 무역</b><br>학습노트 3-3 · 2·3 / 3-5 · 3';rows[3].lastElementChild.innerHTML='<b>외부 효과·윤리적 소비·환경 보호</b><br>학습노트 3-2 · 3 ③ / 3-3 · 4 ②';}});
 // Resolve saved display names by the stable identities already used in v7.60.
 try{const key='social2_u3_progress_v2',data=JSON.parse(localStorage.getItem(key)||'{}');let changed=false;for(const record of Object.values(data)){let i=record.lessonId760?slides.findIndex(s=>s.id760===record.lessonId760):-1;if(i<0&&aliases.has(record.title))i=slides.findIndex(s=>s.title===aliases.get(record.title));if(i<0&&Number.isInteger(record.slide)&&slides[record.slide])i=record.slide;if(i>=0&&record.title!==slides[i].title){Object.assign(record,{lessonId760:slides[i].id760,title:slides[i].title,slide:i,page:i+1,topic:slides[i].t});changed=true;}}if(changed)localStorage.setItem(key,JSON.stringify(data));}catch{}
 for(let i=0;i<slides.length;i++){if(slides[i].id760!==original[i].id||slides[i].kind!==original[i].kind||slides[i].t!==original[i].t)throw Error('Lesson identity or calculator changed at '+(i+1));}
 window.unit3NoteSchema762=schema;
 document.title='통합사회2 3단원 · Spotlight 플레이어 v7.62';document.documentElement.dataset.curriculumVersion='7.62';
 const style=document.createElement('style');style.textContent='.slide-kicker{line-height:1.4;overflow-wrap:anywhere}.slide h2{font-size:1em;margin:10px 0 6px}';document.head.append(style);
})();
