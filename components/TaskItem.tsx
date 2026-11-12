"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { carryOverTasks, deleteTask, setTaskCompleted } from "@/hooks/useAppStore";
import { EFFORT_LABEL, IMPORTANCE_LABEL } from "@/lib/constants";
import { formatDueChip } from "@/lib/date";
import type { Project, Task } from "@/lib/types";
import MoveDateSheet from "./MoveDateSheet";
import TaskEditSheet from "./TaskEditSheet";
import { Chip, EditFillIcon, GhostButton, Modal, MoreIcon, MoveArrowFillIcon, PrimaryButton, TrashFillIcon } from "./ui";

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
      <Chip tone={tone}>{task.effort ? EFFORT_LABEL[task.effort] : "소요시간 미정"}</Chip>
      {due && <Chip tone={due === "마감 지남" ? "warn" : tone}>{due}</Chip>}
    </div>
  );
}

const MENU_H = 152; // 팝오버 높이(147px) + 여백

/** 더보기(···) 팝오버: 수정하기 / 다른 날로 이동 / (구분선) / 삭제하기. 아래 공간이 부족하면 위로 연다. */
function TaskMenu({
  title,
  canMove,
  onEdit,
  onMove,
  onDelete,
}: {
  title: string;
  /** 완료한 작업은 기존 '할 일 옮기기'처럼 원래 날짜에 남기므로 이동할 수 없다 */
  canMove: boolean;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // 위·아래 가용 공간(하단 고정 탭바 위쪽까지)을 재서 방향을 정한다. 열려 있는 동안 스크롤·화면 크기 변경에도 다시 잰다.
  const place = useCallback(() => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const nav = document.querySelector("nav[aria-label='주요 화면']");
    const bottomLimit = Math.min(window.innerHeight, nav ? nav.getBoundingClientRect().top : window.innerHeight) - 8;
    const below = bottomLimit - r.bottom;
    const above = r.top - 8;
    if (r.bottom <= 0 || r.top >= bottomLimit) return setOpen(false); // 기준 버튼이 화면 밖(탭바 뒤 포함)으로 나가면 닫는다
    setUp(below < MENU_H && above > below);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const toggle = () => {
    if (!open) place();
    setOpen(!open);
  };
  const item = "flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-sm hover:bg-surface-muted active:bg-surface-muted";

  return (
    <div ref={wrap} className="relative -m-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={`‘${title}’ 더보기`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-11 w-11 place-items-center text-[#9b9ca3] hover:text-ink"
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-30 w-[164px] overflow-hidden rounded-xl border border-[#e8e8e9] bg-white py-1 shadow-[0_6px_20px_rgba(0,0,0,0.1)] ${up ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          <button
            type="button"
            role="menuitem"
            className={`${item} text-ink`}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <EditFillIcon />
            수정하기
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canMove}
            className={`${item} text-ink disabled:cursor-not-allowed disabled:text-[#b4b5ba] disabled:hover:bg-transparent`}
            onClick={() => {
              setOpen(false);
              onMove();
            }}
          >
            <MoveArrowFillIcon />
            다른 날로 이동
          </button>
          <div role="separator" className="mx-3 my-0.5 h-px bg-[#eee]" />
          <button
            type="button"
            role="menuitem"
            className={`${item} text-primary-dark`}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <TrashFillIcon />
            삭제하기
          </button>
        </div>
      )}
    </div>
  );
}

export default function TaskItem({
  task,
  projects,
  today,
  nowTime,
  selectable,
}: {
  task: Task;
  projects: Project[];
  today: string;
  nowTime: string;
  /** 이월 선택 모드일 때 체크박스 자리에 선택 컨트롤을 둔다 */
  selectable?: { selected: boolean; onChange: (selected: boolean) => void };
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState(false);
  const deleted = useRef(false); // 중복 클릭으로 두 번 삭제되지 않게 한다
  const closeEdit = useCallback(() => setEditing(false), []);
  const closeMove = useCallback(() => setMoving(false), []);
  const confirmDelete = () => {
    if (deleted.current) return;
    deleted.current = true;
    deleteTask(task.id);
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
        </div>
        <TaskMenu
          title={task.title}
          canMove={!task.isCompleted}
          onMove={() => setMoving(true)}
          onEdit={() => {
            track("Condition Settings Viewed");
            setEditing(true);
          }}
          onDelete={() => setConfirming(true)}
        />
      </div>
      {editing && <TaskEditSheet task={task} projects={projects} today={today} onClose={closeEdit} />}
      {moving && (
        <MoveDateSheet
          current={task.plannedDate}
          today={today}
          onClose={closeMove}
          onMove={(date) => {
            // 기존 일괄 이동 로직을 재사용한다(작업 날짜만 바뀌고 조건·완료 기한·시간은 그대로)
            carryOverTasks([task.id], date);
          }}
        />
      )}
      {confirming && (
        <Modal title="할 일을 삭제할까요?" onClose={() => setConfirming(false)}>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6f7176]">삭제한 할 일은 복구할 수 없어요.</p>
          <div className="mt-5 flex gap-[9px]">
            <GhostButton type="button" onClick={() => setConfirming(false)} className="min-h-[44px] flex-1 py-2.5">
              취소
            </GhostButton>
            <PrimaryButton type="button" onClick={confirmDelete} className="min-h-[44px] flex-1 py-2.5">
              삭제
            </PrimaryButton>
          </div>
        </Modal>
      )}
    </li>
  );
}
