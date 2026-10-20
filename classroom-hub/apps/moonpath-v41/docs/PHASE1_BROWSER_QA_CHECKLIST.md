# PHASE 1 Chromium / Edge 독립 실증 (미완료)
- 시험 HTML: `tests/browser/phase1-browser-probe.html`; 실제 게임이 아닌 신규 엔진 단위 검사용.
- **이 시험 페이지는 다른 DB** `moonpath-v411-browser-probe-db-v1` 사용. 구 운영 저장키/파일을 읽거나 삭제하지 않음.
- 저장/읽기·이벤트 중복·JSON SHA-256·실제 IDB abort·브라우저 내 닫았다 다시 열기·학생 projection 간단 검사.
- 사용법: Chrome/Edge에서 HTML을 개별적으로 `file://` 직접 열고 "실제 저장 검사" 실행. 브라우저 버전, PASS/FAIL 전체 로그, 파일 SHA, OS 기록. 완전히 종료 후 다시 검사해 장기 저장 확인.
- 현재 샌드박스 Chromium 144에서는 `ERR_BLOCKED_BY_ADMINISTRATOR`로 모든 브라우저 진입이 차단되어 **실행 못 함(BLOCKED)**.
- 실행 결과가 나와도 정식 오프라인 1지역 완주, 복제/확장 학생 창 BroadcastChannel, 타이머 1초, 실제 45분 수업, PDF 출력 V09/V11/V12/V14/V15 등은 별도 확인이 필수.
