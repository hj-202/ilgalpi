import { MAX_WARNINGS } from "../constants";
import { daysUntilDue, formatDueChip, minutesUntilDue } from "../date";
import { formatMinutes, truncate } from "../format";
import type { Importance, Project, RecommendationResult, Task } from "../types";

export interface BasicInput {
  /** 추천 대상 날짜의 미완료 작업 */
  tasks: Task[];
  /** 미완료 작업이 있는 프로젝트 */
  projects: Project[];
  /** 이날 작업 가능한 시간(분). 순위 기준이 아니라 주의사항 판단에만 쓴다 */
  availableMinutes: number;
  /** 사용자 로컬 '오늘' */
  today: string;
  /** 사용자 로컬 현재 시각 "HH:mm" (오늘 마감 시각 판단용, 선택) */
  nowTime?: string;
}

const IMPORTANCE_SCORE: Record<Importance, number> = { high: 60, medium: 35, low: 10 };
const IMPORTANCE_ORDER: Record<Importance, number> = { high: 0, medium: 1, low: 2 };
const EFFORT_ORDER = { short: 0, medium: 1, long: 2 } as const;

function urgencyScore(d: number | null): number {
  if (d === null) return 20; // 마감 없음을 최하위로 고정하지 않음
  if (d < 0) return 100;
  if (d === 0) return 90;
  if (d === 1) return 75;
  if (d <= 3) return 55;
  if (d <= 7) return 35;
  if (d <= 14) return 20;
  return 10;
}

type Scored = {
  task: Task;
  d: number | null;
  scoreD: number | null;
  score: number;
  chip: string | null;
  imp: number;
  left: number | null;
};

const SIZE_ORDER = (t: Task) => (t.effort ? EFFORT_ORDER[t.effort] : 1);

/**
 * 이 작업의 판단 근거(마감 → 중요도)를 짧게 설명한다. 순위는 화면에 이미 보이므로 순위 자체는 말하지 않는다.
 * 조건 유형(지남·오늘·내일·며칠·일주일·여유·없음)에 따라 문장 구조가 달라진다. 숫자·날짜는 쓰지 않는다(칩에 있다).
 * 점수·동점 정렬에 쓰이지 않은 조건(작업 가능 시간 등)이나 근거 없는 행동 제안은 넣지 않는다.
 * `nearest`: 같은 중요도 작업 중 마감이 가장 가까운지(점수에서 같은 중요도끼리 긴급도가 앞선다는 뜻)
 */
function ownBasis(x: Scored, nearest: boolean): string {
  const { task, d, scoreD, chip, left } = x;
  const high = task.importance === "high";
  const impTail = task.importance === "medium" ? "보통이에요" : "낮아요";
  if (d !== null && d < 0) return "마감이 지났어요. 일정을 확인해 보세요.";
  if (chip === "마감 지남") return "오늘 마감 시간이 지났어요. 상황을 확인해 보세요.";
  if (d === 0) {
    if (left !== null && left <= 180) return high ? "오늘 마감 시각이 가까운 중요한 작업이에요." : "오늘 마감 시각이 가까워요.";
    return high ? "오늘까지 끝내야 하는 중요한 작업이에요." : "오늘까지 끝내야 하는 작업이에요.";
  }
  if (d === 1) return high ? "내일까지 끝내야 하는 중요한 작업이에요." : "내일까지 끝내야 해요.";
  if (scoreD !== null && scoreD <= 3) {
    if (high) return "며칠 안에 끝내야 하는 중요한 작업이에요.";
    return nearest ? "기한이 며칠 남지 않았고, 같은 중요도 작업 중 가장 빨라요." : `기한이 며칠 남지 않았지만 중요도는 ${impTail}.`;
  }
  if (scoreD !== null && scoreD <= 7) {
    if (high) return "일주일 안에 끝내야 하는 중요한 작업이에요.";
    return nearest ? "일주일 안에 끝내면 되고, 같은 중요도 작업 중 가장 빨라요." : `일주일 안에 끝내면 되고, 중요도는 ${impTail}.`;
  }
  if (scoreD !== null) {
    if (high) return "기한은 여유 있지만 중요도가 높은 작업이에요.";
    return task.importance === "medium" ? "기한에 여유가 있고 중요도는 보통이에요." : "기한에 여유가 있고 중요도도 낮아요.";
  }
  if (high) return "기한은 없지만 중요도가 높은 작업이에요.";
  return task.importance === "medium" ? "기한이 없고 중요도는 보통이에요." : "기한이 없고 중요도도 낮아요.";
}

