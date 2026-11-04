"use client";

import { useEffect, useState } from "react";

/** 이 시간이 지나도 응답이 없으면 지연 안내로 바꾼다(실제 진행률이 아니므로 숫자는 보이지 않는다) */
export const SLOW_AFTER_MS = 8_000;

export const LOADING_MAIN = "추천 결과를 준비하고 있어요";
export const LOADING_SUB = "잠시만 기다려 주세요";
export const LOADING_SUB_SLOW = "평소보다 시간이 조금 더 걸리고 있어요";

export function loadingSub(slow: boolean) {
  return slow ? LOADING_SUB_SLOW : LOADING_SUB;
}

/** 추천 요청 중 목록·결과 영역을 대신하는 미니멀 로딩(시안: design-references/loading/03). 회색 트랙은 고정, 레드 라인이 12시부터 시계 방향으로 차오르기를 반복한다 */
/** 로딩 직전 영역 높이를 그대로 유지하되 너무 작거나 크지 않게 제한한다(화면이 갑자기 줄거나 늘어나지 않도록) */
export const LOADING_MIN_H = 290;
export const LOADING_MAX_H = 480;
export function clampLoadingHeight(prev: number | null) {
  return Math.min(LOADING_MAX_H, Math.max(LOADING_MIN_H, prev ?? LOADING_MIN_H));
}

export default function RecommendLoading({ prevHeight = null }: { prevHeight?: number | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div role="status" aria-live="polite" style={{ minHeight: clampLoadingHeight(prevHeight) }} className="flex flex-col items-center justify-center px-4 py-8 text-center">
      <svg aria-hidden="true" width="140" height="140" viewBox="0 0 140 140" className="block">
        <circle cx="70" cy="70" r="64.5" fill="none" stroke="var(--color-line)" strokeWidth="11" />
        <circle
          className="rec-ring-arc"
          cx="70"
          cy="70"
          r="64.5"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="11"
          strokeLinecap="round"
          pathLength={100}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <p className="mt-8 text-xl font-bold tracking-tight">{LOADING_MAIN}</p>
      <p className="mt-2.5 text-base text-subtle">{loadingSub(slow)}</p>
    </div>
  );
}
