# PHASE 0 — 기준 원본·코드 조사 / 2026-10-14

## 기준 스냅샷
- 저장소: `tugoyam119-blip/teacher.yujin`, `main` 확인 커밋 `16c5d7f9d929a06a35b47c8da410c7a73facdf20`
- 신규 브랜치: `feat/moonpath-v411-rebuild-phase0-20261014`; 구 장식 브랜치 `moonpath/setup-decoration-rebuild-20261014` **미사용**
- 구 운영 코드: `classroom-hub/apps/moonpath-dev/index.html` (blob `f35fbfda707c488c34d71977ae455cc49f00f776`), `expedition.html` (blob `35154eb61dac2e03fd6154fa1130d5a99c3ba70d`)
- 구 자산: `../moonpath-dev/assets`의 PNG/SVG 등은 전부 **참고·보존** 대상, 신규 빌드에 복사·임포트 금지.
- 앱 정적 제공: 서버의 `app.use('/apps', express.static(APPS,...))` 확인. 새 경로는 운영 `main`에 아직 없으므로 운영 페이지에 등장하지 않음.
- Railway 동작이나 고객 저장 데이터는 수정/이관/삭제하지 않음. 운영 데이터 사본 백업 성공을 뜻하지 않음.

## 실제 60문항 원본 추적
- 별도 Library 파일: `통합사회2_1단원_YQBank_교과서기반_60문항_v1.0.json` (원본 확인).
- 기존 게임: `expedition.html` line ~666 내장 `const DEFAULT_PACK={...}`.
- 전체 루트 객체 `schema_version,pack,curriculum,taxonomy,assets,questions` 비교, **의미적 데이터 전체 일치**.
- 원본 60개 vs 내장 60개, 고유 ID 60개, 문항별 문제/선택지/정답/해설/메타 차이 **0개**.
- 유형 7개: 객관 25, 진위 8, 연결 7, 순서 3, 교사판정 8, 분류 6, 단답 3.
- 난도 1~5 분포: 6/15/21/12/6.
- 원본 보존: `data/YQBank_60_v1.0.0_source.json`.
- **제약**: 위 일치는 원본·코드 간 데이터 검사이며 교과서와 내용·채점의 교육적 적합성 검토나 실제 게임 실행 PASS가 아님. 신규 브랜치에 올린 원본 JSON은 로컬 Library raw_file과 Git blob의 SHA-1로 **바이트 일치 확인**. 원본 SHA-256: `3a2401498a73bf5afd7ed72329ef07d4dd742d58f5ab27ab966841cc67c5de7f`.

## 승인 참고 자료
- Library: `미지의길_HOME_제작기준_v2.0_5차검토(1).md` (설계·픽셀·앵커/레이어 참고)
- Library: `MP_OFFICIAL_PRODUCTION_STANDARD_v1.5_20261010.md` (이전 구현 규칙·정체성 참고)
- 사용자 첨부: `docs/MASTER_v4.1.1_original.md` (우선순위 최상위, 결정 01~42 및 V01~V22).
- 기타 구 버전 승인 PNG/SVG: `data/legacy-reference-assets.json`에 파일/해시만 기록, 직접 사용 금지.
- 과거 승인 캐릭터·갈림길 사진이 모두 확보됐다고 주장하지 않음. 실제 신규 제작 전 개별 참고 자료 확보·비교.

## 버전 충돌/실구현 리스크
1. **문항 유형 확장:** 확정 명세의 대표 4종과 실제 원본 7종 사이 간극. 연결·순서·분류를 원본 그대로 지원해야 하며 임의 삭제·자동 변환 금지.
2. **보상/정정:** 최초 정답·유효 회수 별빛 +1, 지역 완료 열쇠 +1 / 별빛 0. 정정 시 파생 활동 재계산 및 정산 필요.
3. **저장/타이머/두 창:** IndexedDB 원자성, 단일 writer, file:// Chrome/Edge, 복원 뒤 교사 재개만 허용.
4. **배포:** 브랜치 작업을 운영 `main`에 병합하거나 Railway 서비스 설정을 바꾸지 말 것.
5. **아트:** 30지역/캐릭터 동작 포함 *전부 신규* 픽셀아트. 시안 승인과 PNG 본파일 업로드/해시/표시를 각각 추적.

## 게이트
PHASE 0 원본 JSON 전문 60개 대조는 정적 검사 근거를 확보했으나 **V01~V22의 통합/브라우저 실행 PASS는 아직 0개**.
PHASE 1은 새 저장소·기술 실험 코드 작성 준비 가능, **정상 저장·복구·출시 가능 판단은 차단**.
