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
    expect(formatDueChip("2026-10-24", null, TODAY)).toBe("토요일"); // 이번 주 마지막 날
    expect(formatDueChip("2026-10-25", null, TODAY)).toBe("다음 주 일요일"); // 일요일 시작 → 다음 주 첫날
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
  it("주는 일요일에 시작한다", () => {
    expect(weekStart("2026-10-25")).toBe("2026-10-25"); // 일요일 → 자기 자신
    expect(weekStart("2026-10-24")).toBe("2026-10-18"); // 토요일 → 그 주 일요일
    expect(weekDays(TODAY)).toHaveLength(7);
    expect(weekDays(TODAY)[0]).toBe("2026-10-18");
    expect(weekDays(TODAY)[6]).toBe("2026-10-24");
  });

  it("월간 그리드는 7칸 단위이고 해당 월 날짜만 채운다", () => {
    const grid = monthGrid(TODAY);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    const days = grid.flat().filter(Boolean);
    expect(days).toHaveLength(31);
    expect(grid[0][4]).toBe("2026-10-01"); // 2026-10-01은 목요일(일요일 시작 → 5번째 칸)
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

describe("일요일 시작 달력 (2026-10 ~ 2026-12, 연도 경계)", () => {
  const firstCells = (ymd: string) => monthGrid(ymd).map((w) => w.findIndex(Boolean));
  it("월 1일의 칸 위치와 행 수", () => {
    expect(monthGrid("2026-10-15")[0].indexOf("2026-10-01")).toBe(4); // 목
    expect(monthGrid("2026-11-15")[0].indexOf("2026-11-01")).toBe(0); // 일
    expect(monthGrid("2026-12-15")[0].indexOf("2026-12-01")).toBe(2); // 화
    expect(monthGrid("2026-10-15")).toHaveLength(5);
    expect(monthGrid("2026-11-15")).toHaveLength(5);
    expect(monthGrid("2026-12-15")).toHaveLength(5);
    expect(firstCells("2026-11-15")[1]).toBe(0);
  });
  it("2026-11 마지막 행은 11/29(일) ~ 11/30(월)", () => {
    const last = monthGrid("2026-11-02").at(-1)!;
    expect(last.slice(0, 2)).toEqual(["2026-11-29", "2026-11-30"]);
    expect(last.slice(2).every((c) => c === null)).toBe(true);
  });
  it("주간 범위는 월·연 경계를 넘어도 일~토 전체", () => {
    expect(weekDays("2026-11-02")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(weekDays("2026-12-31")[0]).toBe("2026-12-27");
    expect(weekDays("2026-12-31")[6]).toBe("2027-01-02");
    expect(weekDays("2026-11-30")[0]).toBe("2026-11-29");
    expect(weekDays("2026-11-30")[6]).toBe("2026-12-05");
  });
});
