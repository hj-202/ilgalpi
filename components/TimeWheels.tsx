"use client";

import { useEffect, useRef } from "react";

const ITEM_H = 40;
const VIEW_H = 200; // 5줄. 가운데 줄이 선택값
const PAD = (VIEW_H - ITEM_H) / 2;

export const AMPM = [
  { value: 0, label: "오전" },
  { value: 1, label: "오후" },
];
export const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}` }));
export const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: i, label: String(i).padStart(2, "0") }));

export function parseHm(value: string | null) {
  const [h, m] = (value ?? "18:00").split(":").map(Number);
  return { pm: h >= 12 ? 1 : 0, hour: h % 12 === 0 ? 12 : h % 12, minute: m };
}

/** 오전·오후 / 시 / 분 → "HH:mm" (24시간제). 오전 12시 = 00:00, 오후 12시 = 12:00 */
export function toHm(pm: number, hour: number, minute: number): string {
  const h24 = (hour % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 스크롤 스냅 휠. 가운데에 멈춘 항목이 선택값이다. 클릭·방향키로도 조작할 수 있다. */
export function Wheel({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Array<{ value: number; label: string }>;
  value: number;
  onChange: (v: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const index = Math.max(0, items.findIndex((i) => i.value === value));

  useEffect(() => {
    if (box.current) box.current.scrollTop = index * ITEM_H;
    // 최초 위치만 맞춘다. 이후 스크롤은 사용자가 주도한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (i: number, smooth = true) => {
    const next = Math.min(items.length - 1, Math.max(0, i));
    box.current?.scrollTo({ top: next * ITEM_H, behavior: smooth ? "smooth" : "auto" });
    onChange(items[next].value);
  };

  return (
    <div className="relative flex-1" style={{ height: VIEW_H }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 rounded-xl bg-surface-muted"
        style={{ top: PAD, height: ITEM_H }}
      />
      <div
        ref={box}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={`${label}-${items[index].value}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            goTo(index + (e.key === "ArrowDown" ? 1 : -1));
          }
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
            if (items[i].value !== value) onChange(items[i].value);
          }, 80);
        }}
        className="no-scrollbar relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain focus:outline-none"
        style={{ paddingTop: PAD, paddingBottom: PAD }}
      >
        {items.map((item, i) => (
          <div
            key={item.value}
            id={`${label}-${item.value}`}
            role="option"
            aria-selected={i === index}
            onClick={() => goTo(i)}
            className={`flex cursor-pointer snap-center items-center justify-center text-[17px] transition-colors ${
              i === index ? "font-bold text-ink" : "text-[#a9aab2]"
            }`}
            style={{ height: ITEM_H }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

