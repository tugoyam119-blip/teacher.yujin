# 《미지의 길 : 달빛 마도 탐험》 v4.1.1 — 새 채팅 인수인계

**기준일:** 2026-10-16 (KST) · **공식 현재 단계:** PHASE 3-3 디자인 방향 승인, **게임용 64×64 독립 스프라이트·23프레임 미구현**.  
**이 문서는 신규 제작기준을 변경하는 것이 아니라 기존 결정·증거를 연결하는 안내서입니다.**

## 1. 반드시 먼저 읽을 공식 자료
- 최상위 기준(결정 01~42, V01~V22): `docs/MASTER_v4.1.1_original.md`.
- 누적 개발·검증: `docs/PROJECT_STATUS_HANDOFF_v4.1.1_20261014.md`.
- PHASE 3-1 실물 원본/규격: `docs/PHASE3_STEP3_1_REFERENCE_AND_STANDARD_20261016.md`, `data/phase3-visual-contract.json`.
- PHASE 3-2 후보 및 HOME B안 방향: `docs/PHASE3_STEP3_2_HOME_CONCEPTS_20261016.md`, `data/phase3-home-concept-candidates.json`.
- PHASE 3-3 최신 캐릭터 디자인 승인: `docs/PHASE3_STEP3_3_CHARACTER_DIRECTION_APPROVAL_20261016.md`, `data/phase3-character-design-sheet.json`.
- 16단계 상태: `data/phase3-sixteen-stage-tracker.json` / 신규 자산 장부: `data/asset-manifest.json`.
- PHASE 2 마지막 1지역 시험: `docs/PHASE2_STEP2_9_VERIFICATION_20261016.md` 및 `data/phase2-nine-stage-tracker.json`.

저장소: https://github.com/tugoyam119-blip/teacher.yujin  
신규 전면개발 브랜치: `feat/moonpath-v411-rebuild-phase0-20261014`  
신규 개발 경로: `classroom-hub/apps/moonpath-v41/`  
이 인수인계 직전 확인된 HEAD: `908b6081ce76f46313e02fa8672c8c08a648d549`.

## 2. 확정된 시각 방향 — 다시 임의로 선택하지 말 것
- **HOME: B안 승인**. 큰 보름달·달빛이 비추는 웅장한 부유 성역/성곽·폭포·깊은 공간감, 남색·보라·라벤더와 금빛 조명. B안은 **디자인 방향 승인**이지 게임용 PNG 분리/기능 승인 아님.
- **캐릭터 시트: 사용자 “응 좋아 마음에 들어”로 디자인 방향 승인** (2026-10-16). 풍성한 연보라색 긴 머리카락, 보라색 눈동자, 귀여운 치비 비율, 짙은 보라색 로브와 금빛 별·달 문양, 정면/후면/3/4 시각 정체성 유지.
- 과거 뒷모습 다섯 안에서는 사용자가 선택했던 **첫 번째 뒷모습**이 참고 정체성. 신규 승인 캐릭터 시트에 없는 신체·소품을 마음대로 확정하지 말 것.
- 현재 신규 B HOME 시안 및 캐릭터 시트는 **글자·장식과 캐릭터가 한 장에 합쳐진 이미지**. 실행용으로 직접 사용하지 않음. UI 글자·상태·버튼·입력은 HTML/CSS/JS, 그림은 신규 독립 PNG.
- HOME 네 가지 기본 메뉴: **새로운 탐험 / 이어하기 / 탐험 일지 / 설정**. 합성 시안에 생긴 추가 버튼·텍스트를 새 규칙으로 취급하지 않음.
- 원본 시각 참고 자료는 모두 `REFERENCE_ONLY`이며 신규 최종 그래픽은 **전부 신규 제작**(결정 29 B).

### 현재 승인 방향 이미지 (원본 바이트 증거)
- 캐릭터 디자인 시트: `달빛_아케인_여정_캐릭터_시트.png` · 1491×1055 RGB · 2,682,298 bytes · SHA-256 `b29da70036c0fbd7cfd1c2952665d8dfcbe250c9fc05bb2eea14e8e78213435d` · 현재 대화 이미지 파일 ID `file_00000000443482099a7b38e19c888412`.
- HOME B 방향 960×540 후보: `MP_PHASE3-2_HOME_B_DIRECTION_CANDIDATE_960x540.png` · SHA-256 `b918602567a3ffd630dc6aa0465eeb1ac0efe0efa1d035eb5f50c16ab11a03fc`.
- 과거 HOME 원본과 첫 번째 뒷모습 비교 이미지는 `data/phase3-reference-registry.json`에 출처. 실제 PNG를 찾지 못할 때 원본을 봤다고 주장하지 말 것.
- **주의:** GitHub에는 위 신규 이미지의 실제 바이너리 원본을 아직 업로드하지 않았음. 현재 대화에서 제공된 새 채팅 인수인계 ZIP의 `approved_directions/` 폴더에 두 이미지를 포함. 다음 채팅에서 이미지에 접근할 수 없다면 ZIP을 함께 첨부해서 실제 픽셀을 확인.

