// Pure score policy. No student records or external calls are performed here.
const POLICY_VERSION='effort-85-20261019';
function meaningful(value){
 if(typeof value!=='string')return false;
 const text=value.trim(),compact=text.replace(/\s+/g,'');
 return /[가-힣a-zA-Z]/.test(text)&&!/^(.{1,12})\1{2,}$/.test(compact)&&!(/^(모름|모르겠다|없음|해당없음|몰라|test|asdf|abc)[.!?]*$/i.test(compact));
}
function hasEntry(value){
 if(typeof value==='string')return meaningful(value);
 if(Array.isArray(value))return value.some(hasEntry);
 if(value&&typeof value==='object')return Object.values(value).some(hasEntry);
 return false;
}
function effortProfile(answers,narratives,choices){
 const written=narratives.filter(k=>meaningful(answers?.[k]));
 const selected=choices.filter(k=>hasEntry(answers?.[k]));
 const attempted=written.length>0||selected.length>0;
 const fraction=written.length/narratives.length;
 const target=!attempted?60:fraction===1?100:fraction>=.75?98:fraction>=.5?95:written.length>=2?90:85;
 return {attempted,written,selected,target,reviewRequired:!attempted||written.length<=1};
}
// Dynamic programming enumerates only legal per-area values. Fixed time is never changed.
function legalScores(options,present,target,fixed={}){
 let states=new Map([[0,{cost:0,scores:{}}]]);
 for(const [key,values] of Object.entries(options)){
  const choices=Object.prototype.hasOwnProperty.call(fixed,key)?[fixed[key]]:values;
  if(!choices.every(v=>values.includes(v)))throw Error('허용되지 않는 고정 점수: '+key);
  const maximum=Math.max(...values),next=new Map();
  for(const [sum,state] of states)for(const value of choices){
   const total=sum+value,loss=maximum-value;
   const cost=state.cost+loss*loss*(present[key]?4:1)/maximum;
   if(!next.has(total)||cost<next.get(total).cost)next.set(total,{cost,scores:{...state.scores,[key]:value}});
  }
  states=next;
 }
 const total=[...states.keys()].filter(n=>n>=target&&n<=100).sort((a,b)=>a-b)[0];
 if(total===undefined)throw Error('기존 배점과 고정 시간점수로 새 기준을 충족할 수 없습니다. 교사 확인이 필요합니다.');
 const scores=states.get(total).scores;
 if(Object.values(scores).reduce((a,b)=>a+b,0)!==total)throw Error('항목 합계 검증 실패');
 return {scores,total};
}
function gradeByEffort(answers,options,mapping,narratives,choices,fixed={}){
 const profile=effortProfile(answers,narratives,choices);
 const present=Object.fromEntries(Object.keys(options).map(k=>[k,(mapping[k]||[]).some(field=>hasEntry(answers?.[field]))]));
 const timeLoss=Object.entries(fixed).reduce((sum,[k,v])=>sum+Math.max(...options[k])-v,0);
 const target=profile.attempted?Math.max(85,profile.target-timeLoss):60;
 const result=legalScores(options,present,target,fixed);
 const note=profile.attempted?'참여 중심 기준: 100점 출발, 수행 시도 최소 85점. 허용 배점으로 항목별 조정.':'거의 미작성 60점 제안: 수행 시도 여부를 교사가 확인하세요.';
 return {...result,profile,policyVersion:POLICY_VERSION,note,present};
}

module.exports={POLICY_VERSION,meaningful,effortProfile,legalScores,gradeByEffort};
