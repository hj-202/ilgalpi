"use client";

import { useEffect, useState } from "react";
import { addMonths, daysBetween, formatDotDate, formatKoreanTime, formatYearMonth, monthGrid, WEEKDAY_SHORT_MON_FIRST } from "@/lib/date";
import { AMPM, HOURS, MINUTES, parseHm, Wheel } from "./TimeWheels";
import { ChevronIcon, CloseIcon, PrimaryButton } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");

/** 오전·오후 / 시 / 분 → "HH:mm" (24시간제). 오전 12시 = 00:00, 오후 12시 = 12:00 */
export function toHm(pm: number, hour: number, minute: number): string {
  return `${pad((hour % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
}

function ResetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5v4.8h4.8" />
    </svg>
  );
}

export function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function TimeWheels({ value, onChange }: { value: string; onChange: (hm: string) => void }) {
  const init = parseHm(value);
  const [pm, setPm] = useState(init.pm);
  const [hour, setHour] = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const emit = (p: number, h: number, m: number) => onChange(toHm(p, h, m));
  return (
    <div className="mt-3 flex gap-1">
      <Wheel label="오전·오후" items={AMPM} value={pm} onChange={(v) => { setPm(v); emit(v, hour, minute); }} />
      <Wheel label="시" items={HOURS} value={hour} onChange={(v) => { setHour(v); emit(pm, v, minute); }} />
      <Wheel label="분" items={MINUTES} value={minute} onChange={(v) => { setMinute(v); emit(pm, hour, v); }} />
    </div>
  );
}

/**
 * 마감 일정 바텀시트. 선택 중인 값은 시트 안의 임시 상태이고, `적용하기`를 눌러야 저장된다.
 * 닫기·배경 터치·Esc는 변경 없이 닫는다.
 */
export default function DueSheet({
  dueDate,
  dueTime,
  today,
  onApply,
  onClose,
}: {
  dueDate: string | null;
  dueTime: string | null;
  today: string;
  onApply: (v: { dueDate: string | null; dueTime: string | null }) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState<string | null>(dueDate);
  const [time, setTime] = useState<string | null>(dueDate ? dueTime : null);
  const [step, setStep] = useState<"date" | "time">("date");
  const [month, setMonth] = useState(dueDate ?? today);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canReset = date !== null || time !== null;
  const past = date !== null && daysBetween(today, date) < 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="due-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(92dvh,640px)] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <h3 id="due-sheet-title" className="text-lg font-bold">
            마감 일정
          </h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-2 grid h-11 w-11 place-items-center text-subtle">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
          {step === "date" ? (
            <>
              <section aria-label="마감일">
                {past && <p className="mt-1 text-xs text-[#767780]">이미 지난 날짜예요.</p>}

                <div className="mt-2 flex items-center justify-between">
                  <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="이전 달" className="grid h-10 w-10 place-items-center rounded-full text-subtle hover:bg-chip">
                    <ChevronIcon dir="left" size={20} />
                  </button>
                  <strong className="text-[15px]">{formatYearMonth(month)}</strong>
                  <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="다음 달" className="grid h-10 w-10 place-items-center rounded-full text-subtle hover:bg-chip">
                    <ChevronIcon dir="right" size={20} />
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-7 text-center text-xs text-[#85878d]" aria-hidden>
                  {WEEKDAY_SHORT_MON_FIRST.map((w) => (
                    <span key={w} className="py-1">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                  {monthGrid(month).flat().map((d, i) => {
                    if (!d) return <span key={i} />;
                    const selected = d === date;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={selected}
                        aria-label={formatDotDate(d)}
                        aria-current={d === today ? "date" : undefined}
                        onClick={() => setDate(d)}
                        className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-[15px] ${
                          selected ? "bg-primary font-bold text-white" : d === today ? "font-bold text-primary ring-1 ring-primary/50" : "text-ink hover:bg-chip"
                        }`}
                      >
                        {Number(d.slice(8))}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-label="마감 시간" className="mt-3 flex min-h-[48px] items-center justify-between border-t border-line pt-2">
                <span className="text-sm font-bold">마감 시간</span>
                {time ? (
                  <span className="flex items-center">
                    <button type="button" onClick={() => setStep("time")} aria-label={`마감 시간 ${formatKoreanTime(time)} 수정`} className="min-h-[44px] px-2 text-sm font-bold">
                      {formatKoreanTime(time)}
                    </button>
                    <button type="button" onClick={() => setTime(null)} aria-label="마감시간 삭제" className="grid h-11 w-11 place-items-center text-subtle hover:text-ink">
                      <CloseIcon size={16} />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!date}
                    onClick={() => {
                      setTime("18:00");
                      setStep("time");
                    }}
                    className="min-h-[44px] px-2 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:text-[#c3c4ca]"
                  >
                    + 추가
                  </button>
                )}
              </section>
              {!date && <p className="text-xs text-[#85878d]">마감일을 먼저 선택하면 시간을 추가할 수 있어요.</p>}
            </>
          ) : (
            <section aria-label="마감 시간 선택">
              <button type="button" onClick={() => setStep("date")} className="-ml-2 inline-flex min-h-[44px] items-center gap-0.5 px-2 text-sm font-bold">
                <ChevronIcon dir="left" size={18} />
                <span className="whitespace-nowrap">{date ? formatDotDate(date) : ""}</span>
              </button>
              <p className="text-sm text-subtle">마감 시간</p>
              <TimeWheels value={time ?? "18:00"} onChange={setTime} />
            </section>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            aria-label="마감 초기화"
            title="마감 초기화"
            disabled={!canReset}
            onClick={() => {
              setDate(null);
              setTime(null);
              setStep("date");
            }}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ResetIcon />
          </button>
          <PrimaryButton type="button" onClick={() => onApply({ dueDate: date, dueTime: date ? time : null })} className="min-h-12 flex-1">
            적용하기
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
