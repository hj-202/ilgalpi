"use client";

import { useState } from "react";
import { setAvailableMinutes } from "@/hooks/useAppStore";
import { AVAIL_MAX, AVAIL_MIN, AVAIL_PRESETS } from "@/lib/constants";
import { formatMinutes } from "@/lib/format";

export default function AvailableTimePicker({ value }: { value: number }) {
  const [custom, setCustom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyCustom = () => {
    const n = Number(custom);
    if (!Number.isInteger(n) || n < AVAIL_MIN || n > AVAIL_MAX) {
      setError(`${AVAIL_MIN}분에서 ${AVAIL_MAX}분 사이로 입력해 주세요`);
      return;
    }
    setAvailableMinutes(n);
    setCustom(null);
    setError(null);
  };

  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">
        오늘 남은 작업 가능 시간 <span className="ml-1 text-indigo-700">{formatMinutes(value)}</span>
      </p>
      <p className="text-xs text-slate-500">지금부터 오늘 더 쓸 수 있는 시간을 골라 주세요.</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="오늘 남은 작업 가능 시간">
        {AVAIL_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={value === m}
            onClick={() => {
              setAvailableMinutes(m);
              setCustom(null);
              setError(null);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${
              value === m
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {formatMinutes(m)}
          </button>
        ))}
        {custom === null ? (
          <button
            type="button"
            onClick={() => setCustom(String(value))}
            className={`rounded-full border px-3 py-1 text-sm ${
              AVAIL_PRESETS.includes(value)
                ? "border-dashed border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                : "border-indigo-600 bg-indigo-600 text-white"
            }`}
          >
            {AVAIL_PRESETS.includes(value) ? "직접 입력" : `직접 입력: ${formatMinutes(value)}`}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyCustom();
            }}
            className="flex items-center gap-1"
          >
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min={AVAIL_MIN}
              max={AVAIL_MAX}
              step={15}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="가용 시간(분) 직접 입력"
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate-600">분</span>
            <button type="submit" className="rounded-lg bg-slate-800 px-2.5 py-1 text-sm text-white">
              적용
            </button>
            <button
              type="button"
              onClick={() => {
                setCustom(null);
                setError(null);
              }}
              className="px-1.5 py-1 text-sm text-slate-500"
            >
              취소
            </button>
          </form>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
