"use client";

import { useEffect, useRef, useState } from "react";
import { setDailyAvailableMinutes, setRecommendation } from "@/hooks/useAppStore";
import { track, trackPage } from "@/lib/analytics";
import { availableFor } from "@/lib/availability";
import { MAX_AI_TASKS } from "@/lib/constants";
import { nowTimeLocal } from "@/lib/date";
import { isRecommendationStale } from "@/lib/fingerprint";
import { ERROR_MESSAGES } from "@/lib/messages";
import { basicRecommend } from "@/lib/recommend/basic";
import { failureAction, FALLBACK_FAILED_MESSAGE } from "@/lib/recommend/failure";
import { buildRecommendRequest, createStoredRecommendation, getActiveProjects, getIncompleteTasks } from "@/lib/recommend/buildRequest";
import type { AppState, RecommendErrorCode, RecommendResponse } from "@/lib/types";
import AvailableTimePicker from "./AvailableTimePicker";
import Calendar from "./Calendar";
import DaySection from "./DaySection";
import RecommendLoading from "./RecommendLoading";
import { RecommendCta, RecommendResult, type PanelNotice } from "./RecommendSection";

const CLIENT_TIMEOUT_MS = 45_000;

export default function HomeView({
  app,
  today,
  selected,
  onSelect,
}: {
  app: AppState;
  today: string;
  selected: string;
  onSelect: (ymd: string) => void;
}) {
  const [viewRec, setViewRec] = useState(false);
  // 요청 중인 계획 날짜. 중복 요청 방지(busy)와 로딩 표시(해당 날짜를 보고 있을 때만)에 쓴다
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  // state 갱신 전 연속 탭도 막는 동기 가드, 그리고 응답 도착 시점의 선택 날짜
  const inFlight = useRef(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const [prevHeight, setPrevHeight] = useState<number | null>(null);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  // 날짜가 바뀌면 이전 날짜의 결과 화면·안내를 닫는다(데이터는 날짜별로 보존)
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setViewRec(false);
    setNotice(null);
  }

  const busy = loadingDate !== null;
  const loading = loadingDate === selected;
  const nowTime = nowTimeLocal();
  // 추천과 작업 가능 시간은 선택한 날짜 기준이다. 마감 임박도만 실제 오늘 기준으로 판단한다.
  const dayTasks = app.tasks.filter((t) => t.plannedDate === selected);
  const incomplete = getIncompleteTasks(dayTasks);
  const availableMinutes = availableFor(app, selected);
  const rec = app.recommendations[selected] ?? null;
  const stale = rec ? isRecommendationStale(rec, dayTasks, availableMinutes, today) : false;
  const tooMany = incomplete.length > MAX_AI_TASKS;
  const showingRec = viewRec && rec !== null && !loading;

  // 홈 목록 ↔ 추천 결과 화면 진입. 같은 화면의 재렌더링으로는 중복 기록되지 않는다
  useEffect(() => {
    trackPage(showingRec ? "recommendation" : "home");
  }, [showingRec]);

  /** 조건 기반 추천을 만들어 저장한다. 만들지 못하면 false */
  const storeBasic = (reason: string, excludedCompletedCount: number, show: boolean): boolean => {
    try {
      const result = basicRecommend({
        tasks: incomplete,
        projects: getActiveProjects(app.projects, incomplete),
        availableMinutes,
        today,
        nowTime,
      });
      setRecommendation(selected, createStoredRecommendation(result, "basic", { tasks: incomplete, availableMinutes, date: today, excludedCompletedCount }));
    } catch {
      return false;
    }
    track("Recommendation Viewed", { recommendation_type: "basic", result_source: "new" });
    if (show) {
      setNotice({ kind: "fallback", message: `${reason} 조건 기반 추천으로 순서를 정리했어요.`, canRetry: true });
      setViewRec(true);
    }
    return true;
  };

  const runAI = async () => {
    if (incomplete.length < 2 || tooMany || inFlight.current) return;
    inFlight.current = true;
    setPrevHeight(regionRef.current?.offsetHeight ?? null);
    const startedAt = performance.now();
    const isRetry = rec !== null;
    track("Recommendation Requested", { task_count: incomplete.length, is_retry: isRetry });
    const planDate = selected;
    // 완료한 작업은 추천에서 제외된다. 제외한 개수를 추천 결과와 함께 저장해 안내 문구의 기준으로 쓴다
    const excludedCompletedCount = dayTasks.filter((t) => t.isCompleted).length;
    const request = buildRecommendRequest({ tasks: dayTasks, projects: app.projects, availableMinutes, today, planDate, nowTime });
    setLoadingDate(planDate);
    setNotice(null);
    if (rec) setViewRec(true);
    let failure: RecommendErrorCode | null = null;
    let meta: { model: string; attempts: number } | null = null;
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const data = (await res.json()) as RecommendResponse;
      if (!data.ok) {
        failure = data.error.code;
      } else {
        meta = data.meta;
        // 분석에 실제로 사용한 입력 스냅샷으로 지문을 만든다(분석 중 수정한 작업은 stale로 표시됨)
        setRecommendation(
          planDate,
          createStoredRecommendation(
            data.recommendation,
            "ai",
            { tasks: request.tasks, availableMinutes: request.availableMinutes, date: request.currentDate, excludedCompletedCount },
            data.meta.model,
          ),
        );
        track("Recommendation Viewed", { recommendation_type: "ai", result_source: "new" });
      }
    } catch (err) {
      failure = (err as Error)?.name === "TimeoutError" ? "AI_TIMEOUT" : "NETWORK_ERROR";
    } finally {
      inFlight.current = false;
      setLoadingDate(null);
    }
    // 요청 중 다른 날짜로 옮겼다면 결과는 저장만 하고 현재 화면은 건드리지 않는다
    const show = selectedRef.current === planDate;
    const duration_ms = Math.round(performance.now() - startedAt);
    if (!failure) {
      track("Recommendation Completed", { outcome: "ai", duration_ms, is_retry: isRetry, model: meta?.model, attempts: meta?.attempts });
      if (show) setViewRec(true);
      return;
    }
    const info = ERROR_MESSAGES[failure];
    const showError = (message: string, canRetry: boolean) => {
      if (show) setNotice({ kind: "error", message, canRetry });
    };
    if (failureAction(failure, rec !== null && !stale) === "error") {
      // 입력 오류이거나, 최신 결과가 이미 있어 오류만으로 대체하거나 지우지 않는 경우
      track("Recommendation Completed", { outcome: "error", duration_ms, is_retry: isRetry, error_code: failure });
      showError(info.message, info.canRetry);
    } else if (storeBasic(info.message, excludedCompletedCount, show)) {
      track("Recommendation Completed", { outcome: "fallback", duration_ms, is_retry: isRetry, error_code: failure });
    } else {
      // 조건 기반 추천까지 만들지 못한 최종 실패: 오류 안내와 재시도를 제공한다
      track("Recommendation Completed", { outcome: "error", duration_ms, is_retry: isRetry, error_code: failure });
      showError(FALLBACK_FAILED_MESSAGE, true);
    }
  };

  return (
    <>
      <Calendar tasks={app.tasks} selected={selected} today={today} onSelect={onSelect} />

      <div ref={regionRef}>
      {loading ? (
        <div className="mt-[19px]">
          <RecommendLoading prevHeight={prevHeight} />
        </div>
      ) : showingRec ? (
        <div className="mt-[19px]">
          <RecommendResult
            rec={rec}
            stale={stale}
            dayTasks={dayTasks}
            projects={app.projects}
            selected={selected}
            today={today}
            nowTime={nowTime}
            notice={notice}
            onBack={() => setViewRec(false)}
            onRetry={runAI}
          />
        </div>
      ) : (
        <DaySection
          tasks={app.tasks}
          projects={app.projects}
          allEmpty={app.tasks.length === 0}
          selected={selected}
          today={today}
          nowTime={nowTime}
          hasRecommendation={rec !== null}
          onShowRecommendation={() => {
            if (rec) track("Recommendation Viewed", { recommendation_type: rec.recommendationType, result_source: "saved" });
            setViewRec(true);
          }}
        />
      )}
      </div>

      <AvailableTimePicker value={availableMinutes} onChange={(m) => setDailyAvailableMinutes(selected, m)} readOnly={showingRec} />
      <RecommendCta
        hasRec={rec !== null}
        incompleteCount={incomplete.length}
        tooMany={tooMany}
        loading={busy}
        notice={notice}
        showNotice={!showingRec}
        onRecommend={runAI}
      />
    </>
  );
}
