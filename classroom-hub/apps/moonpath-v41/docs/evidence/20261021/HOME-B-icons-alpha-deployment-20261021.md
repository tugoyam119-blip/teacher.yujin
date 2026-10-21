# HOME 아이콘 배경 제거 — 배포 결과 (2026-10-21)

PR #55 병합: https://github.com/tugoyam119-blip/teacher.yujin/pull/55
main: 5a5b44065aac60fd372f8db92e3d6fb344fab76f
Railway: e2128e00-c8ea-47cd-a6ba-9128b73ca3b4 SUCCESS, healthcheck 통과
개발 링크: https://magnificent-gentleness-production-61b8.up.railway.app/apps/moonpath-dev/

원본 ui-source-original.png 및 HOME 배경·프레임·캐릭터·로고·CSS 보존. 7개 crop의 RGB 모든 바이트 변경0, alpha만 처리한 별도 icons-alpha-v1 PNG 연결. 원 crop 크기·주40×40/보조24×24 표시·버튼 좌표·아이콘 앵커 유지.
실제 개발 링크를 열어 7개 PNG 로딩, 네모 배경 사라짐을 전체 HOME 스크린샷으로 시각 확인. 실제 PNG7개 전체 다운로드 SHA-256 manifest 모두일치. 버튼·아이콘 DOM 좌표 기존과 동일.
픽셀 검사: HOME-B-icon-alpha-pixel-checks.json. 원격: HOME-B-icons-alpha-live-hashes.json. 실제 화면: HOME-B-icons-alpha-live-final.png (원본 프레임7개 로딩 완료 확인 후 캡처). 클립 스크린샷은 브라우저 도구 좌표가 적용되지 않아 검증 증거에서 제외.

imagegen 투명화 후보는 외형 변화가 있어 미적용. 적용 파생본은 기존 RGB에 투명도 마스크만 적용.
F5 health ready였으나 허용 출처 .oaiusercontent.com에 GitHub URL이 포함되지 않아 INVALID_JOB 접수 거절. 허용 범위 변경 없이 검증된 Git 경로로 전달·전체 SHA 대조. F5_QUEUE_JOB 비운 뒤 정리 배포48590994-7003-4edf-8dde-5523ac5335e2 SUCCESS. F5 큐 성공으로 표시하지 않음.
저장·복원 엔진 변경 없음. 이번 검증은 아이콘/표시/좌표/원격 바이트 범위이며 전체 게임·오프라인 검증 아님.

