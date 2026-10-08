import { SYSTEM_PROMPT } from "./prompt";
import { RESPONSE_SCHEMA } from "./schema";

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; code: "AI_TIMEOUT" | "AI_RATE_LIMITED" | "AI_UPSTREAM_ERROR" | "AI_INVALID_RESPONSE"; detail: string };

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

/** Gemini generateContent REST 호출 (SDK 미사용) */
export async function callGemini(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<GeminiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
  };
  // Gemini 3 이상은 thinkingLevel 지원. 응답 지연을 줄이기 위해 low 사용
  if (/^gemini-([3-9]|\d{2,})/.test(opts.model)) {
    generationConfig.thinkingConfig = { thinkingLevel: "low" };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, code: "AI_TIMEOUT", detail: `timeout ${opts.timeoutMs}ms` };
    }
    return { ok: false, code: "AI_UPSTREAM_ERROR", detail: `fetch failed: ${name}` };
  }

  if (res.status === 429) return { ok: false, code: "AI_RATE_LIMITED", detail: "HTTP 429" };
  if (!res.ok) {
    let message = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message?.slice(0, 200) ?? "";
    } catch {
      // 본문 없음
    }
    return { ok: false, code: "AI_UPSTREAM_ERROR", detail: `HTTP ${res.status} ${message}` };
  }

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: "response body is not JSON" };
  }
  if (data.promptFeedback?.blockReason) {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: `blocked: ${data.promptFeedback.blockReason}` };
  }
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: `empty (finishReason=${candidate?.finishReason})` };
  }
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    return { ok: false, code: "AI_INVALID_RESPONSE", detail: `finishReason=${candidate.finishReason}` };
  }
  return { ok: true, text };
}
