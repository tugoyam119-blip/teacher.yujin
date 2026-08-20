# 유진T 클래스룸 v3

유진T 클래스룸 v3는 **수업자료/게임/수행평가를 업로드하고 패치하면 GitHub와 Railway 배포까지 이어지는 교사용 배포 플랫폼**입니다.

## v3에서 달라진 점

- 통합사회2, 국제관계와 국제기구, 학습 보드게임 같은 **정적 HTML 프로그램은 별도 Railway 서비스가 필요 없습니다.**
- 정적 앱은 `classroom-hub/apps/<slug>` 아래에서 유진T 클래스룸이 직접 제공합니다.
- 인권 수행평가처럼 서버/DB가 필요한 프로그램만 `services/<slug>`에 두고 Railway 독립 서비스를 사용합니다.
- 교사용 화면에서 새 프로그램 업로드, 패치, 버전 복구, 학생 링크 복사, 공개/숨김을 처리합니다.
- GitHub 토큰과 Railway 토큰은 브라우저에 저장하지 않고 서버 환경변수에만 둡니다.
- 학생 링크는 `/go/<slug>`로 고정됩니다. 패치 후에도 주소가 바뀌지 않습니다.

## 최초 1회 필요한 것

v3가 자기 자신을 인터넷에 올리기 전에는 웹페이지가 존재하지 않기 때문에 **최초 1회만** GitHub와 Railway에서 클래스룸 허브를 배포해야 합니다.

1. 이 폴더 전체를 GitHub 저장소에 올립니다.
2. Railway에서 GitHub 저장소를 연결한 서비스 하나를 만듭니다.
3. Root Directory를 `/classroom-hub`로 지정합니다.
4. PostgreSQL을 하나 추가하고 `DATABASE_URL`을 클래스룸 서비스에 연결합니다.
5. 클래스룸 서비스 환경변수에 아래 값을 설정합니다.
   - `TEACHER_PIN`
   - `COOKIE_SECRET`
   - `GITHUB_TOKEN`
   - `GITHUB_OWNER`
   - `GITHUB_REPO`
   - `GITHUB_BRANCH=main`
   - `RAILWAY_TOKEN`
6. Railway의 `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_ID`는 배포 환경에서 시스템 변수로 자동 제공됩니다.
7. 클래스룸 주소에 접속해 교사 PIN으로 로그인합니다.
8. `인권도시 수행평가` 카드에 **서버 자동연결** 버튼이 보이면 누릅니다. 그러면 GitHub의 `services/human-rights`를 기반으로 Railway 서비스/도메인 생성을 시도합니다.

이후 새 정적 프로그램은 Railway에 들어가지 않고 클래스룸의 **새 프로그램 올리기**에서 HTML/ZIP만 선택하면 됩니다.

## 새 프로그램 올리기

### 정적 웹앱

추천 대상: 교사용 설명자료, 퀴즈, 보드게임, 브라우저 안에서만 동작하는 시뮬레이션

- 단일 HTML: 그대로 업로드
- 여러 파일: `index.html`이 최상위에 있도록 ZIP 업로드
- 자동 저장 위치: `classroom-hub/apps/<slug>`
- 별도 Railway 서비스: 없음

### 서버형

추천 대상: 학생 답안 저장, 로그인, DB, 교사 채점, AI API 등 서버가 필요한 수행평가

ZIP 최상위에 다음이 필요합니다.

- `package.json`
- `scripts.start`
- 서버 소스
- `/health` 엔드포인트 권장

자동 저장 위치는 `services/<slug>`이고, GitHub 저장 후 Railway 서비스 생성/Root Directory/도메인/배포를 API로 요청합니다.

## 패치

교사용 화면에서 `패치` → 새 HTML/ZIP 업로드만 하면 됩니다.

- GitHub 기존 프로그램 폴더 교체
- 새 커밋 생성
- 재배포 요청
- 학생 고정 주소 유지
- 버전 번호 증가
- 버전 기록 저장

## 이전 버전 복구

`버전` 메뉴에서 이전 GitHub 커밋을 골라 복구합니다. 선택한 시점의 프로그램 폴더를 새 커밋으로 복원하고 재배포합니다.

## 보안

- `GITHUB_TOKEN`, `RAILWAY_TOKEN`, `COOKIE_SECRET`은 절대 HTML/JavaScript에 넣지 않습니다.
- GitHub 토큰은 해당 저장소에 필요한 최소 권한만 부여하는 것을 권장합니다.
- 실제 학생 답안은 Railway PostgreSQL을 사용하세요.
- 서버형 ZIP에서 `.env`, secret/credential 이름이 포함된 파일은 업로드 단계에서 차단합니다.

## 아이패드

모든 기존 정적 앱은 Safari 주소로 여는 방식입니다. `.html` 파일을 iPad 파일 앱에서 직접 열 필요가 없습니다.

Safari에서 클래스룸 주소를 열고 `공유 → 홈 화면에 추가`를 하면 앱처럼 사용할 수 있습니다.

## 서버형 앱 자동 환경변수 규칙 (선택)

서버형 ZIP에 `yujint.app.json`을 넣으면 클래스룸이 Railway 서비스를 만들 때 필요한 공통 환경변수를 함께 넣을 수 있습니다.

```json
{
  "schema": 1,
  "type": "server",
  "healthcheck_path": "/health",
  "manage_path": "/?teacher=1",
  "inherit_env": ["TEACHER_PIN", "DATABASE_URL"],
  "variables": {"APP_MODE":"classroom"}
}
```

현재 안전하게 상속하는 공통 비밀값은 `TEACHER_PIN`, `DATABASE_URL`입니다. 따라서 클래스룸에 PostgreSQL이 연결되어 있으면 서버형 수행평가에도 같은 DB 연결 문자열을 서버 간에만 전달할 수 있습니다.
