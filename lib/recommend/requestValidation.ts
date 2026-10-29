import { AVAIL_MAX, AVAIL_MIN, MAX_AI_TASKS, PROJECT_NAME_MAX, TITLE_MAX } from "../constants";
import { isValidHm, isValidYmd } from "../date";
import type { RecommendErrorCode, RecommendRequest } from "../types";

type Result =
  | { ok: true; request: RecommendRequest }
  | { ok: false; code: Extract<RecommendErrorCode, "INVALID_REQUEST" | "NO_TASKS" | "TOO_MANY_TASKS"> };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

/** 서버 요청 검증 (PRD §7-2 V-Q1~Q6). 완료 작업이 포함되면 요청 전체를 거부한다. */
export function validateRecommendRequest(body: unknown): Result {
  const invalid = { ok: false, code: "INVALID_REQUEST" } as const;
  if (!isObj(body)) return invalid;
  const { currentDate, planDate, currentTime, timezone, availableMinutes, projects, tasks } = body;

  if (!isValidYmd(currentDate) || !isValidYmd(planDate)) return invalid;
  if (currentTime !== undefined && !isValidHm(currentTime)) return invalid;
  if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 64) return invalid;
  if (!isIntIn(availableMinutes, AVAIL_MIN, AVAIL_MAX)) return invalid;
  if (!Array.isArray(projects) || !Array.isArray(tasks)) return invalid;

  if (tasks.length === 0) return { ok: false, code: "NO_TASKS" };
  if (tasks.length > MAX_AI_TASKS) return { ok: false, code: "TOO_MANY_TASKS" };

  const projectIds = new Set<string>();
  const cleanProjects: RecommendRequest["projects"] = [];
  for (const p of projects) {
    if (!isObj(p) || !isText(p.id, 100) || !isText(p.name, PROJECT_NAME_MAX)) return invalid;
    if (projectIds.has(p.id)) return invalid;
    projectIds.add(p.id);
    cleanProjects.push({ id: p.id, name: p.name.trim() });
  }

  const taskIds = new Set<string>();
  const cleanTasks: RecommendRequest["tasks"] = [];
  for (const t of tasks) {
    if (!isObj(t) || !isText(t.id, 100) || taskIds.has(t.id)) return invalid;
    taskIds.add(t.id);
    // V-Q5: 완료 작업(true)이나 필드 누락이 있으면 거부
    if (t.isCompleted !== false) return invalid;
    if (!isText(t.title, TITLE_MAX)) return invalid;
    if (t.projectId !== null && (typeof t.projectId !== "string" || !projectIds.has(t.projectId))) {
      return invalid;
    }
    if (t.dueDate !== null && !isValidYmd(t.dueDate)) return invalid;
    // dueTime은 dueDate가 있을 때만 허용. 필드 누락(undefined)은 null로 본다(구버전 호환)
    const dueTime = t.dueTime ?? null;
    if (dueTime !== null && (!isValidHm(dueTime) || t.dueDate === null)) return invalid;
    if (t.importance !== "high" && t.importance !== "medium" && t.importance !== "low") return invalid;
    const effort = t.effort ?? null;
    if (effort !== null && effort !== "short" && effort !== "medium" && effort !== "long") return invalid;
    cleanTasks.push({
      id: t.id,
      projectId: t.projectId as string | null,
      title: t.title.trim(),
      dueDate: t.dueDate as string | null,
      dueTime: dueTime as string | null,
      importance: t.importance,
      effort: effort as RecommendRequest["tasks"][number]["effort"],
      isCompleted: false,
    });
  }

  // V-Q6: 작업이 없는 프로젝트는 분석 대상에서 제외
  const used = new Set(cleanTasks.map((t) => t.projectId));
  return {
    ok: true,
    request: {
      currentDate,
      planDate,
      ...(currentTime !== undefined ? { currentTime: currentTime as string } : {}),
      timezone,
      availableMinutes,
      projects: cleanProjects.filter((p) => used.has(p.id)),
      tasks: cleanTasks,
    },
  };
}
