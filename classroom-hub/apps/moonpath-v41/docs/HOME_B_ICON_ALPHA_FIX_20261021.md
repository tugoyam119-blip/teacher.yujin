# HOME 아이콘 배경 제거 (2026-10-21)

요청: 기존 아이콘 모양·색·버튼 배치 유지, 네모 배경만 제거.

## 변경
원본 ui-source-original.png는 보존. 기존 7개 crop의 RGB 전체 바이트를 그대로 유지한 RGBA 파생 PNG를 assets/home/icons-alpha-v1/에 저장. 알파만 변경하고 각 파일의 캔버스 크기는 원 crop 크기와 동일하다. HOME은 해당 파일을 기존 크기(주메뉴40×40/보조24×24)와 동일 contain 공식으로 표시한다. CSS/클릭 영역/프레임/문자 위치 변경 없음.

투명화는 색 경계와 1px 외곽 보호 마스크로 처리. 나침반은 원 crop에 포함된 버튼 프레임을 별도 마스크로 제외하고, 트로피 내부 별 문양은 보존. 원본을 다시 그리지 않았으며 저장한 RGB는 원본 crop과 모든 픽셀 일치. alpha0 영역에도 원본 RGB 보존.
imagegen 배경 제거 후보는 외곽·크기 변화가 있어 게임에 적용하지 않았다. 게임 파생본은 원본 RGB에 투명도만 적용한 결과다.

## 전달과 검증
SOURCE_READ_PASS / REMOTE_BYTES_VERIFIED / GAME_PATH_LINKED / 로컬 HTML_RENDER_PASS.
원격 fix/moonpath-icon-alpha-20261021의 PNG7개 전체 다운로드 SHA-256=각 manifest 값 일치.
F5 health는 ready이나 큐가 .oaiusercontent.com 출처만 허용하여 GitHub source INVALID_JOB로 접수 거절. 허용 목록 변경하지 않음. F5_QUEUE_JOB 비우고 재배포. F5 QUEUE_SUCCEEDED라고 표시하지 않음. Git 경로 전체 바이트 검증으로 전달.
로컬960×540 버튼 좌표: 주메뉴 x733/폭208/y125,203,280,357; 보조x749,812,877/y440/48×55 유지. 네모 배경 사라짐 시각 확인. 기존 원본7PNG·HOME CSS 변경 없음.
실서비스 브라우저 표시·배포는 PR 병합 후 확인하며, 전용 아이콘 최종 디자인을 새로 승인받았다고 주장하지 않는다.
