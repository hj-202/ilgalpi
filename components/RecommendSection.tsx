"use client";

import { formatMonthDay } from "@/lib/date";
import type { Project, StoredRecommendation, Task } from "@/lib/types";
import { CompleteCheck, ConditionChips } from "./TaskItem";
import { ChevronIcon, EmptyState, PrimaryButton, ProgressBar } from "./ui";

export interface PanelNotice {
  kind: "error" | "fallback";
  message: string;
  canRetry: boolean;
}

/** 추천 방식 구분: 실제 Gemini 호출이 성공한 결과만 'AI 추천' */
export function TypeBadge({ type }: { type: StoredRecommendation["recommendationType"] }) {
  return type === "ai" ? (
    <span className="rounded-full bg-selected px-2.5 py-0.5 text-xs text-white">AI 추천</span>
  ) : (
    <span className="rounded-full bg-chip px-2.5 py-0.5 text-xs text-[#65676e]">기본 추천</span>
  );
}

/** 1순위 레드 / 2순위 부드러운 핑크 / 그 외 아주 연한 핑크. 완료 항목은 순위 숫자를 유지하고 뉴트럴로 */
export function RankCircle({ n, done }: { n: number; done: boolean }) {
  const style = done
    ? "bg-[#f4f2f3] text-[#8b8183]"
    : n === 1
      ? "bg-primary text-white"
      : n === 2
        ? "bg-rank2 text-rank2-ink"
        : "bg-rank-soft text-rank-soft-ink";
  return (
    <span aria-label={`${n}순위`} className={`flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${style}`}>
      {n}
    </span>
  );
}