/**
 * 규모는 점수에서 '마감이 가까운 큰 작업의 조기 착수 가점'과 동점 정렬에만 쓰인다.
 * 가점이 실제로 붙은 경우에만 언급하고, 동점 정렬에 쓰인 경우는 tieNote가 말한다.
 */
function sizeNote(x: Scored): string | null {
  return x.task.effort === "long" && x.scoreD !== null && x.scoreD <= 3 ? "규모가 커서 먼저 시작해 부담을 나눠보세요." : null;
}

const ORDER_NOTE = "정렬 기준이 같아 등록 순서를 따랐어요.";
const TIE_PREFIX = "조건이 비슷한 작업 중";

/** 점수가 같은 a(앞)·b(뒤)를 실제로 가른 정렬 기준: 마감일 → (중요도) → 규모 → 등록순 */
function tieFactor(a: Scored, b: Scored): "due" | "size" | "order" {
  if (a.scoreD !== b.scoreD) return "due";
  if (SIZE_ORDER(a.task) !== SIZE_ORDER(b.task)) return "size";
  return "order";
}

/**
 * 동점 정렬이 이 작업의 자리에 영향을 준 경우, 실제로 갈린 기준을 그대로 말한다.
 * 이긴 쪽(뒤 작업과 점수가 같은 앞 작업)에 붙이고, 등록순으로만 갈린 경우는 뒤 작업에도 같은 안내를 붙인다.
 * (점수가 같고 마감일 구간도 같으면 중요도는 항상 같아서 중요도 기준은 따로 두지 않는다)
 */
function tieNote(cur: Scored, prev: Scored | null, next: Scored | null): string | null {
  if (next && next.score === cur.score) {
    const kind = tieFactor(cur, next);
    if (kind === "due") return `${TIE_PREFIX} 더 일찍 끝내야 해요.`;
    if (kind === "size") return `${TIE_PREFIX} 규모가 더 작아요.`;
    return ORDER_NOTE;
  }
  if (prev && prev.score === cur.score && tieFactor(prev, cur) === "order") return ORDER_NOTE;
  return null;
}

/** 같은 중요도 작업 중 마감이 가장 가까운가(마감이 지난 작업과 비교 대상이 없는 경우는 제외) */
function isNearestAmongPeers(cur: Scored, all: Scored[]): boolean {
  if (cur.scoreD === null || cur.scoreD < 2) return false; // 오늘·내일·지남은 기본 문장이 이미 급함을 말한다
  const peers = all.filter((p) => p !== cur && p.task.importance === cur.task.importance);
  const key = (p: Scored) => p.scoreD ?? Number.POSITIVE_INFINITY;
  return peers.length > 0 && !peers.some((p) => key(p) <= cur.scoreD!) && peers.some((p) => key(p) > cur.scoreD!);
}

function explain(cur: Scored, prev: Scored | null, next: Scored | null, all: Scored[]): string {
  const tie = tieNote(cur, prev, next);
  // 마감일로 동점이 갈린 경우는 그 근거가 비교 문장을 대신한다
  const nearest = tie?.includes("더 일찍") ? false : isNearestAmongPeers(cur, all);
  let text = ownBasis(cur, nearest);
  for (const extra of [tie, sizeNote(cur)]) {
    if (extra && text.length + extra.length + 1 <= 88) text += ` ${extra}`;
  }
  return text;
}

const q = (title: string) => `‘${truncate(title, 30)}’`;

