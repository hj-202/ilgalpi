import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();

async function load() {
  vi.resetModules();
  mem.clear();
  const localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  vi.stubGlobal("window", { localStorage, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("localStorage", localStorage);
  vi.doMock("@/lib/analytics", async (orig) => ({ ...(await orig<object>()), track: vi.fn() }));
  return import("@/hooks/useAppStore");
}

const saved = () => JSON.parse(mem.get("ilgalpi:v3")!).tasks as Array<Record<string, unknown>>;

describe("addTask 조건 옵션", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("조건 없이 등록하면 기본값(보통/미정/마감 없음)", async () => {
    const s = await load();
    s.addTask({ title: "a", plannedDate: "2026-11-11" });
    const t = saved()[0];
    expect([t.importance, t.effort, t.dueDate, t.dueTime]).toEqual(["medium", null, null, null]);
  });

  it("지정한 조건이 그대로 저장되고, 마감일이 없으면 마감시간은 버린다", async () => {
    const s = await load();
    s.addTask({ title: "b", plannedDate: "2026-11-11", importance: "high", effort: "long", dueDate: "2026-11-20", dueTime: "18:00" });
    s.addTask({ title: "c", plannedDate: "2026-11-11", dueDate: null, dueTime: "09:00" });
    const [b, c] = saved();
    expect([b.importance, b.effort, b.dueDate, b.dueTime]).toEqual(["high", "long", "2026-11-20", "18:00"]);
    expect([c.dueDate, c.dueTime]).toEqual([null, null]);
  });

  it("수정 시트 저장 형태의 patch(기한 값 그대로)는 기존 날짜·시간을 보존한다", async () => {
    const s = await load();
    s.addTask({ title: "d", plannedDate: "2026-11-11", dueDate: "2026-11-20", dueTime: "18:30" });
    const id = String(saved()[0].id);
    s.patchTask(id, { title: "d2", importance: "high", effort: "short", dueDate: "2026-11-20", dueTime: "18:30" });
    const t = saved()[0];
    expect([t.title, t.importance, t.effort, t.dueDate, t.dueTime]).toEqual(["d2", "high", "short", "2026-11-20", "18:30"]);
  });

  it("완료 기한 '없음'으로 저장하면 날짜와 시간이 함께 지워진다", async () => {
    const s = await load();
    s.addTask({ title: "e", plannedDate: "2026-11-11", dueDate: "2026-11-20", dueTime: "18:30" });
    s.patchTask(String(saved()[0].id), { dueDate: null, dueTime: null });
    expect([saved()[0].dueDate, saved()[0].dueTime]).toEqual([null, null]);
  });

  it("마지막 할 일을 삭제하면 목록이 비어 Empty State 조건(0개)이 된다", async () => {
    const s = await load();
    s.addTask({ title: "f", plannedDate: "2026-11-11" });
    s.deleteTask(String(saved()[0].id));
    s.deleteTask("missing"); // 중복 호출에도 문제 없음
    expect(saved()).toHaveLength(0);
  });
});
