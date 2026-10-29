import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const insert = vi.fn();
let admin: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => admin }));

import { POST as feedbackPost } from "@/app/api/feedback/route";
import { allow, hashSubject, LIMITS } from "@/lib/server/rateLimit";

const limit = { bucket: "t", windowSeconds: 60, max: 2 };

beforeEach(() => {
  rpc.mockReset();
  insert.mockReset();
  admin = null;
});

describe("rate limit — 메모리 카운터(Supabase 미연결 개발 환경)", () => {
  it("한도까지 허용하고 초과하면 막으며, 요청자별로 분리된다", async () => {
    const who = `mem-${Math.random()}`;
    expect(await allow(limit, who)).toBe(true);
    expect(await allow(limit, who)).toBe(true);
    expect(await allow(limit, who)).toBe(false);
    expect(await allow(limit, `${who}-other`)).toBe(true);
  });
});

describe("rate limit — DB 카운터(서버리스 운영)", () => {
  it("해시된 요청자와 한도를 RPC로 넘기고 결과를 그대로 따른다(원문 IP 미전달)", async () => {
    admin = { rpc };
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await allow(limit, "1.2.3.4")).toBe(true);
    expect(await allow(limit, "1.2.3.4")).toBe(false);
    const args = rpc.mock.calls[0];
    expect(args[0]).toBe("hit_rate_limit");
    expect(args[1]).toMatchObject({ p_bucket: "t", p_window_seconds: 60, p_max: 2, p_subject: hashSubject("1.2.3.4") });
    expect(JSON.stringify(args[1])).not.toContain("1.2.3.4");
  });

  it("DB 오류 시 서비스를 막지 않는다(fail-open)", async () => {
    admin = { rpc };
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await allow(limit, "5.6.7.8")).toBe(true);
  });
});

describe("의견 API — 제한과 저장", () => {
  const req = (message: unknown, ip = "9.9.9.9") =>
    new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ message }),
    });

  it("한도 초과 시 429 RATE_LIMITED이며 저장하지 않는다", async () => {
    admin = { rpc: rpc.mockResolvedValue({ data: false, error: null }), from: () => ({ insert }) };
    const res = await feedbackPost(req("의견"));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("RATE_LIMITED");
    expect(insert).not.toHaveBeenCalled();
  });

  it("허용되면 저장하고 저장이 확인된 경우에만 ok:true", async () => {
    insert.mockResolvedValueOnce({ error: null });
    admin = { rpc: rpc.mockResolvedValue({ data: true, error: null }), from: () => ({ insert }) };
    const res = await feedbackPost(req("좋아요"));
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({ message: "좋아요" });
  });

  it("다른 출처 요청은 403, 빈 의견은 400", async () => {
    admin = { rpc: rpc.mockResolvedValue({ data: true, error: null }), from: () => ({ insert }) };
    const cross = new Request("http://localhost/api/feedback", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" });
    expect((await feedbackPost(cross)).status).toBe(403);
    expect((await feedbackPost(req("   "))).status).toBe(400);
  });

  it("LIMITS는 추천·의견 모두 정의돼 있다", () => {
    expect(LIMITS.recommend.max).toBeGreaterThan(0);
    expect(LIMITS.feedback.max).toBeGreaterThan(0);
  });
});
