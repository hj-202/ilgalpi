/*
 * 추천 API 운영 로그. 요청 1건당 JSON 한 줄을 남긴다.
 * 남기는 값: 결과(ok/fail), 오류 코드, 사용 모델, 시도 횟수, 시도 경로(모델:결과), 소요 시간, 작업 개수,
 *   호출별 기록(모델·결과·HTTP 상태·소요 시간·토큰 수), 토큰 합계, 429 발생 여부, 이유 문구 품질 검사 개수.
 * 남기지 않는 값: API 키, 할 일 제목·프로젝트명, AI 응답 본문(이유 문구 포함), IP, 사용자 ID.
 *   호출 기록·토큰·품질 값은 모두 허용된 형태의 짧은 문자열이나 숫자로 걸러서 남긴다.
 */

export interface LoggedCall {
  model: string;
  result: string;
  status?: number;
  ms: number;
  usage?: { promptTokens?: number; outputTokens?: number; thoughtsTokens?: number; totalTokens?: number };
}

export interface RecommendLogEntry {
  ok: boolean;
  code?: string;
  model?: string;
  attempts?: number;
  trail?: string[];
  ms: number;
  tasks?: number;
  detail?: string;
  calls?: LoggedCall[];
  usage?: LoggedCall["usage"];
  rateLimited?: boolean;
  /** AI 이유 문구 품질 검사 결과(개수만). 결과 표시에는 영향을 주지 않는다 */
  quality?: { duplicates: number; contradictions: number };
}

const MODEL_RE = /^[A-Za-z0-9._-]{1,60}$/;
const RESULT_RE = /^(ok|[A-Z_]{3,40})$/;
const count = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);

function safeUsage(u: LoggedCall["usage"]): LoggedCall["usage"] {
  if (!u) return undefined;
  return { promptTokens: count(u.promptTokens), outputTokens: count(u.outputTokens), thoughtsTokens: count(u.thoughtsTokens), totalTokens: count(u.totalTokens) };
}

/** 호출 기록은 모델 ID·결과 코드를 형식 검사로 걸러 남긴다(임의 문자열 통과 금지) */
export function safeCalls(calls: LoggedCall[] | undefined): LoggedCall[] | undefined {
  return calls?.map((c) => ({
    model: MODEL_RE.test(c.model) ? c.model : "unknown",
    result: RESULT_RE.test(c.result) ? c.result : "unknown",
    status: count(c.status),
    ms: Math.round(c.ms),
    usage: safeUsage(c.usage),
  }));
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
    calls: safeCalls(entry.calls),
    usage: safeUsage(entry.usage),
    rateLimited: entry.rateLimited,
    quality: entry.quality ? { duplicates: count(entry.quality.duplicates) ?? 0, contradictions: count(entry.quality.contradictions) ?? 0 } : undefined,
  });
}

export function logRecommend(entry: RecommendLogEntry) {
  const line = formatRecommendLog(entry);
  if (entry.ok) console.info(line);
  else console.error(line);
}
