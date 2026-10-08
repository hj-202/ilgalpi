"use client";

import { useState } from "react";
import { formatTime } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import type { Project, StoredRecommendation, Task, TaskRanking } from "@/lib/types";
import { RecommendationTypeBadge } from "./Badges";
import { CompleteCheckbox, TaskMeta } from "./TaskRow";

export interface PanelError {
  message: string;
  canRetry: boolean;
}

interface Props {
  rec: StoredRecommendation | null;
  stale: boolean;
  tasks: Task[];
  projects: Project[];
  today: string;
  loading: boolean;
  error: PanelError | null;
  hasTasks: boolean;
  canAnalyze: boolean;
  onRecommend: () => void;
  onBasic: () => void;
}

const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

function RankedTaskItem({
  ranking,
  task,
  order,
  showGlobalRank,
  projectName,
  today,
}: {
  ranking: TaskRanking;
  task: Task;
  order: number;
  showGlobalRank: boolean;
  projectName: string | null;
  today: string;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          order <= 3 && !task.isCompleted ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        {order}
      </span>
      <CompleteCheckbox task={task} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-sm font-semibold ${task.isCompleted ? "text-slate-400 line-through" : "text-slate-900"}`}>
            {task.title}
          </span>
          {task.isCompleted && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">완료</span>}
          <span className="text-xs text-slate-500">{projectName ?? "개별 할 일"}</span>
          {showGlobalRank && <span className="text-xs text-slate-400">전체 {ranking.rank}위</span>}
        </div>
        <p className="mt-0.5 text-sm text-slate-600">{ranking.reason}</p>
        {!task.isCompleted && <TaskMeta task={task} today={today} />}
      </div>
    </li>
  );
}

function FocusCard({ rec, taskById, projectById, reasonById }: {
  rec: StoredRecommendation;
  taskById: Map<string, Task>;
  projectById: Map<string, Project>;
  reasonById: Map<string, string>;
}) {
  const items = rec.focusPlan.taskIds.map((id) => taskById.get(id)).filter((t): t is Task => !!t);
  const total = items.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const done = items.filter((t) => t.isCompleted).length;

  return (
    <section id="todays-focus" aria-labelledby="focus-title" className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="focus-title" className="text-lg font-bold text-slate-900">오늘의 Focus</h3>
        {items.length > 0 && (
          <span className="text-sm text-slate-600">
            {done}/{items.length} 완료 · 합계 <strong className="text-slate-900">{formatMinutes(total)}</strong> / 가용{" "}
            {formatMinutes(rec.availableMinutes)}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-3">
          <p className="font-semibold text-slate-800">오늘 시간 안에 끝낼 수 있는 작업이 없어요.</p>
          <p className="mt-1 text-sm text-slate-600">{rec.focusPlan.reason}</p>
          <p className="mt-1 text-sm text-slate-600">가용 시간을 늘리면 다시 추천받을 수 있어요.</p>
        </div>
      ) : (
        <>
          <ol className="mt-3 flex flex-col gap-2">
            {items.map((t, i) => (
              <li key={t.id} className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <CompleteCheckbox task={t} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className={`font-semibold ${t.isCompleted ? "text-slate-400 line-through" : "text-slate-900"}`}>
                      {t.title}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t.projectId ? (projectById.get(t.projectId)?.name ?? "개별 할 일") : "개별 할 일"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{reasonById.get(t.id)}</p>
                </div>
                <span className="shrink-0 text-sm font-medium text-slate-700">{formatMinutes(t.estimatedMinutes)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-slate-700">{rec.focusPlan.reason}</p>
          {done === items.length && (
            <p className="mt-2 text-sm font-semibold text-emerald-700">오늘의 Focus를 모두 끝냈어요. 수고했어요!</p>
          )}
        </>
      )}
    </section>
  );
}

function ProjectRankingList({ rec, taskById, projectById, today }: {
  rec: StoredRecommendation;
  taskById: Map<string, Task>;
  projectById: Map<string, Project>;
  today: string;
}) {
  const ranked = rec.projectRankings.filter((r) => projectById.has(r.projectId));
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(ranked.length > 0 ? [ranked[0].projectId] : []),
  );
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rankingsFor = (projectId: string | null) =>
    rec.taskRankings.filter((r) => {
      const t = taskById.get(r.taskId);
      return t && t.projectId === projectId;
    });

  const individual = rankingsFor(null);

  return (
    <div className="flex flex-col gap-3">
      {ranked.length === 0 && (
        <p className="text-sm text-slate-500">프로젝트 없이 등록한 할 일만 있어요.</p>
      )}
      {ranked.map((r) => {
        const project = projectById.get(r.projectId)!;
        const projectTasks = rankingsFor(r.projectId);
        const open = expanded.has(r.projectId);
        const remaining = projectTasks
          .map((x) => taskById.get(x.taskId)!)
          .filter((t) => !t.isCompleted);
        return (
          <div key={r.projectId} className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => toggle(r.projectId)}
              aria-expanded={open}
              className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                {r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-slate-900">{project.name}</span>
                  <span className="text-xs text-slate-500">
                    미완료 {remaining.length}개 · 남은 작업 {formatMinutes(remaining.reduce((s, t) => s + t.estimatedMinutes, 0))}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{r.reason}</p>
              </div>
              <span aria-hidden className="text-slate-400">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4">
                {projectTasks.map((x, i) => (
                  <RankedTaskItem
                    key={x.taskId}
                    ranking={x}
                    task={taskById.get(x.taskId)!}
                    order={i + 1}
                    showGlobalRank
                    projectName={project.name}
                    today={today}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h4 className="font-semibold text-slate-900">개별 할 일</h4>
        {individual.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">추천에 포함된 개별 할 일이 없어요.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {individual.map((x, i) => (
              <RankedTaskItem
                key={x.taskId}
                ranking={x}
                task={taskById.get(x.taskId)!}
                order={i + 1}
                showGlobalRank
                projectName={null}
                today={today}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ResultPanel(props: Props) {
  const { rec, stale, tasks, projects, today, loading, error, hasTasks, canAnalyze } = props;
  const [tab, setTab] = useState<"project" | "all">("project");

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <section aria-labelledby="result-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="result-title" className="text-lg font-bold text-slate-900">추천 결과</h2>
        {rec && (
          <>
            <RecommendationTypeBadge type={rec.recommendationType} />
            <span className="text-xs text-slate-500">{formatTime(rec.generatedAt)} 생성</span>
          </>
        )}
      </div>
      {rec?.recommendationType === "basic" && (
        <p className="-mt-2 text-xs text-slate-500">마감·중요도·소요시간 규칙으로 계산했어요.</p>
      )}

      <div aria-live="polite" className="flex flex-col gap-3">
        {loading && (
          <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-white p-4">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" aria-hidden />
            <p className="text-sm text-slate-700">할 일을 비교하고 있어요… (보통 10~20초)</p>
          </div>
        )}
        {error && !loading && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-800">{error.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {error.canRetry && (
                <button
                  type="button"
                  onClick={props.onRecommend}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
                >
                  다시 시도
                </button>
              )}
              <button
                type="button"
                onClick={props.onBasic}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
              >
                기본 추천 보기
              </button>
            </div>
          </div>
        )}
      </div>

      {!rec && !loading && (
        <div className={`${card} text-center`}>
          {hasTasks ? (
            <>
              <p className="font-semibold text-slate-800">준비가 됐어요. 우선순위를 추천받아 보세요.</p>
              {canAnalyze && (
                <button
                  type="button"
                  onClick={props.onRecommend}
                  className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  우선순위 추천받기
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">할 일을 추가하고 우선순위를 추천받아 보세요.</p>
          )}
        </div>
      )}

      {rec && (
        <>
          {stale && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                할 일이 바뀌어서 추천이 최신이 아니에요. 다시 추천받아 주세요.
              </p>
              {canAnalyze && (
                <button
                  type="button"
                  onClick={props.onRecommend}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  다시 추천받기
                </button>
              )}
            </div>
          )}

          <div className={`flex flex-col gap-4 ${stale || loading ? "opacity-60" : ""}`}>
            <FocusCard
              rec={rec}
              taskById={taskById}
              projectById={projectById}
              reasonById={new Map(rec.taskRankings.map((r) => [r.taskId, r.reason]))}
            />

            {rec.warnings.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <h3 className="text-sm font-semibold text-amber-900">주의사항</h3>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {rec.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-amber-900">⚠ {w}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className={card}>
              <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ["project", "프로젝트별"],
                    ["all", "전체 순위"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                      tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                프로젝트 순위는 어느 프로젝트에 먼저 신경 쓸지, 전체 순위는 어떤 작업부터 시작할지를 보여줘요.
              </p>

              <div className="mt-3">
                {tab === "project" ? (
                  <ProjectRankingList
                    key={rec.generatedAt}
                    rec={rec}
                    taskById={taskById}
                    projectById={projectById}
                    today={today}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rec.taskRankings
                      .filter((r) => taskById.has(r.taskId))
                      .map((r) => {
                        const t = taskById.get(r.taskId)!;
                        return (
                          <RankedTaskItem
                            key={r.taskId}
                            ranking={r}
                            task={t}
                            order={r.rank}
                            showGlobalRank={false}
                            projectName={t.projectId ? (projectById.get(t.projectId)?.name ?? null) : null}
                            today={today}
                          />
                        );
                      })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
