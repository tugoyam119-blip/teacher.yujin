(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProgressChecks=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const resources=['structure','usage','map','voices','budget'];
 function reasons(s,step,{observer=false,qualityError,cost,manualSaved=false}={}){
  const out=[],arr=k=>Array.isArray(s[k])?s[k]:[],count=(k,min,max,label)=>{const n=arr(k).length;if(n<min||n>max)out.push(`${label}: ${min===max?min:min+'~'+max}개를 선택하세요. (현재 ${n}개)`)};
  const writing=(k,min,label)=>{const e=qualityError(s[k]||'',min);if(e)out.push(label+': '+e)};
  if(step===1){const missing=resources.map((id,i)=>!s.quizDone?.[id]?i+1:null).filter(Boolean);if(missing.length)out.push('자료 '+missing.join(', ')+'의 확인문제를 완료하세요. 자료를 열고 아래쪽 확인문제에 답해 주세요.');count('evidence',observer?0:3,5,'내 자료함의 핵심 근거')}
  if(step===2){count('policyStations',2,6,'설치역');if(cost(arr('policyStations'))>50)out.push('1차 정책 예산이 50억 원을 넘었습니다. 설치역을 조정하세요.');count('criteria',2,2,'정책 기준')}
  if(step===3){count('rights',1,2,'관련 권리');writing('answer1',150,'정책 선택 이유')}
  if(step===4){count('beneficiaries',1,2,'먼저 도움받는 시민');count('delayed',1,2,'상대적으로 기다리는 시민');for(const [k,label] of [['limitation','정책의 한계'],['remedy','보완 방법']]){if(!s[k])out.push(label+'을 선택하세요.');if(s[k]==='other'&&String(s[k+'Other']||'').trim().length<5)out.push(label+'의 기타 내용을 5자 이상 작성하세요.')}writing('answer2',100,'정책 영향과 보완')}
  if(step===5){if(!arr('newImpacts').length)out.push('새 정보가 정책에 미치는 영향을 1개 이상 선택하세요.');if(!s.impactStrength)out.push('기존 정책에 미치는 영향의 크기를 선택하세요.')}
  if(step===6){if(!s.finalDecision)out.push('최종 판단(유지·일부 변경·크게 변경)을 선택하세요.');count('finalStations',2,6,'최종 설치역');if(cost(arr('finalStations'),true)>50)out.push('최종 정책 예산이 50억 원을 넘었습니다. 설치역을 조정하세요.');writing('answer3',150,'최종 결정 이유')}
  if(step===7){for(let i=1;i<=6;i++)out.push(...reasons(s,i,{observer,qualityError,cost,manualSaved}).map(x=>'STEP '+i+' · '+x));if(!manualSaved)out.push('현재 답안을 먼저 임시저장한 뒤 최종 제출하세요.')}
  return out;
 }
 return {reasons};
});
