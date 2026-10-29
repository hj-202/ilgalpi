import { addDays, addMonths, weekDays, weekStart } from "./date";
import type { Task } from "./types";

export interface DayStat {
  total: number;
  done: number;
}

/** 날짜별 완료/등록 수. 저장된 작업에서 매번 계산한다(별도 저장 없음). */
export function computeDayStats(tasks: Task[]): Map<string, DayStat> {
  const map = new Map<string, DayStat>();
  for (const t of tasks) {
    const stat = map.get(t.plannedDate) ?? { total: 0, done: 0 };
    stat.total += 1;
    if (t.isCompleted) stat.done += 1;
    map.set(t.plannedDate, stat);
  }
  return map;
}

export function pct(stat: DayStat | undefined): number | null {
  return stat && stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : null;
}

export type RecordMode = "week" | "month";

export interface Bar {
  key: string;
  label: string;
  /** 이 막대가 묶는 날짜 범위(해당 기간 안의 날짜만) */
  from: string;
  to: string;
  total: number;
  done: number;
  /** 할 일이 없으면 null (0%와 구분) */
  pct: number | null;
}

export interface RecordPeriod {
  mode: RecordMode;
  heading: string;
  from: string;
  to: string;
  bars: Bar[];
  /** 일별 완료율 산술평균. 할 일이 있는 날이 없으면 null */
  averagePct: number | null;
  completed: number;
  fullDays: number;
  hasRecords: boolean;
}

function monthLastDay(ymd: string): string {
  return addDays(addMonths(`${ymd.slice(0, 7)}-01`, 1), -1);
}

function sumRange(stats: Map<string, DayStat>, from: string, to: string) {
  let total = 0;
  let done = 0;
  const daily: number[] = [];
  let full = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const s = stats.get(d);
    if (!s || s.total === 0) continue;
    total += s.total;
    done += s.done;
    daily.push(s.done / s.total);
    if (s.done === s.total) full += 1;
  }
  return { total, done, daily, full };
}

const WEEK_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * 내 기록의 조회 기간 계산. offset은 기준일(anchor)이 속한 주/월에서의 이동량.
 * 집계 기준은 계획일(plannedDate). 평균 완료율 = 할 일이 있는 날들의 일별 완료율 산술평균.
 */
export function buildPeriod(tasks: Task[], mode: RecordMode, anchor: string, offset: number): RecordPeriod {
  const stats = computeDayStats(tasks);
  let from: string;
  let to: string;
  let heading: string;
  let bars: Bar[];

  if (mode === "week") {
    const start = addDays(weekStart(anchor), offset * 7);
    const days = weekDays(start);
    from = days[0];
    to = days[6];
    const f = from.split("-").map(Number);
    const t = to.split("-").map(Number);
    heading = `${f[1]}월 ${f[2]}일 ~ ${t[1]}월 ${t[2]}일`;
    bars = days.map((d, i) => {
      const s = stats.get(d) ?? { total: 0, done: 0 };
      return { key: d, label: WEEK_LABELS[i], from: d, to: d, ...s, pct: pct(s) };
    });
  } else {
    const first = `${addMonths(`${anchor.slice(0, 7)}-01`, offset)}`;
    from = first;
    to = monthLastDay(first);
    const [y, m] = first.split("-").map(Number);
    heading = `${y}년 ${m}월`;
    bars = [];
    let cursor = from;
    let n = 1;
    while (cursor <= to) {
      const weekEnd = addDays(weekStart(cursor), 6);
      const end = weekEnd < to ? weekEnd : to;
      const r = sumRange(stats, cursor, end);
      const s = { total: r.total, done: r.done };
      bars.push({ key: cursor, label: `${n}주차`, from: cursor, to: end, ...s, pct: pct(s) });
      cursor = addDays(end, 1);
      n += 1;
    }
  }

  const r = sumRange(stats, from, to);
  return {
    mode,
    heading,
    from,
    to,
    bars,
    averagePct: r.daily.length ? Math.round((r.daily.reduce((a, b) => a + b, 0) / r.daily.length) * 100) : null,
    completed: r.done,
    fullDays: r.full,
    hasRecords: r.total > 0,
  };
}

/** 최초 선택 막대: 완료율이 가장 높은 항목, 동률이면 가장 최근 */
export function defaultBarIndex(bars: Bar[]): number {
  let best = -1;
  bars.forEach((b, i) => {
    if (b.pct !== null && (best === -1 || b.pct >= (bars[best].pct as number))) best = i;
  });
  return best;
}

export interface DayRecord {
  date: string;
  total: number;
  done: number;
  pct: number;
}

/** 지난 실행 기록: 오늘까지, 할 일이 있는 날짜, 최신순 */
export function pastRecords(tasks: Task[], today: string): DayRecord[] {
  return [...computeDayStats(tasks).entries()]
    .filter(([d, s]) => d <= today && s.total > 0)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, s]) => ({ date, total: s.total, done: s.done, pct: Math.round((s.done / s.total) * 100) }));
}

export { weekStart };
