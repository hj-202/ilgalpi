import { describe, expect, it } from "vitest";
import { EFFORT_LABEL, EFFORT_OPTIONS } from "../lib/constants";
import { isRecommendationStale } from "../lib/fingerprint";
import { basicRecommend } from "../lib/recommend/basic";
import { createStoredRecommendation, getIncompleteTasks } from "../lib/recommend/buildRequest";
import { effortFromMinutes } from "../lib/storage";
import type { Task } from "../lib/types";

const TODAY = "2026-10-30";

function task(id: string, over: Partial<Task> = {}): Task {
  const ts = "2026-10-30T00:00:00.000Z";
  return {
    id,
    projectId: null,
    title: id,
    plannedDate: TODAY,
    dueDate: null,
    dueTime: null,
    importance: "medium",
    effort: "short",
    legacyMinutes: null,
    isCompleted: false,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts,
    ...over,
  };
}

function recommend(tasks: Task[], availableMinutes = 120) {
  const incomplete = getIncompleteTasks(tasks);
  const result = basicRecommend({ tasks: incomplete, projects: [], availableMinutes, today: TODAY, nowTime: "09:00" });
  return createStoredRecommendation(result, "basic", { tasks: incomplete, availableMinutes, date: TODAY });
}

describe("QA03 예상 소요시간 구간", () => {
  it("칩 라벨은 1시간 이내 / 1~2시간 / 2시간 초과이고 저장 값(short·medium·long)은 그대로다", () => {
    expect(EFFORT_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ["short", "1시간 이내"],
      ["medium", "1~2시간"],
      ["long", "2시간 초과"],
    ]);
    expect(EFFORT_LABEL).toEqual({ short: "1시간 이내", medium: "1~2시간", long: "2시간 초과" });
  });

  it("분 단위 값은 60분 이하 / 120분 이하 / 초과 구간으로 대응한다(null은 미정)", () => {
    expect([30, 60].map(effortFromMinutes)).toEqual(["short", "short"]);
    expect([61, 120].map(effortFromMinutes)).toEqual(["medium", "medium"]);
    expect([121, 480].map(effortFromMinutes)).toEqual(["long", "long"]);
    expect(effortFromMinutes(null)).toBeNull();
  });
});

describe("QA05 재추천 안내(stale) 기준", () => {
  const all = [task("a"), task("b"), task("c")];

  it("완료 체크만으로는 재추천 필요 상태가 되지 않는다", () => {
    const rec = recommend(all);
    const done = all.map((t) => (t.id === "a" ? { ...t, isCompleted: true } : t));
    expect(isRecommendationStale(rec, done, 120, TODAY)).toBe(false);
  });

  it("완료한 작업을 제외하고 재추천하면 완료 작업은 추천 목록에서 빠지지만 최신 상태(stale 아님)다", () => {
    const done = all.map((t) => (t.id === "a" ? { ...t, isCompleted: true } : t));
    const rec = recommend(done);
    expect(rec.taskRankings.map((r) => r.taskId).sort()).toEqual(["b", "c"]);
    expect(isRecommendationStale(rec, done, 120, TODAY)).toBe(false);
  });

  it("재추천 후 제외된 완료 작업의 완료를 취소하면 다시 추천이 필요하다", () => {
    const done = all.map((t) => (t.id === "a" ? { ...t, isCompleted: true } : t));
    const rec = recommend(done);
    expect(isRecommendationStale(rec, all, 120, TODAY)).toBe(true);
  });

  it("할 일 추가·삭제·작업 가능 시간 변경은 재추천 필요 상태가 된다", () => {
    const rec = recommend(all);
    expect(isRecommendationStale(rec, [...all, task("d")], 120, TODAY)).toBe(true);
    expect(isRecommendationStale(rec, all.slice(1), 120, TODAY)).toBe(true);
    expect(isRecommendationStale(rec, all, 180, TODAY)).toBe(true);
  });
});

describe("재추천 완료 작업 제외 정보(excludedCompletedCount)", () => {
  const tasks = [task("a"), task("b"), task("c")];
  const withDone = tasks.map((t) => (t.id === "a" ? { ...t, isCompleted: true } : t));
  const make = (day: Task[], excluded: number) => {
    const incomplete = getIncompleteTasks(day);
    const result = basicRecommend({ tasks: incomplete, projects: [], availableMinutes: 120, today: TODAY, nowTime: "09:00" });
    return createStoredRecommendation(result, "basic", { tasks: incomplete, availableMinutes: 120, date: TODAY, excludedCompletedCount: excluded });
  };

  it("완료 작업을 제외하고 만든 추천에만 제외 개수가 저장된다", () => {
    expect(make(withDone, 1).excludedCompletedCount).toBe(1);
    expect(make(tasks, 0)).not.toHaveProperty("excludedCompletedCount");
  });

  it("저장 후 JSON 복원(새로고침·계정 동기화)해도 유지되고, 값이 없는 이전 추천과 호환된다", () => {
    const restored = JSON.parse(JSON.stringify(make(withDone, 1)));
    expect(restored.excludedCompletedCount).toBe(1);
    expect((recommend(tasks) as { excludedCompletedCount?: number }).excludedCompletedCount ?? 0).toBe(0);
  });

  it("이 정보가 있어도 완료 체크는 재추천 필요 상태를 만들지 않는다", () => {
    const rec = make(withDone, 1);
    const moreDone = withDone.map((t) => (t.id === "b" ? { ...t, isCompleted: true } : t));
    expect(isRecommendationStale(rec, moreDone, 120, TODAY)).toBe(false);
  });
});
