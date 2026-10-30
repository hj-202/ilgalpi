import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const people = { set: vi.fn() };
const mp = {
  init: vi.fn(),
  track: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
  get_property: vi.fn(),
  get_distinct_id: vi.fn(),
  people,
};
vi.mock("mixpanel-browser", () => ({ default: mp }));

const flush = () => new Promise((r) => setTimeout(r, 0));

async function loadAnalytics(token: string | undefined, withWindow = true) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (token !== undefined) vi.stubEnv("NEXT_PUBLIC_MIXPANEL_TOKEN", token);
  if (withWindow) vi.stubGlobal("window", {});
  return import("@/lib/analytics");
}

// mixpanel-browser(simplified ID merge)의 식별 상태 동작을 흉내 낸 가짜: 익명은 `$device:` ID, identify하면 `$user_id`가 생기고 reset하면 새 익명 ID가 된다
let props: Record<string, unknown>;
let anonCount: number;
let merges: { id: string; anon: unknown }[];
let events: { name: string; distinct_id: unknown; user_type: unknown }[];

function installFake() {
  anonCount = 1;
  props = { distinct_id: "$device:anon1" };
  merges = [];
  events = [];
  mp.get_property.mockImplementation((k: string) => props[k]);
  mp.get_distinct_id.mockImplementation(() => props.distinct_id);
  mp.register.mockImplementation((o: Record<string, unknown>) => Object.assign(props, o));
  mp.identify.mockImplementation((id: string) => {
    if (id === props.distinct_id) return;
    merges.push({ id, anon: props.distinct_id }); // $identify 이벤트: 이전 distinct_id가 새 ID에 병합된다
    props.$user_id = id;
    props.distinct_id = id;
  });
  mp.reset.mockImplementation(() => {
    props = { distinct_id: `$device:anon${++anonCount}` };
  });
  mp.track.mockImplementation((name: string) => {
    events.push({ name, distinct_id: props.distinct_id, user_type: props.user_type });
  });
}

beforeEach(() => {
  Object.values(mp).forEach((f) => typeof f === "function" && f.mockReset());
  people.set.mockReset();
  installFake();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("analytics — 토큰·브라우저 환경", () => {
  it("토큰이 없으면 아무것도 로드·전송하지 않고 오류도 없다", async () => {
    const a = await loadAnalytics(undefined);
    expect(() => a.track("Task Created")).not.toThrow();
    a.identifyUser("u1");
    a.resetIdentity();
    await flush();
    expect(mp.init).not.toHaveBeenCalled();
    expect(mp.track).not.toHaveBeenCalled();
  });

  it("서버(window 없음)에서는 무시한다", async () => {
    const a = await loadAnalytics("tok", false);
    a.track("Task Created");
    await flush();
    expect(mp.init).not.toHaveBeenCalled();
  });

  it("자동 수집·세션 녹화·자동 페이지뷰를 끄고 한 번만 초기화한다", async () => {
    const a = await loadAnalytics("tok");
    a.resetIdentity(); // 인증 확인 완료(게이트 열림)
    a.track("Task Created");
    a.track("Task Deleted");
    await flush();
    expect(mp.init).toHaveBeenCalledTimes(1);
    expect(mp.init.mock.calls[0][0]).toBe("tok");
    expect(mp.init.mock.calls[0][1]).toMatchObject({ autocapture: false, track_pageview: false, record_sessions_percent: 0 });
    expect(mp.track).toHaveBeenCalledTimes(2);
  });

  it("전송 라이브러리가 예외를 내도 호출자에 영향이 없다", async () => {
    const a = await loadAnalytics("tok");
    mp.track.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => a.track("Task Created")).not.toThrow();
    await flush();
  });

  it("로그인 식별은 사용자 ID로, 로그아웃은 reset", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("uuid-1");
    a.resetIdentity();
    await flush();
    expect(mp.identify).toHaveBeenCalledWith("uuid-1");
    expect(mp.reset).toHaveBeenCalledTimes(1);
  });

  it("이메일이 있으면 사용자 프로필 $email에만 등록하고 distinct_id·super property에는 쓰지 않는다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("uuid-1", " user@example.com ");
    await flush();
    expect(mp.identify).toHaveBeenCalledWith("uuid-1");
    expect(people.set).toHaveBeenCalledWith({ $email: "user@example.com" });
    expect(JSON.stringify(mp.register.mock.calls)).not.toContain("user@example.com");
    expect(mp.track).not.toHaveBeenCalled();
  });

  it("이메일이 없거나 비어 있으면 프로필에 등록하지 않는다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("uuid-1", null);
    a.identifyUser("uuid-2", "  ");
    a.identifyUser("uuid-3");
    await flush();
    expect(mp.identify).toHaveBeenCalledTimes(3);
    expect(people.set).not.toHaveBeenCalled();
  });
});

