# 구현 현황 (PRD v2.3 기준, 로컬 구현 단계)

백업: `~/ai-side-project-backups/ilgalpi-pre-v2.3-*.tar.gz` (구현 시작 전 상태, .git·.env.local 포함)
Git 커밋·Push·Vercel 배포는 진행하지 않았다(사용자 검토·승인 대기).

## 구현·검증됨 (로컬 브라우저로 확인)
홈(주간/월간 캘린더·스탬프·진행바·CRUD·조건 아코디언·작업 가능 시간 7칩), 추천 결과 화면 전환·순위 색 위계·자동 fallback 안내,
내 기록(통계·그래프·툴팁·지난 기록·전체보기·의견 모달), 온보딩 4장, 시작 화면, Empty state, 파비콘, 320~1440px 가로 넘침 없음.

## 코드는 있으나 외부 설정 없이는 검증 불가
Supabase 로그인/DB 동기화/데이터 이전/의견 저장/서버 rate limit(DB) — `docs/SETUP_SUPABASE.md` 참고.
Gemini 실제 성공 호출 — 현재 503(수요 폭주)·타임아웃으로 미확인. 실패 시 기본 추천으로 자동 전환되는 경로만 확인.

## 다음 단계
1. Supabase·Google 설정 → `npm run verify:rls` → 실제 로그인·이전·동기화 수동 테스트
2. `npm run check:gemini` 성공 확인(모델명 `gemini-3.8-flash` 유효성 포함)
3. 사용자 검토 후 커밋 → Push → Vercel(Git 연동·환경변수 확인) 순으로 승인받아 진행

## 2차 수정 (2026-10-25)
- Gemini: 원인은 기본 모델 `gemini-3.8-flash`(·3.7) 과부하(503/무응답). 기본을 `gemini-3.5-flash` → `gemini-3-flash-preview` 순 자동 전환으로 변경. `/api/recommend` 전체 경로 약 3초, `AI 추천` 표시 확인.
- 마감 일정 통합 시트(`components/DueSheet.tsx`, 휠은 `TimeWheels.tsx`), 추천 CTA 2개 이상 조건, 추천 이유 서버 검증(taskMeta), 내 기록 카드 문구 수정.
- Next.js 16.4.0 → 16.4.3(보안 권고 `1 Insight` 해소, 빌드 경고 사라짐).
- 미검증: Supabase 연결·Google 로그인·RLS·동기화·의견 저장 (`.env.local`에 Supabase 값 없음).
