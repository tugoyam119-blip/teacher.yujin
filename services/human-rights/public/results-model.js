(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.ResultsModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const areas = [
    ['evidence_policy', '자료·정책', 25], ['rights_criteria', '권리·기준', 20],
    ['tradeoff', '이해관계', 20], ['limit_remedy', '한계·보완', 15], ['revision', '재판단', 20]
  ];
  const labels = {
    central:'새봄중앙역',welfare:'복지센터역',hospital:'대학병원역',market:'전통시장역',park:'푸른공원역',school:'새봄고역',
    mobility:'교통약자 보호',essential:'필수시설 접근',many:'많은 시민에게 혜택',efficiency:'예산 효율',balance:'지역 간 형평성',urgent:'문제의 긴급성',
    mobility_right:'이동권',equality:'평등권',life:'인간다운 생활을 할 권리',dignity:'인간의 존엄과 가치',
    wheel:'휠체어 이용 시민',elder:'고령 시민',hospital_user:'병원 이용 시민',student:'학생',worker:'통근 시민',market_user:'전통시장 상인·이용객',resident:'다른 역 인근 주민',parent:'유모차 이용 보호자',
    region:'특정 지역에 혜택 집중',wait:'다른 역 이용자의 대기',cost:'한정된 지역에 예산 집중',coverage:'수혜 범위가 좁음',future:'다음 연도 추가 사업 필요',
    next:'다음 사업에서 밀린 역 우선 검토',support:'임시 이동지원 서비스',budget:'예산',voice:'시민 의견 반영',plan:'단계별 계획 공개',
    need:'필요성',none:'영향 없음',small:'작음',medium:'보통',large:'큼',keep:'유지',partial:'일부 변경',major:'대폭 변경',
    ev_hospital_mob:'대학병원역 교통약자 추정 이용객 2,140명',ev_central_all:'새봄중앙역 하루 이용객 18,400명',ev_welfare_ratio:'복지센터역 교통약자 이용 비율이 가장 높음',
    ev_welfare_center:'복지센터역~장애인종합복지관 180m',ev_hospital_access:'대학병원역과 진료·치료 목적 이동 연결',ev_market_elder:'전통시장역과 시장·노인복지관 생활 이동 연결',
    ev_school_route:'새봄고역 특수학급 통학로',ev_school_cost:'새봄고역 기존 시설 활용 8억 원',ev_path:'지상~승강장 끊김 없는 연결 중요',
    ev_wheel_voice:'복지센터역 계단 때문에 우회·택시 이용 사례',ev_hospital_voice:'진료 뒤 계단 이동 위험 사례',ev_budget50:'이번 사업 최대 예산 50억 원'
  };
  const label = value => labels[value] || value || '';
  const list = values => (Array.isArray(values) ? values : []).map(label).join(' / ');
  const confidence = value => ({high:'높음',medium:'보통',low:'낮음'}[value] || '미확인');
  const review = r => !!r.ai_grade && (r.ai_grade.review_required || r.ai_grade.confidence !== 'high' || !!r.ai_grade.reviewFlags?.length);
  const status = r => r.submitted ? '제출 완료' : r.ever_entered ? '작성 중' : '미시작';
  const reflectionStatus = r => r.self_evaluation?.submitted_at ? '완료' : r.self_evaluation ? '임시저장' : '미작성';
  function reflectionTable(rows) {
    return {headers:['반','학번','이름','자기평가서 상태','글자 수','자기평가서','마지막 저장 시각','완료 시각'], rows:rows.map(r=>[r.class_no,String(r.student_id),r.name,reflectionStatus(r),(r.self_evaluation?.text||'').length,r.self_evaluation?.text||'',r.self_evaluation?.saved_at||r.self_evaluation?.submitted_at||'',r.self_evaluation?.submitted_at||''])};
  }
  function filter(rows, options = {}) {
    const q = String(options.q || '').trim().toLowerCase(), c = Number(options.class_no || 0);
    return rows.filter(r => r.student_id !== '000000' && (!c || Number(r.class_no) === c)
      && (!q || String(r.student_id).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q))
      && (!options.status || options.status === 'all' || ({submitted:!!r.submitted,unsubmitted:!r.submitted,graded:!!r.ai_grade,ungraded:!r.ai_grade,review:review(r),final:!!r.teacher_grade,reflection_complete:reflectionStatus(r)==='완료',reflection_draft:reflectionStatus(r)==='임시저장',reflection_empty:reflectionStatus(r)==='미작성'}[options.status])))
      .sort((a,b) => Number(a.class_no)-Number(b.class_no) || String(a.student_id).localeCompare(String(b.student_id), 'ko', {numeric:true}));
  }
  function answers(r) {
    const p = r.payload || {};
    return [
      ['핵심 근거', list(p.evidence)], ['1차 정책', list(p.policyStations)], ['정책 기준', list(p.criteria)], ['관련 권리', list(p.rights)],
      ['정책 선택 이유', p.answer1 || ''], ['먼저 도움받는 시민', list(p.beneficiaries)], ['기다리는 시민', list(p.delayed)],
      ['정책의 한계', p.limitation === 'other' ? p.limitationOther || '' : label(p.limitation)],
      ['보완 방법', p.remedy === 'other' ? p.remedyOther || '' : p.remedy === 'budget' ? '추가 예산과 외부 지원 확보' : label(p.remedy)],
      ['정책 영향·보완', p.answer2 || ''], ['새 정보의 영향', list(p.newImpacts)], ['영향 정도', label(p.impactStrength)],
      ['최종 판단 유형', label(p.finalDecision)], ['최종 정책', list(p.finalStations)], ['최종 판단', p.answer3 || ''], ['자기평가서', r.self_evaluation?.text || ''], ['자기평가서 상태', r.self_evaluation?.submitted_at?'완료':r.self_evaluation?'임시저장':'미작성']
    ];
  }
  function exportTable(rows) {
    const headers = ['반','학번','이름','제출 상태','제출 시각',...answers({}).map(x=>x[0]),'활동시간(초)','시간감점','AI 가채점 상태','AI 잠정총점','AI 신뢰도','교사 확인 권장','AI 종합판단','AI 잘한 점','AI 보완할 점','AI 교사용 피드백','AI 확인사항',
      ...areas.flatMap(([,name,max])=>[`AI ${name} /${max}`,`AI ${name} 채점 이유`,`AI ${name} 인용 근거`]),
      '교사 채점 상태',...areas.map(([,name,max])=>`교사 ${name} /${max}`),'교사 최종총점','교사 피드백'];
    return {headers, rows: rows.map(r => {
      const a = r.ai_grade || {}, g = r.teacher_grade || {};
      return [r.class_no,String(r.student_id),r.name,status(r),r.submitted_at || '',...answers(r).map(x=>x[1]),r.active_seconds || 0,r.time_penalty || 0,
        r.ai_grade?'가채점 완료':'미가채점',a.total ?? '',r.ai_grade?confidence(a.confidence):'',review(r)?'확인 권장':'',a.overall || a.summary || '',a.strength || '',a.improvement || '',a.feedback || '',(a.reviewFlags || []).join('\n'),
        ...areas.flatMap(([key])=>[a.areas?.[key]?.score ?? a[key] ?? '',a.areas?.[key]?.reason || '',(a.areas?.[key]?.evidence || []).join('\n')]),
        r.teacher_grade?'채점 완료':'미채점',...areas.map(([key])=>g[key] ?? ''),g.total ?? '',r.teacher_comment || ''];
    })};
  }
  return {areas,label,list,confidence,review,status,filter,answers,exportTable,reflectionStatus,reflectionTable};
});
