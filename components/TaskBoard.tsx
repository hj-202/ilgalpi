"use client";

import { useState } from "react";
import { addProject, deleteProject, renameProject } from "@/hooks/useAppStore";
import { PROJECT_NAME_MAX } from "@/lib/constants";
import type { Project, Task } from "@/lib/types";
import TaskRow from "./TaskRow";

interface BoardProps {
  projects: Project[];
  tasks: Task[];
  today: string;
  onAddTask: (projectId: string | null) => void;
  onEditTask: (task: Task) => void;
}

/** 미완료(등록순) → 완료(등록순) */
function ordered(tasks: Task[]) {
  return [...tasks.filter((t) => !t.isCompleted), ...tasks.filter((t) => t.isCompleted)];
}

function NameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => string | null;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const err = onSubmit(name);
        if (err) setError(err);
      }}
      className="flex flex-col gap-1"
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          maxLength={PROJECT_NAME_MAX + 10}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          placeholder="프로젝트 이름"
          aria-label="프로젝트 이름"
          aria-invalid={!!error}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
          취소
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </form>
  );
}

function ProjectCard({
  project,
  tasks,
  today,
  onAddTask,
  onEditTask,
}: {
  project: Project;
  tasks: Task[];
  today: string;
  onAddTask: (projectId: string | null) => void;
  onEditTask: (task: Task) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const incomplete = tasks.filter((t) => !t.isCompleted).length;

  const handleDelete = () => {
    const ok = window.confirm(
      `‘${project.name}’ 프로젝트를 삭제할까요? 소속 작업 ${tasks.length}개는 ‘개별 할 일’로 이동해요.`,
    );
    if (ok) deleteProject(project.id);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        {renaming ? (
          <div className="flex-1">
            <NameForm
              initial={project.name}
              submitLabel="저장"
              onSubmit={(name) => {
                const err = renameProject(project.id, name);
                if (!err) setRenaming(false);
                return err;
              }}
              onCancel={() => setRenaming(false)}
            />
          </div>
        ) : (
          <>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
              {project.name}
              <span className="text-sm font-normal text-slate-500">미완료 {incomplete}</span>
            </h3>
            <div className="flex shrink-0 gap-1 text-xs">
              <button type="button" onClick={() => setRenaming(true)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
                이름 수정
              </button>
              <button type="button" onClick={handleDelete} className="rounded-md px-2 py-1 text-rose-600 hover:bg-rose-50">
                삭제
              </button>
            </div>
          </>
        )}
      </header>

      {tasks.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {ordered(tasks).map((t) => (
            <TaskRow key={t.id} task={t} today={today} onEdit={onEditTask} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">아직 할 일이 없어요.</p>
      )}
      <button
        type="button"
        onClick={() => onAddTask(project.id)}
        className="mt-2 text-sm font-medium text-indigo-700 hover:underline"
      >
        + 이 프로젝트에 할 일 추가
      </button>
    </section>
  );
}

export default function TaskBoard({ projects, tasks, today, onAddTask, onEditTask }: BoardProps) {
  const [creating, setCreating] = useState(false);
  const individual = tasks.filter((t) => t.projectId === null);
  const isEmpty = projects.length === 0 && tasks.length === 0;

  return (
    <section aria-labelledby="board-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 id="board-title" className="text-lg font-bold text-slate-900">내 할 일</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + 새 프로젝트
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-indigo-200 bg-white p-4">
          <NameForm
            initial=""
            submitLabel="만들기"
            onSubmit={(name) => {
              const res = addProject(name);
              if ("error" in res) return res.error;
              setCreating(false);
              return null;
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-base font-semibold text-slate-800">아직 등록된 할 일이 없어요.</p>
          <p className="mt-1 text-sm text-slate-500">해야 할 일을 모두 적어 보세요. 프로젝트 없이 바로 등록해도 돼요.</p>
          <button
            type="button"
            onClick={() => onAddTask(null)}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            할 일 추가하기
          </button>
        </div>
      ) : (
        <>
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              tasks={tasks.filter((t) => t.projectId === p.id)}
              today={today}
              onAddTask={onAddTask}
              onEditTask={onEditTask}
            />
          ))}

          <section className="rounded-xl border border-slate-200 bg-slate-100/60 p-4">
            <h3 className="text-base font-semibold text-slate-900">
              개별 할 일{" "}
              <span className="text-sm font-normal text-slate-500">
                미완료 {individual.filter((t) => !t.isCompleted).length}
              </span>
            </h3>
            <p className="text-xs text-slate-500">프로젝트에 속하지 않은 할 일이에요.</p>
            {individual.length > 0 ? (
              <ul className="mt-2 divide-y divide-slate-200">
                {ordered(individual).map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onEdit={onEditTask} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">개별 할 일이 없어요.</p>
            )}
            <button
              type="button"
              onClick={() => onAddTask(null)}
              className="mt-2 text-sm font-medium text-indigo-700 hover:underline"
            >
              + 개별 할 일 추가
            </button>
          </section>
        </>
      )}
    </section>
  );
}
