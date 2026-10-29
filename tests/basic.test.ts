import { describe, expect, it } from "vitest";
import { basicRecommend } from "../lib/recommend/basic";
import { buildValidationContext } from "../lib/recommend/buildRequest";
import { validateRecommendation } from "../lib/recommend/validate";
import { buildFacts } from "../lib/recommend/grounding";
import type { Effort, Importance, Project, Task } from "../lib/types";

const TODAY = "2026-10-08";
let seq = 0;

function task(
  title: string,
  opts: { projectId?: string | null; due?: string | null; dueTime?: string | null; imp?: Importance; effort?: Effort | null } = {},
): Task {
  seq += 1;
  const ts = new Date(Date.UTC(2026, 0, 1, 0, seq)).toISOString();
  return {
    id: `t-${title}`,
    projectId: opts.projectId ?? null,
    title,
    plannedDate: TODAY,
    dueDate: opts.due ?? null,
    dueTime: opts.dueTime ?? null,
    importance: opts.imp ?? "medium",
    effort: opts.effort === undefined ? "short" : opts.effort,
    legacyMinutes: null,
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
    buildValidationContext(
      tasks.map((t) => t.id),
      projects.map((p) => p.id),
      // 기본 추천의 이유 문장도 입력에 없는 날짜·시각·시간을 쓰지 않아야 한다
      buildFacts({
        currentDate: TODAY,
        planDate: TODAY,
        availableMinutes,
        tasks: tasks.map((t) => ({ dueDate: t.dueDate, dueTime: t.dueTime })),
      }),
    ),
  );
  expect(out.valid, JSON.stringify(out)).toBe(true);
  return result;
}

