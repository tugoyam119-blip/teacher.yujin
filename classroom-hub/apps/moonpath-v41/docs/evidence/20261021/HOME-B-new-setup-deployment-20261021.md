# 새 탐험 규칙·문제팩 선택 복구 — 배포 결과

PR #53: https://github.com/tugoyam119-blip/teacher.yujin/pull/53
main: 9cfc8aab6d906527c06903bc59c29dedac30a2d8
Railway: ea6b0afc-d155-48db-be19-1ea039b77f80 / SUCCESS
개발 링크: https://magnificent-gentleness-production-61b8.up.railway.app/apps/moonpath-dev/

## 실제 검증
- 자동 검사 544개 통과.
- 실서비스: 새로운 탐험→규칙·문제팩 선택 먼저 표시, 규칙 미선택 다음 진행 거절, 기본팩 60문항 검증 완료→탐험 설정, 기존 슬롯 생성 거절.
- 실서비스: 이전 슬롯 II 이어하기→진행 문항 보호→IS2-U01-E03/PAUSED/57701ms 유지. 수업·타이머 자동 재개 없음.
- 로컬: 별도 JSON 팩 SETUP-BROWSER-TEST/v1.0.1 불러오기→탐험 생성→책장→갈림길→지역→선택팩 원문 실제 출제.
- JSON 복원 시 팩 ID·버전·원문 유지 및 잘못된 팩 저장 차단은 자동 검사로 확인.
- 실서비스 빌드 SHA: 4de61ef77f32a8738b7eac3394cf9248b5292890203eb81c72bdd3f913081be0 일치.
- HOME PNG/좌표 변경 없음. CSS는 선택 팝업 내부만, HTML은 CSS/JS 캐시 버전만 변경.

## 제한
규칙 선택은 현재 v4.1.1 기본 규칙 1종. 구버전 감독 강도·시간 프리셋까지 구현한 것은 아님.
JSON은 60문항 YQBank 구조, 최대2MiB. 다른 구조·문항 수는 지원하지 않음.
실서비스는 3슬롯 모두 기존 저장이 있어 삭제하지 않았으며, 새 탐험 생성·선택팩 출제/빈 슬롯 복원 성공은 로컬/자동 검사에서 확인.