## 3. 기술·시각 규격
- 논리 무대 **960×540**, contain, 화면 크기별 크롭·비율 왜곡 금지.
- L0 원경, L1 지형/길, L2 캐릭터, L3 마법/달빛 FX, L4 동적 UI, L5 중앙 문제·결과, L6 교사용 안전.
- 캐릭터 신규 스프라이트 **64×64**, 필요하면 사용자 승인 거쳐 128×128 비교. **IDLE 4, WALK 6, CAST 6, SUCCESS 4, THINK 3 = 총 23프레임**. 모든 프레임 발 접지점·머리/몸/팔/손·의상 문양·투명도·지팡이 소지 여부 일관 검수.
- 아이콘 24/32px, 중앙 문제 팝업 최대 820×440.
- 최종 신규 PNG별 개별 원본 전체 SHA-256, 바이트 크기, Git blob/바이트 일치, 실제 브라우저 표시, **사용자 자산·화면 승인 및 기능 QA**를 각각 별도 근거로 기록.

## 4. 정확한 진행 상태
- PHASE 0: 운영 코드/문제은행/참고자료 조사 및 개발 환경 구축.
- PHASE 1: 이벤트/상태/IndexedDB 및 백업 모듈 구현, Node·모의 IDB 검사. **실제 IndexedDB·브라우저 강제 종료·file:// 실증 미통과 → PHASE 1 전체 완료 아님**.
- PHASE 2: 고정 2-1~2-9 핵심 모듈 및 1지역 완주 시험용 UI 구현. **총 513 Node/모의 저장·빌드 검사 PASS**, Chromium about:blank+모의 IDB DOM 조작 성공. **네이티브 브라우저 IndexedDB/무인터넷 완주 실증 미완료 → PHASE 2 전체 완료 아님**.
- PHASE 3-1: 기존 PNG 15개 분석, 제작규격·자산 관리표 정비 및 정적 검사.
- PHASE 3-2: A/B/C 신규 HOME 방향 시안 제작, 사용자가 **B안 선택**. HOME 최종 PNG 레이어·클릭 구현 전.
- **PHASE 3-3: 캐릭터 디자인 시트의 방향 승인 완료**. 64×64 정면·후면·3/4 독립 스프라이트 0개; **23개 애니메이션 프레임 0개**; GitHub 실제 신규 게임용 PNG 업로드 0개.
- PHASE 3-4~3-16: 미착수. V01~V22 추적표에서 **공식 최종 실증 PASS 0/22**; Node PASS와 혼동 금지.
- 운영 `main` / 과거 `classroom-hub/apps/moonpath-dev/` / 기존 저장키·데이터 / Railway 기존 서비스는 **수정·병합·배포 금지**. 실제 Windows Chrome·Edge 오프라인 검증과 최종 사용자 승인 전 출시 불가.

## 5. 새 채팅에서 바로 할 작업
1. 위 문서·GitHub 현재 브랜치 HEAD/추적표를 직접 확인하고 승인된 **B HOME와 신규 마도사 시트 실제 이미지**를 확인. 이 단계에서는 기존 디자인을 다시 후보 3안으로 처음부터 선정하지 말 것.
2. 승인 디자인을 기준으로 **64×64 정면·후면·3/4 독립 투명 스프라이트 후보**를 제작하고 각 프레임의 발 접지·크기·픽셀·손·의상 디테일을 비교. 필요 시 128 규격은 비교/재승인.
3. 베이스 외형과 방향을 사용자가 확인한 뒤 **23프레임 (IDLE4/WALK6/CAST6/SUCCESS4/THINK3)** 제작. 테스트용 수평 시트와 개별 PNG, 알파 검수, 프레임별 좌표·앵커·변경 로그 구분. 후보 생성만으로 게임용 자산 승인이라고 주장하지 않음.
4. 실제 전체 PNG 원본 바이트 GitHub 신규 경로 업로드·SHA 대조·브라우저 표시·사용자 디자인 승인·실제 클릭 QA 순서. 보존된 운영 서비스에는 병합/배포하지 않음.
5. 진행·검증 상태를 `data/phase3-sixteen-stage-tracker.json`, `data/asset-manifest.json`, 인수인계 문서에 증거 기반으로 갱신.

## 6. 새 채팅 시작 지시문

> 《미지의 길 : 달빛 마도 탐험》 v4.1.1 개발을 이전 채팅에서 이어가 주세요. 먼저 GitHub `tugoyam119-blip/teacher.yujin`의 `feat/moonpath-v411-rebuild-phase0-20261014`, `classroom-hub/apps/moonpath-v41/docs/NEXT_CHAT_HANDOFF_PHASE3_3_20261016.md`를 읽고 최상위 마스터 결정 01~42, V01~V22를 유지하세요. PHASE 3-2 HOME는 B안 디자인 방향 승인, PHASE 3-3 마도사 캐릭터 시트도 디자인 방향 승인입니다. 새 HOME나 캐릭터 시안을 처음부터 다시 선정하지 말고, 승인 이미지의 실제 픽셀을 확인한 뒤 PHASE 3-3의 64×64 독립 스프라이트/23개 애니메이션 프레임 제작부터 진행하세요. 기존 디자인 이미지와 엔진 코드·운영 main·저장 데이터는 변경하지 말고, 새 PNG·화면별 승인/해시/실제 브라우저 검증을 완료하기 전까지 어떠한 구현도 최종 PASS·배포 완료라고 주장하지 마세요. PHASE 1 실제 IndexedDB·강제 종료 복원·file:// 오프라인 시험은 여전히 미통과입니다. 확인이 어려운 원본은 추정하지 말고 인수인계 ZIP에서 실제 파일을 확인하세요.
