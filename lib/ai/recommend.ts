import { EFFORT_LABEL } from "../constants";
import { daysUntilDue, minutesUntilDue } from "../date";
import { buildValidationContext } from "../recommend/buildRequest";
import { buildFacts } from "../recommend/grounding";
import { checkReasonQuality } from "../recommend/reasonQuality";
import { validateRecommendation } from "../recommend/validate";
import type { RecommendationResult, RecommendErrorCode, RecommendRequest } from "../types";
import { callGemini, type TokenUsage } from "./gemini";
import { buildRetryPrompt, buildUserPrompt } from "./prompt";

export interface AiOptions {
  apiKey: string;
  /** 앞에서부터 시도한다. 일시 장애(과부하·타임아웃·한도)면 다음 모델로 넘어간다. */
  models: string[];
  timeoutMs: number;
  /** 재시도를 포함한 전체 시간 예산 */
  budgetMs: number;
}

/** 호출 1회의 기록. 모델·결과·HTTP 상태·소요 시간·토큰 수만 담는다(작업 내용·응답 본문 없음). */
export interface CallRecord {
  model: string;
  /** "ok" 또는 오류 코드. 응답은 왔지만 검증에 실패하면 AI_INVALID_RESPONSE */
  result: string;
  status?: number;
  ms: number;
  usage?: TokenUsage;
}

/** 모든 호출의 합계와 429 발생 여부 */
export interface CallSummary {
  calls: CallRecord[];
  usage?: TokenUsage;
  rateLimited: boolean;
}

export type AiOutcome =
  | ({ ok: true; recommendation: RecommendationResult; attempts: number; model: string; trail: string[]; quality: { duplicates: number; contradictions: number } } & CallSummary)
  | ({ ok: false; code: RecommendErrorCode; detail: string; attempts: number; trail: string[] } & CallSummary);

const SUM_KEYS = ["promptTokens", "outputTokens", "thoughtsTokens", "totalTokens"] as const;

export function summarizeCalls(calls: CallRecord[]): CallSummary {
  let usage: TokenUsage | undefined;
  for (const c of calls) {
    if (!c.usage) continue;
    usage ??= {};
    for (const k of SUM_KEYS) {
      const v = c.usage[k];
      if (v !== undefined) usage[k] = (usage[k] ?? 0) + v;
    }
  }
  return { calls, usage, rateLimited: calls.some((c) => c.result === "AI_RATE_LIMITED" || c.status === 429) };
}

const MIN_RETRY_MS = 5_000;

/** UUID → 짧은 ID(t1, p1)로 바꿔 LLM 복사 오류를 줄이고, 결과는 원래 ID로 되돌린다. */
function buildIdMaps(req: RecommendRequest) {
  const toShort = new Map<string, string>();
  const toOrig = new Map<string, string>();
  req.projects.forEach((p, i) => {
    toShort.set(p.id, `p${i + 1}`);
    toOrig.set(`p${i + 1}`, p.id);
  });
  req.tasks.forEach((t, i) => {
    toShort.set(t.id, `t${i + 1}`);
    toOrig.set(`t${i + 1}`, t.id);
  });
  return { toShort, toOrig };
}

export function buildAiInput(req: RecommendRequest, toShort: Map<string, string>) {
  return {
    currentDate: req.currentDate,
    currentTime: req.currentTime ?? null,
    planDate: req.planDate,
    timezone: req.timezone,
    availableMinutes: req.availableMinutes,
    projects: req.projects.map((p) => ({ id: toShort.get(p.id)!, name: p.name })),
    tasks: req.tasks.map((t) => ({
      id: toShort.get(t.id)!,
      projectId: t.projectId ? toShort.get(t.projectId)! : null,
      title: t.title,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      daysUntilDue: daysUntilDue(t.dueDate, req.currentDate),
      minutesUntilDue: minutesUntilDue(t.dueDate, t.dueTime, req.currentDate, req.currentTime),
      importance: t.importance,
      effort: t.effort ? EFFORT_LABEL[t.effort] : null,
    })),
  };
}

