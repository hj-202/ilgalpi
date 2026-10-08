import { fingerprint } from "../fingerprint";
import type {
  AnalysisTask,
  AppState,
  Project,
  RecommendationResult,
  RecommendationType,
  RecommendRequest,
  StoredRecommendation,
  Task,
} from "../types";
import type { ValidationContext } from "./validate";

export function getIncompleteTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.isCompleted);
}

/** 미완료 작업이 1개 이상인 프로젝트 */
export function getActiveProjects(projects: Project[], incomplete: Task[]): Project[] {
  const ids = new Set(incomplete.map((t) => t.projectId).filter(Boolean));
  return projects.filter((p) => ids.has(p.id));
}

/** AppState → API 요청. 완료 작업은 여기서 제외한다(서버는 완료 작업이 오면 거부). */
export function buildRecommendRequest(state: AppState, today: string): RecommendRequest {
  const incomplete = getIncompleteTasks(state.tasks);
  return {
    currentDate: today,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
    availableMinutes: state.preferences.availableMinutes,
    projects: getActiveProjects(state.projects, incomplete).map(({ id, name }) => ({ id, name })),
    tasks: incomplete.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      dueDate: t.dueDate,
      importance: t.importance,
      estimatedMinutes: t.estimatedMinutes,
      isCompleted: false as const,
    })),
  };
}

export function buildValidationContext(
  tasks: AnalysisTask[],
  projectIds: string[],
  availableMinutes: number,
): ValidationContext {
  return {
    taskMinutes: Object.fromEntries(tasks.map((t) => [t.id, t.estimatedMinutes])),
    projectIds,
    availableMinutes,
  };
}

/** 분석에 사용한 입력 스냅샷과 함께 저장할 추천을 만든다. */
export function createStoredRecommendation(
  result: RecommendationResult,
  type: RecommendationType,
  analyzed: { tasks: AnalysisTask[]; availableMinutes: number; date: string },
  model?: string,
): StoredRecommendation {
  return {
    ...result,
    recommendationType: type,
    generatedAt: new Date().toISOString(),
    generatedForDate: analyzed.date,
    availableMinutes: analyzed.availableMinutes,
    taskFingerprints: Object.fromEntries(analyzed.tasks.map((t) => [t.id, fingerprint(t)])),
    ...(model ? { model } : {}),
  };
}
