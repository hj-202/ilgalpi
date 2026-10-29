import type { AppState } from "./types";

/** 해당 날짜의 작업 가능 시간(분). 날짜별 값이 없으면 기본값 */
export function availableFor(app: AppState, date: string): number {
  return app.dailyAvailableMinutes[date] ?? app.preferences.availableMinutes;
}
