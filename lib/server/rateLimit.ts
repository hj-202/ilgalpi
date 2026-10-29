import { createHash } from "node:crypto";
import { getAdminSupabase } from "@/lib/supabase/admin";

export interface Limit {
  bucket: string;
  windowSeconds: number;
  max: number;
}

/** 서비스 자체 제한(추천·의견 공통). 수치는 PRD §19-14·19에서 미확정이라 한 곳에서만 조정한다. */
export const LIMITS = {
  recommend: { bucket: "recommend", windowSeconds: 3600, max: 20 },
  feedback: { bucket: "feedback", windowSeconds: 3600, max: 5 },
  feedbackDup: { bucket: "feedback-dup", windowSeconds: 600, max: 1 },
} satisfies Record<string, Limit>;

/** 원문 IP·내용을 저장하지 않고 솔트된 해시만 쓴다 */
export function hashSubject(value: string): string {
  const salt = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "ilgalpi-dev";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export function requesterIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

// Supabase가 연결되지 않은 개발 환경용 메모리 카운터. 서버리스 운영에서는 유지되지 않으므로 보호 수단으로 간주하지 않는다.
const memory = new Map<string, { windowStart: number; hits: number }>();

/** 허용되면 true. DB 오류 시에는 서비스를 막지 않고(fail-open) 오류 코드만 로그에 남긴다. */
export async function allow(limit: Limit, subject: string): Promise<boolean> {
  const subjectHash = hashSubject(subject);
  const admin = getAdminSupabase();
  if (admin) {
    const { data, error } = await admin.rpc("hit_rate_limit", {
      p_bucket: limit.bucket,
      p_subject: subjectHash,
      p_window_seconds: limit.windowSeconds,
      p_max: limit.max,
    });
    if (error) {
      console.error(`[rate-limit] ${limit.bucket} rpc_error code=${error.code ?? "unknown"}`);
      return true;
    }
    return data === true;
  }
  const key = `${limit.bucket}:${subjectHash}`;
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.windowStart > limit.windowSeconds * 1000) {
    memory.set(key, { windowStart: now, hits: 1 });
    return true;
  }
  entry.hits += 1;
  return entry.hits <= limit.max;
}
