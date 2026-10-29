"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { AVAIL_MAX, AVAIL_MIN, AVAIL_PRESETS } from "@/lib/constants";
import { formatAvailable, formatMinutes } from "@/lib/format";
import { OptionChip } from "./ui";

const numInput = "h-10 w-16 rounded-lg border border-[#e5e5e7] px-2 text-center text-sm";

/** 선택한 날짜의 '이날 작업 가능한 시간'. 값은 분 단위로 날짜마다 따로 저장되며, 작업 완료로 자동 차감되지 않는다. */
export default function AvailableTimePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isPreset = AVAIL_PRESETS.includes(value);

  const openCustom = () => {
    setHours(String(Math.floor(value / 60)));
    setMins(String(value % 60));
    setError(null);
    setEditing(true);
  };

  const applyCustom = () => {
    const h = hours.trim() === "" ? 0 : Number(hours);
    const m = mins.trim() === "" ? 0 : Number(mins);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) {
      setError("시간은 0 이상의 정수, 분은 0~59로 입력해 주세요");
      return;
    }
    const total = h * 60 + m;
    if (total < AVAIL_MIN || total > AVAIL_MAX) {
      setError(`${AVAIL_MIN}분 이상 24시간 이하로 입력해 주세요`);
      return;
    }
    if (total !== value) track("Available Time Updated", { selection_type: "custom" });
    onChange(total);
    setEditing(false);
    setError(null);
  };

  return (
    <div className="border-b border-line pb-[18px] pt-[22px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold tracking-tight">이날 작업 가능한 시간</h2>
        <span className="text-[13px] text-subtle">{formatAvailable(value)}</span>
      </div>
      <div className="mt-3.5 flex flex-wrap items-start gap-2" role="group" aria-label="이날 작업 가능한 시간">
        {AVAIL_PRESETS.map((m) => (
          <OptionChip
            key={m}
            selected={value === m && !editing}
            onClick={() => {
              if (m !== value) track("Available Time Updated", { selection_type: "preset" });
              onChange(m);
              setEditing(false);
              setError(null);
            }}
          >
            {formatAvailable(m)}
          </OptionChip>
        ))}
        <OptionChip selected={!isPreset || editing} onClick={openCustom}>
          {!isPreset && !editing ? `직접 설정: ${formatMinutes(value)}` : "직접 설정"}
        </OptionChip>
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input autoFocus type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} aria-label="시간" className={numInput} />
          <span className="text-sm text-subtle">시간</span>
          <input type="number" inputMode="numeric" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} aria-label="분" className={numInput} />
          <span className="text-sm text-subtle">분</span>
          <button type="submit" className="h-10 rounded-lg bg-selected px-4 text-sm font-semibold text-white">
            적용
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="h-10 px-2 text-sm text-subtle"
          >
            취소
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-primary-dark">
          {error}
        </p>
      )}
    </div>
  );
}
