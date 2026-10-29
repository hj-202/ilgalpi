import { AVAIL_DEFAULT, TITLE_MAX } from "../constants";
import type { AppState, Project, StoredRecommendation, Task } from "../types";

/** DB 행 ↔ 앱 상태 변환과 변경 비교(순수 함수). 계정 데이터는 localStorage에 쓰지 않는다. */

export type Table = "projects" | "tasks" | "daily_available" | "recommendations" | "user_preferences";

export interface Op {
  table: Table;
  /** 같은 대상의 변경은 마지막 것만 남기기 위한 키 */
  key: string;
  /** upsert할 행. 없으면 삭제 */
  row?: Record<string, unknown>;
  /** 삭제 대상 식별값(id / day / plan_date) */
  match?: string;
}

const iso = (v: unknown): string => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

export function taskToRow(uid: string, t: Task) {
  return {
    user_id: uid,
    id: t.id,
    project_id: t.projectId,
    title: t.title.slice(0, TITLE_MAX),
    planned_date: t.plannedDate,
    due_date: t.dueDate,
    due_time: t.dueDate ? t.dueTime : null,
    importance: t.importance,
    effort: t.effort,
    legacy_minutes: t.legacyMinutes,
    is_completed: t.isCompleted,
    completed_at: t.completedAt ? iso(t.completedAt) : null,
    created_at: iso(t.createdAt),
    updated_at: iso(t.updatedAt),
  };
}

export function rowToTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    projectId: (r.project_id as string | null) ?? null,
    title: r.title as string,
    plannedDate: r.planned_date as string,
    dueDate: (r.due_date as string | null) ?? null,
    dueTime: (r.due_time as string | null) ?? null,
    importance: r.importance as Task["importance"],
    effort: (r.effort as Task["effort"]) ?? null,
    legacyMinutes: (r.legacy_minutes as number | null) ?? null,
    isCompleted: r.is_completed === true,
    completedAt: (r.completed_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function projectToRow(uid: string, p: Project) {
  return { user_id: uid, id: p.id, name: p.name, created_at: iso(p.createdAt), updated_at: iso(p.updatedAt) };
}

export function rowToProject(r: Record<string, unknown>): Project {
  return { id: r.id as string, name: r.name as string, createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 이전 상태 → 새 상태에서 서버에 반영해야 할 변경 목록 */
export function diffState(uid: string, prev: AppState, next: AppState): Op[] {
  const ops: Op[] = [];

  const prevTasks = new Map(prev.tasks.map((t) => [t.id, t]));
  const nextTasks = new Map(next.tasks.map((t) => [t.id, t]));
  for (const [id, t] of nextTasks) {
    if (!same(prevTasks.get(id), t)) ops.push({ table: "tasks", key: `t:${id}`, row: taskToRow(uid, t) });
  }
  for (const id of prevTasks.keys()) if (!nextTasks.has(id)) ops.push({ table: "tasks", key: `t:${id}`, match: id });

  const prevProjects = new Map(prev.projects.map((p) => [p.id, p]));
  const nextProjects = new Map(next.projects.map((p) => [p.id, p]));
  for (const [id, p] of nextProjects) {
    if (!same(prevProjects.get(id), p)) ops.push({ table: "projects", key: `p:${id}`, row: projectToRow(uid, p) });
  }
  for (const id of prevProjects.keys()) if (!nextProjects.has(id)) ops.push({ table: "projects", key: `p:${id}`, match: id });

  const now = new Date().toISOString();
  for (const [day, minutes] of Object.entries(next.dailyAvailableMinutes)) {
    if (prev.dailyAvailableMinutes[day] !== minutes) {
      ops.push({ table: "daily_available", key: `d:${day}`, row: { user_id: uid, day, minutes, updated_at: now } });
    }
  }
  for (const day of Object.keys(prev.dailyAvailableMinutes)) {
    if (!(day in next.dailyAvailableMinutes)) ops.push({ table: "daily_available", key: `d:${day}`, match: day });
  }

  for (const [date, rec] of Object.entries(next.recommendations)) {
    if (!same(prev.recommendations[date], rec)) {
      ops.push({ table: "recommendations", key: `r:${date}`, row: { user_id: uid, plan_date: date, data: rec, updated_at: now } });
    }
  }
  for (const date of Object.keys(prev.recommendations)) {
    if (!(date in next.recommendations)) ops.push({ table: "recommendations", key: `r:${date}`, match: date });
  }

  if (prev.preferences.availableMinutes !== next.preferences.availableMinutes) {
    ops.push({
      table: "user_preferences",
      key: "pref",
      row: { user_id: uid, available_minutes: next.preferences.availableMinutes, updated_at: now },
    });
  }
  return ops;
}

/** 서버에서 읽은 상태 위에 아직 저장되지 않은 로컬 변경을 다시 적용한다(저장 대기 중인 변경이 우선) */
export function applyPending(state: AppState, pending: Iterable<Op>): AppState {
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const daily = { ...state.dailyAvailableMinutes };
  const recs = { ...state.recommendations };
  let pref = state.preferences.availableMinutes;
  for (const op of pending) {
    const row = op.row;
    if (op.table === "tasks") {
      if (row) tasks.set(row.id as string, rowToTask(row));
      else tasks.delete(op.match!);
    } else if (op.table === "projects") {
      if (row) projects.set(row.id as string, rowToProject(row));
      else projects.delete(op.match!);
    } else if (op.table === "daily_available") {
      if (row) daily[row.day as string] = row.minutes as number;
      else delete daily[op.match!];
    } else if (op.table === "recommendations") {
      if (row) recs[row.plan_date as string] = row.data as StoredRecommendation;
      else delete recs[op.match!];
    } else if (row) pref = row.available_minutes as number;
  }
  return {
    version: 3,
    projects: [...projects.values()],
    tasks: [...tasks.values()],
    preferences: { availableMinutes: pref },
    dailyAvailableMinutes: daily,
    recommendations: recs,
  };
}

export function emptyAccountState(): AppState {
  return {
    version: 3,
    projects: [],
    tasks: [],
    preferences: { availableMinutes: AVAIL_DEFAULT },
    dailyAvailableMinutes: {},
    recommendations: {},
  };
}
