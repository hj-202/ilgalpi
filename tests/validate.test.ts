import { describe, expect, it } from "vitest";
import { validateRecommendation, type ValidationContext } from "../lib/recommend/validate";

const ctx: ValidationContext = {
  taskMinutes: { t1: 60, t2: 30, t3: 90 },
  projectIds: ["p1", "p2"],
  availableMinutes: 120,
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
    focusPlan: { taskIds: ["t1", "t2"], reason: "90분 안에 끝낼 수 있어요" },
    warnings: ["‘t3’는 시간이 부족해요"],
  };
}

function violationsOf(raw: unknown) {
  const out = validateRecommendation(raw, ctx);
  expect(out.valid).toBe(false);
  return out.valid ? [] : out.violations;
}

describe("validateRecommendation", () => {
  it("올바른 응답을 통과시키고 rank 순으로 정렬한다", () => {
    const out = validateRecommendation(valid(), ctx);
    expect(out.valid).toBe(true);
    if (out.valid) {
      expect(out.result.projectRankings.map((p) => p.projectId)).toEqual(["p1", "p2"]);
      expect(out.result.focusPlan.taskIds).toEqual(["t1", "t2"]);
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

  it("Focus 4개 이상", () => {
    const wide: ValidationContext = {
      ...ctx,
      taskMinutes: { t1: 15, t2: 15, t3: 15, t4: 15 },
      projectIds: [],
    };
    const r = {
      taskRankings: ["t1", "t2", "t3", "t4"].map((id, i) => ({ taskId: id, rank: i + 1, reason: "x" })),
      projectRankings: [],
      focusPlan: { taskIds: ["t1", "t2", "t3", "t4"], reason: "x" },
      warnings: [],
    };
    const out = validateRecommendation(r, wide);
    expect(out.valid).toBe(false);
  });

  it("Focus 합계가 가용 시간 초과", () => {
    const r = valid();
    r.focusPlan.taskIds = ["t1", "t3"]; // 150분 > 120분
    expect(violationsOf(r).join()).toContain("초과");
  });

  it("Focus 중복", () => {
    const r = valid();
    r.focusPlan.taskIds = ["t2", "t2"];
    expect(violationsOf(r).join()).toContain("중복");
  });

  it("Focus에 존재하지 않는(예: 완료된) 작업", () => {
    const r = valid();
    r.focusPlan.taskIds = ["done-task"];
    expect(violationsOf(r).join()).toContain("존재하지 않는");
  });

  it("들어가는 작업이 있는데 Focus가 비어 있으면 실패", () => {
    const r = valid();
    r.focusPlan.taskIds = [];
    expect(violationsOf(r).join()).toContain("최소 1개");
  });

  it("들어가는 작업이 없으면 빈 Focus 허용", () => {
    const tight = { ...ctx, availableMinutes: 15 };
    const r = valid();
    r.focusPlan = { taskIds: [], reason: "15분 안에 끝낼 작업이 없어요" };
    expect(validateRecommendation(r, tight).valid).toBe(true);
  });

  it("warnings가 배열이 아니면 실패, 긴 텍스트는 잘라낸다", () => {
    const r1 = { ...valid(), warnings: "x" };
    violationsOf(r1);
    const r2 = valid();
    r2.warnings = Array(8).fill("가".repeat(300));
    const out = validateRecommendation(r2, ctx);
    expect(out.valid).toBe(true);
    if (out.valid) {
      expect(out.result.warnings).toHaveLength(5);
      expect(out.result.warnings[0].length).toBe(150);
    }
  });
});
