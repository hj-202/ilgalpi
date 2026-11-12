"use client";

import { useEffect, useRef, useState } from "react";
import {
  addMonths,
  daysBetween,
  formatDotDate,
  formatKoreanTime,
  formatYearMonth,
  monthGrid,
  WEEKDAY_SHORT_SUN_FIRST,
} from "@/lib/date";
import { AMPM, HOURS, MINUTES, parseHm, toHm, Wheel } from "./TimeWheels";
import { ChevronIcon, CloseIcon } from "./ui";

/*
 * 완료 기한 편집 조각들. 별도 바텀시트가 아니라 조건 설정·할 일 수정 시트 안에서 화면만 바뀌며 쓰인다(ConditionSheet.tsx).
 * 선택값은 호출하는 쪽의 임시 상태이고, `적용하기`를 눌러야 편집 중인 조건에 반영된다.
 */

export function ResetIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5v4.8h4.8" />
    </svg>
  );
}

export function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

/** 오전·오후 / 시 / 분 3컬럼 휠(선택값 중심 3줄만 보이는 컴팩트 높이) */
function CompactWheels({
  value,
  onChange,
}: {
  value: string;
  onChange: (hm: string) => void;
}) {
  const init = parseHm(value);
  const [pm, setPm] = useState(init.pm);
  const [hour, setHour] = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const emit = (p: number, h: number, m: number) => onChange(toHm(p, h, m));
  const H = 120;
  return (
    <div className="flex gap-1">
      <Wheel
        viewH={H}
        label="오전·오후"
        items={AMPM}
        value={pm}
        onChange={(v) => {
          setPm(v);
          emit(v, hour, minute);
        }}
      />
      <Wheel
        viewH={H}
        label="시"
        items={HOURS}
        value={hour}
        onChange={(v) => {
          setHour(v);
          emit(pm, v, minute);
        }}
      />
      <Wheel
        viewH={H}
        label="분"
        items={MINUTES}
        value={minute}
        onChange={(v) => {
          setMinute(v);
          emit(pm, hour, v);
        }}
      />
    </div>
  );
}

/**
 * `마감 시간 / + 추가` 행. 시간은 선택 사항이라 기본은 미설정이고, `+ 추가`를 누르면 바로 아래에 휠이 펼쳐진다.
 * 설정되면 `마감 시간 / 오후 6:00 / ×`: 시간을 누르면 휠을 다시 열고, ×는 시간만 지운다.
 * 날짜가 없으면(disabled) 시간을 추가할 수 없다.
 */
export function DueTimeField({
  time,
  onChange,
  disabled = false,
  className = "",
  rowHeight = "min-h-[48px]",
}: {
  time: string | null;
  onChange: (time: string | null) => void;
  disabled?: boolean;
  className?: string;
  /** 행 높이 클래스. 조건 화면에서는 날짜 선택 입력창(42px)과 같게 맞춘다 */
  rowHeight?: string;
}) {
  const [open, setOpen] = useState(false);
  const wheel = useRef<HTMLDivElement>(null);
  const expanded = open && time !== null;

  useEffect(() => {
    if (!expanded) return;
    // 시트 높이가 늘어난 뒤 휠이 보이도록 본문을 아래로 맞춘다
    const id = setTimeout(
      () =>
        wheel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      210,
    );
    return () => clearTimeout(id);
  }, [expanded]);

  return (
    <section aria-label="마감 시간" className={className}>
      <div className={`flex items-center justify-between ${rowHeight}`}>
        <span className="text-sm font-bold">마감 시간</span>
        {time ? (
          <span className="flex items-center">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(!expanded)}
              aria-label={`마감 시간 ${formatKoreanTime(time)} 수정`}
              className="min-h-[44px] text-sm font-bold"
            >
              {formatKoreanTime(time)}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChange(null);
              }}
              aria-label="마감 시간 삭제"
              className="-mr-2 grid h-11 w-8 place-items-center text-subtle hover:text-ink"
            >
              <CloseIcon size={16} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("18:00");
              setOpen(true);
            }}
            className="min-h-[44px] px-2 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:text-[#c3c4ca]"
          >
            + 추가
          </button>
        )}
      </div>
      {disabled && !time && (
        <p className="text-xs text-[#85878d]">
          날짜를 먼저 선택하면 시간을 추가할 수 있어요.
        </p>
      )}
      {expanded && (
        <div ref={wheel} className="sheet-view mt-1 pb-1">
          <CompactWheels value={time} onChange={onChange} />
        </div>
      )}
    </section>
  );
}

/** 월간 캘린더(기존 완료 기한 시트의 디자인·날짜 선택 그대로) */
export function DueCalendar({
  date,
  onSelect,
  month,
  onMonth,
  today,
}: {
  date: string | null;
  onSelect: (d: string) => void;
  month: string;
  onMonth: (m: string) => void;
  today: string;
}) {
  const past = date !== null && daysBetween(today, date) < 0;
  return (
    <section aria-label="완료 기한">
      {past && (
        <p className="mt-1 text-xs text-[#767780]">이미 지난 날짜예요.</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonth(addMonths(month, -1))}
          aria-label="이전 달"
          className="grid h-10 w-10 place-items-center rounded-full text-subtle hover:bg-chip"
        >
          <ChevronIcon dir="left" size={20} />
        </button>
        <strong className="text-[15px]">{formatYearMonth(month)}</strong>
        <button
          type="button"
          onClick={() => onMonth(addMonths(month, 1))}
          aria-label="다음 달"
          className="grid h-10 w-10 place-items-center rounded-full text-subtle hover:bg-chip"
        >
          <ChevronIcon dir="right" size={20} />
        </button>
      </div>
      <div
        className="mt-1 grid grid-cols-7 text-center text-xs text-[#85878d]"
        aria-hidden
      >
        {WEEKDAY_SHORT_SUN_FIRST.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {monthGrid(month)
          .flat()
          .map((d, i) => {
            if (!d) return <span key={i} />;
            const selected = d === date;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={selected}
                aria-label={formatDotDate(d)}
                aria-current={d === today ? "date" : undefined}
                onClick={() => onSelect(d)}
                className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-[15px] ${
                  selected
                    ? "bg-primary font-bold text-white"
                    : d === today
                      ? "font-bold text-primary ring-1 ring-primary/50"
                      : "text-ink hover:bg-chip"
                }`}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
      </div>
    </section>
  );
}
