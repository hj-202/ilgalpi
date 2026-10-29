import { describe, expect, it } from "vitest";
import { buildPeriod, defaultBarIndex, pastRecords } from "@/lib/stats";
import type { Task } from "@/lib/types";

let n = 0;
const t = (plannedDate: string, done: boolean): Task => ({
  id: String(++n),
  projectId: null,
  title: "x",
  plannedDate,
  dueDate: null,
  dueTime: null,
  importance: "medium",
  effort: null,
  legacyMinutes: null,
  isCompleted: done,
  completedAt: done ? "2026-10-20T00:00:00Z" : null,
  createdAt: "",
  updatedAt: "",
});

describe("stats", () => {
  const tasks = [
    t("2026-10-19", true), t("2026-10-19", false), // 50%
    t("2026-10-20", true), // 100%
    t("2026-10-21", false), // 0%
  ];
  it("평균 완료율은 일별 완료율의 산술평균(할 일 없는 날 제외, 0% 포함)", () => {
    const p = buildPeriod(tasks, "week", "2026-10-22", 0);
    expect(p.bars).toHaveLength(7);
    expect(p.averagePct).toBe(50); // (50+100+0)/3
    expect(p.completed).toBe(2);
    expect(p.fullDays).toBe(1);
    expect(p.bars[3].pct).toBeNull();
    expect(p.bars[2].pct).toBe(0);
  });
  it("최초 선택은 최고 완료율, 동률이면 최근", () => {
    const p = buildPeriod([t("2026-10-19", true), t("2026-10-21", true)], "week", "2026-10-22", 0);
    expect(defaultBarIndex(p.bars)).toBe(2);
    expect(defaultBarIndex(buildPeriod([], "week", "2026-10-22", 0).bars)).toBe(-1);
  });
  it("월간은 월요일 기준 주차로 나누고 해당 월 날짜만 집계", () => {
    const p = buildPeriod(tasks, "month", "2026-10-22", 0);
    expect(p.bars[0].from).toBe("2026-10-01");
    expect(p.bars.at(-1)!.to).toBe("2026-10-31");
    const w = p.bars.find((b) => b.from <= "2026-10-19" && b.to >= "2026-10-19")!;
    expect(w.total).toBe(4);
    expect(w.pct).toBe(50);
    expect(p.averagePct).toBe(50);
  });
  it("지난 기록은 오늘까지·최신순", () => {
    const r = pastRecords([...tasks, t("2026-10-30", false)], "2026-10-25");
    expect(r.map((x) => x.date)).toEqual(["2026-10-21", "2026-10-20", "2026-10-19"]);
  });
});
