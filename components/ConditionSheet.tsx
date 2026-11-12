"use client";

import { useState, type ReactNode } from "react";
import BottomSheet, { SheetBody, useSheetClose } from "./BottomSheet";
import ConditionFields, { type ConditionValue } from "./ConditionFields";
import { DueCalendar, DueTimeField, ResetIcon } from "./DueSheet";
import { ChevronIcon, HeaderCloseButton, GhostButton, PrimaryButton } from "./ui";

/**
 * 조건 설정·할 일 수정이 함께 쓰는 단일 바텀시트. 오버레이·핸들·패널은 하나이고
 * 조건 편집 화면 ↔ 완료 기한 화면은 안쪽 콘텐츠만 전환된다(시트가 다시 올라오지 않는다).
 * 편집 값(cond·제목 등)은 부모가 들고 있어 화면을 오가도 유지되고, 부모의 확인(저장·적용) 전에는 아무것도 저장하지 않는다.
 * 완료 기한 화면의 `적용하기`는 편집 중인 조건에만 반영하고 편집 화면으로 돌아간다. 뒤로 가기는 변경 없이 복귀, X·배경·Esc(편집 화면)는 전체를 닫는다.
 */
export function ConditionSheetFrame({
  title,
  titleId,
  cond,
  onCond,
  today,
  top,
  bottom,
  error,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  titleId: string;
  cond: ConditionValue;
  onCond: (next: ConditionValue) => void;
  today: string;
  /** 조건 선택 위에 둘 입력(예: 할 일 제목) */
  top?: ReactNode;
  /** 조건 선택 아래에 둘 입력(예: 프로젝트) */
  bottom?: ReactNode;
  error: string | null;
  confirmLabel: string;
  /** false를 돌려주면(검증 실패) 닫지 않는다 */
  onConfirm: () => boolean | void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"edit" | "due">("edit");
  return (
    <BottomSheet
      labelledBy={titleId}
      onClose={onClose}
      focusKey={view}
      onEscape={() => {
        if (view !== "due") return false;
        setView("edit");
        return true;
      }}
    >
      <FrameBody
        view={view}
        setView={setView}
        {...{
          title,
          titleId,
          cond,
          onCond,
          today,
          top,
          bottom,
          error,
          confirmLabel,
          onConfirm,
        }}
      />
    </BottomSheet>
  );
}

function FrameBody({
  view,
  setView,
  title,
  titleId,
  cond,
  onCond,
  today,
  top,
  bottom,
  error,
  confirmLabel,
  onConfirm,
}: {
  view: "edit" | "due";
  setView: (v: "edit" | "due") => void;
  title: string;
  titleId: string;
  cond: ConditionValue;
  onCond: (next: ConditionValue) => void;
  today: string;
  top?: ReactNode;
  bottom?: ReactNode;
  error: string | null;
  confirmLabel: string;
  onConfirm: () => boolean | void;
}) {
  const close = useSheetClose();
  // 완료 기한 화면의 임시 값. 들어올 때 현재 편집 값으로 채우고, 적용하기를 눌러야 cond에 반영한다
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [month, setMonth] = useState(today);

  const openDue = () => {
    setDate(cond.dueDate);
    setTime(cond.dueDate ? cond.dueTime : null);
    setMonth(cond.dueDate ?? today);
    setView("due");
  };

  const headerClass =
    "sheet-view flex shrink-0 items-center justify-between px-5 pb-1 pt-3";
  const footerClass =
    "sheet-view flex shrink-0 items-center gap-2 border-t border-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3";

  if (view === "due") {
    return (
      <>
        <div key="h-due" className={headerClass}>
          <div className="-ml-2 flex items-center">
            <button
              type="button"
              onClick={() => setView("edit")}
              aria-label="뒤로"
              className="grid h-11 w-9 place-items-center text-ink"
            >
              <ChevronIcon dir="left" size={22} />
            </button>
            <h3 id={titleId} className="text-lg font-bold">
              완료 기한
            </h3>
          </div>
          <HeaderCloseButton onClick={close} />
        </div>
        <SheetBody>
          <div key="b-due" className="sheet-view px-5 pb-3">
            <DueCalendar
              date={date}
              onSelect={setDate}
              month={month}
              onMonth={setMonth}
              today={today}
            />
            <DueTimeField
              time={time}
              onChange={setTime}
              disabled={!date}
              className="mt-3 border-t border-line pt-1"
            />
          </div>
        </SheetBody>
        <div key="f-due" className={footerClass}>
          <button
            type="button"
            aria-label="완료 기한 초기화"
            title="완료 기한 초기화"
            disabled={date === null && time === null}
            onClick={() => {
              setDate(null);
              setTime(null);
            }}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ResetIcon />
          </button>
          <PrimaryButton
            type="button"
            onClick={() => {
              onCond({
                ...cond,
                dueMode: "custom",
                dueDate: date,
                dueTime: date ? time : null,
              });
              setView("edit");
            }}
            className="min-h-12 flex-1"
          >
            적용하기
          </PrimaryButton>
        </div>
      </>
    );
  }

  return (
    <>
      <div key="h-edit" className={headerClass}>
        <h3 id={titleId} className="text-lg font-bold">
          {title}
        </h3>
        <HeaderCloseButton onClick={close} />
      </div>
      <SheetBody>
        <div
          key="b-edit"
          className="sheet-view flex flex-col gap-4 px-5 pb-4 pt-2"
        >
          {top}
          <ConditionFields
            value={cond}
            onChange={onCond}
            today={today}
            onOpenDue={openDue}
          />
          {bottom}
          {error && (
            <p role="alert" className="text-xs text-primary-dark">
              {error}
            </p>
          )}
        </div>
      </SheetBody>
      <div key="f-edit" className={footerClass}>
        <GhostButton type="button" onClick={close} className="min-h-12 flex-1">
          취소
        </GhostButton>
        <PrimaryButton
          type="button"
          onClick={() => {
            if (onConfirm() !== false) close();
          }}
          className="min-h-12 flex-1"
        >
          {confirmLabel}
        </PrimaryButton>
      </div>
    </>
  );
}

/**
 * 신규 할 일의 조건 설정. 적용하기는 조건값만 부모(홈의 신규 입력 상태)에 전달하고 할 일은 등록하지 않는다.
 */
export default function ConditionSheet({
  value,
  today,
  onApply,
  onClose,
}: {
  value: ConditionValue;
  today: string;
  onApply: (next: ConditionValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ConditionValue>(value);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConditionSheetFrame
      title="조건 설정"
      titleId="condition-sheet-title"
      cond={draft}
      onCond={(next) => {
        setDraft(next);
        setError(null);
      }}
      today={today}
      error={error}
      confirmLabel="적용하기"
      onConfirm={() => {
        if (draft.dueMode === "custom" && !draft.dueDate) {
          setError("완료 날짜를 선택해 주세요");
          return false;
        }
        onApply(draft);
      }}
      onClose={onClose}
    />
  );
}
