import { cleanFeedback } from "@/lib/feedback";
import { allow, LIMITS, hashSubject, requesterIp } from "@/lib/server/rateLimit";
import { getAdminSupabase } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 8 * 1024;

type Code = "INVALID" | "RATE_LIMITED" | "NOT_CONFIGURED" | "SAVE_FAILED" | "FORBIDDEN";
const STATUS: Record<Code, number> = { INVALID: 400, RATE_LIMITED: 429, NOT_CONFIGURED: 503, SAVE_FAILED: 502, FORBIDDEN: 403 };

function fail(code: Code) {
  return Response.json({ ok: false, code }, { status: STATUS[code] });
}

/** 의견 저장. 본문·IP는 로그에 남기지 않는다. 저장이 확인된 경우에만 ok:true */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("FORBIDDEN");

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail("INVALID");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("INVALID");
  }
  if (typeof body !== "object" || body === null) return fail("INVALID");
  const { message, website } = body as { message?: unknown; website?: unknown };
  // honeypot: 사람이 보지 못하는 입력이 채워졌다면 봇. 성공처럼 응답하지 않고 조용히 거부한다.
  if (typeof website === "string" && website !== "") return fail("INVALID");
  const text = cleanFeedback(message);
  if (!text) return fail("INVALID");

  const ip = requesterIp(request);
  if (!(await allow(LIMITS.feedback, ip))) return fail("RATE_LIMITED");
  if (!(await allow(LIMITS.feedbackDup, `${ip}:${hashSubject(text)}`))) return fail("RATE_LIMITED");

  const admin = getAdminSupabase();
  if (!admin) return fail("NOT_CONFIGURED");
  const { error } = await admin.from("feedback").insert({ message: text });
  if (error) {
    console.error("[feedback] insert_failed", {
      code: error.code,
      message: error.message,
      hint: error.hint,
      details: error.details,
    });
    return fail("SAVE_FAILED");
  }
  return Response.json({ ok: true });
}
