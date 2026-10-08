const test=require('node:test');
const assert=require('node:assert/strict');

function timePenalty(a){if(a.extra_penalty_exempt)return 0;const m=Number(a.extra_granted_minutes||0);if(m<=0)return 0;if(m<=5)return 2;if(m<=10)return 4;return 6}
function timeScore(a){const p=timePenalty(a);return p===0?6:p===2?4:p===4?2:0}
function current(a){
 const g=a.answers||{};
 const textLen=(g.exportReason||'').length+(g.importReason||'').length+(g.policyEffect||'').length+(g.policyRisk||'').length+(g.report||'').length;
 const economy=(g.won&&g.dollar&&g.cost&&g.exportReason&&g.importReason)?25:(g.won||g.dollar||g.cost?16:0);
 const policy=(Array.isArray(g.policies)&&g.policies.length>=2&&g.policyEffect&&g.policyRisk)?25:(Array.isArray(g.policies)&&g.policies.length?16:0);
 const organization=textLen>=140?20:textLen>=80?16:textLen?12:0;
 const cooperation=(g.report||'').length>=120?20:(g.report||'').length>=60?16:(g.report||'').length?12:0;
 const completion=(g.report||'').length>=120?4:(g.report||'').length>=60?3:(g.report||'').length?2:0;
 const time=timeScore(a);
 return {economy,policy,organization,cooperation,completion,time,total:economy+policy+organization+cooperation+completion+time};
}
const goodEx='환율 상승으로 원화 가치가 하락하면 수출 대금을 원화로 환산할 때 금액이 늘어날 수 있어 수출기업에 유리할 수 있습니다.';
const goodIm='달러 가치가 상승하면 수입 원자재 결제에 더 많은 원화가 필요해 수입기업의 비용과 생산비 부담이 커질 수 있습니다.';
const goodEff='외환시장에 달러를 공급하면 달러 부족을 완화하여 급격한 환율 상승을 진정시키고 수입기업의 단기 결제 부담을 줄일 수 있습니다.';
const goodRisk='하지만 외환보유액이 감소할 수 있고, 긴급대출은 부실대출과 금융기관의 위험 부담을 키울 수 있습니다.';
const goodReport='원화 가치 하락과 달러 가치 상승으로 수입 비용이 증가한다. 외환시장 달러 공급과 수입기업 긴급대출을 함께 사용해 단기 충격을 완화하되 외환보유액 감소와 부실대출 위험을 관리해야 한다.';
const wrong='환율 상승은 원화 가치 상승을 의미하므로 수입기업의 비용이 줄고 모든 사람이 이익을 본다.';
const junk='ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ';
function pad(s,n){let x='';while(x.length<n)x+=s;return x.slice(0,n)}
function base(){return{answers:{},extra_granted_minutes:0,extra_penalty_exempt:false}}