describe("basicRecommend", () => {
  const projects = [project("pA", "바나프레소"), project("pB", "스위프")];
  const tasks = [
    task("포트폴리오", { projectId: "pA", due: "2026-10-08", imp: "high", effort: "medium" }),
    task("이력서", { projectId: "pA", due: "2026-10-12", imp: "high", effort: "medium" }),
    task("PPT", { projectId: "pB", due: "2026-10-18", imp: "low", effort: "short" }),
    task("QA", { projectId: "pB", imp: "medium", effort: "medium" }),
    task("택배", { due: "2026-10-09", imp: "medium", effort: "short" }),
    task("병원", { imp: "low", effort: "short" }),
  ];

  it("검증 규칙을 통과하고 모든 작업을 순위에 포함한다", () => {
    const r = run(tasks, projects, 180);
    expect(r.taskRankings).toHaveLength(tasks.length);
    expect(r.projectRankings.map((p) => p.projectId)).toEqual(["pA", "pB"]);
  });

  it("개별 할 일도 순위에 포함된다", () => {
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

  it("2시간 이상 작업은 이날 작업 가능 시간이 2시간 미만이면 주의사항이 생기지만 순위에서 빠지지 않는다", () => {
    const list = [
      task("긴작업", { due: "2026-10-08", imp: "high", effort: "long" }),
      task("짧은작업", { imp: "low", effort: "short" }),
    ];
    const r = run(list, [], 60);
    expect(r.taskRankings[0].taskId).toBe("t-긴작업");
    expect(r.taskRankings).toHaveLength(2);
    expect(r.warnings.join()).toContain("긴작업");
    expect(run(list, [], 180).warnings.join()).not.toContain("긴작업");
  });

  it("마감 지난 작업이 있으면 주의사항", () => {
    const r = run([task("지남", { due: "2026-10-05" })], [], 120);
    expect(r.warnings.join()).toContain("마감이 지난");
  });
});

describe("작업 규모(effort) 정책", () => {
  it("규모 미정도 순위에 포함하고, 중요도·마감으로 판단한다", () => {
    const tasks = [
      task("미정 중요", { due: "2026-10-09", imp: "high", effort: null }),
      task("짧은 일", { imp: "low", effort: "short" }),
    ];
    const r = run(tasks, [], 60);
    expect(r.taskRankings.map((x) => x.taskId)).toEqual(["t-미정 중요", "t-짧은 일"]);
    expect(r.taskRankings[0].reason).toContain("마감이 가까");
    expect(r.taskRankings[1].reason).not.toMatch(/마감이 지나/);
  });

  it("규모가 큰 작업은 마감이 가까우면 같은 조건의 짧은 작업보다 일찍 시작하도록 앞선다", () => {
    const tasks = [
      task("짧음", { due: "2026-10-10", imp: "high", effort: "short" }),
      task("큼", { due: "2026-10-10", imp: "high", effort: "long" }),
    ];
    const r = run(tasks, [], 240);
    expect(r.taskRankings[0].taskId).toBe("t-큼");
    expect(r.taskRankings[0].reason).toContain("먼저 시작해");
  });

  it("시간 합산이나 Focus 결과를 만들지 않는다", () => {
    const r = run([task("a")], [], 60);
    expect("focusPlan" in r).toBe(false);
  });

  it("이유는 마감 칩과 같은 표현(요일·시각)을 쓰고 지어낸 값이 없다", () => {
    const r = basicRecommend({
      tasks: [task("a", { due: "2026-10-09", dueTime: "18:10" })],
      projects: [],
      availableMinutes: 120,
      today: TODAY,
      nowTime: "09:00",
    });
    expect(r.taskRankings[0].reason).not.toMatch(/\d{4}|\d+월/); // 날짜를 지어내지 않는다
  });
});

describe("마감 시각", () => {
  it("같은 중요도라면 오늘 마감 시각이 지난 작업이 더 앞선다", () => {
    const tasks = [
      task("오늘 늦게", { due: TODAY, dueTime: "23:00", imp: "medium" }),
      task("지난 시각", { due: TODAY, dueTime: "09:00", imp: "medium" }),
    ];
    const result = basicRecommend({ tasks, projects: [], availableMinutes: 120, today: TODAY, nowTime: "14:00" });
    expect(result.taskRankings[0].taskId).toBe("t-지난 시각");
    expect(result.taskRankings[0].reason).toContain("마감 시간이 지났");
  });
});

describe("추천 이유 문장", () => {
  it("태그를 반복하는 문장을 쓰지 않고 입력에 없는 날짜·시각·소요시간을 만들지 않는다", () => {
    const mk = (id: string, over: Partial<Task>): Task => ({
      id, projectId: null, title: id, plannedDate: "2026-10-20", dueDate: null, dueTime: null,
      importance: "medium", effort: null, legacyMinutes: null, isCompleted: false, completedAt: null,
      createdAt: `2026-10-0${id.length}T00:00:00Z`, updatedAt: "",
      ...over,
    });
    const tasks = [
      mk("a", { importance: "high", dueDate: "2026-10-21" }),
      mk("bb", { effort: "short" }),
      mk("ccc", { effort: "long" }),
      mk("dddd", { importance: "low" }),
    ];
    const r = basicRecommend({ tasks, projects: [], availableMinutes: 120, today: "2026-10-20" });
    for (const x of r.taskRankings) {
      expect(x.reason).not.toMatch(/중요도 높음|입력 조건|예상 소요시간|\d+월|\d+분|\d+시간|\d{1,2}:\d{2}/);
      expect(x.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("기본 추천 이유의 근거", () => {
  it("마감일이 없는 작업·중요하지 않은 작업에 마감/중요 단정이 없다", () => {
    const tasks = [
      task("A", { imp: "high", due: "2026-10-09" }),
      task("B", { imp: "medium" }),
      task("C", { imp: "low", effort: null }),
      task("D", { imp: "medium", effort: "long" }),
    ];
    const r = basicRecommend({ tasks, projects: [], availableMinutes: 120, today: TODAY, nowTime: "10:00" });
    for (const row of r.taskRankings) {
      const t = tasks.find((x) => x.id === row.taskId)!;
      if (!t.dueDate) expect(row.reason.replace(/마감이 없/g, "")).not.toMatch(/마감/);
      if (t.importance !== "high") expect(row.reason).not.toMatch(/중요(한|도가 높)/);
    }
  });
});
