"use client";

import { fieldTypesOf, identifyUser, markAuthUncertain, resetIdentity, track } from "@/lib/analytics";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { applyPending, diffState, type Op } from "@/lib/account/rows";
import { fetchAccount, importLocal, pushOps } from "@/lib/account/remote";
import { PROJECT_NAME_MAX } from "@/lib/constants";
import { todayLocal } from "@/lib/date";
import {
  loadFlag,
  loadOnboarded,
  loadState,
  saveFlag,
  saveOnboarded,
  saveState,
  type LoadNotice,
} from "@/lib/storage";
import { getBrowserSupabase, supabaseConfigured } from "@/lib/supabase/client";
import type { AppState, StoredRecommendation, Task } from "@/lib/types";

export type AuthStatus = "checking" | "guest" | "account";
export type SyncState = "idle" | "saving" | "saved" | "error";
export type AuthMessage = "cancelled" | "error" | "expired" | "unconfigured" | null;

export interface AccountInfo {
  id: string;
  name: string | null;
  email: string | null;
}

export interface ImportOffer {
  tasks: number;
  projects: number;
  from: string | null;
  to: string | null;
}

export interface StoreSnapshot {
  /** 지금 화면에 보이는 데이터(게스트 또는 계정) */
  app: AppState;
  notice: LoadNotice;
  /** 실제 오늘(로컬). 자정·탭 복귀 때 갱신된다 */
  today: string;
  onboarded: boolean;
  /** 시작(로그인 선택) 화면을 한 번 거쳤는지 */
  started: boolean;
  auth: AccountStatusSnapshot;
  sync: { state: SyncState; pending: number };
  /** 계정 데이터 로드 상태. 로딩 중에는 Empty state를 보이지 않는다 */
  accountLoad: "idle" | "loading" | "error";
  importOffer: ImportOffer | null;
  importState: "idle" | "running" | "error";
  authMessage: AuthMessage;
  guestHasData: boolean;
}

interface AccountStatusSnapshot {
  status: AuthStatus;
  configured: boolean;
  user: AccountInfo | null;
}

interface Internal extends StoreSnapshot {
  guestApp: AppState;
  accountApp: AppState | null;
}

let snapshot: Internal | null = null;
const listeners = new Set<() => void>();
const pending = new Map<string, Op>();
let flushing = false;
let flushAgain = false;

function visible(i: Internal): StoreSnapshot {
  return i;
}

function ensureLoaded(): Internal {
  if (!snapshot) {
    const { state, notice } = loadState();
    snapshot = {
      app: state,
      guestApp: state,
      accountApp: null,
      notice,
      today: todayLocal(),
      onboarded: loadOnboarded(),
      started: loadFlag("started"),
      auth: { status: supabaseConfigured ? "checking" : "guest", configured: supabaseConfigured, user: null },
      sync: { state: "idle", pending: 0 },
      accountLoad: "idle",
      importOffer: null,
      importState: "idle",
      authMessage: null,
      guestHasData: state.tasks.length > 0,
    };
  }
  return snapshot;
}