function buildDomain(domain,i){
 const a=base();const g=a.answers;let expected=0,label='';
 const v=i%10;
 if(domain==='economy'){
  if(v===0){Object.assign(g,{won:'하락',dollar:'상승',cost:'증가',exportReason:goodEx,importReason:goodIm});expected=25;label='all-correct'}
  if(v===1){Object.assign(g,{won:'상승',dollar:'하락',cost:'감소',exportReason:pad(wrong,80),importReason:pad(wrong,80)});expected=5;label='all-wrong-long'}
  if(v===2){Object.assign(g,{won:'하락',dollar:'상승',cost:'증가',exportReason:pad(junk,60),importReason:pad(junk,60)});expected=8;label='correct-buttons-junk-reason'}
  if(v===3){Object.assign(g,{won:'하락',dollar:'상승',cost:'',exportReason:goodEx,importReason:''});expected=18;label='partial-correct'}
  if(v===4){Object.assign(g,{won:'',dollar:'',cost:'',exportReason:goodEx,importReason:goodIm});expected=14;label='reason-only'}
  if(v===5){Object.assign(g,{won:'하락',dollar:'상승',cost:'증가',exportReason:'환율이 올라 수출이 좋다',importReason:'환율이 올라 수입이 나쁘다'});expected=19;label='short-but-correct'}
  if(v===6){Object.assign(g,{won:'하락'});expected=7;label='one-button'}
  if(v===7){Object.assign(g,{won:'하락',dollar:'상승',cost:'증가'});expected=15;label='buttons-only'}
  if(v===8){Object.assign(g,{won:'하락',dollar:'하락',cost:'증가',exportReason:goodEx,importReason:goodIm});expected=20;label='one-direction-error'}
  if(v===9){Object.assign(g,{won:'하락',dollar:'상승',cost:'증가',exportReason:goodIm,importReason:goodEx});expected=16;label='reasons-swapped'}
 }
 if(domain==='policy'){
  if(v===0){Object.assign(g,{policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:goodEff,policyRisk:goodRisk});expected=25;label='sound-two-with-risk'}
  if(v===1){Object.assign(g,{policies:['모든 수입품 수입 금지','수출기업 지원 확대'],policyEffect:pad('무조건 좋아진다.',60),policyRisk:pad('부작용 없음.',60)});expected=7;label='bad-policy-long'}
  if(v===2){Object.assign(g,{policies:['외환시장에 달러 공급'],policyEffect:goodEff,policyRisk:''});expected=18;label='one-good-policy'}
  if(v===3){Object.assign(g,{policies:['외환시장에 달러 공급','기준금리 인상'],policyEffect:'환율 안정',policyRisk:''});expected=19;label='two-good-no-risk'}
  if(v===4){Object.assign(g,{policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:pad(junk,70),policyRisk:pad(junk,70)});expected=8;label='two-good-junk-explanation'}
  if(v===5){Object.assign(g,{policies:['기준금리 인상'],policyEffect:'금리를 올려 자본 유출을 줄일 수 있다',policyRisk:'가계와 기업 이자 부담이 커진다'});expected=21;label='one-policy-good-depth'}
  if(v===6){Object.assign(g,{policies:[]});expected=0;label='blank'}
  if(v===7){Object.assign(g,{policies:['모든 수입품 수입 금지'],policyEffect:'수입이 줄어 달러 수요가 감소한다',policyRisk:'소비자 선택과 무역 갈등 문제가 생긴다'});expected=12;label='extreme-but-reasoned'}
  if(v===8){Object.assign(g,{policies:['수입기업 긴급대출','수입 생필품 가격 지원'],policyEffect:goodEff,policyRisk:goodRisk});expected=23;label='plausible-support-mix'}
  if(v===9){Object.assign(g,{policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:'좋다',policyRisk:'나쁘다'});expected=15;label='thin-explanation'}
 }
 if(domain==='organization'){
  if(v===0){Object.assign(g,{exportReason:goodEx,importReason:goodIm,policyEffect:goodEff,policyRisk:goodRisk,report:goodReport});expected=20;label='concept-rich'}
  if(v===1){Object.assign(g,{exportReason:pad(junk,40),importReason:pad(junk,40),policyEffect:pad(junk,40),policyRisk:pad(junk,40)});expected=0;label='long-junk'}
  if(v===2){Object.assign(g,{exportReason:pad(wrong,50),importReason:pad(wrong,50),policyEffect:pad(wrong,50)});expected=5;label='long-wrong'}
  if(v===3){Object.assign(g,{policyEffect:'중앙은행이 외환시장에 개입해 달러를 공급한다',policyRisk:'외환보유액이 감소할 수 있다'});expected=16;label='short-concept-correct'}
  if(v===4){Object.assign(g,{report:'정부가 해결해야 한다.'});expected=6;label='generic-government'}
  if(v===5){Object.assign(g,{report:'국제통화기금과 중앙은행, 정부가 외환유동성과 금리 정책을 조정할 수 있다.'});expected=16;label='institution-specific'}
  if(v===6){Object.assign(g,{report:pad('경제가 어렵다. ',180)});expected=4;label='length-no-concept'}
  if(v===7){Object.assign(g,{policyRisk:'기준금리 인상은 경기 둔화와 가계 이자 부담을 키울 수 있다',policyEffect:'금리 상승은 자본 유출과 환율 불안을 완화할 수 있다'});expected=17;label='mechanism-correct'}
  if(v===8){Object.assign(g,{report:pad('외환시장 기준금리 정부 중앙은행 외환보유액 ',160)});expected=12;label='keyword-stuffing'}
  if(v===9){Object.assign(g,{exportReason:'수출대금 환산 효과',importReason:'수입 원자재 결제 부담'});expected=12;label='concise-concept'}
 }
 if(domain==='cooperation'){
  if(v===0){g.report=goodReport;expected=20;label='balanced-report'}
  if(v===1){g.report=pad(junk,160);expected=0;label='long-junk'}
  if(v===2){g.report=pad(wrong,160);expected=5;label='long-wrong'}
  if(v===3){g.report='외환시장에 달러를 공급하고 수입기업을 지원한다. 그러나 외환보유액 감소와 부실대출 위험을 관리해야 한다.';expected=18;label='short-balanced'}
  if(v===4){g.report='달러를 많이 풀면 된다.';expected=8;label='one-sided-short'}
  if(v===5){g.report=pad('달러를 공급한다. ',130);expected=10;label='repetitive-long'}
  if(v===6){g.report='';expected=0;label='blank'}
  if(v===7){g.report='환율 상승으로 수입비용이 증가한다. 따라서 외환시장 안정과 취약기업 지원을 병행하되 물가와 재정 부담을 함께 점검한다.';expected=19;label='logic-compact'}
  if(v===8){g.report=pad('정부가 노력하고 기업도 노력해야 한다. ',140);expected=7;label='generic-long'}
  if(v===9){g.report='수입기업을 지원하면 도움이 되지만 부실대출 위험이 생길 수 있으므로 한시적으로 지원하고 점검해야 한다.';expected=17;label='tradeoff'}
 }
 if(domain==='completion'){
  if(v===0){g.report=pad(goodReport,160);expected=4;label='complete'}
  if(v===1){g.report=pad(junk,160);expected=0;label='junk-long'}
  if(v===2){g.report='환율 상승';expected=1;label='very-short'}
  if(v===3){g.report=pad('환율 상승과 수입비용 증가를 설명한다. ',65);expected=3;label='medium'}
  if(v===4){g.report='';expected=0;label='blank'}
  if(v===5){g.report=pad('같은 말 반복 ',130);expected=1;label='repetition'}
  if(v===6){g.report=pad(goodReport,50);expected=2;label='short-good'}
  if(v===7){g.report=pad(goodReport,120);expected=4;label='boundary-120'}
  if(v===8){g.report=pad(goodReport,59);expected=2;label='boundary-59'}
  if(v===9){g.report=pad(goodReport,60);expected=3;label='boundary-60'}
 }
 if(domain==='time'){
  const cases=[[0,false,6],[1,false,4],[5,false,4],[6,false,2],[10,false,2],[11,false,0],[20,false,0],[5,true,6],[10,true,6],[30,true,6]];
  const [m,ex,sc]=cases[v];a.extra_granted_minutes=m;a.extra_penalty_exempt=ex;expected=sc;label='extra-'+m+'-'+(ex?'exempt':'normal');
 }
 return {a,expected,label};
}
test('domain 300 x 6 audit',()=>{
 const domains=['economy','policy','organization','cooperation','completion','time'],summary={};
 for(const d of domains){
  const rows=[];for(let i=0;i<300;i++){const x=buildDomain(d,i),actual=current(x.a)[d];rows.push({label:x.label,actual,expected:x.expected,error:actual-x.expected})}
  const abs=rows.map(r=>Math.abs(r.error)),group={};for(const r of rows){(group[r.label]??=[]).push(r)}
  const labels={};for(const [k,arr] of Object.entries(group))labels[k]={n:arr.length,avgActual:arr.reduce((s,r)=>s+r.actual,0)/arr.length,avgExpected:arr.reduce((s,r)=>s+r.expected,0)/arr.length,avgError:arr.reduce((s,r)=>s+r.error,0)/arr.length,maxAbs:Math.max(...arr.map(r=>Math.abs(r.error)))};
  summary[d]={n:300,mae:abs.reduce((a,b)=>a+b,0)/300,max:Math.max(...abs),over5:rows.filter(r=>r.error>5).length,under5:rows.filter(r=>r.error<-5).length,severe:rows.filter(r=>Math.abs(r.error)>=10).length,labels};
 }
 console.log('DOMAIN300 '+JSON.stringify(summary));
 assert.equal(Object.values(summary).reduce((s,x)=>s+x.n,0),1800);
});
