"use client";

import { useCallback, useState } from "react";
import { setRecommendation, useAppStore } from "@/hooks/useAppStore";
import { MAX_AI_TASKS } from "@/lib/constants";
import { formatTodayLabel } from "@/lib/date";
import { isRecommendationStale } from "@/lib/fingerprint";
import { ERROR_MESSAGES } from "@/lib/messages";
import { basicRecommend } from "@/lib/recommend/basic";
import {
  buildRecommendRequest,
  createStoredRecommendation,
  getActiveProjects,
  getIncompleteTasks,
} from "@/lib/recommend/buildRequest";
import AvailableTimePicker from "./AvailableTimePicker";
import ResultPanel, { type PanelError } from "./ResultPanel";
import TaskBoard from "./TaskBoard";
import TaskModal, { type ModalState } from "./TaskModal";
import type { RecommendErrorCode, RecommendResponse } from "@/lib/types";

const CLIENT_TIMEOUT_MS = 45_000;

function Skeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-8" aria-busy="true" aria-label="불러오는 중">
      <div className="h-8 w-40 rounded bg-slate-200" />
      <div className="mt-6 h-32 rounded-xl bg-slate-200" />
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="h-64 rounded-xl bg-slate-200 lg:col-span-5" />
        <div className="h-64 rounded-xl bg-slate-200 lg:col-span-7" />
      </div>
    </div>
  );
}

export default function App() {
  const store = useAppStore();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const closeModal = useCallback(() => setModal(null), []);

  if (!store) return <Skeleton />;

  const { app, today, notice } = store;
  const incomplete = getIncompleteTasks(app.tasks);
  const activeProjects = getActiveProjects(app.projects, incomplete);
  const availableMinutes = app.preferences.availableMinutes;
  const rec = app.recommendation;
  const stale = rec ? isRecommendationStale(rec, app.tasks, availableMinutes, today) : false;
  const hasTasks = incomplete.length > 0;
  const tooMany = incomplete.length > MAX_AI_TASKS;
  const canAnalyze = hasTasks && !tooMany && !loading;

  const showError = (code: RecommendErrorCode) => setError(ERROR_MESSAGES[code]);

  const runAI = async () => {
    if (!canAnalyze) return;
    const request = buildRecommendRequest(app, today);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const data = (await res.json()) as RecommendResponse;
      if (!data.ok) {
        showError(data.error.code);
        return;
      }
      // 분석에 실제로 사용한 입력 스냅샷으로 지문을 만든다(분석 중 수정한 작업은 stale로 표시됨)
      setRecommendation(
        createStoredRecommendation(
          data.recommendation,
          "ai",
          { tasks: request.tasks, availableMinutes: request.availableMinutes, date: request.currentDate },
          data.meta.model,
        ),
      );
    } catch (err) {
      showError((err as Error)?.name === "TimeoutError" ? "AI_TIMEOUT" : "NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  };

  const runBasic = () => {
    if (!hasTasks) return;
    const result = basicRecommend({ tasks: incomplete, projects: activeProjects, availableMinutes, today });
    setRecommendation(
      createStoredRecommendation(result, "basic", { tasks: incomplete, availableMinutes, date: today }),
    );
    setError(null);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
              갈
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">일갈피</span>
            <span className="hidden text-xs text-slate-400 sm:inline">ILGALPI</span>
          </div>
          <span className="text-sm text-slate-600">{formatTodayLabel(today)}</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        {notice === "corrupt" && (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            저장된 데이터를 불러오지 못해 새로 시작해요.
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">할 일은 많은데, 뭐부터 해야 할지 모르겠다면?</h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            마감과 중요도, 시간을 고려해 지금 가장 필요한 일부터 찾아드려요.
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
            <dl className="flex gap-3">
              <div className="min-w-24 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-xs text-slate-500">미완료 작업</dt>
                <dd className="text-2xl font-bold text-slate-900">{incomplete.length}</dd>
              </div>
              <div className="min-w-24 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-xs text-slate-500">진행 중 프로젝트</dt>
                <dd className="text-2xl font-bold text-slate-900">{activeProjects.length}</dd>
              </div>
            </dl>
            <AvailableTimePicker value={availableMinutes} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModal({ mode: "create", projectId: null })}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              + 할 일 추가하기
            </button>
            <button
              type="button"
              onClick={runAI}
              disabled={!canAnalyze}
              aria-busy={loading}
              title={hasTasks ? undefined : "먼저 할 일을 추가해 주세요"}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              )}
              {loading ? "분석 중…" : rec ? "다시 추천받기" : "우선순위 추천받기"}
            </button>
            <button
              type="button"
              onClick={runBasic}
              disabled={!hasTasks || loading}
              className="px-2 py-2.5 text-sm font-medium text-slate-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
            >
              AI 없이 기본 추천 보기
            </button>
          </div>
          {!hasTasks && <p className="mt-2 text-xs text-slate-500">먼저 할 일을 추가해 주세요.</p>}
          {tooMany && (
            <p className="mt-2 text-sm text-amber-800">
              AI 분석은 한 번에 최대 {MAX_AI_TASKS}개까지 가능해요. 완료했거나 필요 없는 작업을 정리해 주세요. (현재{" "}
              {incomplete.length}개) 기본 추천은 사용할 수 있어요.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400">AI 분석 시 할 일 정보가 Google Gemini로 전송돼요.</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-5">
            <TaskBoard
              projects={app.projects}
              tasks={app.tasks}
              today={today}
              onAddTask={(projectId) => setModal({ mode: "create", projectId })}
              onEditTask={(task) => setModal({ mode: "edit", task })}
            />
          </div>
          <div className="lg:col-span-7">
            <ResultPanel
              rec={rec}
              stale={stale}
              tasks={app.tasks}
              projects={app.projects}
              today={today}
              loading={loading}
              error={error}
              hasTasks={hasTasks}
              canAnalyze={canAnalyze}
              onRecommend={runAI}
              onBasic={runBasic}
            />
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-xs text-slate-400">
        데이터는 이 브라우저에만 저장돼요.
      </footer>

      {modal && (
        <TaskModal
          key={modal.mode === "edit" ? modal.task.id : "new"}
          state={modal}
          projects={app.projects}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
