"use client";

import {
  DUE_MODE_OPTIONS,
  EFFORT_OPTIONS,
  IMPORTANCE_LABEL,
  type DueMode,
} from "@/lib/constants";
import { formatDotDate, formatKoreanTime } from "@/lib/date";
import type { Effort, Importance } from "@/lib/types";
import { CalendarIcon, DueTimeField } from "./DueSheet";
import { OptionChip } from "./ui";

export interface ConditionValue {
  importance: Importance;
  effort: Effort | null;
  dueMode: DueMode;
  dueDate: string | null;
  dueTime: string | null;
  /** 사용자가 '날짜 지정'에서 직접 고른 날짜·시간. 오늘까지로 잠시 바꿨다가 돌아올 때만 복원하고, 오늘 날짜를 자동으로 채우지 않는다 */
  customDate: string | null;
  customTime: string | null;
}

export const DEFAULT_CONDITION: ConditionValue = {
  importance: "medium",
  effort: null,
  dueMode: "none",
  dueDate: null,
  dueTime: null,
  customDate: null,
  customTime: null,
};

const IMPORTANCE_VALUES: Importance[] = ["low", "medium", "high"];

export const conditionLabel = "mb-2 block text-xs font-semibold text-[#707277]";
const fieldClass =
  "w-full rounded-xl border border-[#e3e3e5] bg-white px-3 py-2.5 text-sm focus:border-selected";

/** 편집 값 → 저장할 완료 기한. 날짜가 없으면 시간도 없다(시간만 저장되지 않는다) */
export function dueFromCondition(
  c: ConditionValue,
  today: string,
): { dueDate: string | null; dueTime: string | null } {
  const dueDate =
    c.dueMode === "today" ? today : c.dueMode === "custom" ? c.dueDate : null;
  return { dueDate, dueTime: dueDate ? c.dueTime : null };
}

/**
 * 중요도 / 예상 소요시간 / 완료 기한 선택 (신규 등록과 할 일 수정이 함께 쓴다).
 * '오늘까지'는 바로 아래에서 마감 시간을 선택적으로 추가하고, '날짜 지정'은 날짜 필드를 누르면 같은 시트 안의 완료 기한 화면(onOpenDue)으로 전환된다.
 */
export default function ConditionFields({
  value,
  onChange,
  today,
  onOpenDue,
}: {
  value: ConditionValue;
  onChange: (next: ConditionValue) => void;
  today: string;
  /** '날짜 지정' 날짜 필드를 눌렀을 때: 같은 시트 안에서 완료 기한 화면으로 전환 */
  onOpenDue: () => void;
}) {
  // 화면에 보이지 않는 값이 남지 않게 한다.
  // 없음 → 날짜·시간·직접 지정 기억을 모두 해제 / 오늘까지 → 오늘 날짜, 시간은 해제(이후 추가) / 날짜 지정 → 직접 고른 값만 복원(없으면 비어 있음)
  const selectDue = (mode: DueMode) => {
    if (mode === value.dueMode) return;
    const wasCustom = value.dueMode === "custom";
    const mem = wasCustom
      ? { customDate: value.dueDate, customTime: value.dueTime }
      : { customDate: value.customDate, customTime: value.customTime };
    if (mode === "none")
      onChange({
        ...value,
        dueMode: mode,
        dueDate: null,
        dueTime: null,
        customDate: null,
        customTime: null,
      });
    else if (mode === "today")
      onChange({
        ...value,
        ...mem,
        dueMode: mode,
        dueDate: today,
        dueTime: null,
      });
    else
      onChange({
        ...value,
        dueMode: mode,
        dueDate: mem.customDate,
        dueTime: mem.customDate ? mem.customTime : null,
      });
  };

  return (
    <>
      <div>
        <span className={conditionLabel}>중요도</span>
        <div className="flex flex-wrap gap-[6px]">
          {IMPORTANCE_VALUES.map((v) => (
            <OptionChip
              size="condition"
              key={v}
              selected={value.importance === v}
              onClick={() => onChange({ ...value, importance: v })}
            >
              {IMPORTANCE_LABEL[v]}
            </OptionChip>
          ))}
        </div>
      </div>

      <div>
        <span className={conditionLabel}>예상 소요시간</span>
        <div className="flex flex-wrap gap-[6px]">
          {EFFORT_OPTIONS.map((o) => (
            <OptionChip
              size="condition"
              key={o.value}
              selected={value.effort === o.value}
              onClick={() => onChange({ ...value, effort: o.value })}
            >
              {o.label}
            </OptionChip>
          ))}
          <OptionChip
            size="condition"
            selected={value.effort === null}
            onClick={() => onChange({ ...value, effort: null })}
          >
            미정
          </OptionChip>
        </div>
      </div>

      <div>
        <span className={conditionLabel}>완료 기한</span>
        <div className="flex flex-wrap gap-[6px]">
          {DUE_MODE_OPTIONS.map((o) => (
            <OptionChip
              size="condition"
              key={o.value}
              selected={value.dueMode === o.value}
              onClick={() => selectDue(o.value)}
            >
              {o.label}
            </OptionChip>
          ))}
        </div>
        {value.dueMode === "custom" && (
          <button
            type="button"
            onClick={onOpenDue}
            aria-haspopup="dialog"
            aria-label="완료 기한 날짜 선택"
            className={`${fieldClass} mt-2 flex items-center justify-between gap-2 whitespace-nowrap text-left`}
          >
            <span
              className={`min-w-0 truncate ${value.dueDate ? "" : "text-[#9b9ca3]"}`}
            >
              {value.dueDate
                ? `${formatDotDate(value.dueDate)}${value.dueTime ? ` ${formatKoreanTime(value.dueTime)}` : ""}`
                : "완료 기한을 선택해 주세요"}
            </span>
            <span className="shrink-0 text-subtle">
              <CalendarIcon />
            </span>
          </button>
        )}
        {value.dueMode === "today" && (
          <DueTimeField
            time={value.dueTime}
            onChange={(t) => onChange({ ...value, dueTime: t })}
            className="mt-2"
            rowHeight="h-[42px]"
          />
        )}
      </div>
    </>
  );
}
