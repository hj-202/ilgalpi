"use client";

import { useState } from "react";
import { addTask } from "@/hooks/useAppStore";
import { TITLE_MAX } from "@/lib/constants";
import { PrimaryButton } from "./ui";

/** 단일 텍스트 필드로 빠르게 등록. 기본 조건: 중요도 보통 / 시간 미정 / 마감 없음 */
export default function QuickAdd({
  plannedDate,
  projectId = null,
  placeholder = "예: 포트폴리오 수정하기",
}: {
  plannedDate: string;
  projectId?: string | null;
  placeholder?: string;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return setError("할 일을 입력해 주세요");
    if (trimmed.length > TITLE_MAX) return setError(`${TITLE_MAX}자 이내로 입력해 주세요`);
    addTask({ title: trimmed, plannedDate, projectId });
    setTitle("");
    setError(null);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          id="quick-add-input"
          aria-label="할 일 입력"
          aria-invalid={!!error}
          enterKeyHint="done"
          className="min-w-0 flex-1 rounded-xl border border-[#e8e8e9] bg-white px-3 py-3 text-[15px] text-[#242424] placeholder:text-[#9b9ca3] focus:border-selected"
        />
        <PrimaryButton type="submit" className="shrink-0 px-4 font-bold">
          추가
        </PrimaryButton>
      </div>
      {error && (
        <p role="alert" className="text-xs text-primary-dark">
          {error}
        </p>
      )}
    </form>
  );
}
