# 공통 엔진 재검증 — 2026-10-14
**대상**: v4.1.1 신규 경로/개발 브랜치. **운영 비변경/배포 금지**.

## 확정 결과
- 독립 로컬 Node v22.16.0 환경에서 원본 정적 6건 + PHASE1 규칙/가상 IDB 거래 47건 = **53건 PASS / 0건 FAIL**. Node JS 문법 및 단일 HTML 시험용 번들 문법 검사 PASS.
- 실제 Chromium v144에서 `file://` 및 로컬 HTTP는 `ERR_BLOCKED_BY_ADMINISTRATOR`로 정책 차단. **브라우저 IndexedDB V11, file:// V15 실증은 BLOCKED / 최종 게이트 PASS 아님.**
- 테스트 구현 코드가 정상이라는 Node 증거와 실제 Windows Chrome/Edge 실사용 동작은 별개. `data/verification-v01-v22.json`은 V01~V22 모두 정식 승인·실증 미통과 상태 유지.

## 수정된 핵심 결함
1. 백업 복원의 저장/복원 후 안전 일시정지가 2개 거래였음 → **하나의 IndexedDB 거래**로 실행 중 상태를 일시정지한 결과만 저장.
2. 중복 eventId가 다른 명령이나 다른 내용을 무조건 성공한 재시도로 오판 → 같은 ID/다른 종류/다른 payload `EVENT_ID_CONFLICT` 차단.
3. 백업이 같은 ID·순번이어도 이벤트 유형·시각·본문이 바뀐 것을 놓칠 위험 → 상태 이벤트 이력과 전문을 대조. SHA-256을 재계산해도 내부 불일치 거부.
4. PC 시간 역행을 저장 시각으로 조용히 보정 → DB 쓰기 전에 `CLOCK_BACKWARD`로 차단.
5. 타이머 끔에서 시간의 모래 사용 가능 → `TIMER_DISABLED` 차단.
6. meta.updatedAt 불일치 → `EVENT_TIME_MISMATCH` 감지.

## 엔진 상태
- 구현: 이벤트 reducer, 단일 writer lease, 3슬롯, IndexedDB 상태+이벤트+2세대 체크포인트, JSON 백업·무결성, 교사 확인 복구, 학생 정보 화이트리스트, 타이머 기초 상태 머신.
- 미구현: 공식 60문항 전 유형별 실제 채점, 가로채기·회수·별빛 획득/정정, 30지역 진행, 학생용 2창 BroadcastChannel, 신규 그래픽, UI 및 온라인/오프라인 실제 게임 빌드.
- **테스트 결과 = 최종 게임 완성 아님**. 진행 단계 PHASE 1 구현 중.

## 실사용 검증을 위한 다음 단계
Windows Chrome / Edge에서 각각 `file://`와 `http://localhost` 환경에서 IndexedDB 쓰기/aborted tx, 저장 실패, 강제 종료·재접속·복원, 3슬롯, 1초 전후 타이머, 두 창 충돌을 실증. 로그/스크린샷과 OS/브라우저 버전, 커밋 SHA를 기록한 뒤에만 V09/V11/V12/V14/V15 개별 PASS로 전환.

## 기존 운영 보호
기존 `main`, `classroom-hub/apps/moonpath-dev/`, 과거 localStorage 키 및 Railway 설정을 수정하지 않음. 사용자의 최종 화면·기능 승인 이전 운영 병합/배포 절대 금지.
