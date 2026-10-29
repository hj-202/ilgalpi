# 일갈피 (ILGALPI)

> 복잡한 할 일, 우선순위의 갈피를 잡다.

할 일을 날짜별로 등록하고, AI가 마감·중요도·소요시간·그날 작업 가능 시간을 종합해 **실행 순서와 이유**를 제안하는 웹서비스입니다. 최신 정책은 [PRD_v2.md](./PRD_v2.md)(v2.5, 문서 끝 부록이 우선)이고 이전 버전(v1 원본 `PRD.md`, v2.0~v2.2 백업)은 [docs/archive/](./docs/archive/)에 있습니다. 현재 구현·검증 현황은 PRD 부록과 [docs/STATUS.md](./docs/STATUS.md)를 참고하세요.

> **현재 상태**: 로컬 개발·테스트까지만 완료했고 **Vercel 배포는 아직 하지 않았습니다.** 배포 URL과 배포 환경 검증은 아직 없습니다.

## 주요 기능

모바일 폭(최대 480px) 중심 화면이며 데스크톱에서는 가운데 모바일 캔버스로 보여줍니다.

- **홈 / 내 기록 2탭**: 홈에는 주간·월간 캘린더, 날짜별 할 일, 조건 설정, 우선순위 추천이 있고, 내 기록에는 완료율 통계·그래프·지난 실행 기록·로그인 상태·의견 보내기가 있습니다.
- **날짜별 할 일**: 빠른 입력, 완료·취소, 삭제, 조건 설정(중요도, 예상 소요시간, `마감 일정` 시트로 마감일·마감 시간 선택). 미완료 할 일은 `할 일 옮기기`로 사용자가 선택해 다른 날로 옮깁니다. **자동 이월은 없고, 날짜를 옮겨도 실제 마감일·마감 시간은 바뀌지 않습니다.**
- **이날 작업 가능한 시간**: 날짜마다 따로 저장하며 추천 판단에 참고합니다(시간표를 자동으로 짜지는 않습니다).
- **우선순위 추천**: 선택한 날짜의 미완료 할 일이 2개 이상일 때 Gemini가 순위와 이유를 만듭니다. 서버에서 응답을 검증하고, 모델 과부하 등에는 다음 모델로 전환하며, 모두 실패하면 규칙 기반 추천으로 전환합니다. 실제 Gemini 호출이 성공한 결과만 `AI 추천`, 규칙 기반은 `기본 추천`으로 표시합니다. 저장된 결과는 전체 완료 후에도 `추천 결과 보기`로 다시 볼 수 있습니다(재호출 없음).
- **완료 기록**: 날짜별 `n/m 완료`·진행 바, 모두 완료한 날은 스탬프.
- **로그인과 게스트**: Google 로그인(Supabase Auth)을 하면 계정에 데이터가 저장·동기화되고, 로그인 없이도 모든 핵심 기능을 쓸 수 있습니다(이 경우 이 브라우저의 localStorage `ilgalpi:v3`에 저장). 이전 버전 키(`ilgalpi:v1`, `v2`)는 삭제하지 않고 남깁니다.
- **의견 보내기**: 내 기록의 모달에서 보내면 서버 API를 거쳐 Supabase에 저장됩니다.
- **첫 방문 온보딩 4장 + 시작 화면**: 정적 미리보기이며 실제 데이터와 섞이지 않습니다.

AI 추천 시 선택한 날짜의 미완료 할 일 정보가 Google Gemini API로 전송됩니다.

## 로컬 실행

요구 사항: Node.js 20.9 이상

```bash
npm install
cp .env.example .env.local   # 값을 채워 주세요 (Git에 커밋되지 않음)
npm run dev                  # http://localhost:3000
```

환경변수를 바꾼 뒤에는 개발 서버를 재시작하세요. `GEMINI_API_KEY`가 없어도 앱은 동작하며 기본 추천을 쓸 수 있고, Supabase 값이 없으면 게스트 모드로만 동작합니다. Supabase·Google 로그인 설정은 [docs/SETUP_SUPABASE.md](./docs/SETUP_SUPABASE.md)를 따릅니다.

## 환경 변수 (이름만 기재)

| 이름 | 용도 |
|---|---|
| `GEMINI_API_KEY` | 서버 전용. [Google AI Studio](https://aistudio.google.com/apikey)에서 발급 |
| `GEMINI_MODEL` | 선택. 기본 모델 지정(미지정 시 코드의 기본 모델 목록을 순서대로 시도) |
| `AI_TIMEOUT_MS` | 선택. AI 호출 1회당 타임아웃(ms) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (브라우저 노출 가능) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개(anon/publishable) 키 (RLS가 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용**. 의견 저장·rate limit에만 사용. `NEXT_PUBLIC_` 금지 |
| `RATE_LIMIT_SALT` | 선택. IP 해시용 솔트 |

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 서버 / 프로덕션 빌드 / 실행 |
| `npm run lint` | ESLint |
| `npm test` | 단위 테스트(Vitest) |
| `npm run check:gemini` | Gemini 연동 진단(키 값은 출력하지 않음) |
| `npm run verify:rls` | Supabase RLS 점검(서비스 롤 키 필요) |

## 배포 (Vercel)

사용자 승인 후 진행합니다. 환경변수를 Production/Preview에 등록하고, Supabase의 Site URL·Redirect URL과 Google OAuth 리다이렉트에 배포 도메인을 추가한 뒤 재배포해야 로그인이 동작합니다.

## 구조

```
app/            page, api/recommend, api/feedback, auth/callback, 아이콘
components/     App, HomeView, Calendar, DaySection, TaskItem, DueSheet, TimeWheels, QuickAdd,
                AvailableTimePicker, RecommendSection, MyPage, HistoryView, RecordChart, FeedbackModal,
                ImportModal, Onboarding(+onboarding/), StartScreen, ui
hooks/          useAppStore (게스트=localStorage, 계정=Supabase 동기화)
lib/            storage, date, stats, availability, fingerprint, account/, supabase/, server/(rate limit),
                recommend/(기본 추천·검증·근거 검사), ai/(프롬프트·스키마·Gemini 호출)
supabase/       migrations/0001_init.sql
tests/          Vitest 단위 테스트
```
