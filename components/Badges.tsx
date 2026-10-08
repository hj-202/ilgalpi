import { IMPORTANCE_LABEL } from "@/lib/constants";
import { daysUntilDue, formatShortDate } from "@/lib/date";
import type { Importance, RecommendationType } from "@/lib/types";

const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const IMPORTANCE_STYLE: Record<Importance, string> = {
  high: "bg-indigo-600 text-white",
  medium: "bg-indigo-100 text-indigo-800",
  low: "bg-slate-100 text-slate-600",
};

export function ImportanceBadge({ importance }: { importance: Importance }) {
  return (
    <span className={`${base} ${IMPORTANCE_STYLE[importance]}`}>
      중요도 {IMPORTANCE_LABEL[importance]}
    </span>
  );
}

export function dueLabel(dueDate: string | null, today: string): { text: string; style: string } {
  const d = daysUntilDue(dueDate, today);
  if (d === null || dueDate === null) return { text: "마감 없음", style: "bg-slate-100 text-slate-500" };
  if (d < 0) return { text: `마감 지남 · D+${-d}`, style: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" };
  if (d === 0) return { text: "오늘 마감", style: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" };
  if (d === 1) return { text: "내일 마감", style: "bg-amber-50 text-amber-800 ring-1 ring-amber-200" };
  if (d <= 7) return { text: `D-${d}`, style: "bg-yellow-50 text-yellow-800" };
  return { text: `D-${d} · ${formatShortDate(dueDate)}`, style: "bg-slate-100 text-slate-600" };
}

export function DueBadge({ dueDate, today }: { dueDate: string | null; today: string }) {
  const { text, style } = dueLabel(dueDate, today);
  return <span className={`${base} ${style}`}>{text}</span>;
}

export function RecommendationTypeBadge({ type }: { type: RecommendationType }) {
  return type === "ai" ? (
    <span className={`${base} bg-indigo-600 text-white`}>AI 추천</span>
  ) : (
    <span className={`${base} bg-slate-200 text-slate-700`}>기본 추천 · AI 분석 아님</span>
  );
}