function commit(patch: Partial<Internal>) {
  const cur = ensureLoaded();
  const next = { ...cur, ...patch };
  next.app = next.auth.status === "account" && next.accountApp ? next.accountApp : next.guestApp;
  next.guestHasData = next.guestApp.tasks.length > 0;
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(updater: (app: AppState) => AppState) {
  const cur = ensureLoaded();
  if (cur.auth.status === "account" && cur.accountApp && cur.auth.user) {
    const next = updater(cur.accountApp);
    for (const op of diffState(cur.auth.user.id, cur.accountApp, next)) pending.set(op.key, op);
    commit({ accountApp: next, sync: { state: pending.size ? "saving" : cur.sync.state, pending: pending.size } });
    void flush();
    return;
  }
  const guestApp = updater(cur.guestApp);
  saveState(guestApp);
  commit({ guestApp });
}

/** 서버에서 읽은 데이터 기준. 저장 대기 중인 로컬 변경은 서버 값 위에 다시 얹는다 */
async function flush() {
  if (flushing) {
    flushAgain = true;
    return;
  }
  const cur = ensureLoaded();
  const sb = getBrowserSupabase();
  const uid = cur.auth.user?.id;
  if (!sb || !uid || pending.size === 0) return;
  flushing = true;
  const batch = [...pending.values()];
  try {
    await pushOps(sb, uid, batch);
    // 보내는 동안 같은 키가 다시 바뀌었다면 남겨 둔다
    for (const op of batch) if (pending.get(op.key) === op) pending.delete(op.key);
    commit({ sync: { state: pending.size ? "saving" : "saved", pending: pending.size } });
  } catch {
    commit({ sync: { state: "error", pending: pending.size } });
    flushAgain = false;
  } finally {
    flushing = false;
  }
  if (flushAgain || (pending.size > 0 && ensureLoaded().sync.state !== "error")) {
    flushAgain = false;
    void flush();
  }
}

/** 저장 실패 후 다시 시도 */
export function retrySync() {
  commit({ sync: { state: "saving", pending: pending.size } });
  void flush();
}

/** 서버 데이터 로드(최초·탭 복귀). 저장 대기 변경이 있으면 먼저 보낸다 */
async function loadAccount(sb: SupabaseClient, user: AccountInfo, first: boolean) {
  if (first) commit({ accountLoad: "loading" });
  try {
    if (pending.size > 0) {
      await flush();
      if (pending.size > 0) throw new Error("pending");
    }
    const server = await fetchAccount(sb);
    const cur = ensureLoaded();
    if (cur.auth.user?.id !== user.id) return; // 그 사이 다른 계정으로 바뀜
    commit({ accountApp: applyPending(server, pending.values()), accountLoad: "idle" });
    if (first) maybeOfferImport(user.id);
  } catch (err) {
    console.error("[loadAccount error]", err);
    if (first) commit({ accountLoad: "error" });
    else commit({ sync: { state: "error", pending: pending.size } });
  }
}

function localRange(app: AppState): { from: string | null; to: string | null } {
  const dates = app.tasks.map((t) => t.plannedDate).sort();
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null };
}

function maybeOfferImport(uid: string) {
  const cur = ensureLoaded();
  if (loadFlag(`import:${uid}`) || cur.guestApp.tasks.length === 0) return;
  commit({
    importOffer: { tasks: cur.guestApp.tasks.length, projects: cur.guestApp.projects.length, ...localRange(cur.guestApp) },
  });
}

function toAccountInfo(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AccountInfo {
  const meta = u.user_metadata ?? {};
  const name = (meta.full_name ?? meta.name) as string | undefined;
  return { id: u.id, name: name ?? null, email: u.email ?? null };
}

let authStarted = false;
let signingOut = false;
// OAuth 콜백(`?auth=ok`)으로 막 돌아온 경우에만 true: 세션 복원과 로그인 성공을 구분한다
let freshLogin = false;

/** 앱 시작 시 한 번: 세션 복원 + 인증 이벤트 구독 + OAuth 결과 안내 */
export function initAuth() {
  if (authStarted) return;
  authStarted = true;
  const params = new URLSearchParams(window.location.search);
  const result = params.get("auth");
  if (result) {
    params.delete("auth");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    if (result === "ok") freshLogin = true;
    if (result === "cancelled" || result === "error") commit({ authMessage: result });
  }
  const sb = getBrowserSupabase();
  if (!sb) {
    resetIdentity(); // 계정 기능이 없는 환경: 남아 있는 이전 식별을 정리하고 보류 이벤트를 푼다
    return;
  }

  const apply = (user: AccountInfo | null) => {
    const cur = ensureLoaded();
    if (user) {
      if (cur.auth.user?.id === user.id && cur.auth.status === "account") return;
      pending.clear();
      commit({
        auth: { status: "account", configured: true, user },
        accountApp: null,
        started: true,
        sync: { state: "idle", pending: 0 },
        importOffer: null,
      });
      saveFlag("started");
      identifyUser(user.id, user.email);
      if (freshLogin) {
        freshLogin = false;
        track("Entry Completed", { entry_method: "google" });
      }
      void loadAccount(sb, user, true);
    } else {
      const wasAccount = cur.auth.status === "account";
      // 세션이 없음이 확인된 시점(로그아웃·만료·시작 시 세션 없음). 이전 계정 식별이 남아 있을 때만 reset된다
      resetIdentity();
      pending.clear();
      commit({
        auth: { status: "guest", configured: true, user: null },
        accountApp: null,
        accountLoad: "idle",
        importOffer: null,
        sync: { state: "idle", pending: 0 },
        authMessage: wasAccount && !signingOut ? "expired" : cur.authMessage,
      });
      signingOut = false;
    }
  };

  sb.auth.getSession().then(({ data, error }) => {
    if (error) {
      commit({ auth: { status: "guest", configured: true, user: null }, authMessage: "error" });
      markAuthUncertain(); // 인증 상태를 알 수 없음: 이전 계정으로 귀속될 수 있는 보류 이벤트는 버리고, 이후 인증이 확정되면 정상 수집한다
      return;
    }
    apply(data.session ? toAccountInfo(data.session.user) : null);
  });
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
    apply(session ? toAccountInfo(session.user) : null);
  });
}

