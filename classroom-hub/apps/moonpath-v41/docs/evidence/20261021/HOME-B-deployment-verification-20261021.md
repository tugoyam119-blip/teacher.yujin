# HOME B 클래스룸 배포·실제 저장/복원 검증

검증일: 2026-10-21 KST

## 반영 완료

- 사용자 명시 승인에 따라 PR #49를 main에 병합했다.
- PR: https://github.com/tugoyam119-blip/teacher.yujin/pull/49
- PR HEAD: `33f5aa510709d54dc1a1467f18d73f9969f19d67`
- main 병합 커밋: `b4d76557718ed9048f8df90ed989ae86c3dd323e`
- Railway 배포: `dee6c09c-356b-4b1f-a168-3e60aafa7e55`, **SUCCESS**.
- 기존 개발 링크: https://magnificent-gentleness-production-61b8.up.railway.app/apps/moonpath-dev/
- 접속 경로: 기존 HOME → 설정 → **v4.1.1 HOME B 조립본 확인**.
- HOME B 직접 주소: https://magnificent-gentleness-production-61b8.up.railway.app/apps/moonpath-v41/home-b/

기존 HOME을 새 그림으로 교체하지 않았다. 승인된 범위대로 설정 팝업에 조립본 링크를 추가했다. 이번 배포 과정에서 이미지를 새로 생성하거나 원본 PNG 바이트를 변경하지 않았다.

## 실제 배포 URL에서 확인한 결과

| 항목 | 결과 |
|---|---|
| 기존 개발 HOME에서 설정 링크로 HOME B 진입 | 통과 |
| 1280×720에서 배경·마도사/고양이·로고·슬로건·버튼·아이콘 표시 | 통과 |
| 7개 PNG 전체 HTTPS 재다운로드 크기·SHA-256 대조 | 원본과 모두 일치 |
| HOME HTML/JS/CSS 및 지역 시험 HTML 4개 전체 바이트 대조 | 검증한 로컬 파일과 모두 일치 |
| 기존 HOME 배포 전후 비교 | 1280×720 전체 화면 픽셀 일치 |
| 실제 개발 DB 빈 슬롯 II에 검증 백업 JSON 복원 | 성공 |
| 복원 후 이어하기 | IS2-U01-E03, revision 8, 60초, 차시/타이머 PAUSED |
| 수업·타이머 재개 후 C 답안 저장 | 저장 성공 메시지 확인 |
| HOME 복귀 → HOME 새로고침 → 이어하기 | 같은 문항·revision 12·57,701ms·차시/타이머 PAUSED |
| HOME 설정에서 새 JSON 백업 다운로드 | 성공, 43,360 bytes |
| 새 백업 자체의 엔진 무결성 검증 | 통과, 저장 답안 C·남은 시간 57,701ms·revision 12 일치 |
| 이미 탐험이 있는 슬롯 II에 JSON 재복원 시도 | 덮어쓰기 거부 |
| 브라우저 오류 로그 | 검증 시 수집된 error 없음 |

시험 저장소는 `moonpath-v411-phase29-smoke-db-v1`다. 기존 I·III는 삭제하거나 덮어쓰지 않았다. 이번 복원/저장 검증 기록은 시험 슬롯 II에 남아 있다. 구형 운영 HOME 저장 데이터 삭제 작업은 수행하지 않았다.

새 백업 SHA-256: `e032e026e82f382a9e992b98b5f554627990b3cc2bdbe9c4b6eb6fd79f0372c5`.
복원 입력 백업 SHA-256: `18f28e5e213a6d0c98a825c45a92508397ab3b4137d32d1df87b8956b43052e3`.

## 한계·남은 항목

- 최종 HOME 디자인 승인과 제작 후보 프레임 등의 최종 자산 승인은 이번 개발 배포 승인과 별개다. 화면에도 검토 중이라고 표시한다.
- 상세 탐험 일지·PDF/CSV·전체 게임 완성은 이번 검증 범위가 아니다.
- 실제 시험 브라우저는 in-app browser다. Windows Chrome/Edge, 모바일 실기기, file:// 오프라인, 강제 프로세스 종료, 두 창 충돌은 이번 배포에서 확인하지 않았다.
- 자동 검사 530개 통과는 앞선 PR 조립 단계의 결과다. 이번 턴은 승인된 기존 PR 병합/배포와 실제 배포 URL 검증을 수행했으며 새 기능 코드는 수정하지 않았다.
- Node HTTPS 검증은 현지 인증서 문제로 실패했다. TLS 검증을 끄지 않고 Windows HTTPS 도구로 전체 파일 대조를 완료했다.

## 증거 파일

- `HOME-B-live-20261021.png`: 배포 HOME B 실제 화면.
- `HOME-B-live-link.png`: 기존 개발 HOME 설정의 연결 링크.
- `HOME-B-live-JSON-restored.png`: 실제 배포 화면의 JSON 복원 성공.
- `HOME-B-live-save-resume.png`: 배포 지역 화면의 문항·정지 상태.
- `HOME-B-live-evidence.json`: 실제 UI 표시에서 수집한 복원 전후 상태.
- `HOME-B-live-backup-check.json`: 다운로드된 새 백업의 엔진 검증 결과.
- `HOME-B-deployed-sha256.json`: 배포 PNG 7개 전체 해시.
- `HOME-B-deployed-code.json`: 배포 코드 4개 전체 해시.
- `HOME-old-preservation.json`: 기존 HOME 픽셀 비교 결과.
