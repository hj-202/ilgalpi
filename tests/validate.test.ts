import { describe, expect, it } from "vitest";
import { buildFacts, findUngrounded } from "../lib/recommend/grounding";
import { validateRecommendation, type ValidationContext } from "../lib/recommend/validate";

const ctx: ValidationContext = {
  taskIds: ["t1", "t2", "t3"],
  projectIds: ["p1", "p2"],
};

function valid() {
  return {
    taskRankings: [
      { taskId: "t1", rank: 1, reason: "오늘 마감이에요" },
      { taskId: "t2", rank: 2, reason: "중요도 높음" },
      { taskId: "t3", rank: 3, reason: "마감까지 여유가 있어요" },
    ],
    projectRankings: [
      { projectId: "p2", rank: 2, reason: "이유 B" },
      { projectId: "p1", rank: 1, reason: "이유 A" },
    ],
    warnings: ["‘포트폴리오’는 2시간 이상 걸릴 수 있어요"],
  };
}

function violationsOf(raw: unknown, c: ValidationContext = ctx) {
  const out = validateRecommendation(raw, c);
  expect(out.valid).toBe(false);
  return out.valid ? [] : out.violations;
}

describe("validateRecommendation", () => {
  it("올바른 응답을 통과시키고 rank 순으로 정렬한다", () => {
    const out = validateRecommendation(valid(), ctx);
    expect(out.valid).toBe(true);
    if (out.valid) {
      expect(out.result.projectRankings.map((p) => p.projectId)).toEqual(["p1", "p2"]);
      expect(out.result.taskRankings.map((t) => t.taskId)).toEqual(["t1", "t2", "t3"]);
    }
  });

  it("객체가 아니면 실패", () => {
    violationsOf("not json");
    violationsOf(null);
  });

  it("존재하지 않는 작업 ID", () => {
    const r = valid();
    r.taskRankings[2].taskId = "t9";
    expect(violationsOf(r).join()).toContain("존재하지 않는");
  });

  it("작업 누락", () => {
    const r = valid();
    r.taskRankings.pop();
    expect(violationsOf(r).join()).toContain("누락");
  });

  it("중복 작업 ID", () => {
    const r = valid();
    r.taskRankings[2] = { taskId: "t1", rank: 3, reason: "x" };
    expect(violationsOf(r).join()).toContain("중복");
  });

  it("중복 순위", () => {
    const r = valid();
    r.taskRankings[1].rank = 1;
    expect(violationsOf(r).length).toBeGreaterThan(0);
  });

  it("비연속 순위", () => {
    const r = valid();
    r.taskRankings[2].rank = 5;
    expect(violationsOf(r).join()).toContain("연속");
  });

  it("빈 이유", () => {
    const r = valid();
    r.taskRankings[0].reason = "  ";
    expect(violationsOf(r).join()).toContain("reason");
  });

  it("프로젝트 누락·존재하지 않는 프로젝트", () => {
    const r = valid();
    r.projectRankings = [{ projectId: "p9", rank: 1, reason: "x" }];
    const v = violationsOf(r).join();
    expect(v).toContain("존재하지 않는");
    expect(v).toContain("누락");
  });

  it("warnings가 배열이 아니면 실패", () => {
    const r = { ...valid(), warnings: "x" };
    expect(violationsOf(r).join()).toContain("warnings");
  });

  it("긴 이유는 잘라서 통과시킨다", () => {
    const r = valid();
    r.taskRankings[0].reason = "가".repeat(300);
    const out = validateRecommendation(r, ctx);
    expect(out.valid).toBe(true);
    if (out.valid) expect(out.result.taskRankings[0].reason.length).toBeLessThanOrEqual(100);
  });
});

describe("근거 검사: 입력에 없는 날짜·시각·시간 표현 금지", () => {
  const facts = buildFacts({
    currentDate: "2026-10-20",
    currentTime: "09:30",
    planDate: "2026-10-21",
    availableMinutes: 120,
    tasks: [
      { dueDate: "2026-10-22", dueTime: "18:00", minutesUntilDue: 2910 },
      { dueDate: null, dueTime: null },
    ],
  });

  it("입력에 있는 값과 규모 라벨은 허용한다", () => {
    expect(findUngrounded("10월 22일 18:00 마감이고 30분 이내 작업이라 먼저 하세요", facts)).toEqual([]);
    expect(findUngrounded("2시간 이상 걸릴 수 있고 이날 가능한 시간은 2시간이에요", facts)).toEqual([]);
    expect(findUngrounded("10/22 마감이에요", facts)).toEqual([]);
  });

  it("입력에 없는 날짜·시각·시간은 걸러낸다", () => {
    expect(findUngrounded("10월 25일까지예요", facts)).toEqual(["10월 25일"]);
    expect(findUngrounded("11/3 마감이에요", facts)).toEqual(["11/3"]);
    expect(findUngrounded("21:45에 끝내세요", facts)).toEqual(["21:45"]);
    expect(findUngrounded("45분이면 충분해요", facts)).toEqual(["45분"]);
    expect(findUngrounded("3시간 걸려요", facts)).toEqual(["3시간"]);
  });

  it("일 수(N일 남음)는 날짜 표현이 아니므로 검사하지 않는다", () => {
    expect(findUngrounded("마감까지 5일 남았어요", facts)).toEqual([]);
  });

  it("검증기가 이유와 주의사항에서 지어낸 값을 위반으로 보고한다", () => {
    const c: ValidationContext = { ...ctx, facts };
    const r = valid();
    r.taskRankings[0].reason = "10월 30일 마감이라 서두르세요";
    expect(violationsOf(r, c).join()).toContain("10월 30일");
    const w = valid();
    w.warnings = ["45분 안에 끝낼 수 있어요"];
    expect(violationsOf(w, c).join()).toContain("45분");
    expect(validateRecommendation(valid(), c).valid).toBe(true);
  });
});

describe("추천 이유의 근거 검사(taskMeta)", () => {
  const base = (reason: string) => ({
    taskRankings: [{ taskId: "t1", rank: 1, reason }],
    projectRankings: [],
    warnings: [],
  });
  const ctx = (meta: { hasDue: boolean; importance: string }) => ({ taskIds: ["t1"], projectIds: [], taskMeta: { t1: meta } });
  it("마감일이 없는 작업에 마감 임박 설명이 있으면 거부", () => {
    expect(validateRecommendation(base("마감이 가까워요. 먼저 하세요."), ctx({ hasDue: false, importance: "high" })).valid).toBe(false);
  });
  it("마감일이 있으면 허용", () => {
    expect(validateRecommendation(base("마감이 가까워요. 먼저 하세요."), ctx({ hasDue: true, importance: "high" })).valid).toBe(true);
  });
  it("중요도가 높지 않은데 중요하다고 하면 거부", () => {
    expect(validateRecommendation(base("중요한 일이라 먼저 하세요."), ctx({ hasDue: false, importance: "medium" })).valid).toBe(false);
  });
});
