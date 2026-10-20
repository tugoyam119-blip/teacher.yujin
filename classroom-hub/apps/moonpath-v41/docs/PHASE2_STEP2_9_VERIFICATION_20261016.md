# 《미지의 길 : 달빛 마도 탐험》 v4.1.1 — PHASE 2-9 통합 시제품·검증 결과

**검증 기준일:** 2026-10-16 (KST)  
**고정 9단계:** 2-9 / 1지역 완주 + 중단·복원·실패 회귀  
**원본 브랜치:** `feat/moonpath-v411-rebuild-phase0-20261014` (운영 비병합)  
**최종 판정:** **모의 저장 기반 1지역 통합 흐름·Chromium 시험 UI 검증 PASS / 실제 브라우저 IndexedDB·강제 종료·오프라인 file:// 현장 실증 BLOCKED/NOT_RUN. PHASE 1·PHASE 2 전체 완료 아님.**

## 1. 무엇을 실제로 만들었는가

1. **1지역 완주 통합 Node 경로:** 기존 2-1~2-8 모듈을 변경하지 않고 **실제 TeacherEngineSession → IndexedDbExpeditionStore → reduceCommand → question draw/assessment/interception/recovery/reward/world**를 순서대로 호출하는 시험을 구성. FakeDatabase는 IndexedDB 거래 API의 **메모리 모사체**이며 브라우저 네이티브 API가 아님.
2. **규칙상 완주:** `REGION_ENTERED(T1-R1)`→`QUESTION_DRAWN`(모둠1)→타이머→학생 답변→교사 정답→다음 모둠 오답→가로채기→지역 완료. 기본 2모둠 시험에서 **원답 정답1/오답1, 가로채기 정답1, 미회수1, 지역 열쇠1·별빛2**. 지역 완료 자체 별빛0.
3. **회수는 다음 지역 이후에만:** 실제 `REGION_ENTERED(T1-R2)` 이벤트를 추가한 후 NATURAL 원모둠 회수 호출→답안/교사 판정 성공→별빛 +1. **열쇠1·별빛3, 회수 대기0, 기존 T1-R1 결과와 원오답/실제 해결 모둠 이력 유지**. T1-R2 자체의 기본 문제는 완료하지 않음(추가 지역 회수 기능 검사용).
4. **독립 교사용 시험 화면:** `src/demo/one-region-smoke.js`, `src/demo/one-region-template.html`. 960×540 논리 화면 contain, 중앙 최대 820×440 문제 팝업, 실제 7유형 답변 입력, 타이머 시작/정지/재개, 교사 판정, 가로채기, 지역 완료, 다음 지역 회수, JSON 내보내기/빈 슬롯 가져오기 UI. **신규 승인 픽셀아트, 교사 PIN, 학생 2창, 실제 교실 배포 화면이 아님.**
5. **로컬 단일 HTML 시험 빌드:** `scripts/build-one-region-smoke.mjs`가 실제 60문항/기존 공통엔진 모듈을 HTML 안에 내장, 외부 네트워크/CDN 필요 없도록 시험 파일 `dist/phase2-9-one-region-smoke.html` 생성. `file://` 실행·재접속은 별도 미검증이며, 공식 온라인/오프라인 이중 출시 빌드 완료가 아님.
6. **저장 격리:** 시험 HTML의 IndexedDB 요청을 `moonpath-v411-phase29-smoke-db-v1`으로만 치환. 기존 개발용 `moonpath-v411-engine-db` 및 구운영 HOME·탐험 `localStorage` 키를 읽거나 삭제하지 않음. 이미 저장된 시험 슬롯을 새로 만들어 덮지 않음.

## 2. 실행한 실제 검사와 증거

