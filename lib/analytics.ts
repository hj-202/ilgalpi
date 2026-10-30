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
      // 이전 방문에서 식별된 상태가 남아 있으면 account, 아니면 guest. 인증 확인 후 identifyUser/resetIdentity가 바로잡는다
      mixpanel.register({ environment: process.env.NODE_ENV, user_type: identifiedUserId(mixpanel) ? "account" : "guest" });
      return mixpanel;
    })
    .catch(() => null);
  return ready;
}

/**
 * 인증 확인 게이트: Supabase 세션 확인이 끝나기 전에는 `track`을 보류한다(이전 계정의 Mixpanel ID로 기록되는 것을 막는다).
 * - pending: 확인 중. 이벤트를 보류한다(최대 MAX_HELD개, 넘으면 버린다).
 * - settled: identifyUser/resetIdentity로 식별 상태가 확정됨. 보류분을 호출 순서대로 한 번씩 보내고 이후는 바로 보낸다.
 * - uncertain: 확인 오류·시간 초과. Mixpanel이 계정으로 식별된 채라면(이전 계정일 수 있음) 이벤트를 버리고, 익명이면 보낸다.
 *   이후 인증이 뒤늦게 확정되면 settled로 전환돼 정상 수집된다.
 */
const AUTH_WAIT_MS = 8000;
const MAX_HELD = 100;
let authState: "pending" | "uncertain" | "settled" = "pending";
const held: Array<(mp: Mixpanel) => void> = [];

function exec(mp: Mixpanel, fn: (mp: Mixpanel) => void) {
  try {
    fn(mp);
  } catch {
    /* 분석 오류는 서비스에 영향을 주지 않는다 */
  }
}

/**
 * 첫 인증 결과(identify/reset)를 실행한 직후, 그때까지 보류된 이벤트를 호출 순서대로 보낸다.
 * 이후에 호출되는 이벤트는 보류 없이 호출 순서대로 처리된다(예: 로그아웃 reset 뒤 이벤트는 새 익명 ID로).
 */
function settleAuth(fn: (mp: Mixpanel) => void) {
  if (authState === "settled") return run(fn);
  authState = "settled";
  const items = held.splice(0);
  void load().then((mp) => {
    if (!mp) return;
    exec(mp, fn);
    for (const item of items) exec(mp, item);
  });
}

/** 인증 상태를 확인할 수 없는 경우(세션 조회 오류·시간 초과). 잘못된 사용자에게 귀속될 수 있는 보류 이벤트는 버린다 */
export function markAuthUncertain() {
  if (authState !== "pending") return;
  authState = "uncertain";
  const items = held.splice(0);
  void load().then((mp) => {
    if (!mp || identifiedUserId(mp)) return;
    for (const item of items) exec(mp, item);
  });
}

if (typeof window !== "undefined" && TOKEN) setTimeout(markAuthUncertain, AUTH_WAIT_MS);

function run(fn: (mp: Mixpanel) => void, opts: { gated?: boolean } = {}) {
  if (opts.gated && authState === "pending") {
    if (held.length < MAX_HELD) held.push(fn);
    return;
  }
  const guarded = opts.gated && authState === "uncertain";
  void load().then((mp) => {
    if (!mp || (guarded && identifiedUserId(mp))) return;
    exec(mp, fn);
  });
}

export function track<E extends EventName>(name: E, ...[props]: EventMap[E] extends Record<string, never> ? [] : [EventMap[E]]): void {
  run((mp) => mp.track(name, props), { gated: true });
}

/** 현재 Mixpanel에 식별된 사용자 ID. 익명(`$device:`)이면 undefined */
function identifiedUserId(mp: Mixpanel): string | undefined {
  const id = mp.get_property("$user_id");
  return typeof id === "string" && id ? id : undefined;
}

/**
 * 로그인 사용자: Supabase 내부 사용자 ID로 식별하고, 이메일이 있으면 사용자 프로필 `$email`에만 등록한다(이름은 보내지 않는다).
 * - 이미 같은 ID로 식별돼 있으면 identify를 다시 보내지 않는다(세션 복원·재호출).
 * - 다른 계정으로 식별돼 있으면 먼저 reset해, 이전 계정의 ID가 새 계정에 병합($anon_distinct_id)되지 않게 한다.
 */
export function identifyUser(userId: string, email?: string | null) {
  settleAuth((mp) => {
    const current = identifiedUserId(mp);
    if (current !== userId) {
      if (current) mp.reset();
      mp.identify(userId);
    }
    mp.register({ user_type: "account" });
    const trimmed = email?.trim();
    if (trimmed) mp.people.set({ $email: trimmed });
  });
}

/**
 * 로그아웃·세션 없음 확인: 식별 상태가 남아 있을 때만 reset해 새 익명 ID를 쓴다(이미 익명이면 reset하지 않아 중복 reset이 없다).
 * 인증 확인 중(`checking`)에는 호출하지 않는다.
 */
export function resetIdentity() {
  settleAuth((mp) => {
    if (identifiedUserId(mp)) mp.reset();
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
