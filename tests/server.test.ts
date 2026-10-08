import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/recommend/route";
import { validateRecommendRequest } from "../lib/recommend/requestValidation";
import type { RecommendRequest, RecommendResponse } from "../lib/types";

const UUID_A = "11111111-aaaa-4aaa-8aaa-000000000001";
const UUID_B = "11111111-aaaa-4aaa-8aaa-000000000002";
const P1 = "22222222-bbbb-4bbb-8bbb-000000000001";

function request(overrides: Partial<RecommendRequest> = {}): RecommendRequest {
  return {
    currentDate: "2026-10-08",
    timezone: "Asia/Seoul",
    availableMinutes: 60,
    projects: [{ id: P1, name: "바나프레소" }],
    tasks: [
      { id: UUID_A, projectId: P1, title: "포트폴리오", dueDate: "2026-10-08", importance: "high", estimatedMinutes: 45, isCompleted: false },
      { id: UUID_B, projectId: null, title: "택배", dueDate: null, importance: "low", estimatedMinutes: 30, isCompleted: false },
    ],
    ...overrides,
  };
}

/** Gemini가 돌려줄 법한 응답 본문 (단축 ID 사용) */
function geminiBody(payload: unknown, finishReason = "STOP") {
  return {
    candidates: [{ content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] }, finishReason }],
  };
}

const goodPayload = {
  taskRankings: [
    { taskId: "t1", rank: 1, reason: "오늘 마감이고 중요도가 높아요" },
    { taskId: "t2", rank: 2, reason: "마감이 없고 중요도가 낮아요" },
  ],
  projectRankings: [{ projectId: "p1", rank: 1, reason: "오늘 마감 작업이 있어요" }],
  focusPlan: { taskIds: ["t1"], reason: "60분 안에 가장 급한 작업부터 해 보세요" },
  warnings: [],
};

function mockFetch(...responses: Array<{ status?: number; body?: unknown } | Error>) {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 }));
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function call(body: unknown) {
  const res = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, data: (await res.json()) as RecommendResponse };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("validateRecommendRequest", () => {
  it("정상 요청 통과", () => {
    expect(validateRecommendRequest(request()).ok).toBe(true);
  });
  it("V-Q5: 완료 작업이 포함되면 INVALID_REQUEST (필터링하지 않음)", () => {
    const r = request();
    (r.tasks[1] as unknown as { isCompleted: boolean }).isCompleted = true;
    expect(validateRecommendRequest(r)).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });
  it("V-Q5: isCompleted 누락도 거부", () => {
    const r = request();
    delete (r.tasks[0] as Partial<RecommendRequest["tasks"][0]>).isCompleted;
    expect(validateRecommendRequest(r).ok).toBe(false);
  });
  it("작업 0개 / 31개", () => {
    expect(validateRecommendRequest(request({ tasks: [] }))).toEqual({ ok: false, code: "NO_TASKS" });
    const many = Array.from({ length: 31 }, (_, i) => ({ ...request().tasks[1], id: `id-${i}` }));
    expect(validateRecommendRequest(request({ tasks: many }))).toEqual({ ok: false, code: "TOO_MANY_TASKS" });
  });
  it("존재하지 않는 projectId, 중복 ID, 범위 밖 값 거부", () => {
    const r1 = request();
    r1.tasks[1].projectId = "nope";
    expect(validateRecommendRequest(r1).ok).toBe(false);
    const r2 = request();
    r2.tasks[1].id = UUID_A;
    expect(validateRecommendRequest(r2).ok).toBe(false);
    const r3 = request();
    r3.tasks[0].estimatedMinutes = 500;
    expect(validateRecommendRequest(r3).ok).toBe(false);
    expect(validateRecommendRequest(request({ availableMinutes: 0 })).ok).toBe(false);
  });
});

