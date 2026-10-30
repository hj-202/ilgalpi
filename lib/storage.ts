import { AVAIL_DEFAULT } from "./constants";
import { isValidYmd, todayLocal } from "./date";
import type { AppState, Effort, Importance, Project, Task } from "./types";

export const STORAGE_KEY = "ilgalpi:v3";
/** 이전 버전 키. 마이그레이션 후에도 삭제하지 않는다(백업 역할) */
export const V2_KEY = "ilgalpi:v2";
export const V1_KEY = "ilgalpi:v1";
const CORRUPT_BACKUP_KEY = "ilgalpi:v3:corrupt-backup";
/** 온보딩 완료 여부. 로그인 여부와는 별개로 관리한다 */
const ONBOARDED_KEY = "ilgalpi:onboarded";

export function createEmptyState(): AppState {
  return {
    version: 3,
    projects: [],
    tasks: [],
    preferences: { availableMinutes: AVAIL_DEFAULT },
    dailyAvailableMinutes: {},
    recommendations: {},
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAppState(value: unknown): value is AppState {
  if (!isObj(value)) return false;
  const v = value as Partial<AppState>;
  return (
    v.version === 3 &&
    Array.isArray(v.projects) &&
    Array.isArray(v.tasks) &&
    typeof v.preferences?.availableMinutes === "number" &&
    isObj(v.dailyAvailableMinutes) &&
    isObj(v.recommendations)
  );
}

function localDateOf(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : todayLocal(date);
}

// ---------- v1 → v2 ----------

interface LegacyEnvelope {
  projects: unknown[];
  tasks: unknown[];
  preferences?: { availableMinutes?: unknown };
}

/** v2 저장 형태(소요시간이 분 단위). v3로 넘어가는 중간 표현 */
export interface V2Task {
  id: string;
  projectId: string | null;
  title: string;
  plannedDate: string;
  dueDate: string | null;
  dueTime: string | null;
  importance: Importance;
  estimatedMinutes: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface V2State {
  projects: Project[];
  tasks: V2Task[];
  availableMinutes: number;
}

function isEnvelope(value: unknown, version: number): value is LegacyEnvelope {
  return isObj(value) && value.version === version && Array.isArray(value.projects) && Array.isArray(value.tasks);
}

function readProjects(raw: unknown[]): Project[] {
  const projects: Project[] = [];
  for (const p of raw) {
    if (!isObj(p) || typeof p.id !== "string" || typeof p.name !== "string") continue;
    const ts = typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
    projects.push({
      id: p.id,
      name: p.name,
      createdAt: ts,
      updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : ts,
    });
  }
  return projects;
}

function readImportance(v: unknown): Importance {
  return v === "high" || v === "low" ? v : "medium";
}

function readMinutes(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

export interface MigrationResult<T> {
  state: T;
  /** 완료 작업의 날짜를 추정해 배치한 개수 (완료/생성 시각이 없어 오늘로 둔 경우) */
  estimatedPlacements: number;
}

/** v1 → v2. 순수 함수: 입력을 바꾸지 않고, 알 수 없는 값은 안전한 기본값으로 둔다. */
export function migrateV1ToV2(legacy: LegacyEnvelope, today: string): MigrationResult<V2State> {
  let estimatedPlacements = 0;
  const tasks: V2Task[] = [];
  for (const t of legacy.tasks) {
    if (!isObj(t) || typeof t.id !== "string" || typeof t.title !== "string") continue;
    const isCompleted = t.isCompleted === true;
    const completedAt = isCompleted && typeof t.completedAt === "string" ? t.completedAt : null;

    let plannedDate = today;
    if (isCompleted) {
      const fromCompleted = localDateOf(completedAt);
      const fromCreated = localDateOf(t.createdAt);
      if (fromCompleted) plannedDate = fromCompleted;
      else if (fromCreated) plannedDate = fromCreated;
      else estimatedPlacements += 1;
    }
    const createdAt = typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString();
    tasks.push({
      id: t.id,
      projectId: typeof t.projectId === "string" ? t.projectId : null,
      title: t.title,
      plannedDate,
      dueDate: isValidYmd(t.dueDate) ? t.dueDate : null,
      dueTime: null,
      importance: readImportance(t.importance),
      estimatedMinutes: readMinutes(t.estimatedMinutes),
      isCompleted,
      completedAt,
      createdAt,
      updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : createdAt,
    });
  }
  const avail = legacy.preferences?.availableMinutes;
  return {
    state: {
      projects: readProjects(legacy.projects),
      tasks,
      availableMinutes: typeof avail === "number" ? avail : AVAIL_DEFAULT,
    },
    estimatedPlacements,
  };
}

// ---------- v2 → v3 ----------

/** 분 단위 값을 새 규모 옵션에 대응시킨다: ≤60 → 1시간 이내, ≤120 → 1~2시간, 그 이상 → 2시간 초과 */
export function effortFromMinutes(minutes: number | null): Effort | null {
  if (minutes === null) return null;
  if (minutes <= 60) return "short";
  if (minutes <= 120) return "medium";
  return "long";
}

/** v2 → v3. 분 단위 값은 legacyMinutes로 그대로 보존한다. 이전 단일 추천 결과는 버린다(어차피 최신 아님). */
export function migrateV2ToV3(v2: V2State): { state: AppState; mappedEffort: number } {
  let mappedEffort = 0;
  const tasks: Task[] = v2.tasks.map((t) => {
    const effort = effortFromMinutes(t.estimatedMinutes);
    if (effort) mappedEffort += 1;
    const { estimatedMinutes, ...rest } = t;
    return { ...rest, effort, legacyMinutes: estimatedMinutes };
  });
  return {
    state: {
      version: 3,
      projects: v2.projects,
      tasks,
      preferences: { availableMinutes: v2.availableMinutes },
      dailyAvailableMinutes: {},
      recommendations: {},
    },
    mappedEffort,
  };
}

/** 저장된 v2 JSON → V2State. 필드가 깨진 작업은 건너뛴다. */
function readV2(parsed: unknown): V2State | null {
  if (!isEnvelope(parsed, 2)) return null;
  const tasks: V2Task[] = [];
  for (const t of parsed.tasks) {
    if (!isObj(t) || typeof t.id !== "string" || typeof t.title !== "string") continue;
    const createdAt = typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString();
    const isCompleted = t.isCompleted === true;
    tasks.push({
      id: t.id,
      projectId: typeof t.projectId === "string" ? t.projectId : null,
      title: t.title,
      plannedDate: isValidYmd(t.plannedDate) ? t.plannedDate : todayLocal(),
      dueDate: isValidYmd(t.dueDate) ? t.dueDate : null,
      dueTime: isValidYmd(t.dueDate) && typeof t.dueTime === "string" && /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : null,
      importance: readImportance(t.importance),
      estimatedMinutes: readMinutes(t.estimatedMinutes),
      isCompleted,
      completedAt: isCompleted && typeof t.completedAt === "string" ? t.completedAt : null,
      createdAt,
      updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : createdAt,
    });
  }
  const avail = parsed.preferences?.availableMinutes;
  return {
    projects: readProjects(parsed.projects),
    tasks,
    availableMinutes: typeof avail === "number" ? avail : AVAIL_DEFAULT,
  };
}

export type LoadNotice =
  | "corrupt"
  | "unavailable"
  | "migrated"
  | "migrated-estimated"
  | "migrated-effort"
  | null;

function tryParse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function loadState(): { state: AppState; notice: LoadNotice } {
  let raw: string | null;
  let v2Raw: string | null;
  let v1Raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
    v2Raw = window.localStorage.getItem(V2_KEY);
    v1Raw = window.localStorage.getItem(V1_KEY);
  } catch {
    return { state: createEmptyState(), notice: "unavailable" };
  }

  let corrupt = false;
  if (raw !== null) {
    const parsed = tryParse(raw);
    if (isAppState(parsed)) return { state: parsed, notice: null };
    // 손상된 원본은 덮어쓰기 전에 따로 보관한다
    corrupt = true;
    try {
      window.localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
    } catch {
      // 보관 실패는 무시
    }
  }

  // 이전 버전에서 변환. 저장이 확인된 뒤에만 v3로 전환하며 이전 키는 지우지 않는다.
  const fromV2 = readV2(tryParse(v2Raw));
  if (fromV2) {
    const { state, mappedEffort } = migrateV2ToV3(fromV2);
    const saved = saveState(state);
    return { state, notice: !saved ? "unavailable" : mappedEffort > 0 ? "migrated-effort" : null };
  }

  const v1 = tryParse(v1Raw);
  if (isEnvelope(v1, 1)) {
    const { state: v2, estimatedPlacements } = migrateV1ToV2(v1, todayLocal());
    const { state } = migrateV2ToV3(v2);
    const saved = saveState(state);
    const notice: LoadNotice = !saved ? "unavailable" : estimatedPlacements > 0 ? "migrated-estimated" : "migrated";
    return { state, notice };
  }

  if (corrupt || v2Raw !== null || v1Raw !== null) return { state: createEmptyState(), notice: "corrupt" };
  return { state: createEmptyState(), notice: null };
}

export function saveState(state: AppState): boolean {
  try {
    const json = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, json);
    return window.localStorage.getItem(STORAGE_KEY) === json;
  } catch {
    return false;
  }
}

export function loadOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return true; // 저장소를 못 쓰면 매번 띄우지 않는다
  }
}

export function saveOnboarded() {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // 무시
  }
}

/** 로컬 플래그(`ilgalpi:<name>`). 로그인 선택 화면 완료, 계정별 가져오기 결정 등 */
export function loadFlag(name: string): boolean {
  try {
    return window.localStorage.getItem(`ilgalpi:${name}`) !== null;
  } catch {
    return name === "started"; // 저장소를 못 쓰면 시작 화면을 매번 띄우지 않는다
  }
}

export function saveFlag(name: string, value = "1") {
  try {
    window.localStorage.setItem(`ilgalpi:${name}`, value);
  } catch {
    // 무시
  }
}
