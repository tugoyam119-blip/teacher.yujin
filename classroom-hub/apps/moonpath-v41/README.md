# 《미지의 길 : 달빛 마도 탐험》 v4.1.1 — 전면 신규 개발

> **PHASE 1 공통 엔진 구현 중 / 비운영 / 배포 금지** · 시작일 2026-10-14

이 경로는 독립 신규 프로젝트입니다. `../moonpath-dev/` 및 운영 저장 키·데이터를 **읽기 참고** 외 어떤 방식으로도 변경하지 않습니다. 운영 `main`에 병합하지 않으며 사용자 최종 승인 전 자동 배포·클래스룸 활동 등록을 금지합니다.

## 확인된 소스
- 별도 보관된 원본 `통합사회2_1단원_YQBank_교과서기반_60문항_v1.0.json`을 발견하고 기존 `moonpath-dev/expedition.html`의 `DEFAULT_PACK`과 60문항 모든 JSON 필드의 의미적 일치를 검사했습니다(차이 0).
- 원본 팩 `data/YQBank_60_v1.0.0_source.json`은 **변경 불가 스냅샷**. 신규 스키마로 바꿀 경우 복사·변환본을 별도 경로에 두고 원본 ID/정답/수정 버전을 유지합니다.
- 신규 아트 원본은 아직 없습니다. `data/asset-manifest.json`에서 신규 아트 0개·승인 0개로 기록합니다.

## 제작 흐름
PHASE 0(원본·환경) → 1(상태/IndexedDB) → 2(1지역 완주) → 3(신규 아트·HOME부터 화면별 승인) → 4(전 지역/엔딩) → 5(브라우저·오프라인) → 6(최종 승인 후 병합/배포).

`npm test`는 PHASE 0 원본 정적 검사와 PHASE 1 규칙·모의 IndexedDB 검사입니다. 로컬 53건 PASS여도 **실제 브라우저 IndexedDB / file:// / 동시창 / 1지역 플레이 완료 증거는 아닙니다.** 별도 `docs/PHASE1_ENGINE_VERIFICATION_20261014.md` 참고.

## 보호 장치
- 브랜치: `feat/moonpath-v411-rebuild-phase0-20261014` (출발 `main` 커밋 `16c5d7f9d929a06a35b47c8da410c7a73facdf20`)
- 신규 경로: `classroom-hub/apps/moonpath-v41/`
- 새 저장 네임스페이스 제안: `moonpath-v411` (구형 저장 데이터와 키를 공유하지 않도록 PHASE 1에서 확인)
- 신규 서비스 라우트/등록: **미연결**, 기존 `/apps/moonpath-dev/` 영향 없음
- 운영 변경, PR 병합, Railway 배포: **실행 금지, 수행 안 함**

문서와 정적 검사 결과는 `docs/` 및 `data/verification-v01-v22.json`을 확인하십시오. 실제 Chrome/Edge 저장 실증까지 신규 엔진 완료 선언·운영 배포 금지.

## PHASE 1 — 신규 공통 엔진 착수 (2026-10-14)
- 실제 모듈: `src/engine/`, `src/storage/` (이벤트 리듀서·차시/타이머·단독 writer·IndexedDB·백업).
- **Node 신규 단위·모의 저장소 검사 30건 PASS**. 상세: `docs/PHASE1_ENGINE_PROGRESS.md`.
- 원본 문제팩·30지역·기존 운영 경로 및 저장 키 수정하지 않음.
- **브라우저 IndexedDB / file:// / 두 창 / 게임 1지역 플레이는 NOT_RUN**. 신규 PNG/화면 승인도 아직 0.
- 운영 `main` 병합·PR 자동 병합·Railway 배포는 금지.