/** 탭 복귀·자정: 오늘 날짜를 다시 계산하고 계정이면 서버 데이터를 다시 읽는다. AI는 호출하지 않는다 */
export function refreshClock() {
  const cur = ensureLoaded();
  const today = todayLocal();
  if (today !== cur.today) commit({ today });
  const sb = getBrowserSupabase();
  if (sb && cur.auth.status === "account" && cur.auth.user && cur.accountApp) void loadAccount(sb, cur.auth.user, false);
}

export async function signInWithGoogle(): Promise<"started" | "unconfigured" | "error"> {
  const sb = getBrowserSupabase();
  if (!sb) {
    commit({ authMessage: "unconfigured" });
    return "unconfigured";
  }
  // OAuth는 페이지를 떠나므로 리다이렉트 전에 온보딩·시작 화면 완료를 먼저 저장한다
  saveOnboarded();
  saveFlag("started");
  commit({ onboarded: true, started: true, authMessage: null });
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) {
    commit({ authMessage: "error" });
    return "error";
  }
  return "started";
}

export async function signOut() {
  const sb = getBrowserSupabase();
  if (!sb) return;
  signingOut = true;
  await sb.auth.signOut();
  // onAuthStateChange가 정리한다. 이벤트가 오지 않는 경우를 대비해 직접 정리
  const cur = ensureLoaded();
  if (cur.auth.status === "account") {
    resetIdentity();
    pending.clear();
    commit({ auth: { status: "guest", configured: true, user: null }, accountApp: null, importOffer: null, sync: { state: "idle", pending: 0 } });
    signingOut = false;
  }
}

export function hasUnsavedChanges(): boolean {
  return pending.size > 0;
}

export function dismissAuthMessage() {
  commit({ authMessage: null });
}

/** 비회원 로컬 기록을 계정으로 가져오기(사용자 동의 후). 로컬 원본은 지우지 않는다 */
export async function runImport(): Promise<boolean> {
  const cur = ensureLoaded();
  const sb = getBrowserSupabase();
  const user = cur.auth.user;
  if (!sb || !user) return false;
  commit({ importState: "running" });
  if (pending.size > 0) await flush();
  const res = await importLocal(sb, user.id, cur.guestApp);
  if (!res.ok) {
    commit({ importState: "error" });
    return false;
  }
  saveFlag(`import:${user.id}`, "done");
  const server = await fetchAccount(sb).catch(() => null);
  commit({
    importState: "idle",
    importOffer: null,
    ...(server ? { accountApp: applyPending(server, pending.values()) } : {}),
  });
  return true;
}

export function declineImport() {
  const user = ensureLoaded().auth.user;
  if (user) saveFlag(`import:${user.id}`, "declined");
  commit({ importOffer: null, importState: "idle" });
}

/** 가져오지 않기를 고른 뒤에도 내 기록에서 다시 가져올 수 있다 */
export function reopenImport() {
  const cur = ensureLoaded();
  if (!cur.auth.user || cur.guestApp.tasks.length === 0) return;
  commit({
    importOffer: { tasks: cur.guestApp.tasks.length, projects: cur.guestApp.projects.length, ...localRange(cur.guestApp) },
  });
}

export function retryAccountLoad() {
  const cur = ensureLoaded();
  const sb = getBrowserSupabase();
  if (sb && cur.auth.user) void loadAccount(sb, cur.auth.user, true);
}

/** 이 계정에서 가져오기를 이미 끝냈는지 / 건너뛰었는지 */
export function importFlag(uid: string): string | null {
  return loadFlag(`import:${uid}`) ? (window.localStorage.getItem(`ilgalpi:import:${uid}`) ?? null) : null;
}