/** 추천 결과 화면. 기본 할 일 목록을 같은 자리에서 대체한다 */
export function RecommendResult({
  rec,
  stale,
  dayTasks,
  projects,
  selected,
  today,
  nowTime,
  notice,
  loading,
  onBack,
  onRetry,
}: {
  rec: StoredRecommendation | null;
  stale: boolean;
  dayTasks: Task[];
  projects: Project[];
  selected: string;
  today: string;
  nowTime: string;
  notice: PanelNotice | null;
  loading: boolean;
  onBack: () => void;
  onRetry: () => void;
}) {
  const taskById = new Map(dayTasks.map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const ranked = rec ? rec.taskRankings.filter((r) => taskById.has(r.taskId)) : [];
  const doneCount = ranked.filter((r) => taskById.get(r.taskId)!.isCompleted).length;
  const title = selected === today ? "오늘의 우선순위" : `${formatMonthDay(selected)}의 우선순위`;
  const allDone = ranked.length > 0 && doneCount === ranked.length;
  // 홈과 같은 기준: 선택한 날짜의 실제 할 일이 1개 이상이고 모두 완료
  const dayAllDone = dayTasks.length > 0 && dayTasks.every((t) => t.isCompleted);

  return (
    <section aria-labelledby="rec-title" className="pb-2 pt-px">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="rec-title" className="text-lg font-extrabold tracking-tight">
              {title}
            </h2>
            {rec && <TypeBadge type={rec.recommendationType} />}
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-[#ebd6d8] bg-white pl-2.5 pr-3.5 text-xs text-[#b43d46] hover:bg-[#fff1f2]"
        >
          <ChevronIcon dir="left" size={14} />
          할 일 목록으로
        </button>
      </div>

      {ranked.length > 0 && (
        <div className="mb-3 mt-1">
          <div className="mb-2 flex items-center justify-between gap-2 text-[13px] text-subtle">
            {dayAllDone ? (
              <span className="font-semibold text-primary-dark">{selected === today ? "오늘 할 일을 모두 마쳤어요. 수고했어요!" : "이 날의 할 일을 모두 마쳤어요."}</span>
            ) : (
              <span>추천 순서는 유지돼요</span>
            )}
            <span>
              {doneCount}/{ranked.length} 완료
            </span>
          </div>
          <ProgressBar done={doneCount} total={ranked.length} />
        </div>
      )}

      <div aria-live="polite">
        {loading && <p className="mb-2 text-sm text-subtle">할 일을 비교하고 있어요.</p>}
      </div>
      {notice && !loading && (
        <div role={notice.kind === "error" ? "alert" : "status"} className="mb-2.5 flex items-start justify-between gap-2 rounded-[10px] bg-[#fff1f2] px-3 py-2.5 text-xs text-[#bc434b]">
          <p className="leading-relaxed">{notice.message}</p>
          {notice.canRetry && (
            <button type="button" onClick={onRetry} className="-my-1 shrink-0 px-1.5 py-1.5 font-bold underline underline-offset-2">
              다시 시도
            </button>
          )}
        </div>
      )}

      <div className={`rounded-[18px] border border-rec-line bg-rec-bg px-[15px] pb-3.5 pt-3 ${loading ? "opacity-60" : ""}`}>
        {stale && (
          <p role="status" className="mb-1 rounded-[10px] bg-[#fff1f2] px-3 py-2.5 text-xs text-[#bc434b]">
            할 일이나 조건이 바뀌었어요. 아래에서 다시 추천받으면 순위를 갱신할 수 있어요.
          </p>
        )}
        {ranked.length === 0 ? (
          <EmptyState className="border-0 bg-transparent" icon="done" title="추천할 할 일이 없어요" description="새로운 할 일을 추가하면 우선순위를 추천해 드릴게요." />
        ) : (
          <ol>
            {ranked.map((r) => {
              const t = taskById.get(r.taskId)!;
              const project = t.projectId ? projectById.get(t.projectId) : null;
              return (
                <li key={r.taskId} className="flex items-start gap-2.5 border-b border-[#f2e2e4] py-4 last:border-b-0">
                  <RankCircle n={r.rank} done={t.isCompleted} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] font-bold leading-[1.45] ${t.isCompleted ? "text-[#9a9ba1] line-through" : ""}`}>{t.title}</p>
                    {project && <p className="text-xs text-subtle">{project.name}</p>}
                    <ConditionChips task={t} today={today} nowTime={nowTime} tone="outline" />
                    <p className={`mt-2 flex items-start gap-1.5 text-[12.5px] leading-normal ${t.isCompleted ? "text-[#a5a0a0]" : "text-[#6a6264]"}`}>
                      <span aria-hidden className="text-base leading-[1.2] text-primary">
                        ✧
                      </span>
                      <span>{r.reason}</span>
                    </p>
                  </div>
                  <div className="pt-0.5">
                    <CompleteCheck task={t} source="recommendation" />
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {allDone && (
          <p role="status" className="mt-2 rounded-[10px] bg-white px-3 py-2.5 text-xs font-semibold text-[#b73a43]">
            모든 추천 항목을 완료했어요! 캘린더의 별 스탬프도 확인해 보세요.
          </p>
        )}
        {rec && rec.recommendationType === "basic" && (
          <p className="mt-3 text-xs leading-relaxed text-[#8a7f82]">마감·중요도·소요시간을 기준으로 실행 순서를 정리했어요.</p>
        )}
        {rec && rec.warnings.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {rec.warnings.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-[#6a6264]">
                · {w}
              </li>
            ))}
          </ul>
        )}

        {rec && rec.projectRankings.some((r) => projectById.has(r.projectId)) && (
          <details className="mt-4 rounded-2xl border border-[#f2e2e4] bg-white p-3.5">
            <summary className="cursor-pointer text-sm font-semibold">프로젝트별 우선순위</summary>
            <ol className="mt-1 divide-y divide-line">
              {rec.projectRankings
                .filter((r) => projectById.has(r.projectId))
                .map((r) => (
                  <li key={r.projectId} className="flex items-start gap-3 py-3">
                    <RankCircle n={r.rank} done={false} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{projectById.get(r.projectId)!.name}</p>
                      <p className="mt-0.5 text-xs text-subtle">{r.reason}</p>
                    </div>
                  </li>
                ))}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
}

/** 단일 CTA(`우선순위 추천받기` / `다시 추천받기`)와 오류 안내 */
export function RecommendCta({
  hasRec,
  incompleteCount,
  tooMany,
  loading,
  notice,
  showNotice,
  onRecommend,
}: {
  hasRec: boolean;
  incompleteCount: number;
  tooMany: boolean;
  loading: boolean;
  notice: PanelNotice | null;
  /** 결과 화면이 아닌 목록 화면에서만 오류 안내를 이 자리에 보인다 */
  showNotice: boolean;
  onRecommend: () => void;
}) {
  // 새 추천은 미완료 2개 이상일 때만. 기존 결과 조회는 이 조건과 별개다.
  const canAnalyze = incompleteCount >= 2 && !tooMany && !loading;
  return (
    <div>
      <PrimaryButton
        type="button"
        onClick={onRecommend}
        disabled={!canAnalyze}
        aria-busy={loading}
        className="mt-[17px] flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[13px] text-[15px] font-extrabold"
      >
        {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {loading ? "분석 중..." : hasRec ? "다시 추천받기 ↻" : "우선순위 추천받기 →"}
      </PrimaryButton>
      {incompleteCount < 2 && (
        <p className="mt-2 text-center text-[13px] text-[#76777c]">
          {incompleteCount === 1 ? "할 일을 1개 더 추가하면 우선순위를 추천받을 수 있어요." : "할 일을 2개 이상 추가하면 추천받을 수 있어요."}
        </p>
      )}
      {tooMany && (
        <p className="mt-2 text-[13px] text-primary-dark">
          AI 분석은 한 번에 최대 30개까지 가능해요. 완료했거나 필요 없는 작업을 정리해 주세요. (현재 {incompleteCount}개)
        </p>
      )}
      <div aria-live="polite">
        {loading && !hasRec && <p className="mt-3 text-center text-sm text-subtle">할 일을 비교하고 있어요.</p>}
      </div>
      {showNotice && notice && !loading && (
        <div role={notice.kind === "error" ? "alert" : "status"} className="mt-3 flex items-start justify-between gap-2 rounded-[10px] bg-[#fff1f2] px-3 py-2.5 text-xs text-[#bc434b]">
          <p className="leading-relaxed">{notice.message}</p>
          {notice.canRetry && (
            <button type="button" onClick={onRecommend} className="-my-1 shrink-0 px-1.5 py-1.5 font-bold underline underline-offset-2">
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}
