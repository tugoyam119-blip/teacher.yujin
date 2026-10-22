# STEP 08 최종 검수 — 요청한 연속 흐름 통과

검수:2026-10-22T09:46:45.878Z(KST18:46). 대상 https://moonpath-v411-test.kkyj119.workers.dev/home-b/ . 원격 기준 커밋 c0fa130cb4ab24fe3ccfdbf2961eb8cd4aed40df, 게임 구현15a6b013f1a655bcca6a1c0654832bdcd5c15818. 두 커밋 사이에는 문서/증거만 추가되어 게임 코드·승인 PNG는 동일하다.

Cloudflare 제공 버전7f7bef99-a952-4995-9717-76cc0f162647(100%), 배포d3e38840-73e2-4ae2-b7cd-ffee0196456e를 읽기 전용으로 재확인했다.

## 실제 연결 검수

별도 로컬 서버나 UI 명령 우회로 흐름을 대신하지 않았다. 실제 HTTPS 사이트의 화면 버튼과 입력으로 수행했고, 저장 상태는 읽기 전용으로 비교했다. 예외는 보존 비교용 구형 합성 슬롯3을 초기 준비 단계에서 엔진으로 생성한 것뿐이다. 모든 시험은 사용자 프로필과 다른 임시 WebKit 문맥에서 수행했다.

| 실제 흐름 | 확인 내용 | 결과 |
|---|---|---|
| 새로운 탐험 |25분·완전 협동·2모둠×3명·Seed 선택 저장, 생성 직후 수업 미시작 |PASS|
| 지역 진입/첫 문항 |기본 확인으로 수업 시작, 별도 출제/타이머 시작 |PASS|
| 답안/교사 판정 |객관식 실제 선택→답안 제출→교사 근거 입력→정답 확정, 별빛1 저장 |PASS|
| 진행 중 HOME 복귀 |두 번째 문항 타이머 실행 후 HOME 복귀, 실제 잔여 시간과 수업 일시정지 저장 |PASS|
| 이어하기 |HOME 이어하기→저장된 지역, 문항/답안 이력/남은 시간/명단/보상/Seed 동일, 자동 재개 없음 |PASS|
| 명시적 재개 |수업 재개 후 타이머 재개를 각각 확인, 다시 HOME 복귀 시 정지 |PASS|
| JSON 백업 |실제 파일 다운로드에 완료 문항과 미완료 문항·일시정지 시간·보상 포함 |PASS|
| 사용 중 슬롯 보호 |동일 슬롯 복원 거부, 원래 상태 전체 동일 |PASS|
| 보관/손상 파일 |보관으로 슬롯 비운 뒤 훼손한 합성 백업의 checksum 오류 거부, 빈 슬롯 유지 |PASS|
| 정상 복원 |실제 파일 입력→JSON 복원, 설정/Seed/명단/문제팩/문항/남은 시간/보상 및 기존 이벤트 접두부 동일 |PASS|
| 복원 후 이어하기 |HOME→이어하기→진행 문항, 저장된 일시정지 상태 유지 |PASS|
| 다른 기록/오류 |별도 구형 합성 슬롯3 전체 동일, 브라우저 예외·HTTP400 이상0 |PASS|

연결 흐름12개 검증과 자동570개가 통과했다. 저장 비교는 settings,teams,questions,attempts,activeAttemptId,participation,rewards,health,recovery,interception,sessions,activeSessionId를 포함한다. 백업 복원 시 감사 이벤트가 추가될 수 있으므로 전체 revision 자체를 원본과 같다고 주장하지 않고 기존 이벤트 접두부 보존을 검사했다.

증거: `evidence/20261022-step08/live-results.json`, `automatic-results.txt`. 재현 검사: `tests/browser/step08-cloudflare-live.cjs`; PLAYWRIGHT_MODULE/PLAYWRIGHT_BROWSERS_PATH가 준비된 환경에서 실행한다. outputs/STEP08-01-preparation.png, STEP08-02-continued-question.png, STEP08-03-restored.png, STEP08-04-restored-continued.png는 실제 주소에서 캡처한 화면이다. 실사용자 백업 JSON은 수집하거나 저장하지 않았다.

## 보존과 판정 범위

- main 기준/종료 HEAD f7e0e8e29428b3b7118c9553cd517f870bfd785e. main 쓰기·병합 없음. Railway 도구·배포 호출 없음.
- 실제 사용자 브라우저 프로필·기존 IndexedDB·localStorage 접근 없음. 기존 기록 보존의 직접 비교 대상은 임시 문맥의 합성 슬롯이며 사용자 실제 저장을 열람했다고 주장하지 않는다.
- 이번 STEP08은 검수와 기록만 수행했다. 실행 코드·원본 PNG·Cloudflare 설정 변경 및 추가 배포 없음. 원격 시험 사이트는 검수한c0fa130 상태를 유지한다. 기록과 재현 검사는 로컬 시험 브랜치에 보존한다.
- STEP07의 PC/모바일 팝업15항목·진행3종·배포 파일49개 증거는 동일 구현에 대한 이전 검증이다. 이번12개 검사로 다시 수행했다고 합산하지 않는다.
- 지역 문항 화면은 현재 PHASE2-9 교사용 검증 UI다. 이번 판정은 HOME 공통 팝업 및 요청한 연결 기능의 시험 사이트 검수 통과다. 전체 게임 최종 아트·6테마 완주·학생 동기화/PIN·Windows Chrome/Edge·모바일 실기기/키보드·오프라인 file:// 출시 검수는 별도다.
