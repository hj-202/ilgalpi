import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "../types";
import { emptyAccountState, projectToRow, rowToProject, rowToTask, taskToRow, type Op, type Table } from "./rows";

const PAGE = 1000;
const CHUNK = 200;

async function selectAll(sb: SupabaseClient, table: Table, order: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select("*").order(order).range(from, from + PAGE - 1);
    if (error) {
      console.error(`[fetchAccount error on ${table}]`, error);
      throw new Error(`load:${table}:${error.code ?? "error"}`);
    }
    rows.push(...(data as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** 로그인 사용자의 전체 데이터를 읽는다(RLS가 본인 행만 돌려준다) */
export async function fetchAccount(sb: SupabaseClient): Promise<AppState> {
  const [projects, tasks, daily, recs, prefs] = await Promise.all([
    selectAll(sb, "projects", "created_at"),
    selectAll(sb, "tasks", "created_at"),
    selectAll(sb, "daily_available", "day"),
    selectAll(sb, "recommendations", "plan_date"),
    selectAll(sb, "user_preferences", "user_id"),
  ]);
  const state = emptyAccountState();
  state.projects = projects.map(rowToProject);
  state.tasks = tasks.map(rowToTask);
  for (const r of daily) state.dailyAvailableMinutes[r.day as string] = r.minutes as number;
  for (const r of recs) state.recommendations[r.plan_date as string] = r.data as AppState["recommendations"][string];
  if (prefs[0]) state.preferences.availableMinutes = prefs[0].available_minutes as number;
  return state;
}

const CONFLICT: Record<Table, string> = {
  projects: "user_id,id",
  tasks: "user_id,id",
  daily_available: "user_id,day",
  recommendations: "user_id,plan_date",
  user_preferences: "user_id",
};
const MATCH_COL: Partial<Record<Table, string>> = {
  projects: "id",
  tasks: "id",
  daily_available: "day",
  recommendations: "plan_date",
};

/** 변경 목록을 서버에 반영한다. 하나라도 실패하면 throw — 호출자는 큐를 유지하고 재시도한다. */
export async function pushOps(sb: SupabaseClient, uid: string, ops: Op[]): Promise<void> {
  // 프로젝트를 먼저(참조 순서), 삭제는 마지막
  const order: Table[] = ["projects", "tasks", "daily_available", "recommendations", "user_preferences"];
  for (const table of order) {
    const upserts = ops.filter((o) => o.table === table && o.row).map((o) => o.row!);
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const { error } = await sb.from(table).upsert(upserts.slice(i, i + CHUNK), { onConflict: CONFLICT[table] });
      if (error) throw new Error(`save:${table}:${error.code ?? "error"}`);
    }
  }
  for (const table of order) {
    const col = MATCH_COL[table];
    const ids = ops.filter((o) => o.table === table && !o.row && o.match).map((o) => o.match!);
    for (let i = 0; i < ids.length && col; i += CHUNK) {
      const { error } = await sb.from(table).delete().eq("user_id", uid).in(col, ids.slice(i, i + CHUNK));
      if (error) throw new Error(`delete:${table}:${error.code ?? "error"}`);
    }
  }
}

export interface ImportResult {
  ok: boolean;
  tasks: number;
  projects: number;
  /** 오류 시 사유 코드(내용 없음) */
  error?: string;
}

/**
 * 비회원 기록을 계정으로 가져온다(사용자 동의 후에만 호출). id 기준 upsert라 재시도해도 중복이 생기지 않는다.
 * 같은 id가 서버에 있으면 updatedAt이 최신인 쪽을 유지한다. 끝나면 서버에서 다시 읽어 건수를 대조한다.
 */
export async function importLocal(sb: SupabaseClient, uid: string, local: AppState): Promise<ImportResult> {
  try {
    const server = await fetchAccount(sb);
    const serverTasks = new Map(server.tasks.map((t) => [t.id, t]));
    const serverProjects = new Map(server.projects.map((p) => [p.id, p]));
    const newer = (a: string, b?: string) => !b || new Date(a).getTime() > new Date(b).getTime();

    const ops: Op[] = [];
    for (const p of local.projects) {
      if (newer(p.updatedAt, serverProjects.get(p.id)?.updatedAt)) ops.push({ table: "projects", key: `p:${p.id}`, row: projectToRow(uid, p) });
    }
    for (const t of local.tasks) {
      if (newer(t.updatedAt, serverTasks.get(t.id)?.updatedAt)) ops.push({ table: "tasks", key: `t:${t.id}`, row: taskToRow(uid, t) });
    }
    const now = new Date().toISOString();
    for (const [day, minutes] of Object.entries(local.dailyAvailableMinutes)) {
      if (!(day in server.dailyAvailableMinutes) && minutes >= 5 && minutes <= 1440) {
        ops.push({ table: "daily_available", key: `d:${day}`, row: { user_id: uid, day, minutes, updated_at: now } });
      }
    }
    for (const [date, rec] of Object.entries(local.recommendations)) {
      if (!(date in server.recommendations)) ops.push({ table: "recommendations", key: `r:${date}`, row: { user_id: uid, plan_date: date, data: rec, updated_at: now } });
    }
    await pushOps(sb, uid, ops);

    const after = await fetchAccount(sb);
    const have = new Set(after.tasks.map((t) => t.id));
    const haveP = new Set(after.projects.map((p) => p.id));
    const missing = local.tasks.some((t) => !have.has(t.id)) || local.projects.some((p) => !haveP.has(p.id));
    return { ok: !missing, tasks: local.tasks.length, projects: local.projects.length, error: missing ? "verify" : undefined };
  } catch (e) {
    return { ok: false, tasks: local.tasks.length, projects: local.projects.length, error: (e as Error).message.split(":").slice(0, 3).join(":") };
  }
}
