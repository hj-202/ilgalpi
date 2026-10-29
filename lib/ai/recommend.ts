import { EFFORT_LABEL } from "../constants";
import { daysUntilDue, minutesUntilDue } from "../date";
import { buildValidationContext } from "../recommend/buildRequest";
import { buildFacts } from "../recommend/grounding";
import { validateRecommendation } from "../recommend/validate";
import type { RecommendationResult, RecommendErrorCode, RecommendRequest } from "../types";
import { callGemini } from "./gemini";
import { buildRetryPrompt, buildUserPrompt } from "./prompt";

export interface AiOptions {
  apiKey: string;
  /** 앞에서부터 시도한다. 일시 장애(과부하·타임아웃·한도)면 다음 모델로 넘어간다. */
  models: string[];
  timeoutMs: number;
  /** 재시도를 포함한 전체 시간 예산 */
  budgetMs: number;
}

export type AiOutcome =
  | { ok: true; recommendation: RecommendationResult; attempts: number; model: string }
  | { ok: false; code: RecommendErrorCode; detail: string; attempts: number };

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

  let modelIdx = 0;
  let formatTries = 0;
  let firstFailure: { code: RecommendErrorCode; detail: string } | null = null;
  for (let n = 1; n <= opts.models.length + 2; n++) {
    const remaining = opts.budgetMs - (Date.now() - started);
    const model = opts.models[modelIdx];
    const res = await callGemini({
      apiKey: opts.apiKey,
      model,
      prompt,
      timeoutMs: Math.min(opts.timeoutMs, remaining),
    });
    if (!res.ok) {
      if (res.code !== "AI_INVALID_RESPONSE") {
        // 과부하·타임아웃·한도·모델 오류는 다음 모델로 넘어간다. 인증 오류 등은 즉시 종료.
        firstFailure ??= { code: res.code, detail: res.detail };
        const transient = res.code === "AI_UPSTREAM_ERROR" || res.code === "AI_TIMEOUT" || res.code === "AI_RATE_LIMITED" || res.code === "AI_MODEL_ERROR";
        if (transient && modelIdx < opts.models.length - 1 && remaining > MIN_RETRY_MS) {
          modelIdx++;
          continue;
        }
        return { ok: false, ...(transient && firstFailure ? firstFailure : { code: res.code, detail: res.detail }), attempts: n };
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
          return { ok: true, recommendation: restoreIds(outcome.result, toOrig), attempts: n, model };
        }
        violations = outcome.violations;
      } catch {
        violations = ["응답이 올바른 JSON이 아닙니다."];
      }
      lastDetail = violations.join(" / ");
      prompt = buildRetryPrompt(input, res.text.slice(0, 8000), violations);
    }

    formatTries++;
    if (formatTries >= 2 || opts.budgetMs - (Date.now() - started) < MIN_RETRY_MS) {
      return { ok: false, code: "AI_INVALID_RESPONSE", detail: lastDetail, attempts: n };
    }
  }
  return { ok: false, code: "AI_INVALID_RESPONSE", detail: lastDetail, attempts: formatTries };
}

function restoreIds(result: RecommendationResult, toOrig: Map<string, string>): RecommendationResult {
  const orig = (id: string) => toOrig.get(id)!;
  return {
    taskRankings: result.taskRankings.map((r) => ({ ...r, taskId: orig(r.taskId) })),
    projectRankings: result.projectRankings.map((r) => ({ ...r, projectId: orig(r.projectId) })),
    warnings: result.warnings,
  };
}
