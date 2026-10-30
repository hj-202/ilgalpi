import { EFFORT_OPTIONS } from "../constants";

/** AI가 입력에 없는 날짜·시각·소요시간을 지어내지 않았는지 검사하기 위한 사실 집합 */
export interface Facts {
  /** "M-D" 형태 (예: "10-21") */
  dates: Set<string>;
  /** "HH:mm" */
  times: Set<string>;
  /** "30분", "2시간" 같은 지속시간 표기 */
  durations: Set<string>;
}

const md = (ymd: string) => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}-${d}`;
};

function addDuration(set: Set<string>, minutes: number) {
  if (minutes <= 0) return;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  set.add(`${minutes}분`);
  if (h > 0) set.add(`${h}시간`);
  if (m > 0) set.add(`${m}분`);
}

export function buildFacts(input: {
  currentDate: string;
  currentTime?: string | null;
  planDate: string;
  availableMinutes: number;
  tasks: Array<{ dueDate: string | null; dueTime: string | null; minutesUntilDue?: number | null }>;
}): Facts {
  const dates = new Set<string>([md(input.currentDate), md(input.planDate)]);
  const times = new Set<string>();
  const durations = new Set<string>();
  if (input.currentTime) times.add(input.currentTime);
  // 규모 옵션 라벨(1시간 이내, 1~2시간, 2시간 초과)에 나오는 숫자는 허용
  for (const o of EFFORT_OPTIONS) for (const m of o.label.matchAll(/(\d+)\s*(분|시간)/g)) durations.add(`${m[1]}${m[2]}`);
  addDuration(durations, input.availableMinutes);
  for (const t of input.tasks) {
    if (t.dueDate) dates.add(md(t.dueDate));
    if (t.dueTime) times.add(t.dueTime);
    if (typeof t.minutesUntilDue === "number") addDuration(durations, Math.abs(t.minutesUntilDue));
  }
  return { dates, times, durations };
}

/** 문장에서 사실 집합에 없는 날짜·시각·지속시간 표현을 찾는다. 없으면 빈 배열. */
export function findUngrounded(text: string, facts: Facts): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    if (!facts.dates.has(`${Number(m[1])}-${Number(m[2])}`)) bad.push(m[0]);
  }
  for (const m of text.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g)) {
    if (!facts.dates.has(`${Number(m[1])}-${Number(m[2])}`)) bad.push(m[0]);
  }
  for (const m of text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)) {
    if (!facts.times.has(`${m[1].padStart(2, "0")}:${m[2]}`)) bad.push(m[0]);
  }
  for (const m of text.matchAll(/(\d+)\s*(분|시간)/g)) {
    if (!facts.durations.has(`${m[1]}${m[2]}`)) bad.push(m[0]);
  }
  return bad;
}
