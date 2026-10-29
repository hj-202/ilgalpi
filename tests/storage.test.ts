import { describe, expect, it } from "vitest";
import { effortFromMinutes, migrateV1ToV2, migrateV2ToV3 } from "../lib/storage";

const TODAY = "2026-10-20";

const v1 = {
  version: 1,
  projects: [{ id: "p1", name: "바나프레소", createdAt: "2026-10-08T01:00:00.000Z", updatedAt: "2026-10-08T01:00:00.000Z" }],
  tasks: [
    { id: "a", projectId: "p1", title: "미완료", dueDate: "2026-10-25", importance: "high", estimatedMinutes: 45, isCompleted: false, completedAt: null, createdAt: "2026-10-08T01:00:00.000Z", updatedAt: "2026-10-08T01:00:00.000Z" },
    { id: "b", projectId: null, title: "완료(완료시각 있음)", dueDate: null, importance: "low", estimatedMinutes: 30, isCompleted: true, completedAt: "2026-10-09T03:00:00.000Z", createdAt: "2026-10-08T01:00:00.000Z", updatedAt: "2026-10-09T03:00:00.000Z" },
    { id: "c", projectId: null, title: "완료(생성시각만)", dueDate: null, importance: "medium", estimatedMinutes: 15, isCompleted: true, completedAt: null, createdAt: "2026-10-10T03:00:00.000Z", updatedAt: "2026-10-10T03:00:00.000Z" },
    { id: "d", projectId: null, title: "완료(날짜 정보 없음)", importance: "medium", estimatedMinutes: 15, isCompleted: true },
  ],
  preferences: { availableMinutes: 90 },
  recommendation: null,
};

describe("migrateV1ToV2", () => {
  const { state, estimatedPlacements } = migrateV1ToV2(v1, TODAY);
  // (v2 중간 표현)

  it("프로젝트·작업·설정을 모두 보존한다", () => {
    expect(state.projects).toHaveLength(1);
    expect(state.tasks.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(state.availableMinutes).toBe(90);
  });

  it("기존 마감·중요도·숫자형 소요시간을 유지하고 dueTime은 null", () => {
    const a = state.tasks[0];
    expect(a).toMatchObject({ dueDate: "2026-10-25", dueTime: null, importance: "high", estimatedMinutes: 45, projectId: "p1" });
  });

  it("미완료 작업은 마이그레이션 당일에 배치한다", () => {
    expect(state.tasks[0].plannedDate).toBe(TODAY);
  });

  it("완료 작업은 completedAt → createdAt → 당일 순서로 날짜를 정한다", () => {
    expect(state.tasks[1].plannedDate).toBe("2026-10-09");
    expect(state.tasks[1].completedAt).toBe("2026-10-09T03:00:00.000Z");
    expect(state.tasks[2].plannedDate).toBe("2026-10-10");
    expect(state.tasks[3].plannedDate).toBe(TODAY);
    expect(estimatedPlacements).toBe(1);
  });

  it("입력(v1)을 변경하지 않는다", () => {
    expect(v1.version).toBe(1);
    expect("plannedDate" in v1.tasks[0]).toBe(false);
  });
});

describe("v2 → v3 (소요시간 규모 옵션)", () => {
  it("분 단위 값을 가까운 규모 옵션으로 옮기고 원래 값은 legacyMinutes에 보존한다", () => {
    expect(effortFromMinutes(15)).toBe("short");
    expect(effortFromMinutes(30)).toBe("short");
    expect(effortFromMinutes(31)).toBe("medium");
    expect(effortFromMinutes(45)).toBe("medium");
    expect(effortFromMinutes(60)).toBe("medium");
    expect(effortFromMinutes(90)).toBe("medium");
    expect(effortFromMinutes(120)).toBe("long");
    expect(effortFromMinutes(480)).toBe("long");
    expect(effortFromMinutes(null)).toBeNull();
  });

  it("작업·프로젝트·날짜·마감·완료 기록을 그대로 유지하고 미정은 미정으로 둔다", () => {
    const { state: v2 } = migrateV1ToV2(v1, TODAY);
    v2.tasks.push({ ...v2.tasks[0], id: "n", estimatedMinutes: null, dueTime: "18:10" });
    const { state, mappedEffort } = migrateV2ToV3(v2);
    expect(state.version).toBe(3);
    expect(mappedEffort).toBe(4); // 분 값이 있던 4건만(미정은 제외)
    expect(state.tasks.map((t) => t.id)).toEqual(["a", "b", "c", "d", "n"]);
    expect(state.tasks[0]).toMatchObject({ effort: "medium", legacyMinutes: 45, dueDate: "2026-10-25", plannedDate: TODAY });
    expect(state.tasks[1]).toMatchObject({ effort: "short", legacyMinutes: 30, isCompleted: true, completedAt: "2026-10-09T03:00:00.000Z" });
    expect(state.tasks[4]).toMatchObject({ effort: null, legacyMinutes: null, dueTime: "18:10" });
    expect("estimatedMinutes" in state.tasks[0]).toBe(false);
    expect(state.projects).toHaveLength(1);
    expect(state.preferences.availableMinutes).toBe(90);
    expect(state.dailyAvailableMinutes).toEqual({});
    expect(state.recommendations).toEqual({});
  });
});
