"use client";

import { useState } from "react";
import { patchTask } from "@/hooks/useAppStore";
import { TITLE_MAX } from "@/lib/constants";
import { dueModeOf } from "@/lib/date";
import type { Project, Task } from "@/lib/types";
import {
  conditionLabel,
  dueFromCondition,
  type ConditionValue,
} from "./ConditionFields";
import { ConditionSheetFrame } from "./ConditionSheet";

const fieldClass =
  "w-full rounded-xl border border-[#e3e3e5] bg-white px-3 py-2.5 text-sm focus:border-selected";

/**
 * 할 일 수정 바텀시트. 편집 중인 값은 시트 안의 임시 상태이고 `저장하기`를 눌러야 patchTask로 저장된다.
 * 취소·X·배경·Esc는 변경 없이 닫는다. 완료 기한 선택은 같은 시트 안에서 화면만 전환된다(ConditionSheetFrame).
 */
export default function TaskEditSheet({
  task,
  projects,
  today,
  onClose,
}: {
  task: Task;
  projects: Project[];
  today: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [projectId, setProjectId] = useState(task.projectId);
  const [cond, setCond] = useState<ConditionValue>(() => ({
    importance: task.importance,
    effort: task.effort,
    dueMode: dueModeOf(task.dueDate, today),
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    customDate: null,
    customTime: null,
  }));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return (setError("할 일을 입력해 주세요"), false);
    if (trimmed.length > TITLE_MAX)
      return (setError(`${TITLE_MAX}자 이내로 입력해 주세요`), false);
    if (cond.dueMode === "custom" && !cond.dueDate)
      return (setError("완료 날짜를 선택해 주세요"), false);
    patchTask(task.id, {
      title: trimmed,
      projectId,
      importance: cond.importance,
      effort: cond.effort,
      ...dueFromCondition(cond, today),
    });
  };

  return (
    <ConditionSheetFrame
      title="할 일 수정"
      titleId="task-edit-title"
      cond={cond}
      onCond={(next) => {
        setCond(next);
        setError(null);
      }}
      today={today}
      error={error}
      confirmLabel="저장하기"
      onConfirm={save}
      onClose={onClose}
      top={
        <div>
          <label className={conditionLabel} htmlFor="task-edit-input">
            할 일
          </label>
          <input
            id="task-edit-input"
            value={title}
            maxLength={TITLE_MAX + 20}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && save() !== false && onClose()
            }
            aria-invalid={!!error}
            className={fieldClass}
          />
        </div>
      }
      bottom={
        projects.length > 0 ? (
          <div>
            <label className={conditionLabel} htmlFor="task-edit-project">
              프로젝트
            </label>
            <select
              id="task-edit-project"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
              className={fieldClass}
            >
              <option value="">개별 할 일</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null
      }
    />
  );
}
