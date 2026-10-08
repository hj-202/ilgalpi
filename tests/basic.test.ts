import { describe, expect, it } from "vitest";
import { basicRecommend } from "../lib/recommend/basic";
import { buildValidationContext } from "../lib/recommend/buildRequest";
import { validateRecommendation } from "../lib/recommend/validate";
import type { Importance, Project, Task } from "../lib/types";

const TODAY = "2026-10-08";
let seq = 0;

function task(
  title: string,
  opts: { projectId?: string | null; due?: string | null; imp?: Importance; min?: number } = {},
): Task {
  seq += 1;
  const ts = new Date(Date.UTC(2026, 0, 1, 0, seq)).toISOString();
  return {
    id: `t-${title}`,
    projectId: opts.projectId ?? null,
    title,
    dueDate: opts.due ?? null,
    importance: opts.imp ?? "medium",
    estimatedMinutes: opts.min ?? 30,
    isCompleted: false,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

const project = (id: string, name: string): Project => ({
  id,
  name,
  createdAt: TODAY,
  updatedAt: TODAY,
});

function run(tasks: Task[], projects: Project[], availableMinutes: number) {
  const result = basicRecommend({ tasks, projects, availableMinutes, today: TODAY });
  const out = validateRecommendation(
    result,
    buildValidationContext(tasks, projects.map((p) => p.id), availableMinutes),
  );
  expect(out.valid, JSON.stringify(out)).toBe(true);
  return result;
}

describe("basicRecommend", () => {
  const projects = [project("pA", "바나프레소"), project("pB", "스위프")];
  const tasks = [
    task("포트폴리오", { projectId: "pA", due: "2026-10-08", imp: "high", min: 90 }),
    task("이력서", { projectId: "pA", due: "2026-10-12", imp: "high", min: 60 }),
    task("PPT", { projectId: "pB", due: "2026-10-18", imp: "low", min: 30 }),
    task("QA", { projectId: "pB", imp: "medium", min: 45 }),
    task("택배", { due: "2026-10-09", imp: "medium", min: 20 }),
    task("병원", { imp: "low", min: 15 }),
  ];

  it("검증 규칙을 통과하고 모든 작업을 순위에 포함한다", () => {
    const r = run(tasks, projects, 180);
    expect(r.taskRankings).toHaveLength(tasks.length);
    expect(r.projectRankings.map((p) => p.projectId)).toEqual(["pA", "pB"]);
  });

  it("Focus 합계가 가용 시간(60/180분)을 넘지 않고 최대 3개", () => {
    for (const avail of [60, 180]) {
      const r = run(tasks, projects, avail);
      const total = r.focusPlan.taskIds
        .map((id) => tasks.find((t) => t.id === id)!.estimatedMinutes)
        .reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(avail);
      expect(r.focusPlan.taskIds.length).toBeGreaterThan(0);
      expect(r.focusPlan.taskIds.length).toBeLessThanOrEqual(3);
    }
  });

  it("개별 할 일도 순위와 Focus 후보에 포함된다", () => {
    const r = run(tasks, projects, 180);
    const ids = r.taskRankings.map((t) => t.taskId);
    expect(ids).toContain("t-택배");
    expect(ids).toContain("t-병원");
  });

  it("마감 없음 + 중요도 높음은 마감 D-10 + 중요도 낮음보다 앞선다", () => {
    const list = [
      task("낮음D10", { due: "2026-10-18", imp: "low" }),
      task("높음무마감", { imp: "high" }),
    ];
    const r = run(list, [], 120);
    expect(r.taskRankings[0].taskId).toBe("t-높음무마감");
  });

  it("가용 시간보다 긴 중요 작업은 Focus에서 빠지고 주의사항이 생긴다", () => {
    const list = [
      task("긴작업", { due: "2026-10-08", imp: "high", min: 240 }),
      task("짧은작업", { imp: "low", min: 30 }),
    ];
    const r = run(list, [], 60);
    expect(r.focusPlan.taskIds).toEqual(["t-짧은작업"]);
    expect(r.taskRankings[0].taskId).toBe("t-긴작업");
    expect(r.warnings.join()).toContain("긴작업");
  });

  it("들어가는 작업이 없으면 빈 Focus와 이유", () => {
    const r = run([task("a", { min: 30 }), task("b", { min: 60 })], [], 15);
    expect(r.focusPlan.taskIds).toEqual([]);
    expect(r.focusPlan.reason).toContain("없어요");
  });

  it("마감 지난 작업이 있으면 주의사항", () => {
    const r = run([task("지남", { due: "2026-10-05" })], [], 120);
    expect(r.warnings.join()).toContain("마감이 지난");
  });

  it("30분 작업 1개만 들어가면 정확히 1개", () => {
    const r = run([task("a", { min: 30 }), task("b", { min: 120 })], [], 30);
    expect(r.focusPlan.taskIds).toEqual(["t-a"]);
  });
});