| 구분 | 테스트 방식 | 기록 | 결과 | 해석 |
|---|---|---|---|---|
| 이전 2-8까지 | Node + FakeDatabase | 492건 | PASS | 기존 회귀 유지 |
| 2-9 실질 통합 | **실제 교사 세션 API** + FakeDatabase, 2·4·8모둠 | 15건 | PASS | 지역 1회 완주, 회수, 타이머, 백업, 실패/정정/소유권 |
| 2-9 배포 산출물 구조 | Node 정적 원본·SHA·외부요청 검사 | 6건 | PASS | 시험 HTML 생성·원본 포함/규격·격리 확인 |
| **Node 전체** | `node --test tests/*.test.mjs` | **513건** | **PASS / FAIL 0** | 실제 브라우저 DB 증거가 아님 |
| **Chromium DOM 시연** | Chromium 144, **about:blank + 메모리 모의 IndexedDB 삽입**, 화면 실제 버튼 클릭 | 시험 시나리오 1회 | **PASS** | 2문항/가로채기/지역 완료/다음 지역 회수, JS 오류 0, 별빛3/열쇠1 |
| 표시 영역 | Chromium 144 브라우저 화면 크기별 경계 검사 | 1920×1080, 1600×900, 1366×768, 430×900 | **검사 대상 시험 화면 contain PASS** | 글자·팝업/최종 UI 모든 기종 승인과 다름 |
| Chrome file:// 실제 저장 | Chromium 144 실제 파일 경로 접근 | `net::ERR_BLOCKED_BY_ADMINISTRATOR` | **BLOCKED** | IndexedDB 호출에 도달하지 못함 |
| localhost 실제 저장 | Chromium 144 localhost 접근 | 동일 정책 차단 | **BLOCKED** | HTTP 환경도 IndexedDB 호출 못함 |
| Windows Chrome·Edge file:// | 학생·교사용 실제 실행 | 실행 자료 없음 | **NOT_RUN** | 실제 저장·복구·다중창·무인터넷 재시험 필요 |
| 스크린샷 | DOM 모의 저장 시연 | `test-logs/phase2-step2-9-dialog-preview.png`, `...browser-dom-mock.png` | 생성 | 실제 승인된 픽셀아트 시안 아님 |

환경/도구: Linux x86_64, Node.js v22.16.0, Chromium 144.0.7559.96 (headless), Python Playwright. **브라우저가 `about:blank`로 실행 가능한 상황에서의 가상 DB 시연과, `file://`에서의 네이티브 DB 실증은 완전히 다른 검사입니다.**

## 3. 핵심 실패/복구 테스트 — 실제 보존 상태

- **지역 완료 직전 저장 실패:** FakeDatabase에서 `QuotaExceededError` 주입. 열쇠/결과/최신 체크포인트/교사 메모리 상태 모두 롤백 후 동일 상태에서 정상 재시도 시 정확히 한 번 지급.
- **중복 완료:** 동일 완료 eventId로 재실행 시 기존 결과 반환; 다른 완료 eventId로 두 번째 지급 요청 시 거부.
- **재접속:** 모의 DB에 쓰인 지역 결과·미회수/가로채기·원답 판정 보존, 차시와 타이머 자동 재개 금지.
- **브라우저 비정상 종료 유사 상황:** writer lease를 수동 해제하지 않고 만료 후 다른 교사 세션에서 열어 실행 중 타이머 PAUSED 복원. 실제 운영체제에서 브라우저 프로세스를 강제 종료한 실증은 아님.
- **JSON 백업/빈 슬롯 복원:** 실제 `TeacherEngineSession` API를 이용하되 FakeDatabase에서 백업 유효성·복원 후 PAUSED 상태 확인. HTML 파일 대화상자/실제 디스크 지속성은 네이티브 Chrome/Edge 시험 대상.
- **판정 정정:** 최초 정답을 오답으로 정정해도 지역 완료 열쇠·원본 활동 증거 유지, 유효 별빛/공헌도 재계산.
- **교사용 공개 분리:** 학생 공개 Projection/지역 결과에 원답, 정답, 교사 판정 사유, 감사 기록·명단 ID 미포함. 단일 HTML에는 **내부 원본 60문항 정답이 내장**되어 있으므로 이 시험 파일은 학생에게 배포해서는 안 됨.

