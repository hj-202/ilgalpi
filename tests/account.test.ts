import { describe, expect, it } from "vitest";
import { applyPending, diffState, emptyAccountState, rowToTask, taskToRow } from "@/lib/account/rows";
import type { Task } from "@/lib/types";

const task: Task = {
  id: "a", projectId: null, title: "t", plannedDate: "2026-10-20", dueDate: "2026-10-21", dueTime: "18:00",
  importance: "high", effort: "long", legacyMinutes: 45, isCompleted: true, completedAt: "2026-10-20T01:00:00.000Z",
  createdAt: "2026-10-19T01:00:00.000Z", updatedAt: "2026-10-20T01:00:00.000Z",
};

describe("account rows", () => {
  it("작업 변환에 손실이 없다", () => {
    expect(rowToTask(taskToRow("u", task) as never)).toEqual(task);
  });
  it("마감일이 없으면 마감 시각을 저장하지 않는다", () => {
    expect(taskToRow("u", { ...task, dueDate: null }).due_time).toBeNull();
  });
  it("diff는 추가·수정·삭제와 날짜별 시간을 잡아낸다", () => {
    const a = { ...emptyAccountState(), tasks: [task] };
    const b = {
      ...a,
      tasks: [{ ...task, title: "n" }, { ...task, id: "b" }],
      dailyAvailableMinutes: { "2026-10-20": 180 },
    };
    const ops = diffState("u", a, b);
    expect(ops.map((o) => o.key).sort()).toEqual(["d:2026-10-20", "t:a", "t:b"]);
    const del = diffState("u", b, a).filter((o) => !o.row).map((o) => o.key).sort();
    expect(del).toEqual(["d:2026-10-20", "t:b"]);
  });
  it("저장 대기 변경은 서버 값 위에 다시 적용된다", () => {
    const server = { ...emptyAccountState(), tasks: [task] };
    const pending = diffState("u", server, { ...server, tasks: [{ ...task, title: "local" }] });
    expect(applyPending(server, pending).tasks[0].title).toBe("local");
  });
});
