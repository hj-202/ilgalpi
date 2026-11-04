/*
 * 추천 API 운영 로그. 요청 1건당 JSON 한 줄을 남긴다.
 * 남기는 값: 결과(ok/fail), 오류 코드, 사용 모델, 시도 횟수, 시도 경로(모델:결과), 소요 시간, 작업 개수.
 * 남기지 않는 값: API 키, 할 일 제목·프로젝트명, AI 응답 본문, IP, 사용자 ID.
 */

export interface RecommendLogEntry {
  ok: boolean;
  code?: string;
  model?: string;
  attempts?: number;
  trail?: string[];
  ms: number;
  tasks?: number;
  detail?: string;
}

/**
 * 상세 사유는 허용된 패턴만 통과시킨다.
 * AI 응답 검증 실패 메시지는 작업 제목을 인용할 수 있고, Google 오류 메시지는 길이·내용을 통제할 수 없으므로 원문을 남기지 않는다.
 */
export function safeDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const m = detail.match(/^(HTTP \d{3}|timeout \d+ms|fetch failed: \w+|blocked: \w+|finishReason=\w+|empty \(finishReason=\w*\)|response body is not JSON)/);
  return m ? m[1] : "validation_failed";
}

export function formatRecommendLog(entry: RecommendLogEntry): string {
  return JSON.stringify({
    evt: "recommend",
    outcome: entry.ok ? "ok" : "fail",
    code: entry.code,
    model: entry.model,
    attempts: entry.attempts,
    trail: entry.trail,
    ms: Math.round(entry.ms),
    tasks: entry.tasks,
    detail: entry.ok ? undefined : safeDetail(entry.detail),
  });
}

export function logRecommend(entry: RecommendLogEntry) {
  const line = formatRecommendLog(entry);
  if (entry.ok) console.info(line);
  else console.error(line);
}