describe("analytics — 속성과 중복 방지", () => {
  it("이벤트 속성은 정의된 값만 전달한다", async () => {
    const a = await loadAnalytics("tok");
    a.resetIdentity(); // 인증 확인 완료(게이트 열림)
    a.track("Recommendation Requested", { task_count: 3, is_retry: false });
    await flush();
    expect(mp.track).toHaveBeenCalledWith("Recommendation Requested", { task_count: 3, is_retry: false });
  });

  it("같은 화면은 연속 기록하지 않고, 다른 화면을 거쳐 다시 들어오면 기록한다", async () => {
    const a = await loadAnalytics("tok");
    a.resetIdentity(); // 인증 확인 완료(게이트 열림)
    a.trackPage("home");
    a.trackPage("home"); // 재렌더링·이중 effect
    a.trackPage("records");
    a.trackPage("home");
    await flush();
    expect(mp.track.mock.calls.map((c) => c[1].page)).toEqual(["home", "records", "home"]);
  });

  it("온보딩 단계도 같은 단계는 중복 기록하지 않는다", async () => {
    const a = await loadAnalytics("tok");
    a.resetIdentity(); // 인증 확인 완료(게이트 열림)
    a.trackOnboardingStep(1);
    a.trackOnboardingStep(1);
    a.trackOnboardingStep(2);
    await flush();
    expect(mp.track.mock.calls.map((c) => c[1].step)).toEqual([1, 2]);
  });

  it("수정 필드는 종류만 매핑하고(마감일·마감시각은 due 하나), 계획 날짜는 제외한다", async () => {
    const a = await loadAnalytics("tok");
    expect(a.fieldTypesOf(["dueDate", "dueTime", "importance"])).toEqual(["due", "importance"]);
    expect(a.fieldTypesOf(["plannedDate"])).toEqual([]);
  });
});