/** 서버 렌더링 중에는 null → 클라이언트에서 localStorage 로드 후 실제 데이터 */
export function useAppStore(): StoreSnapshot | null {
  return useSyncExternalStore(
    subscribe,
    () => visible(ensureLoaded()),
    () => null,
  );
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

export interface NewTaskInput {
  title: string;
  plannedDate: string;
  projectId?: string | null;
}

/** 기본 조건: 중요도 보통 / 시간 미정 / 마감 없음 */
export function addTask(input: NewTaskInput) {
  const ts = now();
  const task: Task = {
    id: newId(),
    projectId: input.projectId ?? null,
    title: input.title.trim(),
    plannedDate: input.plannedDate,
    dueDate: null,
    dueTime: null,
    importance: "medium",
    effort: null,
    legacyMinutes: null,
    isCompleted: false,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  update((app) => ({ ...app, tasks: [...app.tasks, task] }));
  track("Task Created");
}

export type TaskPatch = Partial<
  Pick<Task, "title" | "projectId" | "plannedDate" | "dueDate" | "dueTime" | "importance" | "effort">
>;

/** 조건 일부만 수정한다. dueDate를 지우면 dueTime도 함께 지운다. */
export function patchTask(id: string, patch: TaskPatch) {
  const before = ensureLoaded().app.tasks.find((t) => t.id === id);
  const changed = before ? Object.keys(patch).filter((k) => patch[k as keyof TaskPatch] !== before[k as keyof TaskPatch]) : [];
  update((app) => ({
    ...app,
    tasks: app.tasks.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch, updatedAt: now() };
      if (patch.title !== undefined) next.title = patch.title.trim();
      if (!next.dueDate) next.dueTime = null;
      return next;
    }),
  }));
  for (const field_type of fieldTypesOf(changed)) track("Task Updated", { field_type });
}

export function deleteTask(id: string) {
  const existed = ensureLoaded().app.tasks.some((t) => t.id === id);
  update((app) => ({ ...app, tasks: app.tasks.filter((t) => t.id !== id) }));
  if (existed) track("Task Deleted");
}

export function setTaskCompleted(id: string, completed: boolean, source: "home" | "recommendation" = "home") {
  const before = ensureLoaded().app.tasks.find((t) => t.id === id);
  const ts = now();
  update((app) => ({
    ...app,
    tasks: app.tasks.map((t) =>
      t.id === id
        ? { ...t, isCompleted: completed, completedAt: completed ? ts : null, updatedAt: ts }
        : t,
    ),
  }));
  if (before && before.isCompleted !== completed) track(completed ? "Task Completed" : "Task Reopened", { source });
}

/**
 * 미완료 작업만 다른 날짜의 계획으로 옮긴다. 완료된 작업은 원래 날짜에 그대로 남아
 * 원래 날짜의 완료 기록이 바뀌거나 중복 집계되지 않는다.
 */
export function carryOverTasks(ids: string[], targetDate: string) {
  const set = new Set(ids);
  const movedCount = ensureLoaded().app.tasks.filter((t) => set.has(t.id) && !t.isCompleted).length;
  const ts = now();
  update((app) => ({
    ...app,
    tasks: app.tasks.map((t) =>
      set.has(t.id) && !t.isCompleted ? { ...t, plannedDate: targetDate, updatedAt: ts } : t,
    ),
  }));
  if (movedCount > 0) track("Task Moved", { selected_count: movedCount });
}

// ---------- 설정·추천 ----------

/** 날짜별 '이날 작업 가능한 시간'(분) */
export function setDailyAvailableMinutes(date: string, minutes: number) {
  update((app) => ({
    ...app,
    dailyAvailableMinutes: { ...app.dailyAvailableMinutes, [date]: minutes },
  }));
}

/** 계획 날짜별 추천 결과 저장 */
export function setRecommendation(date: string, recommendation: StoredRecommendation) {
  update((app) => ({ ...app, recommendations: { ...app.recommendations, [date]: recommendation } }));
}

export function finishOnboarding(method: "completed" | "skipped") {
  track("Onboarding Finished", { method });
  saveOnboarded();
  commit({ onboarded: true });
}

/** 시작 화면에서 '로그인 없이 시작하기' */
export function startAsGuest() {
  track("Entry Completed", { entry_method: "guest" });
  saveOnboarded();
  saveFlag("started");
  commit({ onboarded: true, started: true });
}
