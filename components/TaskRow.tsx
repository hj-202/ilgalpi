"use client";

import { setTaskCompleted } from "@/hooks/useAppStore";
import { formatMinutes } from "@/lib/format";
import type { Task } from "@/lib/types";
import { DueBadge, ImportanceBadge } from "./Badges";

export function CompleteCheckbox({ task }: { task: Task }) {
  return (
    <input
      type="checkbox"
      checked={task.isCompleted}
      onChange={(e) => setTaskCompleted(task.id, e.target.checked)}
      aria-label={`‘${task.title}’ 완료`}
      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-indigo-600"
    />
  );
}

export function TaskMeta({ task, today }: { task: Task; today: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <ImportanceBadge importance={task.importance} />
      <DueBadge dueDate={task.dueDate} today={today} />
      <span className="text-xs text-slate-500">{formatMinutes(task.estimatedMinutes)}</span>
    </div>
  );
}

export default function TaskRow({
  task,
  today,
  onEdit,
}: {
  task: Task;
  today: string;
  onEdit: (task: Task) => void;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <CompleteCheckbox task={task} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className={`text-left text-sm font-medium hover:text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
            task.isCompleted ? "text-slate-400 line-through" : "text-slate-900"
          }`}
        >
          {task.title}
        </button>
        {!task.isCompleted && <TaskMeta task={task} today={today} />}
      </div>
    </li>
  );
}