describe("analytics — 사용자 식별 전환", () => {
  it("최초 익명 방문자: 세션 없음이 확인되면 이벤트가 guest로 정상 기록된다", async () => {
    const a = await loadAnalytics("tok");
    a.track("Task Created"); // 인증 확인 전
    a.resetIdentity(); // getSession → 세션 없음
    await flush();
    expect(events).toEqual([{ name: "Task Created", distinct_id: "$device:anon1", user_type: "guest" }]);
    expect(mp.identify).not.toHaveBeenCalled();
    expect(mp.reset).not.toHaveBeenCalled();
  });

  it("익명 방문 → A 로그인(OAuth 리다이렉트): 익명 이벤트는 익명 ID로, 복귀 후 이벤트는 A로 기록되고 익명 ID가 A에 연결된다", async () => {
    const a = await loadAnalytics("tok");
    a.resetIdentity();
    a.track("Task Created");
    await flush();
    const b = await loadAnalytics("tok"); // 리다이렉트 후 새 페이지 로드: 익명 ID는 localStorage에 유지
    b.track("Page Viewed", { page: "home" }); // 인증 확인 전
    b.identifyUser("A", "a@example.com");
    b.track("Task Deleted");
    await flush();
    expect(mp.reset).not.toHaveBeenCalled();
    expect(merges).toEqual([{ id: "A", anon: "$device:anon1" }]);
    expect(events.map((e) => [e.distinct_id, e.user_type])).toEqual([
      ["$device:anon1", "guest"],
      ["A", "account"],
      ["A", "account"],
    ]);
  });

  it("A 로그아웃 → B 로그인: A는 reset 후 새 익명 ID, B는 그 익명 ID에만 연결된다(A와 병합 없음)", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    a.resetIdentity();
    a.track("Task Created");
    a.identifyUser("B");
    a.track("Task Deleted");
    await flush();
    expect(mp.reset).toHaveBeenCalledTimes(1);
    expect(merges).toEqual([
      { id: "A", anon: "$device:anon1" },
      { id: "B", anon: "$device:anon2" },
    ]);
    expect(events.map((e) => [e.distinct_id, e.user_type])).toEqual([
      ["$device:anon2", "guest"],
      ["B", "account"],
    ]);
  });

  it("로그아웃 이벤트 없이 A에서 B로 바뀌면 identify 전에 reset해 A를 B에 병합하지 않는다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    a.identifyUser("B");
    await flush();
    expect(mp.reset).toHaveBeenCalledTimes(1);
    expect(merges).toEqual([
      { id: "A", anon: "$device:anon1" },
      { id: "B", anon: "$device:anon2" },
    ]);
    expect(merges.some((m) => m.anon === "A")).toBe(false);
  });

  it("로그인 상태 새로고침·세션 복원: 같은 ID는 identify·reset을 다시 하지 않고 account 유지", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    props = { ...props }; // 새로고침 후에도 localStorage에 식별 상태 유지
    const b = await loadAnalytics("tok");
    b.track("Page Viewed", { page: "home" }); // 인증 확인 전 이벤트도 account
    b.identifyUser("A"); // 세션 복원
    b.identifyUser("A"); // SIGNED_IN 재발생
    await flush();
    expect(mp.identify).toHaveBeenCalledTimes(1);
    expect(mp.reset).not.toHaveBeenCalled();
    expect(events.map((e) => [e.distinct_id, e.user_type])).toEqual([["A", "account"]]);
  });

  it("A 세션 만료 후 재접속: 세션 없음이 확인되면 reset되고 이후 이벤트는 새 익명 guest", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    const b = await loadAnalytics("tok"); // 재접속: localStorage에는 A가 남아 있다
    b.resetIdentity(); // getSession → 세션 없음
    b.track("Page Viewed", { page: "home" });
    await flush();
    expect(mp.reset).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ name: "Page Viewed", distinct_id: "$device:anon2", user_type: "guest" }]);
  });

  it("이미 익명이면 resetIdentity는 reset하지 않고(중복 reset 방지) guest만 보장한다", async () => {
    const a = await loadAnalytics("tok");
    a.resetIdentity();
    a.resetIdentity();
    await flush();
    expect(mp.reset).not.toHaveBeenCalled();
    expect(props.distinct_id).toBe("$device:anon1");
    expect(props.user_type).toBe("guest");
  });

  it("로그아웃 이벤트와 보조 정리가 연달아 와도 reset은 한 번", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    a.resetIdentity();
    a.resetIdentity();
    await flush();
    expect(mp.reset).toHaveBeenCalledTimes(1);
  });
});

