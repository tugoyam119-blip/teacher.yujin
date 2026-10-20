# PNG 바이너리 왕복 검증 (2026-10-19)

이 폴더는 인증된 GitHub 연결을 통한 PNG 원본 바이트 전달 실험입니다.
운영 이미지의 교체, main 병합, 서비스 배포를 수행하지 않습니다.

## 입력

- 현재 작업 환경에 실제로 존재하는 github_binary_probe.png
- 1 x 1 PNG, 69 bytes
- SHA-256: c319b4ed7e591d5505bc3b8a73b8e3eb8f74e596cc8c00cf1d8e4b8c120e24d7
- Git blob SHA-1: c79be11a976d83b3b9e19816db720dee013808eb

## 실행 경로

1. 파일 전체 바이트 읽기와 Base64 인코딩
2. GitHub.create_blob(content=전체 Base64, encoding=base64)
3. 기존 main의 base_tree를 보존하여 새 파일만 추가
4. 새 commit 및 격리된 테스트 branch 생성
5. GitHub.fetch_file(path=PNG 경로, ref=테스트 commit, encoding=base64)로 재조회 시도
6. 수신 바이트와 로컬 원본의 길이, SHA-256, Git blob SHA-1 및 전체 바이트 비교

## 범위와 한계

이 커밋을 만들 때 재조회 검증은 아직 대기 상태입니다. 결과는 PR 검증 기록을 확인합니다.
69-byte fixture 성공은 대용량 PNG의 무인 자동 전송 성공을 의미하지 않습니다.
현재 create_blob은 파일 경로나 파일 참조 ID가 아니라 content 문자열을 받습니다.
기존 fetch_blob과 generic fetch의 PNG 직접 조회는 UTF-8 처리 오류를 보였습니다.

공식 API 참고: https://docs.github.com/en/rest/git/blobs
https://docs.github.com/en/rest/git/trees
https://docs.github.com/en/rest/repos/contents
