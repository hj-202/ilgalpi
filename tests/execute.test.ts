import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../lib/messages";
import { executeRecommend } from "../lib/recommend/execute";
import { failureAction } from "../lib/recommend/failure";
import type { RecommendRequest, RecommendResponse } from "../lib/types";

const request: RecommendRequest = {
  currentDate: "2026-11-05",
  planDate: "2026-11-05",
  timezone: "Asia/Seoul",
  availableMinutes: 60,
  projects: [],
  tasks: [],
};
const okResponse = { ok: true, recommendation: { taskRankings: [], projectRankings: [], warnings: [] }, meta: { model: "m", attempts: 1 } } as RecommendResponse;
const named = (name: string) => Object.assign(new Error(name), { name });

describe("executeRecommend", () => {
  it("요청 생성이 예외를 던지면 던지지 않고 INVALID_REQUEST를 돌려주며 전송하지 않는다", async () => {
    let sent = false;
    const result = await executeRecommend(
      () => {
        throw new Error("boom");
      },
      async () => {
        sent = true;
        return okResponse;
      },
    );
    expect(result).toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(sent).toBe(false);
  });

  it("생성 실패 뒤에도 상태가 남지 않아 다음 요청이 정상 처리된다(로딩 복구)", async () => {
    const failed = await executeRecommend(() => {
      throw new Error("boom");
    }, async () => okResponse);
    const next = await executeRecommend(() => request, async () => okResponse);
    expect(failed.ok).toBe(false);
    expect(next.ok).toBe(true);
  });

  it("INVALID_REQUEST는 기본 추천으로 대신하지 않고 안내만 하며 재시도할 수 있다", () => {
    expect(failureAction("INVALID_REQUEST", false)).toBe("error");
    expect(ERROR_MESSAGES.INVALID_REQUEST.message).toBeTruthy();
    expect(ERROR_MESSAGES.INVALID_REQUEST.canRetry).toBe(true);
  });

  it("정상 응답은 요청과 응답을 그대로 돌려준다", async () => {
    const result = await executeRecommend(() => request, async () => okResponse);
    expect(result).toEqual({ ok: true, request, data: okResponse });
  });

  it("서버 오류 응답은 해당 오류 코드를 돌려준다(기본 추천 전환 대상 유지)", async () => {
    const result = await executeRecommend(() => request, async () => ({ ok: false, error: { code: "AI_RATE_LIMITED", message: "x" } }));
    expect(result).toEqual({ ok: false, code: "AI_RATE_LIMITED" });
    expect(failureAction("AI_RATE_LIMITED", false)).toBe("fallback");
  });

  it("전송 중 TimeoutError는 AI_TIMEOUT, 그 밖의 예외는 NETWORK_ERROR", async () => {
    const timeout = await executeRecommend(() => request, async () => {
      throw named("TimeoutError");
    });
    const network = await executeRecommend(() => request, async () => {
      throw named("TypeError");
    });
    expect(timeout).toEqual({ ok: false, code: "AI_TIMEOUT" });
    expect(network).toEqual({ ok: false, code: "NETWORK_ERROR" });
  });
});
