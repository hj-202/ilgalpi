import { describe, expect, it } from "vitest";
import { addMonths, formatDotDate, formatKoreanTime, formatDueChip, minutesUntilDue, monthGrid, weekDays, weekStart } from "../lib/date";

// 2026-10-20은 화요일
const TODAY = "2026-10-20";

describe("formatDueChip (PRD v2 §5.2)", () => {
  it("상대 표현을 쓴다", () => {
    expect(formatDueChip(null, null, TODAY)).toBeNull();
    expect(formatDueChip("2026-10-20", null, TODAY)).toBe("오늘");
    expect(formatDueChip("2026-10-20", "18:00", TODAY, "09:00")).toBe("오늘 18:00");
    expect(formatDueChip("2026-10-21", null, TODAY)).toBe("내일");
    expect(formatDueChip("2026-10-21", "18:00", TODAY)).toBe("내일 18:00"); // T06
    expect(formatDueChip("2026-10-21", "12:00", TODAY)).toBe("내일 12:00");
  });

  it("이번 주 / 다음 주 / 먼 날짜를 구분한다", () => {
    expect(formatDueChip("2026-10-23", "18:00", TODAY)).toBe("금요일 18:00");
    expect(formatDueChip("2026-10-25", null, TODAY)).toBe("일요일"); // 이번 주 마지막 날
    expect(formatDueChip("2026-10-26", null, TODAY)).toBe("다음 주 월요일");
    expect(formatDueChip("2026-10-28", null, TODAY)).toBe("다음 주 수요일"); // T07
    expect(formatDueChip("2026-11-06", "15:00", TODAY)).toBe("11월 6일 15:00");
  });

  it("지난 마감은 마감 지남", () => {
    expect(formatDueChip("2026-10-19", null, TODAY)).toBe("마감 지남");
    expect(formatDueChip("2026-10-20", "09:00", TODAY, "10:00")).toBe("마감 지남");
    expect(formatDueChip("2026-10-20", "09:00", TODAY, "08:00")).toBe("오늘 09:00");
  });
});

describe("calendar helpers", () => {
  it("주는 월요일에 시작한다", () => {
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // 일요일 → 그 주 월요일
    expect(weekDays(TODAY)).toHaveLength(7);
    expect(weekDays(TODAY)[0]).toBe("2026-10-19");
    expect(weekDays(TODAY)[6]).toBe("2026-10-25");
  });

  it("월간 그리드는 7칸 단위이고 해당 월 날짜만 채운다", () => {
    const grid = monthGrid(TODAY);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    const days = grid.flat().filter(Boolean);
    expect(days).toHaveLength(31);
    expect(grid[0][3]).toBe("2026-10-01"); // 2026-10-01은 목요일
  });

  it("월 이동 시 말일을 넘지 않는다", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("minutesUntilDue", () => {
  it("시각이 없으면 null, 있으면 남은 분", () => {
    expect(minutesUntilDue("2026-10-20", null, TODAY, "09:00")).toBeNull();
    expect(minutesUntilDue("2026-10-20", "18:00", TODAY, "09:00")).toBe(540);
    expect(minutesUntilDue("2026-10-21", "09:00", TODAY, "09:00")).toBe(1440);
  });
});

describe("마감 표시 형식", () => {
  it("날짜는 한 줄 점 표기", () => expect(formatDotDate("2026-10-30")).toBe("2026. 10. 30."));
  it("시간은 오전/오후 12시간제", () => {
    expect(formatKoreanTime("18:00")).toBe("오후 6:00");
    expect(formatKoreanTime("00:05")).toBe("오전 12:05");
    expect(formatKoreanTime("12:00")).toBe("오후 12:00");
    expect(formatKoreanTime("09:30")).toBe("오전 9:30");
  });
});
