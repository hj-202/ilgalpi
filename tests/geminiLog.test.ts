import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/recommend/route";
import { readUsage } from "../lib/ai/gemini";
import { summarizeCalls } from "../lib/ai/recommend";
import { formatRecommendLog, safeCalls } from "../lib/server/recommendLog";

const SECRET_TITLE = "극비 계약서 검토";
const SECRET_KEY = "AIza-SECRET-KEY-999";
const body = {
  currentDate: "2026-11-04", planDate: "2026-11-04", timezone: "Asia/Seoul", availableMinutes: 60, projects: [],
  tasks: [
    { id: "a", projectId: null, title: SECRET_TITLE, dueDate: "2026-11-04", dueTime: null, importance: "high", effort: "medium", isCompleted: false },
    { id: "b", projectId: null, title: "택배", dueDate: null, dueTime: null, importance: "low", effort: "short", isCompleted: false },
  ],
};
const good = { taskRankings: [{ taskId: "t1", rank: 1, reason: "오늘 마감이고 중요도가 높아요" }, { taskId: "t2", rank: 2, reason: "마감이 없고 중요도가 낮아요" }], projectRankings: [], warnings: [] };
const ok = (payload: unknown, usageMetadata?: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }], usageMetadata }));
const post = () => POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify(body) }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("usageMetadata 읽기", () => {
  it("토큰 수만 숫자로 읽고 이상한 값은 버린다", () => {
    expect(readUsage({ promptTokenCount: 3000, candidatesTokenCount: 800, thoughtsTokenCount: 500, totalTokenCount: 4300 })).toEqual({ promptTokens: 3000, outputTokens: 800, thoughtsTokens: 500, totalTokens: 4300 });
    expect(readUsage({ promptTokenCount: "많이", candidatesTokenCount: -1 })).toBeUndefined();
    expect(readUsage(undefined)).toBeUndefined();
  });
  it("호출별 합산과 429 여부", () => {
    const s = summarizeCalls([
      { model: "m1", result: "AI_RATE_LIMITED", status: 429, ms: 300 },
      { model: "m2", result: "ok", status: 200, ms: 4000, usage: { promptTokens: 100, outputTokens: 50 } },
      { model: "m2", result: "ok", status: 200, ms: 100, usage: { promptTokens: 10, thoughtsTokens: 5 } },
    ]);
    expect(s.rateLimited).toBe(true);
    expect(s.usage).toEqual({ promptTokens: 110, outputTokens: 50, thoughtsTokens: 5 });
    expect(summarizeCalls([{ model: "m", result: "ok", status: 200, ms: 1 }])).toMatchObject({ rateLimited: false, usage: undefined });
  });
});

describe("서버 로그: 호출별 모델·결과·토큰·429", () => {
  it("성공: 호출 기록과 토큰 합계를 남기고 제목·키·응답 본문은 남기지 않는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", SECRET_KEY);
    vi.stubEnv("GEMINI_MODEL", "");
    const fetchFn = vi.fn(async () => ok(good, { promptTokenCount: 2900, candidatesTokenCount: 700, thoughtsTokenCount: 400, totalTokenCount: 4000 }));
    vi.stubGlobal("fetch", fetchFn);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await post();
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1); // 로그 때문에 호출이 늘지 않는다
    const line = String(info.mock.calls[0][0]);
    const p = JSON.parse(line);
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toMatchObject({ model: "gemini-3.5-flash", result: "ok", status: 200, usage: { promptTokens: 2900, outputTokens: 700, thoughtsTokens: 400, totalTokens: 4000 } });
    expect(typeof p.calls[0].ms).toBe("number");
    expect(p.usage).toEqual({ promptTokens: 2900, outputTokens: 700, thoughtsTokens: 400, totalTokens: 4000 });
    expect(p.rateLimited).toBe(false);
    for (const secret of [SECRET_TITLE, SECRET_KEY, "오늘 마감이고 중요도가", "택배"]) expect(line).not.toContain(secret);
  });

  it("첫 모델 429 → 둘째 모델 성공: 모델별 결과와 429 발생이 기록된다", async () => {
    vi.stubEnv("GEMINI_API_KEY", SECRET_KEY);
    vi.stubEnv("GEMINI_MODEL", "");
    const quota = new Response(JSON.stringify({ error: { message: `Quota exceeded for ${SECRET_TITLE}` } }), { status: 429 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(quota).mockResolvedValueOnce(ok(good, { promptTokenCount: 10, candidatesTokenCount: 5 })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await post();
    const line = String(info.mock.calls[0][0]);
    const p = JSON.parse(line);
    expect(p.calls.map((c: { model: string; result: string; status?: number }) => [c.model, c.result, c.status])).toEqual([
      ["gemini-3.5-flash", "AI_RATE_LIMITED", 429],
      ["gemini-3-flash-preview", "ok", 200],
    ]);
    expect(p.rateLimited).toBe(true);
    expect(p.usage).toEqual({ promptTokens: 10, outputTokens: 5 });
    expect(line).not.toContain("Quota exceeded");
    expect(line).not.toContain(SECRET_TITLE);
  });

  it("두 모델 모두 429: 실패 로그에도 호출 기록과 429가 남고 사용자 응답은 기존과 같다", async () => {
    vi.stubEnv("GEMINI_API_KEY", SECRET_KEY);
    vi.stubEnv("GEMINI_MODEL", "");
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }));
    vi.stubGlobal("fetch", fetchFn);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post();
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("AI_RATE_LIMITED");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const p = JSON.parse(String(err.mock.calls[0][0]));
    expect(p).toMatchObject({ outcome: "fail", code: "AI_RATE_LIMITED", rateLimited: true });
    expect(p.calls).toHaveLength(2);
    expect(p.calls.every((c: { status: number }) => c.status === 429)).toBe(true);
  });

  it("형식 오류 재시도: 응답은 왔지만 검증에 실패한 호출은 AI_INVALID_RESPONSE로, 토큰은 합산", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("GEMINI_MODEL", "");
    const bad = { ...good, taskRankings: [{ taskId: "t9", rank: 1, reason: "x" }, good.taskRankings[1]] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok(bad, { promptTokenCount: 100, candidatesTokenCount: 10 })).mockResolvedValueOnce(ok(good, { promptTokenCount: 120, candidatesTokenCount: 12 })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await post();
    const p = JSON.parse(String(info.mock.calls[0][0]));
    expect(p.calls.map((c: { result: string }) => c.result)).toEqual(["AI_INVALID_RESPONSE", "ok"]);
    expect(p.usage).toEqual({ promptTokens: 220, outputTokens: 22 });
    expect(p.attempts).toBe(2);
  });

  it("usageMetadata가 없는 응답도 정상 처리된다(필드 없음)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => ok(good)));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await post();
    expect(res.status).toBe(200);
    expect(JSON.parse(String(info.mock.calls[0][0])).usage).toBeUndefined();
  });
});

describe("로그 형식 검사", () => {
  it("모델·결과 문자열은 허용된 형식만 통과한다(임의 문자열은 unknown)", () => {
    const out = safeCalls([{ model: `m ${SECRET_TITLE}`, result: "제목 유출", ms: 1.7, status: 200 }]);
    expect(out).toEqual([{ model: "unknown", result: "unknown", status: 200, ms: 2, usage: undefined }]);
    const line = formatRecommendLog({ ok: true, ms: 5, calls: [{ model: `x ${SECRET_TITLE}`, result: "ok", ms: 1 }] });
    expect(line).not.toContain(SECRET_TITLE);
  });
});
