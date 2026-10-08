import { AVAIL_DEFAULT } from "./constants";
import type { AppState } from "./types";

export const STORAGE_KEY = "ilgalpi:v1";

export function createEmptyState(): AppState {
  return {
    version: 1,
    projects: [],
    tasks: [],
    preferences: { availableMinutes: AVAIL_DEFAULT },
    recommendation: null,
  };
}

function isAppState(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<AppState>;
  return (
    v.version === 1 &&
    Array.isArray(v.projects) &&
    Array.isArray(v.tasks) &&
    typeof v.preferences?.availableMinutes === "number" &&
    (v.recommendation === null || typeof v.recommendation === "object")
  );
}

export type LoadNotice = "corrupt" | "unavailable" | null;

export function loadState(): { state: AppState; notice: LoadNotice } {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { state: createEmptyState(), notice: "unavailable" };
  }
  if (raw === null) return { state: createEmptyState(), notice: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isAppState(parsed)) return { state: parsed, notice: null };
  } catch {
    // 아래에서 손상 처리
  }
  return { state: createEmptyState(), notice: "corrupt" };
}

export function saveState(state: AppState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