describe("POST /api/recommend", () => {
  it("API 키가 없으면 MISSING_API_KEY(503)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchFn = mockFetch();
    const { status, data } = await call(request());
    expect(status).toBe(503);
    expect(data.ok).toBe(false);
    if (!data.ok) expect(data.error.code).toBe("MISSING_API_KEY");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("완료 작업 포함 요청은 Gemini를 호출하지 않고 400", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchFn = mockFetch();
    const r = request();
    (r.tasks[0] as unknown as { isCompleted: boolean }).isCompleted = true;
    const { status } = await call(r);
    expect(status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("성공: 단축 ID를 원래 ID로 복원하고, LLM에는 UUID·완료 정보 대신 daysUntilDue를 보낸다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
    const fetchFn = mockFetch({ body: geminiBody(goodPayload) });
    const { status, data } = await call(request());
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    if (data.ok) {
      expect(data.recommendation.taskRankings.map((r) => r.taskId)).toEqual([UUID_A, UUID_B]);
      expect(data.recommendation.projectRankings[0].projectId).toBe(P1);
      expect(data.recommendation.focusPlan.taskIds).toEqual([UUID_A]);
      expect(data.meta).toEqual({ model: "gemini-3.8-flash", attempts: 1 });
    }
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("models/gemini-3.8-flash:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    const sent = JSON.parse(init.body);
    const prompt: string = sent.contents[0].parts[0].text;
    expect(prompt).not.toContain(UUID_A);
    expect(prompt).toContain('"daysUntilDue": 0');
    expect(prompt).not.toContain("isCompleted");
    expect(sent.generationConfig.responseMimeType).toBe("application/json");
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("규칙 위반(Focus 합계 초과) → 위반 내용과 함께 1회 재시도 후 성공", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const bad = { ...goodPayload, focusPlan: { taskIds: ["t1", "t2"], reason: "둘 다 해요" } }; // 75분 > 60분
    const fetchFn = mockFetch({ body: geminiBody(bad) }, { body: geminiBody(goodPayload) });
    const { data } = await call(request());
    expect(data.ok).toBe(true);
    if (data.ok) expect(data.meta.attempts).toBe(2);
    const retryPrompt: string = JSON.parse(fetchFn.mock.calls[1][1].body).contents[0].parts[0].text;
    expect(retryPrompt).toContain("초과");
  });

  it("잘못된 JSON이 두 번 오면 AI_INVALID_RESPONSE, 결과를 돌려주지 않음", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch({ body: geminiBody("{not json") }, { body: geminiBody("still not json") });
    const { status, data } = await call(request());
    expect(status).toBe(502);
    expect(data.ok).toBe(false);
    if (!data.ok) expect(data.error.code).toBe("AI_INVALID_RESPONSE");
    expect("recommendation" in data).toBe(false);
  });

  it("존재하지 않는 ID가 두 번 오면 실패", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = { ...goodPayload, focusPlan: { taskIds: ["t9"], reason: "x" } };
    mockFetch({ body: geminiBody(bad) }, { body: geminiBody(bad) });
    const { data } = await call(request());
    expect(data.ok).toBe(false);
  });

  it("Gemini 429 → AI_RATE_LIMITED, 재시도 없음", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = mockFetch({ status: 429, body: {} });
    const { status, data } = await call(request());
    expect(status).toBe(429);
    if (!data.ok) expect(data.error.code).toBe("AI_RATE_LIMITED");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("Gemini 500 → AI_UPSTREAM_ERROR", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch({ status: 500, body: { error: { message: "internal" } } });
    const { data } = await call(request());
    if (!data.ok) expect(data.error.code).toBe("AI_UPSTREAM_ERROR");
  });

  it("타임아웃 → AI_TIMEOUT", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("timeout");
    err.name = "TimeoutError";
    mockFetch(err);
    const { status, data } = await call(request());
    expect(status).toBe(504);
    if (!data.ok) expect(data.error.code).toBe("AI_TIMEOUT");
  });

  it("잘못된 본문 → INVALID_REQUEST", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const res = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: "{oops" }));
    expect(res.status).toBe(400);
  });
});
