"use client";

import { useEffect, useState } from "react";
import { hasUnsavedChanges, reopenImport, retrySync, signInWithGoogle, signOut, type StoreSnapshot } from "@/hooks/useAppStore";
import { track, trackPage } from "@/lib/analytics";
import { formatMonthDay, weekdayIndex } from "@/lib/date";
import { buildPeriod, pastRecords, type RecordMode } from "@/lib/stats";
import { supabaseConfigured } from "@/lib/supabase/client";
import FeedbackModal from "./FeedbackModal";
import RecordChart from "./RecordChart";
import { focusQuickAdd } from "./DaySection";
import { ChevronIcon, EmptyState, emptyCtaOutline } from "./ui";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function RecordRow({ date, total, done, pct, large, onOpen }: { date: string; total: number; done: number; pct: number; large?: boolean; onOpen: (d: string) => void }) {
  const [y] = date.split("-");
  const label = `${formatMonthDay(date)} (${WEEKDAY[weekdayIndex(date)]})`;
  return (
    <button
      type="button"
      onClick={() => onOpen(date)}
      className={`flex w-full items-center gap-3 border-b border-[#f0f0f1] text-left ${large ? "min-h-[89px] py-[17px]" : "min-h-[79px] py-4"}`}
    >
      <span className="flex w-11 shrink-0 flex-col items-center text-center text-[13px] leading-snug text-[#76777c]">
        {WEEKDAY[weekdayIndex(date)]}요일
        <strong className="text-[19px] text-[#292a2d]">{Number(date.slice(8))}</strong>
      </span>
      <span className="flex-1 text-sm font-semibold">
        {large ? `${y}년 ` : ""}
        {label}
        <small className="mt-1 block text-[13px] font-normal text-[#767780]">
          계획한 {total}개 중 {done}개 완료
        </small>
      </span>
      <span className={`flex items-center gap-0.5 whitespace-nowrap text-[15px] font-bold ${pct === 100 ? "text-primary" : "text-[#6f7074]"}`}>
        {pct}%<ChevronIcon dir="right" size={18} />
      </span>
    </button>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <strong className="block text-[22px] font-extrabold tracking-tight">{value}</strong>
      <span className="mt-0.5 block text-xs text-[#76777c]">{label}</span>
    </div>
  );
}

const SYNC_TEXT = { idle: "저장됨", saving: "저장 중…", saved: "저장됨", error: "저장하지 못했어요" } as const;

