"use client";

import { useState } from "react";
import { carryOverTasks } from "@/hooks/useAppStore";
import { addDays, formatMonthDay } from "@/lib/date";
import type { Project, Task } from "@/lib/types";
import QuickAdd from "./QuickAdd";
import TaskItem from "./TaskItem";
import { ChevronIcon, EmptyState, ProgressBar } from "./ui";

export function focusQuickAdd() {
  requestAnimationFrame(() => {
    const el = document.getElementById("quick-add-input");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  });
}

/** 선택 날짜의 실행 기록(완료 n/m·진행 바) + 할 일 입력 + 구분선 목록 */
export default function DaySection({
  tasks,
  projects,
  allEmpty,
  selected,
  today,
  nowTime,
  hasRecommendation,
  onShowRecommendation,
}: {
  tasks: Task[];
  projects: Project[];
  allEmpty: boolean;
  selected: string;
  today: string;
  nowTime: string;
  hasRecommendation: boolean;
  onShowRecommendation: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [carrying, setCarrying] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // 날짜를 바꾸면 이월 선택 상태를 초기화한다
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setCarrying(false);
    setPicked(new Set());
    setOpenId(null);
  }
  const dayTasks = tasks.filter((t) => t.plannedDate === selected);
  const done = dayTasks.filter((t) => t.isCompleted).length;
  const total = dayTasks.length;
  const incompleteIds = dayTasks.filter((t) => !t.isCompleted).map((t) => t.id);
  const nextDay = addDays(selected, 1);
  const move = (target: string) => {
    carryOverTasks([...picked], target);
    setPicked(new Set());
    setCarrying(false);
  };
  const title = selected === today ? "오늘의 실행 기록" : `${formatMonthDay(selected)}의 할 일`;

  return (
    <>
      <section aria-labelledby="day-title" className="mx-0.5 mb-[15px] mt-[19px]">
        <div className="flex items-center justify-between gap-2">
          <h2 id="day-title" className="text-lg font-extrabold tracking-tight">
            {title}
          </h2>
          <span className="text-[13px] text-subtle">
            {total > 0 ? (
              <>
                {done}/{total} 완료
              </>
            ) : (
              "아직 할 일이 없어요"
            )}
          </span>
        </div>
        <div className="mt-2.5">
          <ProgressBar done={done} total={total} />
        </div>
        {total > 0 && done === total && (
          <p className="mt-2.5 text-sm font-semibold text-primary-dark">
            {selected === today ? "오늘 할 일을 모두 마쳤어요. 수고했어요!" : "이 날의 할 일을 모두 마쳤어요."}
          </p>
        )}
      </section>

      <section aria-label="할 일 목록" className="mt-[23px]">
        <div className="flex min-h-[28px] items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight">할 일</span>
          <span className="flex items-center gap-2 text-[13px] text-subtle">
            {hasRecommendation && (
              <button
                type="button"
                onClick={onShowRecommendation}
                className="inline-flex min-h-[36px] items-center gap-0.5 rounded-full border border-[#ebd6d8] bg-white px-3 text-xs text-[#b43d46] hover:bg-[#fff1f2]"
              >
                추천 결과 보기
                <ChevronIcon dir="right" size={14} />
              </button>
            )}
          </span>
        </div>

        <div className="mb-1.5 mt-3">
          <QuickAdd plannedDate={selected} />
        </div>

        {incompleteIds.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setCarrying(!carrying);
                setPicked(new Set());
              }}
              aria-pressed={carrying}
              className="min-h-[40px] text-[#707277] underline underline-offset-2"
            >
              {carrying ? "옮기기 취소" : "할 일 옮기기"}
            </button>
            {carrying && (
              <button
                type="button"
                onClick={() => setPicked(picked.size === incompleteIds.length ? new Set() : new Set(incompleteIds))}
                className="min-h-[40px] px-1 text-[#707277]"
              >
                {picked.size === incompleteIds.length ? "선택 해제" : "모두 선택"}
              </button>
            )}
          </div>
        )}
        {carrying && (
          <div role="group" aria-label="옮길 날짜" className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
            <span className="mr-1 text-sm">{picked.size > 0 ? `${picked.size}개 선택` : "옮길 작업을 선택해 주세요"}</span>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => move(nextDay)}
              className="min-h-[38px] rounded-full bg-selected px-3.5 text-[13px] text-white disabled:opacity-30"
            >
              {formatMonthDay(nextDay)}로 이동
            </button>
            {selected !== today && (
              <button
                type="button"
                disabled={picked.size === 0}
                onClick={() => move(today)}
                className="min-h-[38px] rounded-full border border-line px-3.5 text-[13px] disabled:opacity-30"
              >
                오늘로 이동
              </button>
            )}
          </div>
        )}

        {total > 0 ? (
          <ul className="mt-1 divide-y divide-[#eee] border-b border-[#eee]">
            {dayTasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                projects={projects}
                today={today}
                nowTime={nowTime}
                open={openId === t.id}
                onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                selectable={
                  carrying
                    ? {
                        selected: picked.has(t.id),
                        onChange: (on) => {
                          const next = new Set(picked);
                          if (on) next.add(t.id);
                          else next.delete(t.id);
                          setPicked(next);
                        },
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-3"
            icon="task"
            title={allEmpty || selected === today ? "아직 등록한 할 일이 없어요" : "이 날짜에 계획된 할 일이 없어요"}
            description={selected === today ? "오늘 해야 할 일을 하나씩 적어보세요." : `${formatMonthDay(selected)}에 해야 할 일을 적어보세요.`}
          />
        )}
      </section>
    </>
  );
}
