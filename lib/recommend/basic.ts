import { IMPORTANCE_LABEL, MAX_FOCUS, MAX_WARNINGS } from "../constants";
import { daysUntilDue } from "../date";
import { truncate } from "../format";
import type { Importance, Project, RecommendationResult, Task } from "../types";

export interface BasicInput {
  /** 미완료 작업 */
  tasks: Task[];
  /** 미완료 작업이 있는 프로젝트 */
  projects: Project[];
  availableMinutes: number;
  today: string;
}

const IMPORTANCE_SCORE: Record<Importance, number> = { high: 60, medium: 35, low: 10 };
const IMPORTANCE_ORDER: Record<Importance, number> = { high: 0, medium: 1, low: 2 };

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

function dueReason(d: number | null): string {
  if (d === null) return "마감일이 정해지지 않았어요";
  if (d < 0) return `마감이 ${-d}일 지났어요`;
  if (d === 0) return "오늘 마감이에요";
  if (d === 1) return "내일 마감이에요";
  return `마감까지 ${d}일 남았어요`;
}

const q = (title: string) => `‘${truncate(title, 30)}’`;

/** 규칙 기반 기본 추천. AI 분석이 아니며 PRD §7-6을 따른다. */
export function basicRecommend(input: BasicInput): RecommendationResult {
  const { tasks, projects, availableMinutes, today } = input;

  const scored = tasks.map((task) => {
    const d = daysUntilDue(task.dueDate, today);
    const fits = task.estimatedMinutes <= availableMinutes;
    const score = urgencyScore(d) + IMPORTANCE_SCORE[task.importance] + (fits ? 0 : -10);
    return { task, d, fits, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.d ?? Number.POSITIVE_INFINITY;
    const db = b.d ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const ia = IMPORTANCE_ORDER[a.task.importance] - IMPORTANCE_ORDER[b.task.importance];
    if (ia !== 0) return ia;
    if (a.task.estimatedMinutes !== b.task.estimatedMinutes) {
      return a.task.estimatedMinutes - b.task.estimatedMinutes;
    }
    return a.task.createdAt.localeCompare(b.task.createdAt);
  });

  const rankOf = new Map<string, number>();
  const taskRankings = scored.map(({ task, d, fits }, i) => {
    rankOf.set(task.id, i + 1);
    const reason = [
      dueReason(d),
      `중요도 ${IMPORTANCE_LABEL[task.importance]}`,
      fits ? "남은 시간 안에 끝낼 수 있어요" : "오늘 남은 시간보다 길어요",
    ].join(" · ");
    return { taskId: task.id, rank: i + 1, reason };
  });

  // Focus: 순위대로 남은 시간에 들어가는 작업을 최대 3개
  const focusIds: string[] = [];
  let remaining = availableMinutes;
  for (const { task } of scored) {
    if (focusIds.length >= MAX_FOCUS) break;
    if (task.estimatedMinutes <= remaining) {
      focusIds.push(task.id);
      remaining -= task.estimatedMinutes;
    }
  }
  const focusTotal = availableMinutes - remaining;
  const focusReason =
    focusIds.length > 0
      ? `순위가 높은 작업 중 오늘 ${availableMinutes}분 안에 끝낼 수 있는 ${focusIds.length}개를 골랐어요. (합계 ${focusTotal}분)`
      : `오늘 설정한 ${availableMinutes}분 안에 끝낼 수 있는 작업이 없어요.`;

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
    let reason = `가장 앞선 작업: ${q(s.top.task.title)}(전체 ${s.bestRank}위)`;
    if (s.urgentCount > 0) reason += ` · 3일 안에 마감되는 작업 ${s.urgentCount}개`;
    return { projectId: s.project.id, rank: i + 1, reason };
  });

  // 주의사항
  const warnings: string[] = [];
  const focusSet = new Set(focusIds);
  for (const s of scored) {
    if (focusSet.has(s.task.id)) continue;
    const important =
      rankOf.get(s.task.id)! <= 3 ||
      s.task.importance === "high" ||
      (s.d !== null && s.d <= 1);
    const blockedByTime =
      s.task.estimatedMinutes > availableMinutes ||
      (focusIds.length < MAX_FOCUS && s.task.estimatedMinutes > remaining);
    if (important && blockedByTime) {
      warnings.push(
        `${q(s.task.title)}은(는) ${s.task.estimatedMinutes}분이 필요해 오늘 Focus에서 제외했어요. 시간을 따로 확보해 보세요.`,
      );
    }
  }
  const overdue = scored.filter((s) => s.d !== null && s.d < 0).length;
  if (overdue > 0) {
    warnings.push(`마감이 지난 작업이 ${overdue}개 있어요. 일정을 다시 확인해 보세요.`);
  }

  return {
    projectRankings,
    taskRankings,
    focusPlan: { taskIds: focusIds, reason: focusReason },
    warnings: warnings.slice(0, MAX_WARNINGS),
  };
}
