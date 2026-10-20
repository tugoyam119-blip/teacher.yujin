# GitHub 바이너리 Library 중계 검증 — 2026-10-19

> **2026-10-20 갱신 — 자료 처리 기본 경로:** [F5 공식 규칙](F5_ASSET_PROCESSING_RULES_20261020.md)을 먼저 읽는다. 앞으로 승인 범위의 PNG 작업은 별도 F5 재지시 없이 원본 접근→영구 큐→원격 전체 SHA 검증→게임 연결·브라우저 확인 순서로 처리한다. 이 문서의 과거 Base64 우선 권장·전송 미확보·당시 진행 상태는 날짜가 붙은 이력이며, 현재 상태는 최신 장부와 증거로 조회한다. F5 test 서비스 배포와 운영 게임 배포는 다르며, 운영 main·승인 원본·학생 데이터 보호는 유지한다.

## 실제 검증 성공 (운영 main·Railway 무변경)
- 메인 원본: `logo_main_approved.png`, 1,653,077바이트, SHA-256 `2709003daaf25fd6124469d996fd78351b4f292a125d5f964f62733265c20094`, Git Blob SHA-1 `00a8586e7c57418bc7e99516df8971058f97c124`.
- 슬로건 원본: `logo_slogan_approved.png`, 578,942바이트, SHA-256 `33444040bc68b92094a0a15375cdaf8b42926bd11dd746fa0c9f2b3aabfc35d7`, Git Blob SHA-1 `e46cec47a5b2b92f7aa2dab8cd6706e770d329eb`.
- GitHub 원격 브랜치: `feat/moonpath-v411-rebuild-phase0-20261014`.
- 업로드 커밋: `d2c6f7bee38f140705dee64d33d1aca82691675a`. HEAD 재조회 일치.
- 원격 Git Tree 재조회에서 두 경로 및 위 크기·Git Blob SHA를 확인.
- 상태: **FILE_READ_PASS, BLOB_CREATED, TREE_LINKED, BRANCH_UPDATED, REMOTE_GIT_OBJECT_MATCH PASS.** 원격 파일의 별도 SHA-256 재계산과 HTML 실제 브라우저 렌더링은 미실시. 따라서 `REMOTE_SHA256_VERIFIED`, `HTML_RENDER_PASS`는 미완료.

## 새로운 성공 절차 (수동 PNG GitHub 업로드 불필요)
1. 원본 PNG의 SHA-256·크기·PNG 시그니처 확인.
2. 로컬 Python으로 원본 PNG를 **손실 없는 Base64** 텍스트로 인코딩 (4096자/줄). 파일 내용을 요약하거나 변환하지 않는다.
3. `files__manage_library`로 해당 텍스트 파일을 별도의 `/Moonpath Binary Bridge Tests` 폴더에 업로드.
4. **동일 `functions.exec` 실행 내부에서** `tools.files__read`의 `start_line`과 `max_lines`로 파일을 나누어 읽고, 반환 문자열을 연결해 개행만 제거. 기대 Base64 길이를 반드시 대조.
5. 같은 실행 안에서 `tools.mcp__GitHub__create_blob({repository_full_name, encoding:"base64",content})` 호출. 파일 내용을 사용자 채팅이나 출력창에 출력하지 않는다.
6. 로컬 PNG로 계산한 `SHA1(b"blob "+len+b"\\0"+bytes)` 값과 반환 Git Blob SHA를 비교. 모든 원본 객체 동일성 확인 후 브랜치 HEAD 및 기본 tree를 GitHub GET으로 조회.
7. `create_tree(base_tree_sha,[{path,mode:"100644",type:"blob",sha},...])` → `create_commit(parent_sha,tree_sha)` → `update_ref(expected_sha=이전 HEAD)`를 **개발 브랜치에서만** 실행.
8. 원격 `git/trees/<HEAD>?recursive=1` 재조회: 등록된 경로·크기·Git Blob SHA를 대조.
9. 별도 GitHub Actions SHA-256 및 HTML 브라우저 렌더링 검증 후에만 최종 QA PASS 판정.

## 진단
- Python 컨테이너에 PAT가 없고 GitHub DNS도 제한되어 직접 HTTPS 접근은 실패.
- 인증된 GitHub 연결은 쓰기가 가능하고, Binary Blob API는 Base64를 지원.
- 해결의 핵심은 **Library에 원본의 Base64 텍스트를 등록하여 Files 도구와 GitHub 도구를 동일한 functions 실행 안에서 연결**한 것.
- 비밀 토큰을 채팅에 게시할 필요 없음.
- 모의 테스트나 68바이트 시험과 다르게 실제 승인 PNG **두 장 모두** 원격 브랜치에 반영됨.
- 데이터 유출·오염 예방을 위해 원본 Base64 전체를 챗 메시지에 출력하지 않고 Library 중계 폴더 접근 관리, 필요 시 정리.

## 12개 후보 방안 비교 (서로 다른 전달·실행 경로)
| 번호 | 방안 | 장점 | 장애/제약 | 적합한 상황 |
|---|---|---|---|---|
| 1 | Library 텍스트 중계 + create_blob | 현재 환경에서 실증 성공, PAT 불필요 | Base64 확장량, 분할 읽기 필요 | 현행 최우선 |
| 2 | GitHub 도구에 로컬 경로·ID 직접 인자 | 가장 단순 | 현재 스키마 미지원 | 향후 도구 확장 |
| 3 | Files read에서 native binary 직접 전달 | 중간 Base64 파일 불필요 | GitHub content는 문자열 요구 | 도구 스키마 개선 시 |
| 4 | GitHub Actions: 인증된 오브젝트 스토리지에서 파일 가져오기 | 재실행·서버 검증 유리 | 외부 접근 가능한 안전한 URL 필요 | 연속 배치 |
| 5 | Work Cloud Browser 업로드 | 실제 브라우저 GitHub 입력 UI 이용 | 파일시스템 자동 첨부 지원 별도 확인 | UI 중심 일회성 |
| 6 | 원격 dev sandbox + tarball 전달 | CLI·git 이용 가능 | 파일 tarball 입력을 원본에서 중계해야 함 | 다수 파일 |
| 7 | 로컬 파일감시 에이전트 + PAT | 이미지 수정 즉시 푸시 | PC 상시 실행 및 비밀관리 | 로컬 제작 주도 |
| 8 | 로컬 git/gh CLI + git credential manager | 범용 git 워크플로 | 현재 컨테이너 DNS 실패 | 사용자 PC/CI |
| 9 | 자체 업로드 API Gateway | 변환·해시·로그 제어 | 호스팅·인증·운영 필요 | 장기 서비스 |
| 10 | GitHub Contents API 단일 Base64 PUT | Tree 단계를 단축 | 본문 전송 경로 및 API 제한 | 한 파일 갱신 |
| 11 | 기존 이미지 호스팅 공개 URL → Actions curl | 브랜치 자동 반영 쉬움 | 공개 원본 URL·무결성·수명 관리 | 공개 에셋 |
| 12 | 임시 조각 텍스트 커밋 → Actions 재조립 | GitHub 커넥터 텍스트만 써도 됨 | 조각 다수·CI 운영·정리 필요 | Blob 호출 크기 제한 시 |

**권장:** 1번을 기본으로 유지하며, CI 검증이 필요해질 때 4번을 후속 조합한다. 기존 운영 main/Railway/학생 데이터 변경 금지.
