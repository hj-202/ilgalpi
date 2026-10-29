/** 분 → "45분" / "1시간" / "1시간 30분" */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 작업 가능 시간 칩 라벨. 60분은 '1시간 이내'(그날 총시간의 상한) */
export function formatAvailable(minutes: number): string {
  return minutes === 60 ? "1시간 이내" : formatMinutes(minutes);
}
