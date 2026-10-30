"use client";

import { useState } from "react";
import { deleteTask, patchTask, setTaskCompleted } from "@/hooks/useAppStore";
import { EFFORT_LABEL, EFFORT_OPTIONS, IMPORTANCE_LABEL, TITLE_MAX } from "@/lib/constants";
import { daysBetween, formatDotDate, formatDueChip, formatKoreanTime } from "@/lib/date";
import type { Importance, Project, Task } from "@/lib/types";
import DueSheet, { CalendarIcon } from "./DueSheet";
import { Chip, ChevronIcon, CloseIcon, OptionChip } from "./ui";

/** 원형 체크 표시(완료 체크와 '할 일 옮기기' 선택이 같은 모양을 쓴다) */
export function CheckCircle({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  const style = disabled
    ? "border-[#d6d7dc] bg-[#d6d7dc]"
    : checked
      ? "border-primary bg-primary"
      : "border-[#c9cad1] bg-white";
  return (
    <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 ${style}`}>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2.5 6.2l2.4 2.4 4.6-4.9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function CompleteCheck({ task, source = "home" }: { task: Task; source?: "home" | "recommendation" }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.isCompleted}
      aria-label={`‘${task.title}’ 완료`}
      onClick={() => setTaskCompleted(task.id, !task.isCompleted, source)}
      className="-m-2 shrink-0 p-2"
    >
      <CheckCircle checked={task.isCompleted} />
    </button>
  );
}

/** 정보 칩 행: 중요도 / 작업 규모 / 마감 */
export function ConditionChips({
  task,
  today,
  nowTime,
  tone = "default",
}: {
  task: Task;
  today: string;
  nowTime: string;
  tone?: "default" | "outline";
}) {
  const due = formatDueChip(task.dueDate, task.dueTime, today, nowTime);
  return (
    <div className="mt-2 flex flex-wrap gap-[5px]">
      <Chip tone={tone}>{IMPORTANCE_LABEL[task.importance]}</Chip>
      <Chip tone={tone}>{task.effort ? EFFORT_LABEL[task.effort] : "시간 미정"}</Chip>
      {due && <Chip tone={due === "마감 지남" ? "warn" : tone}>{due}</Chip>}
    </div>
  );
}

const label = "mb-1.5 block text-xs font-semibold text-[#707277]";
const fieldClass =
  "w-full rounded-xl border border-[#e3e3e5] bg-white px-3 py-2.5 text-sm focus:border-selected";

function ConditionPanel({ task, projects, today }: { task: Task; projects: Project[]; today: string }) {
  const [title, setTitle] = useState(task.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const saveTitle = () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > TITLE_MAX) {
      setTitleError(!trimmed ? "할 일을 입력해 주세요" : `${TITLE_MAX}자 이내로 입력해 주세요`);
      return;
    }
    setTitleError(null);
    if (trimmed !== task.title) patchTask(task.id, { title: trimmed });
  };

  const pastDue = task.dueDate !== null && daysBetween(today, task.dueDate) < 0;

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-[14px] bg-[#f7f7f8] p-[13px]">
      <div>
        <label className={label} htmlFor={`title-${task.id}`}>
          할 일
        </label>
        <input
          id={`title-${task.id}`}
          value={title}
          maxLength={TITLE_MAX + 20}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-invalid={!!titleError}
          className={fieldClass}
        />
        {titleError && <p className="mt-1 text-xs text-primary-dark">{titleError}</p>}
      </div>

      <div>
        <span className={label}>중요도</span>
        <div className="flex flex-wrap gap-2">
          {(["low", "medium", "high"] as Importance[]).map((imp) => (
            <OptionChip key={imp} selected={task.importance === imp} onClick={() => patchTask(task.id, { importance: imp })}>
              {IMPORTANCE_LABEL[imp]}
            </OptionChip>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>예상 소요시간</span>
        <div className="flex flex-wrap gap-2">
          {EFFORT_OPTIONS.map((o) => (
            <OptionChip key={o.value} selected={task.effort === o.value} onClick={() => patchTask(task.id, { effort: o.value })}>
              {o.label}
            </OptionChip>
          ))}
          <OptionChip selected={task.effort === null} onClick={() => patchTask(task.id, { effort: null })}>
            미정
          </OptionChip>
        </div>
        <p className="mt-1.5 text-xs text-[#767780]">대략적인 규모만 골라 주세요. 정확한 시간은 필요 없어요.</p>
      </div>

      <div>
        <span className={label}>
          마감 <span className="font-normal">(선택)</span>
        </span>
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          className={`${fieldClass} flex items-center justify-between gap-2 whitespace-nowrap text-left`}
        >
          <span className={`min-w-0 truncate ${task.dueDate ? "" : "text-[#9b9ca3]"}`}>
            {task.dueDate ? `${formatDotDate(task.dueDate)}${task.dueTime ? ` ${formatKoreanTime(task.dueTime)}` : ""}` : "마감일을 선택해 주세요"}
          </span>
          <span className="shrink-0 text-subtle">
            <CalendarIcon />
          </span>
        </button>
        {pastDue && <p className="mt-1 text-xs text-[#767780]">이미 지난 날짜예요</p>}
      </div>

      {projects.length > 0 && (
        <div>
          <label className={label} htmlFor={`project-${task.id}`}>
            프로젝트 <span className="font-normal">(선택)</span>
          </label>
          <select
            id={`project-${task.id}`}
            value={task.projectId ?? ""}
            onChange={(e) => patchTask(task.id, { projectId: e.target.value || null })}
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
      )}

      {sheet && (
        <DueSheet
          dueDate={task.dueDate}
          dueTime={task.dueTime}
          today={today}
          onClose={() => setSheet(false)}
          onApply={(v) => {
            patchTask(task.id, v);
            setSheet(false);
          }}
        />
      )}
    </div>
  );
}

export default function TaskItem({
  task,
  projects,
  today,
  nowTime,
  open,
  onToggle,
  selectable,
}: {
  task: Task;
  projects: Project[];
  today: string;
  nowTime: string;
  open: boolean;
  onToggle: () => void;
  /** 이월 선택 모드일 때 체크박스 자리에 선택 컨트롤을 둔다 */
  selectable?: { selected: boolean; onChange: (selected: boolean) => void };
}) {
  const handleDelete = () => {
    if (window.confirm(`‘${task.title}’을(를) 삭제할까요?`)) deleteTask(task.id);
  };
  return (
    <li className="py-[15px]">
      <div className="flex items-start gap-[9px]">
        <div className="pt-0.5">
          {selectable && task.isCompleted ? (
            // 옮기기 모드: 이미 완료한 작업은 선택할 수 없다(Disabled / Checked)
            <button
              type="button"
              role="checkbox"
              aria-checked
              aria-disabled
              disabled
              aria-label={`‘${task.title}’ 이미 완료한 작업이라 옮길 수 없어요`}
              className="-m-2 shrink-0 cursor-not-allowed p-2"
            >
              <CheckCircle checked disabled />
            </button>
          ) : selectable ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={selectable.selected}
              onClick={() => selectable.onChange(!selectable.selected)}
              aria-label={`‘${task.title}’ 옮길 작업으로 선택`}
              className="-m-2 shrink-0 p-2"
            >
              <CheckCircle checked={selectable.selected} />
            </button>
          ) : (
            <CompleteCheck task={task} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-semibold leading-[1.45] ${task.isCompleted ? "text-[#9a9ba1] line-through" : "text-ink"}`}>
            {task.title}
          </p>
          <ConditionChips task={task} today={today} nowTime={nowTime} />
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="-mb-2 mt-0.5 inline-flex min-h-[40px] items-center gap-0.5 text-xs text-[#707277] underline underline-offset-2"
          >
            {open ? "조건 닫기" : "조건 설정"}
            <ChevronIcon dir={open ? "up" : "down"} size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          aria-label={`‘${task.title}’ 삭제`}
          className="-m-2 p-3 text-[#9b9ca3] hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>
      {open && <ConditionPanel task={task} projects={projects} today={today} />}
    </li>
  );
}
