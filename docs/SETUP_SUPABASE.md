# Supabase · Google 로그인 설정 (직접 진행하는 단계)

코드는 준비되어 있고, 아래 대시보드 작업만 사용자가 해야 한다. 비밀키는 채팅·Git에 올리지 않는다.

## 1. Supabase (`hj-projects` 조직 → `ilgalpi` 프로젝트)
1. **Project Settings → API**에서 `Project URL`, `anon`(publishable) 키, `service_role` 키를 확인한다.
2. 프로젝트 루트의 `.env.local`에 추가한다(값은 직접 붙여 넣기):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...      # 서버 전용. NEXT_PUBLIC_ 접두사 금지
   ```
3. **SQL Editor → New query**에 `supabase/migrations/0001_init.sql` 전체를 붙여 넣고 Run 한다.
4. **Authentication → URL Configuration**
   - Site URL: 로컬은 `http://localhost:3000` (배포 후 운영 도메인으로 변경)
   - Redirect URLs: `http://localhost:3000/auth/callback`, (운영) `https://<운영 도메인>/auth/callback`

## 2. Google Cloud Console
1. **APIs & Services → OAuth consent screen**: 앱 이름 `일갈피`, 지원 이메일, 범위 `email`·`profile`. 테스트 모드면 본인 계정을 Test users에 추가.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized redirect URIs: `https://<프로젝트 ref>.supabase.co/auth/v1/callback`
3. 발급된 Client ID/Secret을 **Supabase → Authentication → Providers → Google**에 입력하고 Enable.

## 3. 연결 검증 (설정 후)
- `npm run dev` 재시작 → 시작 화면 또는 내 기록의 `Google로 계속하기`가 활성화되어야 한다.
- `npm run verify:rls` : 임시 테스트 계정 2개로 RLS(타 계정 조회·수정·삭제·위조 차단, anon·feedback 접근 차단)를 검증하고 계정을 삭제한다.
- 의견 보내기: 내 기록 → 의견 보내기 → 전송 후 Supabase **Table Editor → feedback**에서 확인.

## 4. 기타
- Gemini 키의 사용량 할당량과 예산 알림은 Google AI Studio/Cloud 콘솔에서 설정한다(PRD §7.5).
- rate limit 수치는 `lib/server/rateLimit.ts`의 `LIMITS`에서 조정한다(추천 20회/시간, 의견 5회/시간·동일 내용 10분 1회).
