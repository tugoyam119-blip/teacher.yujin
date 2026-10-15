# PHASE 2-9 · 기능 검증 시제품 실행 안내

> 《미지의 길 : 달빛 마도 탐험》 v4.1.1, 교사 전용 · **실사용/학생 배포 금지** · **기존 운영버전과 별도**.

## 산출물 역할

- `dist/phase2-9-one-region-smoke.html`: 테스트용 단일 HTML. 외부 파일/네트워크 불러오기 없이 60문항/공통 엔진을 내장한 **기능 검증용**입니다. 새 픽셀아트·승인 HOME·정식 온라인/오프라인 출시 빌드가 아닙니다.
- `src/demo/one-region-smoke.js`, `src/demo/one-region-template.html`: 최소 교사 조작 화면. 학생에게 HTML을 배포하지 마세요. 문항 정답·해설 전체가 소스에 포함되어 있습니다.
- `scripts/build-one-region-smoke.mjs`: 정확히 위 HTML을 생성하는 빌드 도구.
- `tests/phase2-2-9.test.mjs`, `tests/phase2-2-9-build.test.mjs`: Node/FakeDatabase 통합·산출물 검사.
- `tests/browser/phase29-dom-smoke.py`: Chromium 실제 버튼 클릭. **모의 IndexedDB 삽입**이며 네이티브 저장 확인이 아닙니다.
- `tests/browser/phase29-native-preflight.py`: `file://`/localhost 실제 진입만 검증. 정책 차단은 BLOCKED로 기록합니다.

## 재현 명령(프로젝트 디렉터리에서)

```sh
npm run build:phase2:2-9
npm test
npm run check:syntax
# Python Playwright와 Chromium이 별도로 설치된 시험 환경에서만:
python tests/browser/phase29-dom-smoke.py
python tests/browser/phase29-native-preflight.py
```

## 시험 동작(2모둠)

1. 시험 HTML에서 슬롯Ⅰ·모둠2개 선택 → `새 시험`.
2. 모둠1 문제를 `준비`하고 타이머 시작→답변 접수→교사 정답 확정.
3. 모둠2 문제를 준비하고 타이머 시작→답변 접수→교사 오답 확정.
4. 다른 모둠이 가로채기 정답→지역 완료 확정. **열쇠1·별빛2 / 미회수1**.
5. 다음 지역 진입 후 원모둠 회수 정답→**열쇠1·별빛3 / 미회수0**.
6. `JSON 백업`→파일 기록. 동일 슬롯을 덮어쓰지 말고 별도의 **빈 환경**에 복원.

`이어하기`에서 저장 데이터가 사라졌다면 테스트 FAIL로 기록하고, 실제 브라우저/OS·저장 권한·파일 경로를 조사해야 합니다. 임의로 `localStorage.clear`, `indexedDB.deleteDatabase`, 구운영 폴더 삭제를 하지 마세요.

## 미완료 검증

이 환경의 Chromium 144는 `file://`와 로컬 HTTP 모두 `ERR_BLOCKED_BY_ADMINISTRATOR`여서 **실제 IndexedDB·완전한 브라우저 종료 후 지속성·네트워크 차단 상태 복원은 아직 PASS가 아닙니다.** 브라우저·PDF·CSV·두 창 통신/학생 분리·최종 픽셀아트 UI 및 운영 배포는 후속 검증 게이트를 유지합니다.
