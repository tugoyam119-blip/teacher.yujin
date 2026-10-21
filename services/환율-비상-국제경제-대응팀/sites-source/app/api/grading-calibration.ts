/* eslint-disable @typescript-eslint/no-explicit-any */
import {isMeaninglessRepetition} from '../answer-validation';
const clean=(value:any)=>String(value??"").replace(/\s+/g," ").trim();
const includesAny=(value:any,patterns:RegExp[])=>patterns.some(pattern=>pattern.test(clean(value)));
const meaningful=(value:any)=>{const text=clean(value);return text.length>=4&&!isMeaninglessRepetition(text)&&!/^(모름|모르겠다|없음|해당 없음|노력해야 한다)[.! ]*$/.test(text)};
const list=(value:any)=>Array.isArray(value)?value.map(clean).filter(Boolean):[];

/** 구조화된 선택과 답안 속 직접 근거로 반복 가능한 점수 단계를 만든다. */
export function calibratedBands(answers:Record<string,any>){
 const groups=answers.groups||{},effects=list(answers.effects),policies=list(answers.policies);
 const exportReason=clean(answers.exportReason),importReason=clean(answers.importReason),policyEffect=clean(answers.policyEffect),policyRisk=clean(answers.policyRisk),report=clean(answers.report);
 const correct=[clean(answers.won)==="하락",clean(answers.dollar)==="상승",clean(answers.cost)==="증가",clean(groups.exporter)==="유리",clean(groups.importer)==="불리"].filter(Boolean).length;
 const economyContradiction=includesAny([answers.won,answers.dollar,answers.cost,groups.exporter,groups.importer,exportReason,importReason,effects.join(" ")].join(" "),[/상승과 하락/,/수출과 수입.*모두 싸/,/달러.*싸.*수입.*(감소|줄)/,/수입(비|비용|가격).*(감소|줄어|낮아)/]);
 const bothReasons=meaningful(exportReason)&&meaningful(importReason);
 let economy=10;
 if(!economyContradiction&&correct===5&&bothReasons&&effects.length>=2)economy=25;
 else if(!economyContradiction&&correct>=4&&bothReasons&&effects.length>=1&&(exportReason.length+importReason.length)>=35)economy=20;
 else if(!economyContradiction&&correct>=4&&(bothReasons||effects.length>=1))economy=15;
 else if(!economyContradiction&&correct>=3&&(bothReasons||effects.length>=1))economy=15;

 const vaguePolicy=policies.some(x=>/아무 정책|아무거나/.test(x))||/모든 문제가 해결|부작용은 없다/.test(`${policyEffect} ${policyRisk}`);
 const effectTargets=[/환율|외환시장|시장.*안정/,/물가|생활비|생필품|수입가격/,/달러.*(부족|유동성)/].filter(x=>x.test(policyEffect)).length;
 const riskSpecific=includesAny(policyRisk,[/외환보유액|보유액|소진/,/재정|예산|비용/,/경기|실업|금리|물가|부채/])&&!/구체적으로.*(못|쓰지)/.test(policyRisk);
 let policy=10;
 if(!vaguePolicy&&policies.length>=2&&meaningful(policyEffect)&&riskSpecific&&(effectTargets>=2||policyEffect.length>=20))policy=25;
 else if(!vaguePolicy&&policies.length>=2&&meaningful(policyEffect)&&meaningful(policyRisk))policy=20;
 else if(!vaguePolicy&&policies.length>=1&&meaningful(policyEffect))policy=15;

 const hasOrganization=/IMF|국제통화기금|세계은행|국제기구/.test(report),explicitOmission=/국제기구.*(제시하지|쓰지|못했|없)/.test(report);
 const organizationRoles=[/긴급.{0,5}(금융|유동성)|금융 지원/,/정책.{0,3}자문|자문/,/구제금융|대출|차관/,/감시|모니터링/].filter(x=>x.test(report)).length;
 let organization=8;
 if(!explicitOmission&&hasOrganization&&organizationRoles>=2)organization=20;
 else if(!explicitOmission&&hasOrganization&&organizationRoles===1)organization=16;
 else if(explicitOmission||(hasOrganization&&/(지원|도움)/.test(report)))organization=12;

 const cooperationMechanisms=[/통화스와프/,/공동(성명|메시지|시장안정)/,/무역금융/,/만기.{0,4}연장/,/공동.{0,4}(기금|지원)/].filter(x=>x.test(report)).length;
 const genericCooperation=/주변국|다른 나라|국제사회|협력|공동/.test(report);
 let cooperation=8;
 if(cooperationMechanisms>=2||(cooperationMechanisms===1&&organization===20&&/공동 대응/.test(report)))cooperation=20;
 else if(cooperationMechanisms===1)cooperation=16;
 else if(genericCooperation&&report.length>=20)cooperation=12;

 // Completion rewards doing the task, separately from content accuracy. A short
 // answer is not an incomplete answer just because it lacks specialist wording.
 const completed=[exportReason,importReason,policyEffect,policyRisk,report].filter(meaningful).length;
 const completion=completed===5&&policies.length&&effects.length&&Object.keys(groups).length?4:completed>=3?3:completed>=1?2:1;
 return{economy,policy,organization,cooperation,completion};
}

export function applyCalibration(answers:Record<string,any>,result:Record<string,any>){
 const raw={economy:Number(result.economy),policy:Number(result.policy),organization:Number(result.organization),cooperation:Number(result.cooperation),completion:Number(result.completion)};
 const bands=calibratedBands(answers),rawScore=Object.values(raw).reduce((sum,x)=>sum+(Number.isFinite(x)?x:0),0),calibratedScore=Object.values(bands).reduce((sum,x)=>sum+x,0),difference=Math.abs(rawScore-calibratedScore);
 Object.assign(result,bands,{rawAiBreakdown:raw,calibrationApplied:true,calibrationDifference:difference});
 if(difference>=8){result.confidence="low";result.reviewRequired=true;result.reviewReason="AI 판단과 고정 채점 기준의 차이가 커 교사 확인을 권장합니다."}
 else if(difference>=4&&result.confidence==="high"){result.confidence="medium";result.reviewRequired=true;result.reviewReason=result.reviewReason||"경계 점수에 해당하여 교사 확인을 권장합니다."}
 return result;
}
