"use client";

import { useCallback, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { addTask } from "@/hooks/useAppStore";
import { TITLE_MAX } from "@/lib/constants";
import { DEFAULT_CONDITION, dueFromCondition, type ConditionValue } from "./ConditionFields";
import ConditionSheet from "./ConditionSheet";
import { PrimaryButton } from "./ui";

/** 할 일 입력 + [조건 설정][추가하기]. 조건은 바텀시트에서 적용만 하고, 등록은 추가하기에서만 한다(기본값: 보통 / 미정 / 기한 없음). */
export default function QuickAdd({
  plannedDate,
  today,
  projectId = null,
  placeholder = "예: 회의 자료 준비하기",
}: {
  plannedDate: string;
  today: string;
  projectId?: string | null;
  placeholder?: string;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [cond, setCond] = useState<ConditionValue>(DEFAULT_CONDITION);
  const started = useRef(false); // 한 번의 입력 동안 Entry Started를 1회만 기록
  const closeSheet = useCallback(() => setOpen(false), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return setError("할 일을 입력해 주세요");
    if (trimmed.length > TITLE_MAX)
      return setError(`${TITLE_MAX}자 이내로 입력해 주세요`);
    if (cond.dueMode === "custom" && !cond.dueDate) {
      setOpen(true);
      return setError("완료 날짜를 선택해 주세요");
    }
    addTask({
      title: trimmed,
      plannedDate,
      projectId,
      importance: cond.importance,
      effort: cond.effort,
      ...dueFromCondition(cond, today),
    });
    setTitle("");
    setError(null);
    started.current = false;
    setCond(DEFAULT_CONDITION); // 다음 입력을 위해 기본값으로 되돌린다
    setOpen(false);
  };

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              if (!v.trim()) started.current = false;
              else if (!started.current) {
                started.current = true;
                track("Entry Started");
              }
              setError(null);
            }}
            placeholder={placeholder}
            id="quick-add-input"
            aria-label="할 일 입력"
            aria-invalid={!!error}
            enterKeyHint="done"
            className="min-w-0 flex-1 rounded-xl border border-[#e8e8e9] bg-white px-3 py-3 text-[15px] text-[#242424] placeholder:text-[#9b9ca3] focus:border-selected"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-primary-dark">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="h-11 w-[100px] shrink-0 rounded-xl bg-[#f0f0f2] text-sm font-semibold text-[#4a4b50] transition-colors hover:bg-[#e8e8eb] active:bg-[#e3e3e7]"
          >
            조건 설정
          </button>
          <PrimaryButton
            type="submit"
            className="h-11 min-w-0 flex-1 py-0 font-bold"
          >
            추가하기
          </PrimaryButton>
        </div>
      </form>
      {open && (
        <ConditionSheet
          value={cond}
          today={today}
          onClose={closeSheet}
          onApply={(next) => {
            setCond(next);
            setError(null);
          }}
        />
      )}
    </>
  );
}
