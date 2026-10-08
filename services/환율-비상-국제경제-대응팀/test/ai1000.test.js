const test=require('node:test');
const assert=require('node:assert/strict');

function timePenalty(a){if(a.extra_penalty_exempt)return 0;const m=Number(a.extra_granted_minutes||0);if(m<=0)return 0;if(m<=5)return 2;if(m<=10)return 4;return 6}
function timeScore(a){const p=timePenalty(a);return p===0?6:p===2?4:p===4?2:0}
function scoreRubric(a){
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
const good='환율 상승으로 원화 가치가 하락해 같은 달러를 사는 데 더 많은 원화가 필요합니다. 수입기업은 원자재 결제 부담이 커지고 소비자 물가에도 상승 압력이 생길 수 있습니다.';
const good2='외환시장에 달러를 공급하면 급격한 환율 상승을 완화할 수 있지만 외환보유액이 줄어들 수 있습니다. 수입기업 긴급대출은 자금난을 줄이지만 부실대출과 재정 부담 가능성이 있습니다.';
const weak='환율이 올라서 힘들다.';
const nonsense='ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ';
function repeatTo(s,n){let x='';while(x.length<n)x+=s;return x.slice(0,n)}
function expectedCase(kind,extra=0,exempt=false){
 const base={answers:{},extra_granted_minutes:extra,extra_penalty_exempt:exempt};
 if(kind==='excellent')base.answers={won:'하락',dollar:'상승',cost:'증가',exportReason:repeatTo(good,80),importReason:repeatTo(good,80),policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:repeatTo(good2,80),policyRisk:repeatTo(good2,80),report:repeatTo(good+good2,160)};
 if(kind==='medium')base.answers={won:'하락',dollar:'상승',cost:'증가',exportReason:repeatTo(good,45),importReason:repeatTo(good,35),policies:['외환시장에 달러 공급'],policyEffect:repeatTo(good2,35),policyRisk:'',report:repeatTo(good,75)};
 if(kind==='low')base.answers={won:'하락',dollar:'',cost:'',exportReason:weak,importReason:'',policies:['기준금리 인상'],policyEffect:'',policyRisk:'',report:repeatTo(weak,30)};
 if(kind==='blank')base.answers={};
 if(kind==='nonsense')base.answers={won:'하락',dollar:'상승',cost:'증가',exportReason:repeatTo(nonsense,80),importReason:repeatTo(nonsense,80),policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:repeatTo(nonsense,80),policyRisk:repeatTo(nonsense,80),report:repeatTo(nonsense,160)};
 if(kind==='wrong-but-complete')base.answers={won:'상승',dollar:'하락',cost:'감소',exportReason:repeatTo('환율 상승이면 원화 가치가 올라 수입이 싸집니다. ',80),importReason:repeatTo('수입기업은 이익이 늘어납니다. ',80),policies:['모든 수입품 수입 금지','수출기업 지원 확대'],policyEffect:repeatTo('무조건 좋아집니다. ',80),policyRisk:repeatTo('부작용은 없습니다. ',80),report:repeatTo('환율 상승은 원화 강세이고 모든 수입을 금지하면 문제가 해결됩니다. ',160)};
 return base;
}
function teacherExpected(kind,extra=0,exempt=false){
 const t=extra===0||exempt?6:extra<=5?4:extra<=10?2:0;
 if(kind==='excellent')return 94+t;
 if(kind==='medium')return 70+t;
 if(kind==='low')return 35+t;
 if(kind==='blank')return t;
 if(kind==='nonsense')return t;
 if(kind==='wrong-but-complete')return 35+t;
 return t;
}

test('1000 synthetic grading checks',()=>{
 const kinds=['excellent','medium','low','blank','nonsense','wrong-but-complete'];
 const extras=[[0,false],[5,false],[10,false],[5,true],[20,false]];
 const rows=[];let i=0;
 while(rows.length<1000){const kind=kinds[i%kinds.length],ex=extras[Math.floor(i/kinds.length)%extras.length];const a=expectedCase(kind,ex[0],ex[1]);const actual=scoreRubric(a).total;const expected=teacherExpected(kind,ex[0],ex[1]);rows.push({kind,extra:ex[0],exempt:ex[1],actual,expected,error:actual-expected});i++}
 const abs=rows.map(r=>Math.abs(r.error)),mae=abs.reduce((a,b)=>a+b,0)/rows.length,max=Math.max(...abs);
 const over=rows.filter(r=>r.error>5).length,under=rows.filter(r=>r.error<-5).length;
 const severe=rows.filter(r=>Math.abs(r.error)>=20).length;
 const byKind={};for(const k of kinds){const x=rows.filter(r=>r.kind===k);byKind[k]={n:x.length,avgActual:x.reduce((a,b)=>a+b.actual,0)/x.length,avgExpected:x.reduce((a,b)=>a+b.expected,0)/x.length,avgError:x.reduce((a,b)=>a+b.error,0)/x.length,severe:x.filter(r=>Math.abs(r.error)>=20).length}}
 console.log('AI1000_METRICS '+JSON.stringify({n:rows.length,mae,max,over,under,severe,byKind}));
 assert.equal(rows.length,1000);
});
