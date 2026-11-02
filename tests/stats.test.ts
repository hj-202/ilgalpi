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
    expect(p.bars[4].pct).toBeNull(); // 10/22(목)
    expect(p.bars[3].pct).toBe(0); // 10/21(수)
    expect(p.bars.map((b) => b.label).join("")).toBe("일월화수목금토");
  });
  it("최초 선택은 최고 완료율, 동률이면 최근", () => {
    const p = buildPeriod([t("2026-10-19", true), t("2026-10-21", true)], "week", "2026-10-22", 0);
    expect(defaultBarIndex(p.bars)).toBe(3); // 10/21(수)
    expect(defaultBarIndex(buildPeriod([], "week", "2026-10-22", 0).bars)).toBe(-1);
  });
  it("월간은 일요일 기준 주차로 나누고 해당 월 날짜만 집계", () => {
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

describe("월간 주차 (일요일 시작, 2026-11)", () => {
  const nov = Array.from({ length: 9 }, () => t("2026-11-02", true));
  const p = buildPeriod([...nov, t("2026-11-29", false), t("2026-10-31", true), t("2026-12-01", true)], "month", "2026-11-15", 0);
  it("주차 범위: 1주차 11/1~11/7 … 5주차 11/29~11/30", () => {
    expect(p.bars.map((b) => [b.label, b.from, b.to])).toEqual([
      ["1주차", "2026-11-01", "2026-11-07"],
      ["2주차", "2026-11-08", "2026-11-14"],
      ["3주차", "2026-11-15", "2026-11-21"],
      ["4주차", "2026-11-22", "2026-11-28"],
      ["5주차", "2026-11-29", "2026-11-30"],
    ]);
  });
  it("11/2의 할 일 9개는 1주차, 월 밖 날짜는 제외", () => {
    expect(p.bars[0]).toMatchObject({ total: 9, done: 9, pct: 100 });
    expect(p.bars[4]).toMatchObject({ total: 1, done: 0, pct: 0 });
    expect(p.completed).toBe(9);
  });
  it("주간 보기는 월 경계와 무관하게 일~토 전체", () => {
    const w = buildPeriod(nov, "week", "2026-11-02", 0);
    expect([w.from, w.to]).toEqual(["2026-11-01", "2026-11-07"]);
    const prev = buildPeriod([], "week", "2026-11-02", -1);
    expect([prev.from, prev.to]).toEqual(["2026-10-25", "2026-10-31"]);
  });
  it("10월·12월·연도 경계 주차", () => {
    const oct = buildPeriod([], "month", "2026-10-10", 0).bars;
    expect([oct[0].from, oct[0].to, oct.at(-1)!.from, oct.at(-1)!.to]).toEqual(["2026-10-01", "2026-10-03", "2026-10-25", "2026-10-31"]);
    const dec = buildPeriod([], "month", "2026-12-10", 0).bars;
    expect([dec.length, dec[0].to, dec.at(-1)!.from, dec.at(-1)!.to]).toEqual([5, "2026-12-05", "2026-12-27", "2026-12-31"]);
    const jan = buildPeriod([], "month", "2026-12-10", 1).bars;
    expect([jan[0].from, jan[0].to]).toEqual(["2027-01-01", "2027-01-02"]);
  });
});
