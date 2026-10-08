# 일갈피 (ILGALPI)

> 복잡한 할 일, 우선순위의 갈피를 잡다.

여러 프로젝트와 개인 할 일을 한곳에 등록하면, AI가 마감·중요도·소요시간·오늘 남은 작업 가능 시간을 종합해 **실행 순서와 이유**, 그리고 **오늘의 Focus(최대 3개)** 를 제안하는 웹서비스입니다. 상세 명세는 [PRD.md](./PRD.md)를 참고하세요.

## 주요 기능

- **할 일 관리**: 프로젝트(선택) 생성·이름 수정·삭제, 작업 등록·수정·삭제·완료. 프로젝트 없이 개별 할 일 등록 가능
- **AI 우선순위 추천**: Gemini 1회 호출로 프로젝트 순위, 전체 작업 순위, 이유, 오늘의 Focus, 주의사항 생성. 서버에서 응답을 검증하며, 규칙을 어긴 결과는 표시하지 않음
- **오늘의 Focus**: 남은 작업 가능 시간 안에 들어가는 작업 최대 3개. 완료 체크, 변경 시 "추천이 최신이 아니에요" 표시 후 재추천
- **기본 추천**: AI를 쓸 수 없을 때 규칙 기반 추천. 화면에 항상 "기본 추천 · AI 분석 아님"으로 구분해 표시

데이터는 **이 브라우저의 localStorage에만** 저장됩니다(로그인·서버 DB 없음). AI 분석 시에는 미완료 작업 정보가 Google Gemini API로 전송됩니다.

## 로컬 실행

요구 사항: Node.js 20.9 이상 (개발 환경은 Node 24)

```bash
npm install
cp .env.example .env.local   # GEMINI_API_KEY 값을 채워 주세요
npm run dev                  # http://localhost:3000
```

`GEMINI_API_KEY`가 없어도 앱은 동작합니다. 이 경우 AI 추천 시 안내가 나오고, 기본 추천을 사용할 수 있습니다.

## 환경 변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `GEMINI_API_KEY` | 필수 | — | [Google AI Studio](https://aistudio.google.com/apikey)에서 발급. 서버에서만 사용되며 브라우저로 노출되지 않음 |
| `GEMINI_MODEL` | 선택 | `gemini-3.8-flash` | 사용할 Gemini 모델 ID |
| `AI_TIMEOUT_MS` | 선택 | `20000` | AI 호출 1회당 타임아웃(ms). 재시도 포함 전체 예산은 40초 |

`.env.local`은 Git에 커밋되지 않습니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint |
| `npm test` | 단위 테스트(Vitest): 응답 검증, 기본 추천, 요청 검증, API 라우트(Gemini 응답 모킹) |

## Vercel 배포

1. 이 폴더(`ilgalpi`)를 Vercel 프로젝트로 연결합니다. Git 저장소 루트가 상위 폴더라면 **Root Directory를 `ilgalpi`** 로 지정하세요.
   - CLI: `npx vercel` (최초 1회 `npx vercel login`)
2. Project → Settings → Environment Variables에 `GEMINI_API_KEY`를 추가합니다(Production, Preview).
3. 환경 변수를 추가·변경한 뒤에는 **재배포**해야 반영됩니다: `npx vercel --prod`
4. 배포 URL이 공개되므로 Google Cloud 콘솔에서 API 키 할당량(quota)을 낮게 설정해 두는 것을 권장합니다.

## 구조

```
app/
  page.tsx                  단일 페이지
  api/recommend/route.ts    POST: 요청 검증 → Gemini 호출 → 응답 검증(1회 재시도) → 결과
components/                 App, TaskBoard, TaskModal, ResultPanel, AvailableTimePicker, Badges
hooks/useAppStore.ts        localStorage 기반 상태 저장소와 CRUD 액션
lib/
  recommend/                기본 추천, 응답 검증, 요청 생성·검증
  ai/                       프롬프트, 응답 스키마, Gemini REST 호출, 재시도 로직
  fingerprint.ts            추천 최신성(재분석 필요) 판정
tests/                      Vitest 단위 테스트
```
