"use client";

import { useRef, useState } from "react";
import { buildPeriod, defaultBarIndex, type RecordMode } from "@/lib/stats";
import type { Task } from "@/lib/types";
import { ChevronIcon, EmptyState } from "./ui";

const WEEKDAY_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

/** 주간/월간 완료율 막대그래프 `얼마나 해냈을까?` — 선택 막대·말풍선·하단 상세 */
export default function RecordChart({
  tasks,
  anchor,
  onPeriod,
}: {
  tasks: Task[];
  anchor: string;
  /** 조회 기간이 바뀔 때 상단 통계가 같이 바뀌도록 상위에 알린다 */
  onPeriod: (mode: RecordMode, offset: number) => void;
}) {
  const [mode, setMode] = useState<RecordMode>("week");
  const [offset, setOffset] = useState(0);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const group = useRef<HTMLDivElement>(null);

  const period = buildPeriod(tasks, mode, anchor, offset);
  const picked = pickedKey ? period.bars.findIndex((b) => b.key === pickedKey) : -1;
  const idx = picked >= 0 ? picked : defaultBarIndex(period.bars);
  const sel = idx >= 0 ? period.bars[idx] : null;

  const change = (m: RecordMode, o: number) => {
    setMode(m);
    setOffset(o);
    setPickedKey(null);
    onPeriod(m, o);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = Math.min(period.bars.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + (e.key === "ArrowRight" ? 1 : -1)));
    setPickedKey(period.bars[next].key);
    requestAnimationFrame(() => group.current?.querySelectorAll<HTMLElement>("[data-bar]")[next]?.focus());
  };

  const periodBtn = "flex h-10 w-10 items-center justify-center rounded-lg text-[#777] hover:bg-surface-muted";

  return (
    <section aria-labelledby="chart-title" className="rounded-[19px] border border-[#e6e6e8] bg-white px-[15px] pb-[17px] pt-[18px] shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-1.5">
        <h2 id="chart-title" className="text-lg font-extrabold tracking-tight">
          얼마나 해냈을까?
        </h2>
        <div role="group" aria-label="조회 방식" className="flex gap-0.5 rounded-xl bg-[#f5f5f6] p-[3px]">
          {(
            [
              ["week", "주간"],
              ["month", "월간"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => change(key, 0)}
              className={`min-h-8 rounded-[9px] px-3 text-[13px] ${mode === key ? "bg-white font-bold text-ink shadow-[0_1px_5px_rgba(0,0,0,0.05)]" : "text-[#7b7c82]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-1.5">
        <span className="text-[13px] text-[#76777c]">{period.heading}</span>
        <div className="-mr-2 flex items-center">
          <button type="button" className={periodBtn} onClick={() => change(mode, offset - 1)} aria-label={mode === "week" ? "이전 주" : "이전 달"}>
            <ChevronIcon dir="left" size={18} />
          </button>
          <button type="button" className={periodBtn} onClick={() => change(mode, offset + 1)} aria-label={mode === "week" ? "다음 주" : "다음 달"}>
            <ChevronIcon dir="right" size={18} />
          </button>
        </div>
      </div>

      {period.hasRecords ? (
        <>
          <div ref={group} role="group" aria-label="완료율 막대그래프" onKeyDown={onKey} className="mt-[54px] flex h-[174px] items-end gap-2.5 border-b border-[#e9e9eb] min-[461px]:h-[196px]">
            {period.bars.map((b, i) => {
              const h = b.pct === null ? "2px" : b.pct === 0 ? "6px" : `${b.pct}%`;
              return (
                <button
                  key={b.key}
                  type="button"
                  data-bar
                  aria-pressed={idx === i}
                  aria-label={`${b.label} ${b.pct === null ? "기록 없음" : `완료율 ${b.pct}%, ${b.done}/${b.total} 완료`}`}
                  onClick={() => setPickedKey(b.key)}
                  className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                >
                  <span
                    className={`block w-full rounded-t-[10px] transition-[height,background] duration-200 ${mode === "month" ? "max-w-[69px]" : "max-w-[48px]"} ${
                      b.pct === null ? "rounded-none bg-[#ececee]" : idx === i ? "bg-primary" : "bg-bar"
                    }`}
                    style={{ height: h }}
                  />
                  {idx === i && b.pct !== null && (
                    <span
                      className="absolute left-1/2 z-[1] flex h-8 w-16 -translate-x-1/2 items-center justify-center rounded-[9px] border border-[#f0d6d8] bg-white text-[13px] font-extrabold text-primary shadow-[0_2px_6px_rgba(0,0,0,0.07)] after:absolute after:-bottom-[6px] after:left-1/2 after:h-[9px] after:w-[9px] after:-translate-x-1/2 after:rotate-45 after:border-b after:border-r after:border-[#f0d6d8] after:bg-white after:content-['']"
                      style={{ bottom: `calc(${h} + 11px)` }}
                      aria-hidden
                    >
                      {b.pct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-[7px] flex gap-2.5" aria-hidden>
            {period.bars.map((b, i) => (
              <span key={b.key} className={`flex-1 whitespace-nowrap text-center text-xs ${idx === i ? "font-extrabold text-primary" : "text-[#7b7c82]"}`}>
                {b.label}
              </span>
            ))}
          </div>
          <div className="mt-[17px] border-t border-line pt-[15px]" aria-live="polite">
            {sel && sel.pct !== null ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{mode === "week" ? `${WEEKDAY_FULL[idx]} 실행 기록` : `${sel.label} 실행 기록`}</strong>
                  <span className="text-sm">
                    <b className="text-primary">{sel.pct}%</b> · 완료 {sel.done}/{sel.total}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] text-[#76777c]">
                  계획한 {sel.total}개의 할 일 중 {sel.done}개를 완료했어요.
                </p>
              </>
            ) : (
              <strong className="text-sm">선택한 항목에는 기록이 없어요</strong>
            )}
          </div>
        </>
      ) : (
        <EmptyState className="mt-3" icon="chart" title="이 기간에는 기록이 없어요" description="할 일을 완료하거나 다른 기간을 선택해 보세요." />
      )}
    </section>
  );
}
