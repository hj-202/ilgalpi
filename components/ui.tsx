"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";

/** 연그레이(기본) / 화이트+테두리(추천 결과) 정보 칩 (읽기 전용) */
export function Chip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warn" | "outline";
}) {
  const style =
    tone === "warn"
      ? "bg-primary-soft text-primary-dark"
      : tone === "outline"
        ? "border border-[#eedcde] bg-white font-medium text-[#5b5154]"
        : "bg-chip text-[#65676e]";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${style}`}>
      {children}
    </span>
  );
}

/**
 * 조건 선택 칩(작업 가능 시간 칩과 같은 컴포넌트). 내용 너비, 좌우 14px, 선택 = 차콜 Fill.
 * 시각적 높이는 38px이고 투명 영역으로 터치 영역을 40px 이상 확보한다.
 */
export function OptionChip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`relative min-h-[38px] whitespace-nowrap rounded-full border px-3.5 text-[12.5px] leading-none transition-colors after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-[''] disabled:opacity-40 ${
        selected
          ? "border-selected bg-selected font-semibold text-white"
          : "border-[#dedee1] bg-white text-[#505156] hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl border border-[#ddd] bg-white px-4 py-3 text-sm text-[#555] transition-colors hover:bg-surface-muted disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

/** 둥근 꼭짓점의 5각 별 포인트. 외접원 반지름 R, 안쪽 반지름 R*0.46 */
function starPoints(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.46;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// 별 크기가 원 지름(24)의 약 60%가 되도록: (6.7 + 선 반폭 0.6) × 2 ≈ 14.6
const STAR = starPoints(12, 12.6, 6.7);

/**
 * 하루 계획을 100% 완료했을 때의 기록 아이콘: 레드 원 + 흰색 5각 별(꼭짓점 라운딩).
 * 주간·월간 캘린더·온보딩이 같은 SVG를 쓴다.
 */
export function Stamp({ size = 22, label = "모두 완료" }: { size?: number; label?: string | null }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={label ? "img" : undefined} aria-label={label ?? undefined} aria-hidden={label ? undefined : true}>
      <circle cx="12" cy="12" r="12" fill="var(--color-primary)" />
      <polygon points={STAR} fill="#fff" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 11 12 3l9 8v10h-7v-6h-4v6H3z" />
    </svg>
  );
}

/** 내 기록 탭: 기록·통계를 연상시키는 막대 아이콘 */
export function RecordIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20V12M10 20V6M16 20V10M22 20V3" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronIcon({ dir, size = 20 }: { dir: "left" | "right" | "down" | "up"; size?: number }) {
  const d = { left: "M15 18 9 12l6-6", right: "M9 18l6-6-6-6", down: "M6 9l6 6 6-6", up: "M6 15l6-6 6 6" }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function CloudIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" />
    </svg>
  );
}

/** 프로토타입 v7의 Empty state 아이콘(Fill 형태) */
const EMPTY_ICONS = {
  task: (
    <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden>
      <rect x="8" y="9" width="32" height="34" rx="7" fill="currentColor" />
      <rect x="16" y="4" width="16" height="10" rx="4.5" fill="currentColor" stroke="#ffeded" strokeWidth="2.5" />
      <circle cx="17" cy="25" r="2.3" fill="#ffeded" />
      <rect x="22" y="23" width="12" height="4" rx="2" fill="#ffeded" />
      <circle cx="17" cy="34" r="2.3" fill="#ffeded" />
      <rect x="22" y="32" width="12" height="4" rx="2" fill="#ffeded" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden>
      <rect x="7" y="29" width="8" height="13" rx="3" fill="currentColor" />
      <rect x="20" y="19" width="8" height="23" rx="3" fill="currentColor" />
      <rect x="33" y="8" width="8" height="34" rx="3" fill="currentColor" />
    </svg>
  ),
  done: (
    <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden>
      <path d="M10 25l9 9L39 14" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden>
      <path fill="currentColor" d="M24 6a18 18 0 1 0 0 36 18 18 0 0 0 0-36Zm-2 10h4v13h-4Zm2 21a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
    </svg>
  ),
};

/** 공통 Empty state: 연핑크 라운드 사각형 + Fill 아이콘 / 제목 / 설명 / CTA */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: keyof typeof EMPTY_ICONS;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[20px] border border-[#eeeeef] bg-white px-3.5 pb-7 pt-[30px] text-center ${className}`}>
      <div className="mx-auto mb-5 grid h-[70px] w-[70px] place-items-center rounded-[21px] bg-[#ffeded] text-primary">
        {EMPTY_ICONS[icon]}
      </div>
      <strong className="block text-base leading-snug tracking-tight">{title}</strong>
      {description && <p className="mx-auto mt-2 max-w-[270px] text-[13px] leading-normal text-[#76777c]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const emptyCtaPrimary =
  "inline-flex min-h-[40px] items-center justify-center rounded-xl bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary-dark";
export const emptyCtaOutline =
  "inline-flex min-h-[40px] items-center justify-center rounded-xl border border-[#dedee2] bg-white px-4 text-[13px] font-bold text-[#333437] hover:bg-surface-muted";

// ---------- 모달 ----------

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([type="hidden"]),select,[tabindex]:not([tabindex="-1"])';

/** aria-modal 다이얼로그: 열면 포커스 이동·유지, Esc로 닫기, 닫으면 호출한 요소로 포커스 복귀 */
export function Modal({
  title,
  onClose,
  children,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>("textarea,input,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [dismissible]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#191a2470] p-[18px]"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90dvh] w-full max-w-[364px] overflow-y-auto rounded-[20px] bg-white p-[21px] shadow-[0_14px_60px_rgba(0,0,0,0.2)]"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-bold">
            {title}
          </h2>
          {dismissible && (
            <button type="button" onClick={onClose} aria-label="닫기" className="-m-2.5 p-2.5 text-[#888] hover:text-ink">
              <CloseIcon size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- 토스트 ----------

let toastMessage: string | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();

export function showToast(message: string) {
  toastMessage = message;
  toastListeners.forEach((l) => l());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage = null;
    toastListeners.forEach((l) => l());
  }, 2700);
}

export function ToastHost() {
  const msg = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toastMessage,
    () => null,
  );
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4">
      {msg && (
        <div className="max-w-[min(90vw,340px)] rounded-[11px] bg-[#292a2f] px-[17px] py-2.5 text-center text-[13px] text-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
          {msg}
        </div>
      )}
    </div>
  );
}

/** 홈과 추천 결과가 같이 쓰는 완료 진행 바 */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#f2f2f3]" role="progressbar" aria-label="완료율" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 온보딩·시작 화면 공통 카피 스타일(메인 24px Bold, 서브 16px) */
export const introTitle = "text-balance text-[24px] font-bold leading-[1.4] tracking-[-0.02em] text-[#19191b]";
export const introSub = "text-[16px] leading-[1.6] tracking-[-0.01em] text-[#8a8c93]";