/** 규칙 기반 기본 추천. AI 분석이 아니며 입력된 조건(마감·중요도·규모)만으로 설명한다. */
export function basicRecommend(input: BasicInput): RecommendationResult {
  const { tasks, projects, availableMinutes, today, nowTime } = input;

  const scored = tasks.map((task) => {
    const d = daysUntilDue(task.dueDate, today);
    const chip = formatDueChip(task.dueDate, task.dueTime, today, nowTime);
    // 오늘 마감 시각이 이미 지났다면 점수에서는 마감 지남으로 취급(문구는 실제 d 기준)
    const scoreD = d === 0 && chip === "마감 지남" ? -1 : d;
    const left = minutesUntilDue(task.dueDate, task.dueTime, today, nowTime);
    // 시각이 있는 오늘 마감이 3시간 안이면 날짜만 있는 오늘 마감보다 조금 더 급하게 본다
    const timeBonus = d === 0 && left !== null && left <= 180 ? 5 : 0;
    // 규모가 큰 작업은 마감이 가까울수록 일찍 착수해야 하므로 가점. 미정은 가감 없음
    const earlyStart = task.effort === "long" && scoreD !== null && scoreD <= 3 ? 5 : 0;
    const score = urgencyScore(scoreD) + timeBonus + earlyStart + IMPORTANCE_SCORE[task.importance];
    return { task, d, scoreD, score, chip, imp: IMPORTANCE_SCORE[task.importance], left };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.scoreD ?? Number.POSITIVE_INFINITY;
    const db = b.scoreD ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const ia = IMPORTANCE_ORDER[a.task.importance] - IMPORTANCE_ORDER[b.task.importance];
    if (ia !== 0) return ia;
    const ea = a.task.effort ? EFFORT_ORDER[a.task.effort] : 1;
    const eb = b.task.effort ? EFFORT_ORDER[b.task.effort] : 1;
    if (ea !== eb) return ea - eb;
    return a.task.createdAt.localeCompare(b.task.createdAt);
  });

  const rankOf = new Map<string, number>();

  // 이유는 '왜 이 순위인가'를 설명한다. 점수·정렬에 실제로 쓰인 값(마감·중요도·규모·동점 기준)만 근거로 쓰고,
  // 순위를 바꾸지 않는다. 입력에서 확인되지 않는 사실이나 점수에 쓰이지 않은 조건은 근거로 삼지 않는다.
  const taskRankings = scored.map((cur, i) => {
    rankOf.set(cur.task.id, i + 1);
    return { taskId: cur.task.id, rank: i + 1, reason: explain(cur, scored[i - 1] ?? null, scored[i + 1] ?? null, scored) };
  });

  // 프로젝트 순위
  const projectStats = projects.map((project) => {
    const own = scored.filter((s) => s.task.projectId === project.id);
    const top = own.reduce((best, s) =>
      rankOf.get(s.task.id)! < rankOf.get(best.task.id)! ? s : best,
    );
    return {
      project,
      top,
      bestRank: rankOf.get(top.task.id)!,
      urgentCount: own.filter((s) => s.d !== null && s.d <= 3).length,
      highCount: own.filter((s) => s.task.importance === "high").length,
    };
  });
  projectStats.sort(
    (a, b) =>
      a.bestRank - b.bestRank || b.urgentCount - a.urgentCount || b.highCount - a.highCount,
  );
  const projectRankings = projectStats.map((s, i) => {
    let reason = `가장 앞선 작업: ${q(s.top.task.title)}(${s.bestRank}순위)`;
    if (s.urgentCount > 0) reason += ` · 3일 안에 마감되는 작업 ${s.urgentCount}개`;
    return { projectId: s.project.id, rank: i + 1, reason };
  });

  // 주의사항: 마감 지남, 이날 작업 시간이 2시간 미만인데 큰 작업이 있는 경우
  const warnings: string[] = [];
  const overdue = scored.filter((s) => s.scoreD !== null && s.scoreD < 0).length;
  if (overdue > 0) warnings.push(`마감이 지난 작업이 ${overdue}개 있어요. 일정을 다시 확인해 보세요.`);
  if (availableMinutes < 120) {
    for (const s of scored) {
      if (s.task.effort === "long") {
        warnings.push(
          `${q(s.task.title)}은(는) 2시간을 넘을 수 있어요. 이날 작업 가능 시간(${formatMinutes(availableMinutes)})보다 길 수 있으니 따로 시간을 확보해 보세요.`,
        );
      }
    }
  }

  return {
    projectRankings,
    taskRankings,
    warnings: warnings.slice(0, MAX_WARNINGS),
  };
}
