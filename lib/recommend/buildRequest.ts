import { fingerprint } from "../fingerprint";
import type {
  AnalysisTask,
  Project,
  RecommendationResult,
  RecommendationType,
  RecommendRequest,
  StoredRecommendation,
  Task,
} from "../types";
import type { Facts } from "./grounding";
import type { ValidationContext } from "./validate";

export function getIncompleteTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.isCompleted);
}

/** 미완료 작업이 1개 이상인 프로젝트 */
export function getActiveProjects(projects: Project[], incomplete: Task[]): Project[] {
  const ids = new Set(incomplete.map((t) => t.projectId).filter(Boolean));
  return projects.filter((p) => ids.has(p.id));
}

export interface RequestSource {
  /** 추천 대상 날짜에 계획된 작업(완료 여부 무관, 여기서 미완료만 고른다) */
  tasks: Task[];
  projects: Project[];
  availableMinutes: number;
  today: string;
  planDate: string;
  nowTime: string;
}

/** 해당 날짜의 미완료 작업 → API 요청. 완료 작업은 여기서 제외한다(서버는 완료 작업이 오면 거부). */
export function buildRecommendRequest(src: RequestSource): RecommendRequest {
  const incomplete = getIncompleteTasks(src.tasks);
  return {
    currentDate: src.today,
    planDate: src.planDate,
    currentTime: src.nowTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
    availableMinutes: src.availableMinutes,
    projects: getActiveProjects(src.projects, incomplete).map(({ id, name }) => ({ id, name })),
    tasks: incomplete.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      importance: t.importance,
      effort: t.effort,
      isCompleted: false as const,
    })),
  };
}

export function buildValidationContext(
  taskIds: string[],
  projectIds: string[],
  facts?: Facts,
  taskMeta?: ValidationContext["taskMeta"],
): ValidationContext {
  return { taskIds, projectIds, facts, taskMeta };
}

/** 분석에 사용한 입력 스냅샷과 함께 저장할 추천을 만든다. */
export function createStoredRecommendation(
  result: RecommendationResult,
  type: RecommendationType,
  analyzed: { tasks: AnalysisTask[]; availableMinutes: number; date: string; excludedCompletedCount?: number },
  model?: string,
): StoredRecommendation {
  return {
    ...result,
    recommendationType: type,
    generatedAt: new Date().toISOString(),
    generatedForDate: analyzed.date,
    availableMinutes: analyzed.availableMinutes,
    taskFingerprints: Object.fromEntries(analyzed.tasks.map((t) => [t.id, fingerprint(t)])),
    ...(analyzed.excludedCompletedCount ? { excludedCompletedCount: analyzed.excludedCompletedCount } : {}),
    ...(model ? { model } : {}),
  };
}
