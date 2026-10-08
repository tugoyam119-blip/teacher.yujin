const test=require('node:test');
const assert=require('node:assert/strict');

function norm(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()}
function nonsense(s){
 const t=norm(s).replace(/\s/g,'');if(!t)return true;
 const valid=(t.match(/[가-힣a-z0-9]/g)||[]).length, junk=(t.match(/[^가-힣a-z0-9]/g)||[]).length;
 if(t.length>=8&&(valid/t.length<.55||junk/t.length>=.35))return true;
 if(/([^\s])\1{3,}/u.test(t))return true;
 if(/^(ㅋㅋ|ㅎㅎ|ㄱㄱ|asdf|test|123)+$/i.test(t))return true;
 return false;
}
function hasAny(s,arr){const t=norm(s);return arr.some(x=>t.includes(norm(x)))}
function timeScore(a){if(a.extra_penalty_exempt)return 6;const m=Number(a.extra_granted_minutes||0);return m<=0?6:m<=5?4:m<=10?2:0}
function improved(a){
 const g=a.answers||{};
 const texts=[g.exportReason,g.importReason,g.policyEffect,g.policyRisk,g.report].map(x=>String(x||''));
 if(texts.filter(x=>x.trim()).length&&texts.filter(x=>x.trim()).every(nonsense))return {economy:0,policy:0,organization:0,cooperation:0,completion:0,time:timeScore(a),total:timeScore(a)};
 let economy=0,policy=0,organization=0,cooperation=0,completion=0;
 const directions=[g.won==='하락',g.dollar==='상승',g.cost==='증가'].filter(Boolean).length;
 const exOk=hasAny(g.exportReason,['원화 환산','수출 대금','원화로 바꾸','수출 가격 경쟁력']);
 const imOk=hasAny(g.importReason,['더 많은 원화','수입 비용','원자재','결제 부담','생산비']);
 if(directions===3&&exOk&&imOk)economy=25;else if(directions>=2&&(exOk||imOk))economy=20;else if(directions>=1)economy=12;
 const policies=Array.isArray(g.policies)?g.policies:[];
 const bad=policies.includes('모든 수입품 수입 금지');
 const plausible=policies.filter(x=>['외환시장에 달러 공급','기준금리 인상','수입 생필품 가격 지원','수출기업 지원 확대','수입기업 긴급대출'].includes(x)).length;
 const eff=hasAny(g.policyEffect,['완화','감소','안정','부담','유동성','환율','물가','자금']);
 const risk=hasAny(g.policyRisk,['부담','위험','감소','부작용','재정','외환보유액','부실','금리']);
 if(policies.length>=2&&plausible>=2&&!bad&&eff&&risk)policy=25;else if(policies.length>=1&&plausible>=1&&eff)policy=18;else if(policies.length>=1)policy=10;
 const joined=texts.join(' ');
 const orgConcept=hasAny(joined,['외환시장','기준금리','정부','중앙은행','국제기구','국제금융','외환보유액']);
 organization=orgConcept?(joined.length>=180?20:joined.length>=100?16:12):(joined.length>=100?8:joined.length?4:0);
 const report=String(g.report||'');
 const reportLogic=hasAny(report,['그러나','반면','따라서','때문','위험','부작용','완화','관리']);
 cooperation=report.length>=120&&reportLogic?20:report.length>=70&&reportLogic?16:report.length>=30?8:report.length?4:0;
 completion=report.length>=120?4:report.length>=60?3:report.length>=20?2:0;
 const time=timeScore(a),total=economy+policy+organization+cooperation+completion+time;
 return {economy,policy,organization,cooperation,completion,time,total};
}
const good='환율 상승으로 원화 가치가 하락해 같은 달러를 사는 데 더 많은 원화가 필요합니다. 수입기업은 원자재 결제 부담이 커지고 소비자 물가에도 상승 압력이 생길 수 있습니다.';
const good2='외환시장에 달러를 공급하면 급격한 환율 상승을 완화할 수 있지만 외환보유액이 줄어들 수 있습니다. 수입기업 긴급대출은 자금난을 줄이지만 부실대출과 재정 부담 가능성이 있습니다.';
const weak='환율이 올라서 힘들다.';
const nonsenseText='ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ';
function repeatTo(s,n){let x='';while(x.length<n)x+=s;return x.slice(0,n)}
function make(kind,extra=0,exempt=false){
 const a={answers:{},extra_granted_minutes:extra,extra_penalty_exempt:exempt};
 if(kind==='excellent')a.answers={won:'하락',dollar:'상승',cost:'증가',exportReason:repeatTo(good,80),importReason:repeatTo(good,80),policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:repeatTo(good2,80),policyRisk:repeatTo(good2,80),report:repeatTo(good+good2,160)};
 if(kind==='medium')a.answers={won:'하락',dollar:'상승',cost:'증가',exportReason:repeatTo(good,45),importReason:repeatTo(good,35),policies:['외환시장에 달러 공급'],policyEffect:repeatTo(good2,35),policyRisk:'',report:repeatTo(good,75)};
 if(kind==='low')a.answers={won:'하락',dollar:'',cost:'',exportReason:weak,importReason:'',policies:['기준금리 인상'],policyEffect:'',policyRisk:'',report:repeatTo(weak,30)};
 if(kind==='blank')a.answers={};
 if(kind==='nonsense')a.answers={won:'하락',dollar:'상승',cost:'증가',exportReason:repeatTo(nonsenseText,80),importReason:repeatTo(nonsenseText,80),policies:['외환시장에 달러 공급','수입기업 긴급대출'],policyEffect:repeatTo(nonsenseText,80),policyRisk:repeatTo(nonsenseText,80),report:repeatTo(nonsenseText,160)};
 if(kind==='wrong-but-complete')a.answers={won:'상승',dollar:'하락',cost:'감소',exportReason:repeatTo('환율 상승이면 원화 가치가 올라 수입이 싸집니다. ',80),importReason:repeatTo('수입기업은 이익이 늘어납니다. ',80),policies:['모든 수입품 수입 금지','수출기업 지원 확대'],policyEffect:repeatTo('무조건 좋아집니다. ',80),policyRisk:repeatTo('부작용은 없습니다. ',80),report:repeatTo('환율 상승은 원화 강세이고 모든 수입을 금지하면 문제가 해결됩니다. ',160)};
 return a;
}
function expected(kind,extra=0,exempt=false){const t=exempt||extra===0?6:extra<=5?4:extra<=10?2:0;if(kind==='excellent')return 94+t;if(kind==='medium')return 70+t;if(kind==='low')return 35+t;if(kind==='blank'||kind==='nonsense')return t;if(kind==='wrong-but-complete')return 35+t}
test('1000 improved checks',()=>{
 const kinds=['excellent','medium','low','blank','nonsense','wrong-but-complete'],extras=[[0,false],[5,false],[10,false],[5,true],[20,false]],rows=[];let i=0;
 while(rows.length<1000){const k=kinds[i%6],ex=extras[Math.floor(i/6)%extras.length],a=make(k,ex[0],ex[1]),actual=improved(a).total,exp=expected(k,ex[0],ex[1]);rows.push({k,actual,exp,error:actual-exp});i++}
 const abs=rows.map(x=>Math.abs(x.error)),byKind={};for(const k of kinds){const x=rows.filter(r=>r.k===k);byKind[k]={n:x.length,avgActual:x.reduce((s,r)=>s+r.actual,0)/x.length,avgExpected:x.reduce((s,r)=>s+r.exp,0)/x.length,avgError:x.reduce((s,r)=>s+r.error,0)/x.length,severe:x.filter(r=>Math.abs(r.error)>=20).length}}
 console.log('AI1000_IMPROVED '+JSON.stringify({n:1000,mae:abs.reduce((a,b)=>a+b,0)/1000,max:Math.max(...abs),over:rows.filter(r=>r.error>5).length,under:rows.filter(r=>r.error<-5).length,severe:rows.filter(r=>Math.abs(r.error)>=20).length,byKind}));
 assert.equal(rows.length,1000);
});
