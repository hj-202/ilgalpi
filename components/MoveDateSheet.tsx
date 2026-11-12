"use client";

import { useState } from "react";
import {
  addMonths,
  formatMonthDay,
  formatYearMonth,
  monthGrid,
  WEEKDAY_SHORT_SUN_FIRST,
} from "@/lib/date";
import BottomSheet, { SheetBody, useSheetClose } from "./BottomSheet";
import { ChevronIcon, HeaderCloseButton, GhostButton, PrimaryButton } from "./ui";

/**
 * 할 일 한 개를 다른 작업 날짜로 옮기는 바텀시트. 완료 기한(DueSheet)과 별개로 '할 일이 표시되는 날짜'만 고른다.
 * 선택 중인 날짜는 시트 안의 임시 상태이고 `이동하기`를 눌러야 onMove가 호출된다. 현재 날짜와 같으면 이동할 수 없다.
 */
function MoveBody({
  current,
  today,
  onMove,
}: {
  /** 할 일이 지금 등록된 작업 날짜 */
  current: string;
  today: string;
  onMove: (date: string) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [month, setMonth] = useState(current);

  const close = useSheetClose();

  return (
    <>
      <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-3">
        <h3 id="move-sheet-title" className="text-lg font-bold">
          이동할 날짜 선택
        </h3>
        <HeaderCloseButton onClick={close} />
      </div>

      <SheetBody>
        <div className="px-5 pb-3">
          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="이전 달"
              className="grid h-10 w-10 place-items-center rounded-full text-subtle hover:bg-chip"
            >
              <ChevronIcon dir="left" size={20} />
            </button>
            <strong className="text-[15px]">{formatYearMonth(month)}</strong>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
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
                const picked = d === target;
                const isCurrent = d === current;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={picked}
                    aria-label={`${formatMonthDay(d)}${isCurrent ? " (현재 날짜)" : ""}`}
                    aria-current={d === today ? "date" : undefined}
                    onClick={() => setTarget(isCurrent ? null : d)}
                    className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-[15px] ${
                      picked
                        ? "bg-primary font-bold text-white"
                        : isCurrent
                          ? "bg-chip font-bold text-ink"
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

          <div
            className="mt-3 flex items-center gap-1.5 text-xs text-[#85878d]"
            aria-hidden
          >
            <span className="inline-block h-3 w-3 rounded-full bg-chip ring-1 ring-[#dedee1]" />
            현재 날짜
          </div>
          <p className="mt-2 min-h-5 text-sm font-semibold" aria-live="polite">
            {target ? (
              <span className="text-primary-dark">
                {formatMonthDay(current)} → {formatMonthDay(target)}로 이동해요
              </span>
            ) : (
              <span className="font-normal text-subtle">
                이동할 날짜를 선택해 주세요
              </span>
            )}
          </p>
        </div>
      </SheetBody>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <GhostButton type="button" onClick={close} className="min-h-12 flex-1">
          취소
        </GhostButton>
        <PrimaryButton
          type="button"
          disabled={!target}
          onClick={() => {
            if (!target || target === current) return;
            onMove(target);
            close();
          }}
          className="min-h-12 flex-1"
        >
          이동하기
        </PrimaryButton>
      </div>
    </>
  );
}

export default function MoveDateSheet(props: {
  current: string;
  today: string;
  onMove: (date: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet labelledBy="move-sheet-title" onClose={props.onClose}>
      <MoveBody
        current={props.current}
        today={props.today}
        onMove={props.onMove}
      />
    </BottomSheet>
  );
}
