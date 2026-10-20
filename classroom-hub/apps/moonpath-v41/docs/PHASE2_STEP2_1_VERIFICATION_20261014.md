# PHASE 2 — 2-1 / 실제 60문항 통합 엔진 구현·검증 보고

**날짜:** 2026-10-14 (KST)  
**프로젝트:** 《미지의 길 : 달빛 마도 탐험》 v4.1.1  
**브랜치:** `feat/moonpath-v411-rebuild-phase0-20261014` (비운영)  
**결론:** 2-1 문항 모듈 구현·Node 단위검사 통과. **실제 게임/브라우저 통합 PASS는 아님**.

## 1. 실제 원본과 일치
- 기준 `data/YQBank_60_v1.0.0_source.json`: Pack ID `KR-HS-IS2-U01`, 버전 `1.0.0`, 원본 60개/고유 ID 60개.
- 원본 파일 SHA-256: `3a2401498a73bf5afd7ed72329ef07d4dd742d58f5ab27ab966841cc67c5de7f`, Git blob SHA-1: `74d2b5dabfcf6c309a217c26220c184dc4baaa8e` (원본 변경 없음).
- 유형: 객관식 25, 진위형 8, 연결형 7, 순서형 3, 교사 판정형 8, 분류형 6, 단답형 3.
- 문항별 개별 출처 필드는 원본에 없으므로 출처를 만들어내지 않고 `null`로 유지. 교과서와 정답의 교육적 정확성 비교는 별도 미실시.

## 2. 구현 기능
- `src/questions/engine.js`: 공식 60문항과 7유형의 구조·정답 참조 검사, 통합 데이터 스키마 정규화.
- 문항·팩 ID/문항 revision/실제 출제 시각·시도 ID/선택지 표시 순서를 저장할 원본과 실제 발행 스냅샷 2개 생성.
- 원문과 내부 스냅샷을 바꾸지 않는 읽기 사본 제공. 공개 화면은 명시적으로 허용된 지문·보기 등만 반환해 정답/해설/루브릭/내부 메타 제외.
- 객관/진위/연결/순서/분류는 구조와 완전한 답안이 명확한 경우 자동 잠정 판정. 미등록 단답·모든 서술형·부분 응답은 교사 확인으로 남김.
- 키 중복·존재하지 않는 보기·미지원 유형·팩 구조 오류를 명시적으로 차단.
- 판정 결과에서 별빛·열쇠·공헌도 등 보상 직접 지급하지 않음(후속 2-6).

## 3. 실제 실행 검사
- 컨테이너 Node.js `v22.16.0`, 실행 명령 `node --test tests/*.test.mjs`.
- 신규 `tests/phase2-2-1.test.mjs`: **77/77 PASS**, 60문항 전 건 원본·문항 유형별 정답/오답/교사검토·표시형 스냅샷·정보 분리 + 17개 경계조건 검사.
- 기존 PHASE 0+1: **53/53 PASS** 재실행. 전체 **130/130 PASS, 0 FAIL**.
- `node --check src/questions/engine.js` 및 `npm run check:syntax` PASS.
- GitHub에 업로드한 새로운 엔진 파일과 테스트 파일의 Git blob SHA가 **실제 Node로 검사한 로컬 소스와 일치하는지** 커밋 후 확인해야 함.

## 4. 현재 완료하지 않은 것 (반드시 분리)
- `V02.testStatus=NOT_RUN`: 문제 화면, 교사 확정 채점 UI, 답변 이벤트·타이머·IndexedDB 저장 연결은 아직 없음.
- 2-2 문제 추첨·미출제·복습·회수, 2-3 답변 접수·교사 확정, 2-4~2-9 모둠/보상/1지역 완주는 구현 전.
- 실제 Windows Chrome/Edge 강제 종료 후 IndexedDB 복원, `file://`, 무인터넷, 두 창 BroadcastChannel, 출력 PDF/CSV는 여전히 미검증. 이전 Linux Chromium 브라우저 시도는 `ERR_BLOCKED_BY_ADMINISTRATOR`로 **환경 차단**이며 엔진 기능 FAIL을 뜻하지 않음.
- 신규 PNG/실제 화면 승인, PR 병합, Railway 배포는 전부 수행 전.

## 5. 인수인계 및 재현
- `npm test`: 기존 + 신규 Node 검사 재현.
- `npm run check:phase2:2-1`: 이번 단계 검사만 재현.
- `npm run check:syntax`: 핵심 코드 문법 검사.
- 기본 현황 보고서 `docs/PROJECT_STATUS_HANDOFF_v4.1.1_20261014.md`, 단계 표 `docs/PHASE2_9_STAGE_FIXED_PLAN.md`, 추적표 `data/phase2-nine-stage-tracker.json` 및 `data/verification-v01-v22.json`.
- 전체 원시 Node 로그는 별도 작업 결과 ZIP에 포함, GitHub 증거 요약은 `test-logs/phase2-step2-1-20261014.summary.json`.