export async function runAiRecommendation(req: RecommendRequest, opts: AiOptions): Promise<AiOutcome> {
  const { toShort, toOrig } = buildIdMaps(req);
  const input = buildAiInput(req, toShort);
  const ctx = buildValidationContext(
    input.tasks.map((t) => t.id),
    input.projects.map((p) => p.id),
    buildFacts(input),
    Object.fromEntries(input.tasks.map((t) => [t.id, { hasDue: t.dueDate !== null, importance: t.importance }])),
  );

  const started = Date.now();
  let prompt = buildUserPrompt(input);
  let lastDetail = "";
  // 시도별 결과 기록(모델:결과). 로그 전용이며 호출 순서·타임아웃에는 영향을 주지 않는다. 작업 내용은 담지 않는다.
  const trail: string[] = [];
  const calls: CallRecord[] = [];

  let modelIdx = 0;
  let formatTries = 0;
  let firstFailure: { code: RecommendErrorCode; detail: string } | null = null;
  for (let n = 1; n <= opts.models.length + 2; n++) {
    const remaining = opts.budgetMs - (Date.now() - started);
    const model = opts.models[modelIdx];
    const callStart = Date.now();
    const res = await callGemini({
      apiKey: opts.apiKey,
      model,
      prompt,
      timeoutMs: Math.min(opts.timeoutMs, remaining),
    });
    const record: CallRecord = { model, result: res.ok ? "ok" : res.code, status: res.ok ? 200 : res.status, ms: Date.now() - callStart, usage: res.usage };
    calls.push(record);
    if (!res.ok) {
      trail.push(`${model}:${res.code}`);
      if (res.code !== "AI_INVALID_RESPONSE") {
        // 과부하·타임아웃·한도·모델 오류는 다음 모델로 넘어간다. 인증 오류 등은 즉시 종료.
        firstFailure ??= { code: res.code, detail: res.detail };
        const transient = res.code === "AI_UPSTREAM_ERROR" || res.code === "AI_TIMEOUT" || res.code === "AI_RATE_LIMITED" || res.code === "AI_MODEL_ERROR";
        if (transient && modelIdx < opts.models.length - 1 && remaining > MIN_RETRY_MS) {
          modelIdx++;
          continue;
        }
        return { ok: false, ...(transient && firstFailure ? firstFailure : { code: res.code, detail: res.detail }), attempts: n, trail, ...summarizeCalls(calls) };
      }
      lastDetail = res.detail;
      prompt = buildUserPrompt(input);
    } else {
      let parsed: unknown;
      let violations: string[];
      try {
        parsed = JSON.parse(res.text);
        const outcome = validateRecommendation(parsed, ctx);
        if (outcome.valid) {
          trail.push(`${model}:ok`);
          // 이유 문구 품질은 검사만 한다(결과는 그대로). 개수만 로그로 남는다.
          const report = checkReasonQuality(
            outcome.result.taskRankings,
            input.tasks.map((t) => ({ id: t.id, dueDate: t.dueDate, dueTime: t.dueTime, daysUntilDue: t.daysUntilDue, minutesUntilDue: t.minutesUntilDue, importance: t.importance, effort: t.effort })),
          );
          const quality = { duplicates: report.duplicates.length, contradictions: report.contradictions.length };
          return { ok: true, recommendation: restoreIds(outcome.result, toOrig), attempts: n, model, trail, quality, ...summarizeCalls(calls) };
        }
        violations = outcome.violations;
      } catch {
        violations = ["응답이 올바른 JSON이 아닙니다."];
      }
      trail.push(`${model}:AI_INVALID_RESPONSE`);
      record.result = "AI_INVALID_RESPONSE"; // 응답은 왔지만 JSON·검증에 실패한 호출
      lastDetail = violations.join(" / ");
      prompt = buildRetryPrompt(input, res.text.slice(0, 8000), violations);
    }

    formatTries++;
    if (formatTries >= 2 || opts.budgetMs - (Date.now() - started) < MIN_RETRY_MS) {
      return { ok: false, code: "AI_INVALID_RESPONSE", detail: lastDetail, attempts: n, trail, ...summarizeCalls(calls) };
    }
  }
  return { ok: false, code: "AI_INVALID_RESPONSE", detail: lastDetail, attempts: formatTries, trail, ...summarizeCalls(calls) };
}

function restoreIds(result: RecommendationResult, toOrig: Map<string, string>): RecommendationResult {
  const orig = (id: string) => toOrig.get(id)!;
  return {
    taskRankings: result.taskRankings.map((r) => ({ ...r, taskId: orig(r.taskId) })),
    projectRankings: result.projectRankings.map((r) => ({ ...r, projectId: orig(r.projectId) })),
    warnings: result.warnings,
  };
}