/** 내 기록: 통계 3개 → 로그인 안내/계정 → 그래프 → 지난 실행 기록 → 의견 보내기 */
export default function MyPage({
  store,
  onOpenDate,
  onOpenHistory,
  onGoHome,
}: {
  store: StoreSnapshot;
  onOpenDate: (d: string) => void;
  onOpenHistory: () => void;
  onGoHome: () => void;
}) {
  const { app, today, auth, sync } = store;
  const [period, setPeriod] = useState<{ mode: RecordMode; offset: number }>({ mode: "week", offset: 0 });
  const [feedback, setFeedback] = useState(false);
  useEffect(() => {
    trackPage("records");
  }, []);
  const [busy, setBusy] = useState(false);
  const tasks = app.tasks;
  const recorded = tasks.some((t) => t.isCompleted);
  const p = buildPeriod(tasks, period.mode, today, period.offset);
  const recent = pastRecords(tasks, today).slice(0, 3);

  const login = async () => {
    setBusy(true);
    const r = await signInWithGoogle();
    if (r !== "started") setBusy(false);
  };
  const logout = async () => {
    if (hasUnsavedChanges() && !window.confirm("아직 저장되지 않은 변경이 있어요. 그래도 로그아웃할까요?")) return;
    await signOut();
  };

  return (
    <div>
      <header className="mb-2.5">
        <h1 className="text-[23px] font-extrabold tracking-tight">내 기록</h1>
        <p className="mt-1 text-[13px] text-[#76777c]">지금까지 해낸 일과 나의 실행 흐름을 확인해요.</p>
      </header>

      {recorded ? (
        <section aria-label="핵심 통계" className="mb-[21px] mt-[17px] grid grid-cols-3 gap-2 rounded-2xl border border-line bg-white px-1.5 py-4">
          <Metric value={p.averagePct === null ? "–" : `${p.averagePct}%`} label="평균 완료율" />
          <Metric value={`${p.completed}개`} label="완료한 일" />
          <Metric value={`${p.fullDays}일`} label="모두 완료한 날" />
        </section>
      ) : (
        <EmptyState
          className="mb-[19px] mt-[17px]"
          icon="chart"
          title="아직 쌓인 기록이 없어요"
          description="할 일을 완료하면 여기에 실행 기록이 쌓여요."
          action={
            <button
              type="button"
              className={emptyCtaOutline}
              onClick={() => {
                onGoHome();
                focusQuickAdd();
              }}
            >
              할 일 등록하러 가기
            </button>
          }
        />
      )}

      {auth.status === "account" && auth.user ? (
        <section aria-label="계정" className="mb-[23px] rounded-[15px] border border-[#eee] p-[11px]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden className="grid h-[34px] min-w-[34px] place-items-center rounded-full bg-primary-soft font-bold text-primary">
                {(auth.user.name ?? auth.user.email ?? "G").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-sm">{auth.user.name ?? "Google 계정"}</strong>
                {auth.user.email && <small className="block truncate text-xs text-[#767780]">{auth.user.email}</small>}
              </div>
            </div>
            <button type="button" onClick={logout} className="min-h-[40px] shrink-0 px-2 text-[13px] text-subtle underline underline-offset-2">
              로그아웃
            </button>
          </div>
          <p
            role={sync.state === "error" ? "alert" : "status"}
            className={`mt-2.5 flex items-center justify-between gap-2 border-t border-[#f2f2f3] pt-2.5 text-xs ${sync.state === "error" ? "text-primary-dark" : "text-[#767780]"}`}
          >
            <span>
              {SYNC_TEXT[sync.state]}
              {sync.state === "idle" || sync.state === "saved" ? " · 이 계정에 저장돼요" : ""}
            </span>
            {sync.state === "error" && (
              <button type="button" onClick={retrySync} className="-my-2 min-h-[40px] px-1 font-bold underline underline-offset-2">
                다시 시도
              </button>
            )}
          </p>
          {store.guestHasData && (
            <button type="button" onClick={reopenImport} className="mt-1 min-h-[40px] text-xs text-subtle underline underline-offset-2">
              이 기기의 기록 가져오기
            </button>
          )}
        </section>
      ) : (
        <section aria-label="로그인 안내" className="mb-[23px] rounded-[17px] border border-[#ffe3e5] bg-primary-soft px-[15px] py-3.5">
          <strong className="block text-[15px]">지금은 이 기기에만 저장돼요</strong>
          <p className="mt-1 text-[14px] leading-normal text-[#6c6a6e]">로그인하면 다른 기기에도 동기화돼요.</p>
          <button
            type="button"
            onClick={login}
            disabled={!supabaseConfigured || busy}
            className="mt-3 min-h-[44px] w-full rounded-xl bg-primary text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45"
          >
            Google로 계속하기
          </button>
          {!supabaseConfigured && (
            <p role="status" className="mt-2 text-xs text-[#6c6a6e]">
              지금은 로그인을 사용할 수 없어요. 비회원으로 계속 사용할 수 있어요.
            </p>
          )}
        </section>
      )}

      {recorded && <RecordChart tasks={tasks} anchor={today} onPeriod={(mode, offset) => setPeriod({ mode, offset })} />}

      <section aria-labelledby="past-title" className="mt-[25px]">
        <div className="flex items-center justify-between">
          <h2 id="past-title" className="text-lg font-extrabold tracking-tight">
            지난 실행 기록
          </h2>
          <button type="button" onClick={onOpenHistory} className="-mr-1 inline-flex min-h-[40px] items-center gap-0.5 pl-3 text-[13px] font-semibold text-[#5d6067] hover:text-[#222428]">
            전체보기
            <ChevronIcon dir="right" size={18} />
          </button>
        </div>
        {recent.length > 0 ? (
          <div className="border-t border-[#f0f0f1]">
            {recent.map((r) => (
              <RecordRow key={r.date} {...r} onOpen={onOpenDate} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-[#76777c]">아직 지난 실행 기록이 없어요.</p>
        )}
      </section>

      <div className="mt-6 flex justify-end border-t border-[#eee] pt-2.5">
        <button type="button" onClick={() => {
            track("Feedback Opened");
            setFeedback(true);
          }} className="inline-flex min-h-[40px] items-center gap-0.5 px-1.5 text-[13px] text-[#6f7074]">
          의견 보내기
          <ChevronIcon dir="right" size={16} />
        </button>
      </div>
      {feedback && <FeedbackModal onClose={() => setFeedback(false)} />}
    </div>
  );
}
