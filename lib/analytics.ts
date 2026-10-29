/*
 * Mixpanel 분석. 이벤트 이름·속성은 이 파일에서만 정의한다.
 * - 토큰(NEXT_PUBLIC_MIXPANEL_TOKEN)이 없거나 로딩·전송이 실패해도 앱은 그대로 동작한다(모든 호출은 조용히 무시).
 * - 자동 클릭 수집·세션 녹화·자동 페이지뷰는 끄고, 아래 정의된 이벤트만 직접 보낸다.
 * - 할 일 제목·의견 본문·이름·정확한 마감일/시각 등 자유 입력값은 이벤트 속성으로 보내지 않는다(속성은 아래 타입의 열거값·개수뿐).
 * - 이메일은 로그인 사용자의 Mixpanel 사용자 프로필(`$email`)에만 등록한다. distinct_id나 이벤트 속성에는 쓰지 않는다.
 */
import type { Mixpanel } from "mixpanel-browser";

export type PageName = "home" | "recommendation" | "records" | "history";
export type FieldType = "title" | "importance" | "effort" | "due" | "project";

interface EventMap {
  "Page Viewed": { page: PageName };
  "Onboarding Step Viewed": { step: 1 | 2 | 3 | 4 };
  "Onboarding Finished": { method: "completed" | "skipped" };
  "Entry Completed": { entry_method: "google" | "guest" };
  "Task Created": Record<string, never>;
  "Recommendation Requested": { task_count: number; is_retry: boolean };
  "Recommendation Viewed": { recommendation_type: "ai" | "basic"; result_source: "new" | "saved" };
  "Task Completed": { source: "home" | "recommendation" };
  "Task Updated": { field_type: FieldType };
  "Task Reopened": { source: "home" | "recommendation" };
  "Task Deleted": Record<string, never>;
  "Task Move Started": Record<string, never>;
  "Task Moved": { selected_count: number };
  "Available Time Updated": { selection_type: "preset" | "custom" };
  "History Period Changed": { period_type: "weekly" | "monthly" };
  "History Detail Viewed": Record<string, never>;
  "Feedback Opened": Record<string, never>;
  "Feedback Submitted": Record<string, never>;
}
export type EventName = keyof EventMap;

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim();

let ready: Promise<Mixpanel | null> | null = null;

/** 브라우저에서 한 번만 로드·초기화한다. 실패하면 null(이후 모든 호출은 무시) */
function load(): Promise<Mixpanel | null> {
  if (typeof window === "undefined" || !TOKEN) return Promise.resolve(null);
  ready ??= import("mixpanel-browser")
    .then(({ default: mixpanel }) => {
      mixpanel.init(TOKEN, {
        autocapture: false,
        track_pageview: false,
        record_sessions_percent: 0,
        persistence: "localStorage",
        ip: false,
      });
      mixpanel.register({ environment: process.env.NODE_ENV });
      return mixpanel;
    })
    .catch(() => null);
  return ready;
}

function run(fn: (mp: Mixpanel) => void) {
  void load().then((mp) => {
    if (!mp) return;
    try {
      fn(mp);
    } catch {
      /* 분석 오류는 서비스에 영향을 주지 않는다 */
    }
  });
}

export function track<E extends EventName>(name: E, ...[props]: EventMap[E] extends Record<string, never> ? [] : [EventMap[E]]): void {
  run((mp) => mp.track(name, props));
}

/** 로그인 사용자: Supabase 내부 사용자 ID로 식별하고, 이메일이 있으면 사용자 프로필 `$email`에만 등록한다(이름은 보내지 않는다) */
export function identifyUser(userId: string, email?: string | null) {
  run((mp) => {
    mp.identify(userId);
    mp.register({ user_type: "account" });
    const trimmed = email?.trim();
    if (trimmed) mp.people.set({ $email: trimmed });
  });
}

/** 로그아웃·세션 종료: 식별 상태를 초기화하고 새 익명 ID를 쓴다 */
export function resetIdentity() {
  run((mp) => {
    mp.reset();
    mp.register({ user_type: "guest", environment: process.env.NODE_ENV });
  });
}

// ---------- 중복 방지 ----------

let lastPage: PageName | null = null;
/** 같은 화면의 재렌더링·개발 모드 이중 실행으로는 기록하지 않는다. 다른 화면을 거쳐 다시 들어오면 기록한다 */
export function trackPage(page: PageName) {
  if (lastPage === page) return;
  lastPage = page;
  track("Page Viewed", { page });
}

let lastStep: number | null = null;
export function trackOnboardingStep(step: 1 | 2 | 3 | 4) {
  if (lastStep === step) return;
  lastStep = step;
  track("Onboarding Step Viewed", { step });
}

/** TaskPatch 키 → 분석용 필드 종류(값은 보내지 않는다). 계획 날짜 이동은 별도 이벤트(Task Moved)이므로 제외 */
export function fieldTypesOf(keys: string[]): FieldType[] {
  const map: Record<string, FieldType> = {
    title: "title",
    importance: "importance",
    effort: "effort",
    dueDate: "due",
    dueTime: "due",
    projectId: "project",
  };
  return [...new Set(keys.map((k) => map[k]).filter((v): v is FieldType => Boolean(v)))];
}
