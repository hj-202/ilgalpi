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
    return { task, d, scoreD, score, chip };
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

  // 이유는 '왜 지금 먼저 하면 좋은가'를 설명한다(태그 나열 금지). 입력에서 확인되는 근거만 쓴다.
  const hasLong = scored.some((s) => s.task.effort === "long");
  const taskRankings = scored.map(({ task, d, scoreD, chip }, i) => {
    rankOf.set(task.id, i + 1);
    const urgentNow = scoreD !== null && scoreD <= 1;
    const fitsTime =
      (task.effort === "short" && availableMinutes >= 60) || (task.effort === "medium" && availableMinutes >= 120);
    let reason: string;
    if (d !== null && d < 0) {
      reason = "마감이 지나 있어요. 가장 먼저 확인해 두면 부담을 덜 수 있어요.";
    } else if (chip === "마감 지남") {
      reason = "오늘 마감 시간이 지났어요. 먼저 상황을 확인해 두는 게 좋아요.";
    } else if (urgentNow && task.importance === "high") {
      reason = "마감이 가까운 중요한 일이에요. 먼저 마치면 다른 작업을 더 여유 있게 진행할 수 있어요.";
    } else if (urgentNow) {
      reason = "마감이 가까워요. 미루면 금방 급해질 수 있으니 먼저 챙겨 두세요.";
    } else if (task.effort === "long" && (task.importance === "high" || (scoreD !== null && scoreD <= 3))) {
      reason = "시간이 오래 걸릴 수 있는 작업이라 먼저 시작해 부담을 나눠보세요.";
    } else if (task.importance === "high" && fitsTime) {
      reason = "중요한 일이고 지금 확보한 시간 안에서 처리할 수 있어 먼저 끝내두기 좋아요.";
    } else if (task.importance === "high") {
      reason = "중요도가 높은 일이에요. 마감이 급한 일을 챙긴 뒤 바로 이어서 시작해 보세요.";
    } else if (task.effort === "short") {
      reason = hasLong
        ? "짧게 끝낼 수 있어요. 긴 작업 사이에 처리하면 흐름을 끊지 않고 마무리할 수 있어요."
        : "잠깐 집중하면 마칠 수 있어 다른 일을 시작하기 전에 처리하기 좋아요.";
    } else if (task.importance === "low" && scoreD === null) {
      reason = "마감이 없고 중요도가 낮아요. 급한 일을 먼저 정리한 뒤 여유가 있을 때 해도 괜찮아요.";
    } else {
      reason = i === 0 ? "조건이 비슷해 등록한 순서대로 시작하면 돼요." : "앞선 작업을 마친 뒤 이어서 진행하기 좋아요.";
    }
    return { taskId: task.id, rank: i + 1, reason };
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
