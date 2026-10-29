const DAY_MS = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 로컬 시간 기준 오늘 날짜 "YYYY-MM-DD" */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 로컬 현재 시각 "HH:mm" */
export function nowTimeLocal(now: Date = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = YMD.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

export function isValidHm(value: unknown): value is string {
  return typeof value === "string" && HM.test(value);
}

function toUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** to - from (일). 음수면 to가 과거 */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function daysUntilDue(dueDate: string | null, today: string): number | null {
  return dueDate ? daysBetween(today, dueDate) : null;
}

export function addDays(ymd: string, n: number): string {
  return fromUtc(toUtc(ymd) + n * DAY_MS);
}

/** 0=일 … 6=토 */
export function weekdayIndex(ymd: string): number {
  return new Date(toUtc(ymd)).getUTCDay();
}

/** 월요일 시작 주의 첫날 */
export function weekStart(ymd: string): string {
  return addDays(ymd, -((weekdayIndex(ymd) + 6) % 7));
}

export function weekDays(ymd: string): string[] {
  const start = weekStart(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

/** 월간 그리드: 월요일 시작, 해당 월 밖은 null */
export function monthGrid(ymd: string): Array<Array<string | null>> {
  const [y, m] = ymd.split("-").map(Number);
  const first = `${y}-${pad(m)}-01`;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (weekdayIndex(first) + 6) % 7;
  const cells: Array<string | null> = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const WEEKDAY_SHORT_MON_FIRST = ["월", "화", "수", "목", "금", "토", "일"];

/** "2026년 10월" */
export function formatYearMonth(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return `${y}년 ${m}월`;
}

/** "10월 20일" */
export function formatMonthDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** "2026.10.08 (목)" */
export function formatTodayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}.${pad(m)}.${pad(d)} (${WEEKDAYS[weekdayIndex(ymd)]})`;
}

/** "2026.10.21" — 상세 편집 패널의 정확한 날짜 */
export function formatExactDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}.${pad(m)}.${pad(d)}`;
}

/** "10/20" */
export function formatShortDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

/** ISO 시각 → "HH:mm" (로컬) */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 마감 칩 문구 (PRD v2 §5.2). 날짜를 숫자로 나열하지 않고 상대 날짜·요일 + 24시간제 시각을 쓴다.
 * 예: "오늘 18:10", "내일", "금요일 18:10", "다음 주 금요일", "11월 6일 15:00"
 * 마감이 없으면 null. nowTime을 주면 오늘 마감 시각이 지났는지도 판단한다.
 */
export function formatDueChip(
  dueDate: string | null,
  dueTime: string | null,
  today: string,
  nowTime?: string,
): string | null {
  if (!dueDate) return null;
  const d = daysBetween(today, dueDate);
  if (d < 0) return "마감 지남";
  if (d === 0 && dueTime && nowTime && dueTime < nowTime) return "마감 지남";

  let day: string;
  if (d === 0) day = "오늘";
  else if (d === 1) day = "내일";
  else {
    const thisWeek = weekStart(today);
    const dueWeek = weekStart(dueDate);
    const weekGap = daysBetween(thisWeek, dueWeek) / 7;
    const name = `${WEEKDAYS[weekdayIndex(dueDate)]}요일`;
    if (weekGap === 0) day = name;
    else if (weekGap === 1) day = `다음 주 ${name}`;
    else day = formatMonthDay(dueDate);
  }
  return dueTime ? `${day} ${dueTime}` : day;
}

/** 지금부터 마감 시각까지 남은 분. 시각이 없거나 현재 시각을 모르면 null */
export function minutesUntilDue(
  dueDate: string | null,
  dueTime: string | null,
  today: string,
  nowTime: string | undefined,
): number | null {
  if (!dueDate || !dueTime || !nowTime) return null;
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  return daysBetween(today, dueDate) * 1440 + toMin(dueTime) - toMin(nowTime);
}

/** "2026. 10. 30." — 마감 입력란·바텀시트의 날짜 표기 */
export function formatDotDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}. ${m}. ${d}.`;
}

/** "18:00" → "오후 6:00" (00:00은 오전 12:00, 12:00은 오후 12:00) */
export function formatKoreanTime(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  return `${h >= 12 ? "오후" : "오전"} ${h % 12 === 0 ? 12 : h % 12}:${pad(m)}`;
}
