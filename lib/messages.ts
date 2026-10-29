import { MAX_AI_TASKS } from "./constants";
import type { RecommendErrorCode } from "./types";

/** PRD §8-1 오류 코드별 사용자 안내 */
export const ERROR_MESSAGES: Record<RecommendErrorCode, { message: string; canRetry: boolean }> = {
  MISSING_API_KEY: {
    message: "서버에 Gemini API 키가 설정되지 않아 AI 추천을 쓸 수 없어요.",
    canRetry: false,
  },
  AI_AUTH_ERROR: {
    message: "Gemini API 키가 올바르지 않거나 사용 권한이 없어요. 키를 확인한 뒤 서버를 다시 시작해 주세요.",
    canRetry: false,
  },
  AI_MODEL_ERROR: {
    message: "설정된 Gemini 모델을 사용할 수 없어요. 모델 이름(GEMINI_MODEL)을 확인해 주세요.",
    canRetry: false,
  },
  INVALID_REQUEST: {
    message: "할 일 정보를 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.",
    canRetry: true,
  },
  NO_TASKS: { message: "먼저 할 일을 추가해 주세요.", canRetry: false },
  TOO_MANY_TASKS: {
    message: `AI 분석은 한 번에 최대 ${MAX_AI_TASKS}개까지 가능해요. 완료했거나 필요 없는 작업을 정리해 주세요.`,
    canRetry: false,
  },
  AI_TIMEOUT: {
    message: "분석이 평소보다 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.",
    canRetry: true,
  },
  AI_RATE_LIMITED: { message: "지금 AI 요청이 많아요. 잠시 후 다시 시도해 주세요.", canRetry: true },
  AI_UPSTREAM_ERROR: { message: "AI 분석 중 문제가 생겼어요. 다시 시도해 주세요.", canRetry: true },
  AI_INVALID_RESPONSE: {
    message: "AI 결과가 올바르지 않아 표시하지 않았어요. 다시 시도해 주세요.",
    canRetry: true,
  },
  SERVICE_RATE_LIMITED: {
    message: "짧은 시간에 요청이 많아 AI 추천을 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.",
    canRetry: true,
  },
  NETWORK_ERROR: { message: "네트워크 연결을 확인하고 다시 시도해 주세요.", canRetry: true },
};
