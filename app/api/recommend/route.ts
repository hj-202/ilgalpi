import { runAiRecommendation } from "@/lib/ai/recommend";
import { ERROR_MESSAGES } from "@/lib/messages";
import { allow, LIMITS, requesterIp } from "@/lib/server/rateLimit";
import { validateRecommendRequest } from "@/lib/recommend/requestValidation";
import type { RecommendErrorCode, RecommendResponse } from "@/lib/types";

export const maxDuration = 60;

const MAX_BODY_BYTES = 32 * 1024;
// 2026-10 진단: gemini-3.8/3.7-flash는 과부하(503·무응답)였고 아래 모델은 1.5~3초에 응답했다.
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview"];
const DEFAULT_TIMEOUT_MS = 12_000;
const BUDGET_MS = 30_000;

const STATUS: Record<RecommendErrorCode, number> = {
  MISSING_API_KEY: 503,
  AI_AUTH_ERROR: 502,
  AI_MODEL_ERROR: 502,
  INVALID_REQUEST: 400,
  NO_TASKS: 400,
  TOO_MANY_TASKS: 400,
  AI_TIMEOUT: 504,
  AI_RATE_LIMITED: 429,
  AI_UPSTREAM_ERROR: 502,
  AI_INVALID_RESPONSE: 502,
  NETWORK_ERROR: 502,
  SERVICE_RATE_LIMITED: 429,
};

function fail(code: RecommendErrorCode) {
  const body: RecommendResponse = { ok: false, error: { code, message: ERROR_MESSAGES[code].message } };
  return Response.json(body, { status: STATUS[code] });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fail("MISSING_API_KEY");

  // 서비스 자체 제한(Gemini 한도 AI_RATE_LIMITED와 구분). 걸려도 클라이언트가 조건 기반 추천으로 전환한다.
  if (!(await allow(LIMITS.recommend, requesterIp(request)))) return fail("SERVICE_RATE_LIMITED");

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail("INVALID_REQUEST");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("INVALID_REQUEST");
  }
  const checked = validateRecommendRequest(body);
  if (!checked.ok) return fail(checked.code);

  const preferred = process.env.GEMINI_MODEL?.trim();
  const models = preferred ? [preferred, ...DEFAULT_MODELS.filter((m) => m !== preferred)] : DEFAULT_MODELS;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const outcome = await runAiRecommendation(checked.request, {
    apiKey,
    models,
    timeoutMs,
    budgetMs: BUDGET_MS,
  });

  if (!outcome.ok) {
    // 작업 내용은 로그에 남기지 않는다
    console.error(`[recommend] ${outcome.code} attempts=${outcome.attempts} ${outcome.detail}`);
    return fail(outcome.code);
  }
  const body200: RecommendResponse = {
    ok: true,
    recommendation: outcome.recommendation,
    meta: { model: outcome.model, attempts: outcome.attempts },
  };
  return Response.json(body200);
}
