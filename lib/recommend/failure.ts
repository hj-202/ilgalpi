import type { RecommendErrorCode } from "../types";

/** 입력 오류는 조건 기반 추천으로 대신하지 않고 안내만 한다 */
export const NO_FALLBACK: RecommendErrorCode[] = ["INVALID_REQUEST", "NO_TASKS", "TOO_MANY_TASKS"];

/**
 * AI 요청 실패 시 화면 처리.
 * - error: 오류 안내만 표시(입력 오류, 또는 최신 결과가 이미 있어 대체·삭제하지 않는 경우)
 * - fallback: 조건 기반 추천으로 전환
 */
export function failureAction(code: RecommendErrorCode, hasFreshRec: boolean): "error" | "fallback" {
  if (NO_FALLBACK.includes(code)) return "error";
  return hasFreshRec ? "error" : "fallback";
}

/** 모든 오류 코드는 사용자 안내를 가져야 한다(조건 기반 추천 생성 자체가 실패한 경우의 안내) */
export const FALLBACK_FAILED_MESSAGE = "추천 순서를 정리하지 못했어요. 잠시 후 다시 시도해 주세요.";
