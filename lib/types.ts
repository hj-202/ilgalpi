export type Importance = "high" | "medium" | "low";

/** 작업 규모. short=30분 이내, medium=1시간 내외, long=2시간 이상. null=미정 */
export type Effort = "short" | "medium" | "long";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  /** 사용자가 그날 하려고 등록한 날 "YYYY-MM-DD" (캘린더 분류용, 마감과 별개) */
  plannedDate: string;
  dueDate: string | null; // "YYYY-MM-DD"
  /** 마감일에 붙는 정확한 시각 "HH:mm" (dueDate 없이 사용 불가) */
  dueTime: string | null;
  importance: Importance;
  /** 대략적인 작업 규모. 정확한 분 단위가 아니며 시간 합산에 쓰지 않는다. null = 미정 */
  effort: Effort | null;
  /** v2 이전의 분 단위 값. 데이터 보존용이며 화면·분석에는 쓰지 않는다. */
  legacyMinutes: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  /** 날짜별 값이 없을 때 쓰는 기본 작업 가능 시간(분) */
  availableMinutes: number;
}

export interface ProjectRanking {
  projectId: string;
  rank: number;
  reason: string;
}

export interface TaskRanking {
  taskId: string;
  rank: number;
  reason: string;
}

export interface RecommendationResult {
  projectRankings: ProjectRanking[];
  taskRankings: TaskRanking[];
  warnings: string[];
}

export type RecommendationType = "ai" | "basic";

export interface StoredRecommendation extends RecommendationResult {
  recommendationType: RecommendationType;
  generatedAt: string;
  /** 추천을 만든 실제 '오늘'(마감 판단 기준). 날짜가 바뀌면 재추천 필요 */
  generatedForDate: string;
  availableMinutes: number;
  taskFingerprints: Record<string, string>;
  model?: string;
}

export interface AppState {
  version: 3;
  projects: Project[];
  tasks: Task[];
  preferences: UserPreferences;
  /** 날짜(YYYY-MM-DD)별 이날 작업 가능한 시간(분) */
  dailyAvailableMinutes: Record<string, number>;
  /** 계획 날짜(YYYY-MM-DD)별 추천 결과 */
  recommendations: Record<string, StoredRecommendation>;
}

/** 추천 분석에 쓰이는 작업 필드 (요청·지문 공용) */
export interface AnalysisTask {
  id: string;
  projectId: string | null;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  importance: Importance;
  effort: Effort | null;
}

export interface RecommendRequest {
  /** 사용자 로컬 '오늘' (마감 임박도 판단 기준) */
  currentDate: string;
  /** 추천 대상 작업이 계획된 날짜 */
  planDate: string;
  /** 사용자 로컬 현재 시각 "HH:mm" */
  currentTime?: string;
  timezone: string;
  availableMinutes: number;
  projects: Array<{ id: string; name: string }>;
  tasks: Array<AnalysisTask & { isCompleted: false }>;
}

export type RecommendErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_REQUEST"
  | "NO_TASKS"
  | "TOO_MANY_TASKS"
  | "AI_AUTH_ERROR"
  | "AI_MODEL_ERROR"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "SERVICE_RATE_LIMITED"
  | "AI_UPSTREAM_ERROR"
  | "AI_INVALID_RESPONSE"
  | "NETWORK_ERROR";

export type RecommendResponse =
  | {
      ok: true;
      recommendation: RecommendationResult;
      meta: { model: string; attempts: number };
    }
  | { ok: false; error: { code: RecommendErrorCode; message: string } };
