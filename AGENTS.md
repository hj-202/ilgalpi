<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 기능 오류 수정 및 배포 원칙

별도 요청이 없는 한, 기능 오류 수정은 로컬 코드 수정만으로 끝내지 않고 아래 순서로 진행한다.

1. 오류 수정과 관련 테스트 작성·실행
2. TypeScript(`npx tsc --noEmit`), lint(`npm run lint`), 테스트(`npm test`), 빌드(`npm run build`) 검사
3. 변경 파일을 확인하고 관련 수정 사항만 GitHub `main`에 커밋·Push
4. GitHub 연동 Vercel 운영 자동 배포 확인
5. 운영 사이트(https://ilgalpi.vercel.app/)에 최신 수정이 반영됐는지 확인
6. 배포 결과와 추가 수동 QA가 필요한 항목 보고

- 개인정보·수집 설정이 바뀌는 변경(분석, 로그, 위치·IP 등)은 배포 전에 개인정보 안내·동의 설정과 충돌하는지 점검하고, 문제가 있으면 임의로 배포하지 말고 먼저 알린다.
- 운영 사용자 데이터, 기존 이벤트 기록, 로그인·비로그인 추적 로직은 유지한다.
- Vercel 배포 상태를 직접 확인할 수 없으면 성공했다고 단정하지 않는다. GitHub Push 완료 여부와 확인하지 못한 항목을 구분해서 보고한다.
