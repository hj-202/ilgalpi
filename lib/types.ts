export type Importance = "high" | "medium" | "low";

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
  dueDate: string | null; // "YYYY-MM-DD"
  importance: Importance;
  estimatedMinutes: number;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  /** 지금부터 오늘 남은 작업 가능 시간(분) */
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

export interface FocusPlan {
  taskIds: string[];
  reason: string;
}

export interface RecommendationResult {
  projectRankings: ProjectRanking[];
  taskRankings: TaskRanking[];
  focusPlan: FocusPlan;
  warnings: string[];
}

export type RecommendationType = "ai" | "basic";

export interface StoredRecommendation extends RecommendationResult {
  recommendationType: RecommendationType;
  generatedAt: string;
  generatedForDate: string;
  availableMinutes: number;
  taskFingerprints: Record<string, string>;
  model?: string;
}

export interface AppState {
  version: 1;
  projects: Project[];
  tasks: Task[];
  preferences: UserPreferences;
  recommendation: StoredRecommendation | null;
}

/** 추천 분석에 쓰이는 작업 필드 (요청·지문 공용) */
export interface AnalysisTask {
  id: string;
  projectId: string | null;
  title: string;
  dueDate: string | null;
  importance: Importance;
  estimatedMinutes: number;
}

export interface RecommendRequest {
  currentDate: string;
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
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
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
