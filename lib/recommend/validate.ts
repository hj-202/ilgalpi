import { MAX_FOCUS, MAX_WARNINGS, REASON_MAX } from "../constants";
import { truncate } from "../format";
import type {
  FocusPlan,
  ProjectRanking,
  RecommendationResult,
  TaskRanking,
} from "../types";

export interface ValidationContext {
  /** 분석 대상(미완료) 작업 ID → 예상 소요시간 */
  taskMinutes: Record<string, number>;
  /** 분석 대상(진행 중) 프로젝트 ID */
  projectIds: string[];
  availableMinutes: number;
}

export type ValidationOutcome =
  | { valid: true; result: RecommendationResult }
  | { valid: false; violations: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? truncate(text, max) : null;
}

/** 순위 목록 공통 검증 (V-T1~T5, V-P1~P3) */
function checkRankings(
  raw: unknown,
  idKey: "taskId" | "projectId",
  expectedIds: string[],
  label: string,
  reasonMax: number,
  violations: string[],
): Array<{ id: string; rank: number; reason: string }> {
  if (!Array.isArray(raw)) {
    violations.push(`${label} 목록이 배열이 아닙니다.`);
    return [];
  }
  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  const ranks = new Set<number>();
  const items: Array<{ id: string; rank: number; reason: string }> = [];

  for (const item of raw) {
    if (!isObject(item) || typeof item[idKey] !== "string") {
      violations.push(`${label} 항목에 ${idKey}가 없습니다.`);
      continue;
    }
    const id = item[idKey] as string;
    if (!expected.has(id)) {
      violations.push(`존재하지 않는 ${label} ID가 포함되었습니다: ${id}`);
      continue;
    }
    if (seen.has(id)) {
      violations.push(`${label} ID가 중복되었습니다: ${id}`);
      continue;
    }
    seen.add(id);

    const rank = item.rank;
    if (typeof rank !== "number" || !Number.isInteger(rank)) {
      violations.push(`${label} ${id}의 rank가 정수가 아닙니다.`);
      continue;
    }
    if (ranks.has(rank)) violations.push(`${label} rank ${rank}가 중복되었습니다.`);
    ranks.add(rank);

    const reason = cleanText(item.reason, reasonMax);
    if (!reason) violations.push(`${label} ${id}의 reason이 비어 있습니다.`);

    items.push({ id, rank, reason: reason ?? "" });
  }

  const missing = expectedIds.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    violations.push(`${label} 목록에서 누락된 ID가 있습니다: ${missing.join(", ")}`);
  }
  for (let r = 1; r <= expectedIds.length; r++) {
    if (!ranks.has(r)) {
      violations.push(`${label} rank는 1부터 ${expectedIds.length}까지 연속된 정수여야 합니다.`);
      break;
    }
  }
  return items.sort((a, b) => a.rank - b.rank);
}

/**
 * AI(또는 기본 추천) 결과가 PRD §7-5 규칙을 지키는지 검증하고 정규화한다.
 * 위반 시 결과를 돌려주지 않는다.
 */
export function validateRecommendation(
  raw: unknown,
  ctx: ValidationContext,
): ValidationOutcome {
  if (!isObject(raw)) {
    return { valid: false, violations: ["응답이 JSON 객체가 아닙니다."] };
  }
  const violations: string[] = [];
  const taskIds = Object.keys(ctx.taskMinutes);

  const taskRankings: TaskRanking[] = checkRankings(
    raw.taskRankings,
    "taskId",
    taskIds,
    "작업",
    REASON_MAX.task,
    violations,
  ).map(({ id, rank, reason }) => ({ taskId: id, rank, reason }));

  const projectRankings: ProjectRanking[] = checkRankings(
    raw.projectRankings,
    "projectId",
    ctx.projectIds,
    "프로젝트",
    REASON_MAX.project,
    violations,
  ).map(({ id, rank, reason }) => ({ projectId: id, rank, reason }));

  let focusPlan: FocusPlan = { taskIds: [], reason: "" };
  const focus = raw.focusPlan;
  if (!isObject(focus) || !Array.isArray(focus.taskIds)) {
    violations.push("focusPlan.taskIds가 배열이 아닙니다.");
  } else {
    const ids = focus.taskIds;
    if (ids.length > MAX_FOCUS) {
      violations.push(`focusPlan은 최대 ${MAX_FOCUS}개까지만 포함할 수 있습니다.`);
    }
    if (ids.some((id) => typeof id !== "string" || !(id in ctx.taskMinutes))) {
      violations.push("focusPlan에 존재하지 않는 작업 ID가 포함되었습니다.");
    } else if (new Set(ids).size !== ids.length) {
      violations.push("focusPlan에 같은 작업이 중복되었습니다.");
    } else {
      const total = (ids as string[]).reduce((sum, id) => sum + ctx.taskMinutes[id], 0);
      if (total > ctx.availableMinutes) {
        violations.push(
          `focusPlan 작업의 소요시간 합계(${total}분)가 가용 시간(${ctx.availableMinutes}분)을 초과합니다.`,
        );
      }
    }
    const anyFits = taskIds.some((id) => ctx.taskMinutes[id] <= ctx.availableMinutes);
    if (anyFits && ids.length === 0) {
      violations.push("가용 시간 안에 끝낼 수 있는 작업이 있으므로 focusPlan에 최소 1개를 포함해야 합니다.");
    }
    const reason = cleanText(focus.reason, REASON_MAX.focus);
    if (!reason) violations.push("focusPlan.reason이 비어 있습니다.");
    focusPlan = { taskIds: ids as string[], reason: reason ?? "" };
  }

  if (!Array.isArray(raw.warnings)) {
    violations.push("warnings가 배열이 아닙니다.");
  }
  const warnings = (Array.isArray(raw.warnings) ? raw.warnings : [])
    .map((w) => cleanText(w, REASON_MAX.warning))
    .filter((w): w is string => w !== null)
    .slice(0, MAX_WARNINGS);

  if (violations.length > 0) return { valid: false, violations };
  return { valid: true, result: { projectRankings, taskRankings, focusPlan, warnings } };
}
