"use client";

import { useRef, useState } from "react";
import { addDays, addMonths, formatYearMonth, monthGrid, WEEKDAY_SHORT_MON_FIRST, weekDays } from "@/lib/date";
import { computeDayStats, type DayStat } from "@/lib/stats";
import type { Task } from "@/lib/types";
import { ChevronIcon, Stamp } from "./ui";

function Progress({ stat }: { stat: DayStat | undefined }) {
  // 할 일이 없는 날짜는 표시하지 않는다(0/0·—·점 없음). 행 높이는 유지한다
  if (!stat || stat.total === 0) return <span aria-hidden className="h-[18px]" />;
  if (stat.done === stat.total) return <Stamp size={18} label={null} />;
  return (
    <span className="text-xs leading-[18px] text-subtle">
      {stat.done}/{stat.total}
    </span>
  );
}

function DayCell({
  ymd,
  selected,
  today,
  stat,
  compact,
  onSelect,
}: {
  ymd: string;
  selected: boolean;
  today: string;
  stat: DayStat | undefined;
  compact: boolean;
  onSelect: (ymd: string) => void;
}) {
  const day = Number(ymd.slice(8));
  const isToday = ymd === today;
  const summary = !stat || stat.total === 0 ? "할 일 없음" : stat.done === stat.total ? `모두 완료 ${stat.done}/${stat.total}` : `${stat.done}/${stat.total} 완료`;
  return (
    <button
      type="button"
      onClick={() => onSelect(ymd)}
      aria-pressed={selected}
      aria-label={`${ymd.replaceAll("-", ".")}${isToday ? " 오늘" : ""}, ${summary}`}
      className={`flex w-full flex-col items-center justify-start gap-0.5 rounded-xl py-px ${compact ? "min-h-[52px]" : "min-h-[56px]"}`}
    >
      <span
        className={`flex items-center justify-center rounded-full text-sm ${compact ? "h-[26px] w-[26px]" : "h-[30px] w-[30px]"} ${
          selected ? "bg-primary font-semibold text-white" : isToday ? "font-extrabold text-ink" : "font-medium text-ink"
        }`}
      >
        {day}
      </span>
      <Progress stat={stat} />
    </button>
  );
}

export default function Calendar({
  tasks,
  selected,
  today,
  onSelect,
}: {
  tasks: Task[];
  selected: string;
  today: string;
  onSelect: (ymd: string) => void;
}) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(selected);
  const [prevSelected, setPrevSelected] = useState(selected);
  // 선택 날짜가 바깥(예: 지난 기록에서 이동)에서 바뀌면 표시 구간도 따라간다
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setAnchor(selected);
  }

  const stats = computeDayStats(tasks);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const move = (dir: 1 | -1) => setAnchor((a) => (mode === "week" ? addDays(a, dir * 7) : addMonths(a, dir)));

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  };

  const navBtn = "flex h-10 w-10 items-center justify-center rounded-lg text-[#777] hover:bg-surface-muted";

  return (
    <section aria-label="캘린더" className="rounded-[19px] border border-line bg-white px-3 pb-3 pt-3.5 shadow-[0_2px_8px_rgba(15,17,19,0.03)]">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} className={navBtn} aria-label={mode === "week" ? "이전 주" : "이전 달"}>
          <ChevronIcon dir="left" />
        </button>
        <h2 className="text-sm font-bold">{formatYearMonth(anchor)}</h2>
        <button type="button" onClick={() => move(1)} className={navBtn} aria-label={mode === "week" ? "다음 주" : "다음 달"}>
          <ChevronIcon dir="right" />
        </button>
      </div>

      <div className="mb-2 mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {selected !== today && (
            <button type="button" onClick={() => onSelect(today)} className="rounded-full bg-chip px-2.5 py-1 text-xs text-[#65676e]">
              오늘
            </button>
          )}
        </div>
        <div role="group" aria-label="보기 방식" className="flex gap-0.5 rounded-xl bg-[#f5f5f6] p-[3px]">
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
              onClick={() => setMode(key)}
              className={`min-h-8 rounded-[9px] px-3 text-[13px] ${mode === key ? "bg-white font-bold text-ink shadow-[0_1px_5px_rgba(0,0,0,0.05)]" : "text-[#7b7c82]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="touch-pan-y" onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })} onTouchEnd={onTouchEnd}>
        <div className="mb-1.5 grid grid-cols-7 gap-[3px] text-center text-xs text-[#85878d]">
          {WEEKDAY_SHORT_MON_FIRST.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        {mode === "week" ? (
          <div className="grid grid-cols-7 gap-[3px]">
            {weekDays(anchor).map((ymd) => (
              <DayCell key={ymd} ymd={ymd} selected={ymd === selected} today={today} stat={stats.get(ymd)} compact={false} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-[3px]">
            {monthGrid(anchor).map((week, i) => (
              <div key={i} className="grid grid-cols-7 gap-[3px]">
                {week.map((ymd, j) =>
                  ymd ? (
                    <DayCell key={ymd} ymd={ymd} selected={ymd === selected} today={today} stat={stats.get(ymd)} compact onSelect={onSelect} />
                  ) : (
                    <span key={`e${j}`} />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
