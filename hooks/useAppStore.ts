"use client";

import { useSyncExternalStore } from "react";
import { PROJECT_NAME_MAX } from "@/lib/constants";
import { todayLocal } from "@/lib/date";
import { loadState, saveState, type LoadNotice } from "@/lib/storage";
import type { AppState, Importance, StoredRecommendation, Task } from "@/lib/types";

export interface StoreSnapshot {
  app: AppState;
  notice: LoadNotice;
  /** 페이지 로드 시점의 오늘 날짜 (S5 판정 기준) */
  today: string;
}

let snapshot: StoreSnapshot | null = null;
const listeners = new Set<() => void>();

function ensureLoaded(): StoreSnapshot {
  if (!snapshot) {
    const { state, notice } = loadState();
    snapshot = { app: state, notice, today: todayLocal() };
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(updater: (app: AppState) => AppState) {
  const current = ensureLoaded();
  const app = updater(current.app);
  saveState(app);
  snapshot = { ...current, app };
  listeners.forEach((l) => l());
}

/** 서버 렌더링 중에는 null → 클라이언트에서 localStorage 로드 후 실제 데이터 */
export function useAppStore(): StoreSnapshot | null {
  return useSyncExternalStore(subscribe, ensureLoaded, () => null);
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

// ---------- 프로젝트 ----------

export function validateProjectName(
  name: string,
  projects: AppState["projects"],
  excludeId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "프로젝트 이름을 입력해 주세요";
  if (trimmed.length > PROJECT_NAME_MAX) return `${PROJECT_NAME_MAX}자 이내로 입력해 주세요`;
  const key = trimmed.replace(/\s+/g, "").toLowerCase();
  const dup = projects.some(
    (p) => p.id !== excludeId && p.name.replace(/\s+/g, "").toLowerCase() === key,
  );
  return dup ? "같은 이름의 프로젝트가 이미 있어요" : null;
}

/** 생성 성공 시 새 ID, 실패 시 오류 메시지 */
export function addProject(name: string): { id: string } | { error: string } {
  const error = validateProjectName(name, ensureLoaded().app.projects);
  if (error) return { error };
  const id = newId();
  const ts = now();
  update((app) => ({
    ...app,
    projects: [...app.projects, { id, name: name.trim(), createdAt: ts, updatedAt: ts }],
  }));
  return { id };
}

export function renameProject(id: string, name: string): string | null {
  const error = validateProjectName(name, ensureLoaded().app.projects, id);
  if (error) return error;
  update((app) => ({
    ...app,
    projects: app.projects.map((p) =>
      p.id === id ? { ...p, name: name.trim(), updatedAt: now() } : p,
    ),
  }));
  return null;
}

/** 프로젝트 삭제. 소속 작업은 개별 할 일로 이동한다. */
export function deleteProject(id: string) {
  const ts = now();
  update((app) => ({
    ...app,
    projects: app.projects.filter((p) => p.id !== id),
    tasks: app.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null, updatedAt: ts } : t)),
  }));
}

// ---------- 작업 ----------

export interface TaskInput {
  title: string;
  projectId: string | null;
  dueDate: string | null;
  importance: Importance;
  estimatedMinutes: number;
}

export function addTask(input: TaskInput) {
  const ts = now();
  const task: Task = {
    id: newId(),
    ...input,
    title: input.title.trim(),
    isCompleted: false,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  update((app) => ({ ...app, tasks: [...app.tasks, task] }));
}

export function updateTask(id: string, input: TaskInput) {
  update((app) => ({
    ...app,
    tasks: app.tasks.map((t) =>
      t.id === id ? { ...t, ...input, title: input.title.trim(), updatedAt: now() } : t,
    ),
  }));
}

export function deleteTask(id: string) {
  update((app) => ({ ...app, tasks: app.tasks.filter((t) => t.id !== id) }));
}

export function setTaskCompleted(id: string, completed: boolean) {
  const ts = now();
  update((app) => ({
    ...app,
    tasks: app.tasks.map((t) =>
      t.id === id
        ? { ...t, isCompleted: completed, completedAt: completed ? ts : null, updatedAt: ts }
        : t,
    ),
  }));
}

// ---------- 설정·추천 ----------

export function setAvailableMinutes(minutes: number) {
  update((app) => ({ ...app, preferences: { ...app.preferences, availableMinutes: minutes } }));
}

export function setRecommendation(recommendation: StoredRecommendation) {
  update((app) => ({ ...app, recommendation }));
}
