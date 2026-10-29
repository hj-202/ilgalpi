import { FEEDBACK_MAX } from "./constants";

/** 제어문자(줄바꿈·탭 제외)를 제거하고 trim한다 */
export function cleanFeedback(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (text.length < 1 || text.length > FEEDBACK_MAX) return null;
  return text;
}
