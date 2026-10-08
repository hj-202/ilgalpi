import { runAiRecommendation } from "@/lib/ai/recommend";
import { ERROR_MESSAGES } from "@/lib/messages";
import { validateRecommendRequest } from "@/lib/recommend/requestValidation";
import type { RecommendErrorCode, RecommendResponse } from "@/lib/types";

export const maxDuration = 60;

const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_TIMEOUT_MS = 20_000;
const BUDGET_MS = 40_000;

const STATUS: Record<RecommendErrorCode, number> = {
  MISSING_API_KEY: 503,
  INVALID_REQUEST: 400,
  NO_TASKS: 400,
  TOO_MANY_TASKS: 400,
  AI_TIMEOUT: 504,
  AI_RATE_LIMITED: 429,
  AI_UPSTREAM_ERROR: 502,
  AI_INVALID_RESPONSE: 502,
  NETWORK_ERROR: 502,
};

function fail(code: RecommendErrorCode) {
  const body: RecommendResponse = { ok: false, error: { code, message: ERROR_MESSAGES[code].message } };
  return Response.json(body, { status: STATUS[code] });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fail("MISSING_API_KEY");

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

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const outcome = await runAiRecommendation(checked.request, {
    apiKey,
    model,
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
    meta: { model, attempts: outcome.attempts },
  };
  return Response.json(body200);
}
