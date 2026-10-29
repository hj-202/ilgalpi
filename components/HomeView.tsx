"use client";

import { useEffect, useState } from "react";
import { setDailyAvailableMinutes, setRecommendation } from "@/hooks/useAppStore";
import { track, trackPage } from "@/lib/analytics";
import { availableFor } from "@/lib/availability";
import { MAX_AI_TASKS } from "@/lib/constants";
import { nowTimeLocal } from "@/lib/date";
import { isRecommendationStale } from "@/lib/fingerprint";
import { ERROR_MESSAGES } from "@/lib/messages";
import { basicRecommend } from "@/lib/recommend/basic";
import { buildRecommendRequest, createStoredRecommendation, getActiveProjects, getIncompleteTasks } from "@/lib/recommend/buildRequest";
import type { AppState, RecommendErrorCode, RecommendResponse } from "@/lib/types";
import AvailableTimePicker from "./AvailableTimePicker";
import Calendar from "./Calendar";
import DaySection from "./DaySection";
import { RecommendCta, RecommendResult, type PanelNotice } from "./RecommendSection";

const CLIENT_TIMEOUT_MS = 45_000;

/** 입력 오류는 조건 기반으로 대신하지 않고 안내만 한다 */
const NO_FALLBACK: RecommendErrorCode[] = ["INVALID_REQUEST", "NO_TASKS", "TOO_MANY_TASKS"];

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
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  // 날짜가 바뀌면 이전 날짜의 결과 화면·안내를 닫는다(데이터는 날짜별로 보존)
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setViewRec(false);
    setNotice(null);
  }

  const nowTime = nowTimeLocal();
  // 추천과 작업 가능 시간은 선택한 날짜 기준이다. 마감 임박도만 실제 오늘 기준으로 판단한다.
  const dayTasks = app.tasks.filter((t) => t.plannedDate === selected);
  const incomplete = getIncompleteTasks(dayTasks);
  const availableMinutes = availableFor(app, selected);
  const rec = app.recommendations[selected] ?? null;
  const stale = rec ? isRecommendationStale(rec, dayTasks, availableMinutes, today) : false;
  const tooMany = incomplete.length > MAX_AI_TASKS;
  const showingRec = viewRec && (rec !== null || loading);

  // 홈 목록 ↔ 추천 결과 화면 진입. 같은 화면의 재렌더링으로는 중복 기록되지 않는다
  useEffect(() => {
    trackPage(showingRec ? "recommendation" : "home");
  }, [showingRec]);

  const storeBasic = (reason: string) => {
    const result = basicRecommend({
      tasks: incomplete,
      projects: getActiveProjects(app.projects, incomplete),
      availableMinutes,
      today,
      nowTime,
    });
    setRecommendation(selected, createStoredRecommendation(result, "basic", { tasks: incomplete, availableMinutes, date: today }));
    track("Recommendation Viewed", { recommendation_type: "basic", result_source: "new" });
    setNotice({ kind: "fallback", message: `${reason} 조건 기반 추천으로 순서를 정리했어요.`, canRetry: true });
    setViewRec(true);
  };

  const runAI = async () => {
    if (incomplete.length < 2 || tooMany || loading) return;
    track("Recommendation Requested", { task_count: incomplete.length, is_retry: rec !== null });
    const planDate = selected;
    const request = buildRecommendRequest({ tasks: dayTasks, projects: app.projects, availableMinutes, today, planDate, nowTime });
    setLoading(true);
    setNotice(null);
    if (rec) setViewRec(true);
    let failure: RecommendErrorCode | null = null;
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
        // 분석에 실제로 사용한 입력 스냅샷으로 지문을 만든다(분석 중 수정한 작업은 stale로 표시됨)
        setRecommendation(
          planDate,
          createStoredRecommendation(
            data.recommendation,
            "ai",
            { tasks: request.tasks, availableMinutes: request.availableMinutes, date: request.currentDate },
            data.meta.model,
          ),
        );
        track("Recommendation Viewed", { recommendation_type: "ai", result_source: "new" });
        setViewRec(true);
      }
    } catch (err) {
      failure = (err as Error)?.name === "TimeoutError" ? "AI_TIMEOUT" : "NETWORK_ERROR";
    } finally {
      setLoading(false);
    }
    if (!failure) return;
    const info = ERROR_MESSAGES[failure];
    if (NO_FALLBACK.includes(failure)) {
      setNotice({ kind: "error", message: info.message, canRetry: info.canRetry });
    } else if (rec && !stale) {
      // 최신 결과가 이미 있으면 오류만으로 대체하거나 지우지 않는다
      setNotice({ kind: "error", message: info.message, canRetry: info.canRetry });
    } else {
      storeBasic(info.message);
    }
  };

  return (
    <>
      <Calendar tasks={app.tasks} selected={selected} today={today} onSelect={onSelect} />

      {showingRec ? (
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
            loading={loading}
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

      <AvailableTimePicker value={availableMinutes} onChange={(m) => setDailyAvailableMinutes(selected, m)} />
      <RecommendCta
        hasRec={rec !== null}
        incompleteCount={incomplete.length}
        tooMany={tooMany}
        loading={loading}
        notice={notice}
        showNotice={!showingRec}
        onRecommend={runAI}
      />
    </>
  );
}
