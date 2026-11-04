import { SYSTEM_PROMPT } from "./prompt";
import { RESPONSE_SCHEMA } from "./schema";

/** 응답의 usageMetadata에서 읽은 토큰 수(숫자만). 비용·지연 분석용이며 내용은 담지 않는다. */
export interface TokenUsage {
  promptTokens?: number;
  outputTokens?: number;
  thoughtsTokens?: number;
  totalTokens?: number;
}

export type GeminiResult =
  | { ok: true; text: string; usage?: TokenUsage }
  | {
      ok: false;
      code: "AI_TIMEOUT" | "AI_RATE_LIMITED" | "AI_UPSTREAM_ERROR" | "AI_INVALID_RESPONSE" | "AI_AUTH_ERROR" | "AI_MODEL_ERROR";
      detail: string;
      /** Gemini가 응답한 HTTP 상태(네트워크 오류·타임아웃이면 없음) */
      status?: number;
      usage?: TokenUsage;
    };

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; thoughtsTokenCount?: unknown; totalTokenCount?: unknown };
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);

/** usageMetadata → 숫자만 남긴 토큰 사용량. 값이 하나도 없으면 undefined */
export function readUsage(meta: GeminiResponse["usageMetadata"]): TokenUsage | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const usage: TokenUsage = {
    promptTokens: num(meta.promptTokenCount),
    outputTokens: num(meta.candidatesTokenCount),
    thoughtsTokens: num(meta.thoughtsTokenCount),
    totalTokens: num(meta.totalTokenCount),
  };
  return Object.values(usage).some((v) => v !== undefined) ? usage : undefined;
}

/** 응답 상태·메시지를 사용자 안내용 오류 코드로 분류한다. */
export function classifyHttpError(status: number, message: string): "AI_AUTH_ERROR" | "AI_MODEL_ERROR" | "AI_RATE_LIMITED" | "AI_UPSTREAM_ERROR" {
  if (status === 429) return "AI_RATE_LIMITED";
  if (status === 401 || status === 403 || (status === 400 && /api key|API_KEY/i.test(message))) return "AI_AUTH_ERROR";
  if (status === 404 || (status === 400 && /model/i.test(message) && /not (found|supported)|unsupported/i.test(message))) {
    return "AI_MODEL_ERROR";
  }
  return "AI_UPSTREAM_ERROR";
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message?.slice(0, 200) ?? "";
  } catch {
    return "";
  }
}

/** Gemini generateContent REST 호출 (SDK 미사용) */
export async function callGemini(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<GeminiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const baseConfig: Record<string, unknown> = {
    temperature: 0.2,
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
  };
  // Gemini 3 이상은 thinkingLevel 지원. 응답 지연을 줄이기 위해 low 사용
  const supportsThinking = /^gemini-([3-9]|\d{2,})/.test(opts.model);

  const post = (generationConfig: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });

  let res: Response;
  try {
    res = await post(supportsThinking ? { ...baseConfig, thinkingConfig: { thinkingLevel: "low" } } : baseConfig);
    // thinking 설정을 모델이 거부하면 설정 없이 한 번 더 시도한다
    if (supportsThinking && res.status === 400) {
      const message = await readErrorMessage(res.clone());
      if (/thinking/i.test(message)) res = await post(baseConfig);
    }
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, code: "AI_TIMEOUT", detail: `timeout ${opts.timeoutMs}ms` };
    }
    return { ok: false, code: "AI_UPSTREAM_ERROR", detail: `fetch failed: ${name}` };
  }

  if (!res.ok) {
    const message = await readErrorMessage(res);
    return { ok: false, code: classifyHttpError(res.status, message), detail: `HTTP ${res.status} ${message}`, status: res.status };
  }

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: "response body is not JSON", status: res.status };
  }
  const usage = readUsage(data.usageMetadata);
  if (data.promptFeedback?.blockReason) {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: `blocked: ${data.promptFeedback.blockReason}`, status: 200, usage };
  }
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: `empty (finishReason=${candidate?.finishReason})`, status: 200, usage };
  }
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: `finishReason=${candidate.finishReason}`, status: 200, usage };
  }
  return { ok: true, text, usage };
}
