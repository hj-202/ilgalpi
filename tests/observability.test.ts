import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/recommend/route";
import RecommendLoading, { loadingSub, LOADING_MAIN, LOADING_SUB, LOADING_SUB_SLOW, SLOW_AFTER_MS } from "../components/RecommendLoading";
import { failureAction } from "../lib/recommend/failure";
import { formatRecommendLog, safeDetail } from "../lib/server/recommendLog";
import type { RecommendErrorCode } from "../lib/types";

const SECRET_TITLE = "비밀프로젝트 계약서 검토";
const body = {
  currentDate: "2026-11-04",
  planDate: "2026-11-04",
  timezone: "Asia/Seoul",
  availableMinutes: 60,
  projects: [],
  tasks: [
    { id: "a", projectId: null, title: SECRET_TITLE, dueDate: "2026-11-04", dueTime: null, importance: "high", effort: "medium", isCompleted: false },
    { id: "b", projectId: null, title: "택배", dueDate: null, dueTime: null, importance: "low", effort: "short", isCompleted: false },
  ],
};
const post = () => POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify(body) }));
const gemini = (payload: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }] }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("추천 서버 로그", () => {
  it("성공: 모델·시도·경로·소요시간·작업 수를 남기고 작업 내용·키는 남기지 않는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "SECRET-KEY-123");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash");
    vi.stubGlobal("fetch", vi.fn(async () => gemini({ taskRankings: [{ taskId: "t1", rank: 1, reason: "오늘 마감이고 중요도가 높아요" }, { taskId: "t2", rank: 2, reason: "마감이 없고 중요도가 낮아요" }], projectRankings: [], warnings: [] })));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post();
    expect(res.status).toBe(200);
    const line = String(info.mock.calls[0][0]);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ evt: "recommend", outcome: "ok", model: "gemini-3.5-flash", attempts: 1, trail: ["gemini-3.5-flash:ok"], tasks: 2 });
    expect(typeof parsed.ms).toBe("number");
    expect(line).not.toContain(SECRET_TITLE);
    expect(line).not.toContain("SECRET-KEY");
    expect(err).not.toHaveBeenCalled();
  });

  it("모델 전환 후 성공해도 경로(trail)에 첫 모델 실패가 남는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("GEMINI_MODEL", "");
    const ok = { taskRankings: [{ taskId: "t1", rank: 1, reason: "오늘 마감이고 중요도가 높아요" }, { taskId: "t2", rank: 2, reason: "마감이 없고 중요도가 낮아요" }], projectRankings: [], warnings: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(gemini(ok)));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await post();
    const parsed = JSON.parse(String(info.mock.calls[0][0]));
    expect(parsed.trail).toEqual(["gemini-3.5-flash:AI_UPSTREAM_ERROR", "gemini-3-flash-preview:ok"]);
    expect(parsed.attempts).toBe(2);
  });

  it("실패: 오류 코드·경로를 남기고, 검증 실패 상세(작업 제목 인용 가능)는 원문을 남기지 않는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    const bad = { taskRankings: [{ taskId: "t1", rank: 1, reason: `${SECRET_TITLE}은 마감이 없는데 마감이 임박했어요 11월 30일` }, { taskId: "t2", rank: 2, reason: "x" }], projectRankings: [], warnings: [] };
    vi.stubGlobal("fetch", vi.fn(async () => gemini(bad)));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post();
    expect(res.status).toBe(502);
    const line = String(err.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({ outcome: "fail", code: "AI_INVALID_RESPONSE", detail: "validation_failed" });
    expect(line).not.toContain(SECRET_TITLE);
  });

  it("키 없음·입력 오류도 한 줄 로그가 남는다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await post();
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ outcome: "fail", code: "MISSING_API_KEY" });
  });

  it("safeDetail은 허용 패턴만 통과시킨다", () => {
    expect(safeDetail("HTTP 503 The model is overloaded. 내 할 일")).toBe("HTTP 503");
    expect(safeDetail("timeout 12000ms")).toBe("timeout 12000ms");
    expect(safeDetail("finishReason=MAX_TOKENS")).toBe("finishReason=MAX_TOKENS");
    expect(safeDetail("마감일이 없는 작업에 마감을 언급했습니다")).toBe("validation_failed");
    expect(safeDetail(undefined)).toBeUndefined();
    expect(formatRecommendLog({ ok: true, ms: 12.6, detail: "HTTP 500" })).not.toContain("HTTP");
  });
});

describe("실패 시 화면 처리 정책", () => {
  const fallbackCodes: RecommendErrorCode[] = ["AI_TIMEOUT", "AI_RATE_LIMITED", "SERVICE_RATE_LIMITED", "AI_UPSTREAM_ERROR", "AI_INVALID_RESPONSE", "NETWORK_ERROR", "MISSING_API_KEY", "AI_AUTH_ERROR", "AI_MODEL_ERROR"];
  it.each(fallbackCodes)("%s: 최신 결과가 없으면 조건 기반 추천으로 전환", (code) => {
    expect(failureAction(code, false)).toBe("fallback");
  });
  it.each(fallbackCodes)("%s: 최신 결과가 있으면 대체하지 않고 오류 안내만", (code) => {
    expect(failureAction(code, true)).toBe("error");
  });
  it.each(["INVALID_REQUEST", "NO_TASKS", "TOO_MANY_TASKS"] as const)("%s: 입력 오류는 전환하지 않는다", (code) => {
    expect(failureAction(code, false)).toBe("error");
  });
});

describe("추천 로딩 UI", () => {
  const html = renderToStaticMarkup(createElement(RecommendLoading));
  it("요청 카피, 140px 원형·두께 11, 퍼센트·AI 텍스트 없음", () => {
    expect(html).toContain(LOADING_MAIN);
    expect(html).toContain(LOADING_SUB);
    expect(html).not.toContain(LOADING_SUB_SLOW);
    expect(html).toContain('width="140"');
    expect(html).toContain('stroke-width="11"');
    expect(html).not.toContain("%");
    expect(html).not.toMatch(/>\s*AI\s*</);
    expect(html).toContain('role="status"');
    // 확정 카피: 문장 끝 마침표·말줄임표 없음, 그림자·스켈레톤 없음
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/[.…]/);
    expect(html).not.toMatch(/shadow|skeleton|animate-pulse/);
    // 중립 트랙 + 브랜드 레드 라인, 길이가 변하며 회전
    expect(html).toContain("var(--color-line)");
    expect(html).toContain("var(--color-primary)");
    expect(html).toContain("rec-ring-arc");
    expect(html).not.toContain("rec-ring-spin");
    expect(html).toContain('stroke-linecap="round"');
    expect(html).not.toMatch(/border|rounded-3xl/);
  });
  it("지연 카피 전환 기준", () => {
    expect(loadingSub(false)).toBe("잠시만 기다려 주세요");
    expect(loadingSub(true)).toBe("평소보다 시간이 조금 더 걸리고 있어요");
    expect(SLOW_AFTER_MS).toBeLessThan(12_000);
  });
});
