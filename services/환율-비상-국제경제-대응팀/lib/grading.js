'use strict';

function timePenalty(a){
  if(a.extra_penalty_exempt)return 0;
  const m=Number(a.extra_granted_minutes||0);
  if(m<=0)return 0;
  if(m<=5)return 2;
  if(m<=10)return 4;
  return 6;
}
function timeScore(a){const p=timePenalty(a);return p===0?6:p===2?4:p===4?2:0}
function normalizeText(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()}
function wordsOf(s){return normalizeText(s).match(/[가-힣a-z0-9]+/g)||[]}
function isNonsense(s){
  const t=normalizeText(s);if(!t)return false;
  const compact=t.replace(/\s/g,'');
  const valid=(compact.match(/[가-힣a-z0-9]/g)||[]).length;
  const junk=(compact.match(/[^가-힣a-z0-9]/g)||[]).length;
  const jamo=(compact.match(/[ㄱ-ㅎㅏ-ㅣ]/g)||[]).length;
  if(compact.length>=8&&(valid/compact.length<.55||junk/compact.length>=.35))return true;
  if(jamo.length>=6&&jamo.length/compact.length>=.45)return true;
  if(/^[0-9]+$/.test(compact)||/([^\s])\1{3,}/u.test(compact))return true;
  const w=wordsOf(t);
  if(w.length>=5){
    const m=new Map;
    for(const x of w)m.set(x,(m.get(x)||0)+1);
    if(Math.max(...m.values())/w.length>=.6&&m.size<=3)return true;
  }
  return false;
}
function hasAny(s,terms){const t=normalizeText(s);return terms.some(x=>t.includes(normalizeText(x)))}
function countConcepts(s,groups){return groups.filter(g=>hasAny(s,g)).length}
function lowDiversity(s){
  const w=wordsOf(s);if(w.length<10)return false;
  return new Set(w).size/w.length<.38;
}
function qualityFlags(g){
  const fields=['exportReason','importReason','policyEffect','policyRisk','report'];
  const filled=fields.filter(k=>String(g[k]||'').trim());
  const nonsenseFields=filled.filter(k=>isNonsense(g[k]));
  return {filled:filled.length,nonsenseFields:nonsenseFields.length,allNonsense:filled.length>0&&nonsenseFields.length===filled.length};
}
function scoreRubric(a){
  const g=a.answers||{},flags=qualityFlags(g);
  const reviewFlags=[];
  if(flags.allNonsense)reviewFlags.push('의미 없는 반복·무성의 답안 가능성');

  const directionCorrect=[g.won==='하락',g.dollar==='상승',g.cost==='증가'].filter(Boolean).length;
  const directionAnswered=[g.won,g.dollar,g.cost].filter(Boolean).length;
  const exportMechanism=countConcepts(g.exportReason,[['수출 대금','달러 대금','원화 환산'],['원화로','환산액','원화 금액'],['가격 경쟁력','수출 경쟁력']]);
  const importMechanism=countConcepts(g.importReason,[['수입 비용','수입 대금','원자재','결제'],['더 많은 원화','원화 부담'],['생산비','비용 부담']]);
  const exportWrong=hasAny(g.exportReason,['원화 가치 상승','수입이 싸','수입 비용 감소']);
  const importWrong=hasAny(g.importReason,['수입 비용 감소','수입기업 이익 증가','원화 가치 상승']);
  let economy=0;
  if(flags.allNonsense)economy=0;
  else if(directionCorrect===3&&exportMechanism>=2&&importMechanism>=2&&!exportWrong&&!importWrong)economy=25;
  else if(directionCorrect>=2&&(exportMechanism>=1||importMechanism>=1))economy=22;
  else if(directionCorrect===3&&(String(g.exportReason||'').trim()||String(g.importReason||'').trim()))economy=19;
  else if(directionCorrect>=1&&(exportMechanism>=1||importMechanism>=1))economy=16;
  else if(directionCorrect>=1)economy=10;
  else if(exportMechanism>=1||importMechanism>=1)economy=12;
  if(directionAnswered===3&&directionCorrect<=1)reviewFlags.push('환율 방향 선택과 개념 설명 확인 필요');
  if((exportWrong||importWrong)&&economy>10)economy=Math.min(economy,10);

  const policies=Array.isArray(g.policies)?g.policies:[];
  const plausiblePolicies=['외환시장에 달러 공급','기준금리 인상','수입 생필품 가격 지원','수출기업 지원 확대','수입기업 긴급대출'];
  const plausible=policies.filter(x=>plausiblePolicies.includes(x)).length;
  const extreme=policies.includes('모든 수입품 수입 금지');
  const effectConcepts=countConcepts(g.policyEffect,[['환율','외환시장','달러'],['완화','안정','감소','줄일'],['유동성','자금','결제 부담','물가'],['금리','자본 유출','외화 유출']]);
  const riskConcepts=countConcepts(g.policyRisk,[['외환보유액','재정','부실대출','부실'],['이자 부담','경기 둔화','물가'],['부작용','위험','부담','감소']]);
  let policy=0;
  if(flags.allNonsense)policy=0;
  else if(policies.length>=2&&plausible>=2&&!extreme&&effectConcepts>=2&&riskConcepts>=2)policy=25;
  else if(policies.length>=2&&plausible>=2&&effectConcepts>=1)policy=22;
  else if(policies.length>=1&&plausible>=1&&effectConcepts>=1&&riskConcepts>=1)policy=20;
  else if(policies.length>=1&&plausible>=1&&effectConcepts>=1)policy=18;
  else if(policies.length>=1)policy=10;
  if(extreme){policy=Math.min(policy,riskConcepts>=1?14:8);reviewFlags.push('극단적 정책 선택: 교사 확인 권장')}
  if(policies.length>=2&&effectConcepts===0&&riskConcepts===0)reviewFlags.push('정책 선택과 효과·부작용 설명 연결 확인 필요');

  const joined=[g.exportReason,g.importReason,g.policyEffect,g.policyRisk,g.report].join(' ');
  const actorConcepts=countConcepts(joined,[['정부'],['중앙은행','한국은행'],['외환시장'],['국제통화기금','imf','국제금융기구'],['기업'],['외환보유액']]);
  const actionConcepts=countConcepts(joined,[['공급','개입'],['금리','인상'],['대출','지원'],['조정','관리'],['완화','안정']]);
  const mechanismConcepts=countConcepts(joined,[['자본 유출','외화 유출'],['이자 부담','경기 둔화'],['원화 환산','환산 효과'],['원자재','결제 부담','생산비']]);
  let organization=0;
  if(flags.allNonsense)organization=0;
  else if(actorConcepts>=3&&actionConcepts>=2)organization=20;
  else if(actorConcepts>=2&&actionConcepts>=1)organization=18;
  else if(actorConcepts>=1&&actionConcepts>=1)organization=15;
  else if(actorConcepts>=1)organization=11;
  else if(mechanismConcepts>=2)organization=15;
  else if(mechanismConcepts>=1)organization=12;
  else if(String(joined).trim())organization=5;
  if(lowDiversity(joined)&&organization>12){organization=12;reviewFlags.push('기관·개념어 반복 나열 가능성')}
  if(actorConcepts>=3&&actionConcepts===0)reviewFlags.push('기관·주체 키워드 나열 가능성');

  const report=String(g.report||'');
  const reportConcepts={
    diagnosis:countConcepts(report,[['원화 가치','달러 가치','환율'],['수입 비용','수입 원자재','구매 비용']]),
    policy:countConcepts(report,[['달러 공급','외환시장'],['기준금리'],['긴급대출','가격 지원','기업 지원','지원']]),
    effect:countConcepts(report,[['완화','안정','감소'],['부담을 줄','유동성','자금난','도움']]),
    risk:countConcepts(report,[['부작용','위험','부담'],['외환보유액','부실대출','재정'],['경기 둔화','이자 부담']]),
    judgement:countConcepts(report,[['따라서','그러나','반면','관리해야','병행','한시적']])
  };
  const reportElements=Object.values(reportConcepts).filter(x=>x>0).length;
  let cooperation=0;
  if(!report.trim())cooperation=0;
  else if(isNonsense(report))cooperation=0;
  else if(reportElements>=5)cooperation=20;
  else if(reportElements===4)cooperation=18;
  else if(reportElements===3)cooperation=17;
  else if(reportElements===2)cooperation=10;
  else cooperation=5;
  if(lowDiversity(report)&&cooperation>10){cooperation=10;reviewFlags.push('보고서 반복 표현 과다')}
  if(report.length>=120&&reportElements<=1)reviewFlags.push('긴 보고서이나 논리 요소 부족');

  let completion=0;
  if(!report.trim())completion=0;
  else if(isNonsense(report))completion=0;
  else if(report.length>=120&&reportElements>=3)completion=4;
  else if(report.length>=60&&!lowDiversity(report))completion=3;
  else if(report.length>=60&&lowDiversity(report))completion=1;
  else if(report.length>=20)completion=2;
  else completion=1;

  const time=timeScore(a);
  let contentTotal=economy+policy+organization+cooperation+completion;
  const meaningful=flags.filled-flags.nonsenseFields;
  if(!flags.allNonsense&&meaningful>=5&&directionCorrect===3&&policies.length>=2&&!extreme&&contentTotal>=82)contentTotal=Math.max(contentTotal,90);
  else if(!flags.allNonsense&&meaningful>=3&&directionCorrect>=2&&contentTotal>=70)contentTotal=Math.max(contentTotal,82);
  contentTotal=Math.min(94,contentTotal);
  const total=contentTotal+time;
  return {economy,policy,organization,cooperation,completion,time,contentTotal,total,reviewRequired:reviewFlags.length>0,reviewFlags};
}
module.exports={timePenalty,timeScore,scoreRubric,isNonsense,normalizeText,qualityFlags};
