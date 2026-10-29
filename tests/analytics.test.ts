import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mp = { init: vi.fn(), track: vi.fn(), identify: vi.fn(), reset: vi.fn(), register: vi.fn() };
vi.mock("mixpanel-browser", () => ({ default: mp }));

const flush = () => new Promise((r) => setTimeout(r, 0));

async function loadAnalytics(token: string | undefined, withWindow = true) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (token !== undefined) vi.stubEnv("NEXT_PUBLIC_MIXPANEL_TOKEN", token);
  if (withWindow) vi.stubGlobal("window", {});
  return import("@/lib/analytics");
}

beforeEach(() => Object.values(mp).forEach((f) => f.mockReset()));
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

  it("로그인 식별은 사용자 ID만, 로그아웃은 reset", async () => {
    const a = await loadAnalytics("tok");
    a.identifyUser("uuid-1");
    a.resetIdentity();
    await flush();
    expect(mp.identify).toHaveBeenCalledWith("uuid-1");
    expect(mp.reset).toHaveBeenCalledTimes(1);
  });
});

describe("analytics — 속성과 중복 방지", () => {
  it("이벤트 속성은 정의된 값만 전달한다", async () => {
    const a = await loadAnalytics("tok");
    a.track("Recommendation Requested", { task_count: 3, is_retry: false });
    await flush();
    expect(mp.track).toHaveBeenCalledWith("Recommendation Requested", { task_count: 3, is_retry: false });
  });

  it("같은 화면은 연속 기록하지 않고, 다른 화면을 거쳐 다시 들어오면 기록한다", async () => {
    const a = await loadAnalytics("tok");
    a.trackPage("home");
    a.trackPage("home"); // 재렌더링·이중 effect
    a.trackPage("records");
    a.trackPage("home");
    await flush();
    expect(mp.track.mock.calls.map((c) => c[1].page)).toEqual(["home", "records", "home"]);
  });

  it("온보딩 단계도 같은 단계는 중복 기록하지 않는다", async () => {
    const a = await loadAnalytics("tok");
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
