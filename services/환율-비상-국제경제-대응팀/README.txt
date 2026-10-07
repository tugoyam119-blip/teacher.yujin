환율 비상! 국제경제 대응팀 · v3.0 복원본

이 폴더는 더 이상 chatgpt.site로 이동시키는 런처가 아닙니다.
2026-10-07에 기존 ChatGPT Sites 배포본(exchange-crisis-team)을 역추적하여,
GitHub/Railway에서 단독 실행 가능한 서버형 수행평가로 복원했습니다.

확인된 원본 Sites 구조
- app/student/page.tsx
- app/teacher/page.tsx
- /api/exam
- /api/admin
- /api/help
- /api/extra
- /api/benchmark
- Cloudflare Worker + Vinext 0.0.50
- Sites deploymentVersion: 460c2288-1923-46c2-a9b5-028bf36e18c7

복원본 제공 기능
- 학생 로그인 / 대기 / 반별 수행 시작
- 45분 수행 타이머
- 답안 자동저장 / 최종 제출 / 재조회
- 도움 요청
- 추가시간 요청 및 승인
- 5분 추가시간 -2점 / 10분 -4점 / 기술 문제 감점 면제
- 교사 관리실
- 학생명단 CSV 업로드 및 검증
- 학생 상세 답안
- 기준표 자동 가채점
- 교사 최종 채점 및 채점 이력
- JSON 기반 영구 저장(DATA_DIR)

실행
npm start

검증
npm test

환경변수
- TEACHER_PIN: 교사 인증번호
- DATA_DIR: 영구 저장 경로(운영 Railway에서는 /data 권장)
- PORT: 서버 포트

주의
현재 복원본의 가채점은 운영 Site에서 확인한 25/25/20/20/4/6 채점 구조를 재현한
기준표 자동 가채점입니다. 기존 Sites의 OpenAI 기반 서버측 프롬프트 원문은 공개 배포물에서
직접 회수되지 않아, 원본 AI 프롬프트를 추정해서 넣지 않았습니다.

기존 운영 Site 및 Railway 서비스는 이 복원 브랜치 작업으로 변경하지 않았습니다.
