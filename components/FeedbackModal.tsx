"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { FEEDBACK_MAX } from "@/lib/constants";
import { GhostButton, Modal, PrimaryButton, showToast } from "./ui";

/** 의견 보내기: 자유 의견만. 서버 API가 DB 저장을 확인한 경우에만 성공으로 표시한다. */
export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: 사람에게는 보이지 않는다
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  const send = async () => {
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, website }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
      if (res.ok && data?.ok === true) {
        track("Feedback Submitted");
        showToast("의견이 전달되었어요.");
        setText("");
        onClose();
        return;
      }
      setError(data?.code === "RATE_LIMITED" ? "요청이 많아 잠시 후에 다시 보내 주세요." : "전송하지 못했어요. 다시 시도해 주세요.");
    } catch {
      setError("전송하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title="의견 보내기" onClose={onClose} dismissible={!sending}>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6f7176]">사용하면서 불편했던 점이나 개선 의견을 적어 주세요. 개인정보는 적지 않아도 돼요.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          maxLength={FEEDBACK_MAX}
          placeholder="의견을 입력해 주세요"
          aria-label="의견"
          className="mt-3 h-[115px] w-full resize-y rounded-[11px] border border-[#ddd] p-[11px] text-sm"
        />
        <input tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[#767780]">
          <span role="alert" className="text-primary-dark">
            {error}
          </span>
          <span>
            {text.length}/{FEEDBACK_MAX}
          </span>
        </div>
        <div className="mt-4 flex gap-[9px]">
          <GhostButton type="button" onClick={onClose} disabled={sending} className="min-h-[44px] flex-1 py-2.5">
            닫기
          </GhostButton>
          <PrimaryButton type="submit" disabled={!trimmed || sending} aria-busy={sending} className="min-h-[44px] flex-1 py-2.5">
            {sending ? "보내는 중…" : "의견 보내기"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
