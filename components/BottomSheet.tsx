"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SheetContext = createContext<() => void>(() => {});

/** 시트 안에서 호출하면 닫기 모션(아래로 슬라이드)을 재생한 뒤 onClose를 부른다 */
export const useSheetClose = () => useContext(SheetContext);

/**
 * 하단 시트 공통 틀: 딤 오버레이 하나 + 드래그 핸들 하나 + 패널. 열기 Slide Up / 닫기 Slide Down + 딤 페이드.
 * 내부 화면은 children만 바꾸면 되고, 그때 시트가 다시 올라오지 않는다.
 * Esc·배경 터치는 close(), 단 onEscape가 true를 돌려주면 그 동작(예: 뒤로 가기)만 하고 닫지 않는다.
 */
export default function BottomSheet({
  labelledBy,
  onClose,
  onEscape,
  focusKey,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  onEscape?: () => boolean;
  /** 값이 바뀌면(내부 화면 전환) 시트로 포커스를 옮긴다 */
  focusKey?: string;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ onClose, onEscape });
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    latest.current = { onClose, onEscape };
  });

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    timer.current = setTimeout(
      () => latest.current.onClose(),
      reduce ? 0 : 220,
    );
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (latest.current.onEscape?.()) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer.current);
      opener?.focus?.();
    };
  }, [close]);

  // 시트가 열려 있는 동안 뒤 화면 스크롤을 잠근다. 페이지 스크롤바가 사라지며 가로 레이아웃이 밀리지 않도록 스크롤바 폭만큼 보정한다
  useEffect(() => {
    const { body, documentElement: root } = document;
    const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const bar = window.innerWidth - root.clientWidth;
    if (bar > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + bar}px`;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.paddingRight;
    };
  }, []);

  useEffect(() => {
    if (focusKey !== undefined) panel.current?.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <SheetContext.Provider value={close}>
      <div
        data-closing={closing}
        className="sheet-dim fixed inset-0 z-40 flex items-end justify-center bg-black/40"
        onClick={close}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          data-closing={closing}
          onClick={(e) => e.stopPropagation()}
          className="sheet-panel flex max-h-[min(92dvh,720px)] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-xl outline-none"
        >
          <div
            className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[#dedee1]"
            aria-hidden
          />
          {children}
        </div>
      </div>
    </SheetContext.Provider>
  );
}

/**
 * 시트 본문: 콘텐츠 높이에 맞춰 부드럽게 늘고 줄며, 시트 최대 높이를 넘으면 이 영역만 스크롤된다(헤더·하단 버튼은 고정).
 * 높이가 바뀌는 동안 스크롤바가 깜빡이며 폭을 차지하지 않도록 스크롤바는 숨기고(no-scrollbar) 스크롤은 그대로 둔다.
 * 높이는 안쪽 콘텐츠를 ResizeObserver로 재서 CSS transition으로 바꾼다. 첫 측정 전에는 transition을 걸지 않는다.
 */
export function SheetBody({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setReady(true)),
    );
    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
    };
  }, []);
  return (
    <div
      style={{ height: h ?? undefined }}
      className={`no-scrollbar min-h-0 shrink overflow-y-auto overscroll-contain ${ready ? "transition-[height] duration-200 ease-out" : ""}`}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