describe("analytics — 인증 확인 중 이벤트 보류", () => {
  it("인증 확인 전에는 전송하지 않고, 확정 후 한 번씩 순서대로 전송한다(누락·중복 없음)", async () => {
    const a = await loadAnalytics("tok");
    a.trackPage("home");
    a.track("Task Created");
    a.trackPage("records");
    await flush();
    expect(mp.track).not.toHaveBeenCalled();
    a.resetIdentity();
    await flush();
    expect(mp.track.mock.calls.map((c) => c[0])).toEqual(["Page Viewed", "Task Created", "Page Viewed"]);
    a.resetIdentity(); // 이후 호출로 다시 전송되지 않는다
    await flush();
    expect(mp.track).toHaveBeenCalledTimes(3);
  });

  it("세션 만료 후 재접속: 인증 확인 중 이벤트가 이전 계정 A가 아니라 새 익명 ID로 기록된다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    const b = await loadAnalytics("tok"); // 재접속: localStorage에는 A가 남아 있다
    b.trackPage("home"); // getSession 확인 전
    await flush();
    expect(events).toEqual([]);
    b.resetIdentity(); // 세션 없음 확정
    await flush();
    expect(events).toEqual([{ name: "Page Viewed", distinct_id: "$device:anon2", user_type: "guest" }]);
  });

  it("로그인 상태 새로고침: 인증 확인 중 이벤트는 확정 후 A로 기록된다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    const b = await loadAnalytics("tok");
    b.trackPage("home");
    b.identifyUser("A");
    await flush();
    expect(events.map((e) => [e.name, e.distinct_id, e.user_type])).toEqual([["Page Viewed", "A", "account"]]);
    expect(mp.reset).not.toHaveBeenCalled();
  });

  it("세션 조회 오류 + 이전 계정 식별이 남아 있으면 보류 이벤트를 버리고 A로 귀속하지 않는다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    const b = await loadAnalytics("tok"); // 재접속: A가 남아 있다
    b.trackPage("home");
    b.markAuthUncertain();
    b.track("Task Created"); // 불확실한 동안의 이벤트도 A로 보내지 않는다
    await flush();
    expect(events).toEqual([]);
    expect(mp.reset).not.toHaveBeenCalled(); // 불확실할 뿐이므로 식별을 지우지도 않는다
  });

  it("세션 조회 오류여도 익명 상태면 보류 이벤트를 guest로 보낸다", async () => {
    const a = await loadAnalytics("tok");
    a.track("Task Created");
    a.markAuthUncertain();
    a.track("Task Deleted");
    await flush();
    expect(events.map((e) => [e.name, e.distinct_id, e.user_type])).toEqual([
      ["Task Created", "$device:anon1", "guest"],
      ["Task Deleted", "$device:anon1", "guest"],
    ]);
  });

  it("불확실 상태 이후 인증이 뒤늦게 성공하면 이후 이벤트는 올바른 계정 ID로 정상 수집된다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    const b = await loadAnalytics("tok");
    b.trackPage("home");
    b.markAuthUncertain();
    await flush();
    b.identifyUser("A"); // 늦게 복원된 세션
    b.trackPage("records");
    await flush();
    expect(events.map((e) => [e.name, e.distinct_id, e.user_type])).toEqual([["Page Viewed", "A", "account"]]);
    expect(mp.reset).not.toHaveBeenCalled();
  });

  it("불확실 상태 이후 세션 없음이 확정되면 reset되고 새 익명 ID로 수집된다", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    const b = await loadAnalytics("tok");
    b.markAuthUncertain();
    b.resetIdentity();
    b.trackPage("home");
    await flush();
    expect(events).toEqual([{ name: "Page Viewed", distinct_id: "$device:anon2", user_type: "guest" }]);
  });

  it("인증이 끝내 오지 않으면 시간 초과 후 식별된 상태의 이벤트는 버리고, 큐는 비워진다", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      vi.stubEnv("NEXT_PUBLIC_MIXPANEL_TOKEN", "tok");
      vi.stubGlobal("window", {});
      props.$user_id = "A"; // 이전 방문의 식별이 남아 있다
      props.distinct_id = "A";
      const a = await import("@/lib/analytics");
      a.track("Task Created");
      await vi.advanceTimersByTimeAsync(7000);
      expect(mp.track).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(mp.track).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("인증 확인 중 보류 큐는 상한(100개)을 넘어 쌓이지 않는다", async () => {
    const a = await loadAnalytics("tok");
    for (let i = 0; i < 150; i++) a.track("Task Created");
    a.resetIdentity();
    await flush();
    expect(mp.track).toHaveBeenCalledTimes(100);
  });

  it("A 로그아웃 직후 보류 중이던 이벤트는 B 식별 이전의 익명 ID로 기록된다(호출 순서 유지)", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("A");
    await flush();
    a.resetIdentity();
    a.track("Task Created");
    a.identifyUser("B");
    await flush();
    expect(events.map((e) => [e.distinct_id, e.user_type])).toEqual([["$device:anon2", "guest"]]);
  });
});