## 4. 검증 미완료와 차단 항목

**아직 최종 PASS가 아닌 항목**

- **PHASE 1 / V09·V11·V12:** 실제 IndexedDB `file://` 저장·거래 abort/용량 초과, 완전한 브라우저 종료 후 지속 저장, 복원 후 수동 재개, Windows Chrome·Edge 실제 동작.
- **PHASE 2 / V02·V03·V06·V07·V08·V21:** 테스트 화면 UI로 일부 시나리오 확인했으나 Native IDB/완전한 게임 운영 및 증빙 필요. 특히 V21의 전체 테마/기본 엔딩/확장 엔딩은 PHASE 4~5 범위이고 현재는 **1지역만 모의 통합**.
- **V14·V15·V16:** 실제 확장 학생용 2창 읽기 전용 통신, 브라우저 격리/동기화 재연결, 완전 무인터넷 파일 저장/호환성, 온라인/오프라인 전체 이중빌드 동등성.
- **V17:** PDF·CSV 및 무인터넷 한글 글꼴·적법성 실제 출력.
- **V18~V20:** 30지역 신규 픽셀아트/캐릭터 23프레임·HOME/설정/책장/갈림길 사용자 화면별 승인 및 실제 960×540 최종 리소스 렌더링.
- **V22:** 승인 후 PR 병합·Railway SUCCESS·운영 URL 재접속. 미실행.

현재 `data/verification-v01-v22.json`의 최종 시험 PASS **0/22** 유지; `V21`은 **구현 중 / 정식 testStatus=NOT_RUN**. PHASE 1과 PHASE 2는 **완료 선언 금지**. 일부 Node·Chromium DOM 모의 시험 PASS는 최종 브라우저 실증 PASS를 대신하지 않음.

## 5. 배포/사용자 승인 보호

- 기존 운영 `main`, 구 게임 `classroom-hub/apps/moonpath-dev/`, 구 저장키·데이터, 기존 Railway 서비스 **변경 금지**.
- 신규 개발 경로 `classroom-hub/apps/moonpath-v41/`와 독립 브랜치에서만 변경. 시험 빌드는 **자산 미승인·브라우저 실증 미완료**로 운영 미연결.
- 시험 결과 화면은 **기능 테스트 전용 임시 HTML**, 사용자가 승인한 픽셀아트/HOME/마법·책장 디자인으로 오인해서는 안 됨.
- 실제 1지역 완주를 사용자가 승인하기 전에 시험/실행 로그, OS/브라우저 버전, 저장과 강제 종료 후 복원 영상/스크린샷을 확보하고 실패를 수정·재검증해야 함.
- 원본 문제팩 SHA-256: `3a2401498a73bf5afd7ed72329ef07d4dd742d58f5ab27ab966841cc67c5de7f`, **변경 없음**.

## 6. 다음 검증 순서 및 인수인계

1. Windows Chrome·Edge 각각 실제 `file://` 시험 HTML 실행 확인: Test DB만 개방; 생성·답변·회수·저장·브라우저 강제 종료 후 이어하기.
2. 네이티브 IDB 용량·쓰기 실패와 두 창 writer lease/버전·타이머 1초 경계 반복 검사. 문제·감사 보상 장부 복구 전후 차이 0 검증.
3. JSON 파일 내보내기/빈 슬롯 가져오기·재실행; `file://`·localhost·온라인 간 저장은 자동 공유하지 않고 파일로 이동.
4. `V09~V12`, `V14~V16`, `V21`을 실제 증거로 각각 평가. 하나라도 미통과이면 PHASE 2 종료·PHASE 5 출시 게이트 해제 금지.
5. 이후 PHASE 3 신규 픽셀아트 HOME 시안부터 독립 원본 PNG 제작/업로드/해시/화면 표시 후 사용자 승인; PHASE 4~6을 별도 진행.

자세한 현장 체크리스트는 `docs/PHASE2_STEP2_9_BROWSER_QA_20261016.md` 참고.
