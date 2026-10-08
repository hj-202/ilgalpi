import { daysUntilDue } from "../date";
import { buildValidationContext } from "../recommend/buildRequest";
import { validateRecommendation } from "../recommend/validate";
import type { RecommendationResult, RecommendErrorCode, RecommendRequest } from "../types";
import { callGemini } from "./gemini";
import { buildRetryPrompt, buildUserPrompt } from "./prompt";

export interface AiOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** 재시도를 포함한 전체 시간 예산 */
  budgetMs: number;
}

export type AiOutcome =
  | { ok: true; recommendation: RecommendationResult; attempts: number }
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
    timezone: req.timezone,
    availableMinutes: req.availableMinutes,
    projects: req.projects.map((p) => ({ id: toShort.get(p.id)!, name: p.name })),
    tasks: req.tasks.map((t) => ({
      id: toShort.get(t.id)!,
      projectId: t.projectId ? toShort.get(t.projectId)! : null,
      title: t.title,
      dueDate: t.dueDate,
      daysUntilDue: daysUntilDue(t.dueDate, req.currentDate),
      importance: t.importance,
      estimatedMinutes: t.estimatedMinutes,
    })),
  };
}

export async function runAiRecommendation(req: RecommendRequest, opts: AiOptions): Promise<AiOutcome> {
  const { toShort, toOrig } = buildIdMaps(req);
  const input = buildAiInput(req, toShort);
  const ctx = buildValidationContext(
    input.tasks,
    input.projects.map((p) => p.id),
    req.availableMinutes,
  );

  const started = Date.now();
  let prompt = buildUserPrompt(input);
  let lastDetail = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = opts.budgetMs - (Date.now() - started);
    const res = await callGemini({
      apiKey: opts.apiKey,
      model: opts.model,
      prompt,
      timeoutMs: Math.min(opts.timeoutMs, remaining),
    });
    if (!res.ok) {
      // 연결·쿼터·타임아웃 오류는 재시도하지 않는다. 형식 문제만 재시도.
      if (res.code !== "AI_INVALID_RESPONSE") {
        return { ok: false, code: res.code, detail: res.detail, attempts: attempt };
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
          return { ok: true, recommendation: restoreIds(outcome.result, toOrig), attempts: attempt };
        }
        violations = outcome.violations;
      } catch {
        violations = ["응답이 올바른 JSON이 아닙니다."];
      }
      lastDetail = violations.join(" / ");
      prompt = buildRetryPrompt(input, res.text.slice(0, 8000), violations);
    }

    if (opts.budgetMs - (Date.now() - started) < MIN_RETRY_MS) {
      return { ok: false, code: "AI_INVALID_RESPONSE", detail: lastDetail, attempts: attempt };
    }
  }
  return { ok: false, code: "AI_INVALID_RESPONSE", detail: lastDetail, attempts: 2 };
}

function restoreIds(result: RecommendationResult, toOrig: Map<string, string>): RecommendationResult {
  const orig = (id: string) => toOrig.get(id)!;
  return {
    taskRankings: result.taskRankings.map((r) => ({ ...r, taskId: orig(r.taskId) })),
    projectRankings: result.projectRankings.map((r) => ({ ...r, projectId: orig(r.projectId) })),
    focusPlan: { ...result.focusPlan, taskIds: result.focusPlan.taskIds.map(orig) },
    warnings: result.warnings,
  };
}
