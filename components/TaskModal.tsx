"use client";

import { useEffect, useRef, useState } from "react";
import { addProject, addTask, deleteTask, updateTask } from "@/hooks/useAppStore";
import {
  EST_DEFAULT,
  EST_MAX,
  EST_MIN,
  EST_PRESETS,
  IMPORTANCE_LABEL,
  TITLE_MAX,
} from "@/lib/constants";
import { isValidYmd } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import type { Importance, Project, Task } from "@/lib/types";

const NEW_PROJECT = "__new__";

export type ModalState =
  | { mode: "create"; projectId: string | null }
  | { mode: "edit"; task: Task };

interface Props {
  state: ModalState;
  projects: Project[];
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function TaskModal({ state, projects, onClose }: Props) {
  const editing = state.mode === "edit" ? state.task : null;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [projectId, setProjectId] = useState<string | null>(
    editing ? editing.projectId : state.mode === "create" ? state.projectId : null,
  );
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? "");
  const [importance, setImportance] = useState<Importance>(editing?.importance ?? "medium");
  const [minutesText, setMinutesText] = useState(String(editing?.estimatedMinutes ?? EST_DEFAULT));
  const [errors, setErrors] = useState<{ title?: string; minutes?: string; dueDate?: string }>({});

  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const minutesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const trimmed = title.trim();
    if (!trimmed) next.title = "작업명을 입력해 주세요";
    else if (trimmed.length > TITLE_MAX) next.title = `${TITLE_MAX}자 이내로 입력해 주세요`;

    const minutes = Number(minutesText);
    if (!Number.isInteger(minutes) || minutes < EST_MIN || minutes > EST_MAX) {
      next.minutes = `${EST_MIN}분에서 ${EST_MAX}분 사이로 입력해 주세요`;
    }
    if (dueDate && !isValidYmd(dueDate)) next.dueDate = "올바른 날짜를 선택해 주세요";

    setErrors(next);
    if (next.title) return titleRef.current?.focus();
    if (next.minutes) return minutesRef.current?.focus();
    if (next.dueDate) return;

    const input = {
      title: trimmed,
      projectId,
      dueDate: dueDate || null,
      importance,
      estimatedMinutes: minutes,
    };
    if (editing) updateTask(editing.id, input);
    else addTask(input);
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    if (window.confirm(`‘${editing.title}’을(를) 삭제할까요? 삭제하면 되돌릴 수 없어요.`)) {
      deleteTask(editing.id);
      onClose();
    }
  };

  const createProject = () => {
    const res = addProject(newProjectName);
    if ("error" in res) {
      setProjectError(res.error);
      return;
    }
    setProjectId(res.id);
    setCreatingProject(false);
    setNewProjectName("");
    setProjectError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
      >
        <h2 id="task-modal-title" className="text-lg font-bold text-slate-900">
          {editing ? "할 일 수정" : "할 일 추가"}
        </h2>

        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
          {/* 작업명 */}
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="task-title" className="text-sm font-semibold text-slate-800">
                작업명 <span className="text-rose-600">*</span>
              </label>
            </div>
            <input
              id="task-title"
              ref={titleRef}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 포트폴리오 수정"
              aria-invalid={!!errors.title}
              className={`mt-1.5 ${inputClass}`}
            />
            {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
          </div>

          {/* 프로젝트 */}
          <div>
            <label htmlFor="task-project" className="text-sm font-semibold text-slate-800">
              프로젝트
            </label>
            <select
              id="task-project"
              value={creatingProject ? NEW_PROJECT : (projectId ?? "")}
              onChange={(e) => {
                if (e.target.value === NEW_PROJECT) {
                  setCreatingProject(true);
                } else {
                  setCreatingProject(false);
                  setProjectId(e.target.value || null);
                }
              }}
              className={`mt-1.5 ${inputClass}`}
            >
              <option value="">프로젝트 없음 (개별 할 일)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={NEW_PROJECT}>+ 새 프로젝트</option>
            </select>
            {creatingProject && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => {
                      setNewProjectName(e.target.value);
                      setProjectError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createProject();
                      }
                    }}
                    placeholder="새 프로젝트 이름"
                    aria-label="새 프로젝트 이름"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={createProject}
                    className="shrink-0 rounded-lg bg-slate-800 px-3 text-sm font-medium text-white hover:bg-slate-900"
                  >
                    만들기
                  </button>
                </div>
                {projectError && <p className="text-xs text-rose-600">{projectError}</p>}
              </div>
            )}
          </div>

          {/* 마감일 */}
          <div>
            <label htmlFor="task-due" className="text-sm font-semibold text-slate-800">
              마감일
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="shrink-0 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100"
                >
                  마감일 지우기
                </button>
              )}
            </div>
            {errors.dueDate && <p className="mt-1 text-xs text-rose-600">{errors.dueDate}</p>}
          </div>

          {/* 중요도 */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">
              중요도 <span className="text-rose-600">*</span>
            </legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["high", "medium", "low"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={importance === level}
                  onClick={() => setImportance(level)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    importance === level
                      ? "border-indigo-600 bg-indigo-50 text-indigo-800"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {IMPORTANCE_LABEL[level]}
                </button>
              ))}
            </div>
          </fieldset>

          {/* 예상 소요시간 */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">
              예상 소요시간 <span className="text-rose-600">*</span>
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EST_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minutesText === String(m)}
                  onClick={() => setMinutesText(String(m))}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    minutesText === String(m)
                      ? "border-indigo-600 bg-indigo-50 text-indigo-800"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {formatMinutes(m)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="task-minutes" className="text-sm text-slate-600">
                직접 입력
              </label>
              <input
                id="task-minutes"
                ref={minutesRef}
                type="number"
                inputMode="numeric"
                min={EST_MIN}
                max={EST_MAX}
                step={5}
                value={minutesText}
                onChange={(e) => setMinutesText(e.target.value)}
                aria-invalid={!!errors.minutes}
                className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <span className="text-sm text-slate-600">분</span>
            </div>
            {errors.minutes && <p className="mt-1 text-xs text-rose-600">{errors.minutes}</p>}
          </fieldset>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
            {editing && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                삭제
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
