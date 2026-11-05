import type { RecommendErrorCode, RecommendRequest, RecommendResponse } from "../types";

export type ExecuteResult =
  | { ok: true; request: RecommendRequest; data: Extract<RecommendResponse, { ok: true }> }
  | { ok: false; code: RecommendErrorCode };

/**
 * 추천 요청 1건을 만들고 보낸다. 어떤 단계에서 예외가 나도 던지지 않고 오류 코드로 돌려준다.
 * - 요청 생성 실패(build 예외) → INVALID_REQUEST (조건 기반 추천으로 대신하지 않는 입력 오류로 취급)
 * - 전송 단계의 TimeoutError → AI_TIMEOUT, 그 밖의 예외(네트워크·응답 파싱) → NETWORK_ERROR
 * 호출한 쪽은 결과와 관계없이 로딩 상태를 풀고 Recommendation Completed를 1번 기록한다.
 */
export async function executeRecommend(
  build: () => RecommendRequest,
  send: (request: RecommendRequest) => Promise<RecommendResponse>,
): Promise<ExecuteResult> {
  let request: RecommendRequest;
  try {
    request = build();
  } catch {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  try {
    const data = await send(request);
    return data.ok ? { ok: true, request, data } : { ok: false, code: data.error.code };
  } catch (err) {
    return { ok: false, code: (err as Error)?.name === "TimeoutError" ? "AI_TIMEOUT" : "NETWORK_ERROR" };
  }
}
