import { describe, expect, it } from "vitest";
import { basicRecommend } from "../lib/recommend/basic";
import { buildFacts, findUngrounded } from "../lib/recommend/grounding";
import type { Effort, Importance, Task } from "../lib/types";

const TODAY = "2026-11-04";
let seq = 0;
function mk(title: string, o: { due?: string | null; time?: string | null; imp?: Importance; effort?: Effort | null; created?: string } = {}): Task {
  seq += 1;
  return {
    id: title, projectId: null, title, plannedDate: TODAY,
    dueDate: o.due ?? null, dueTime: o.time ?? null, importance: o.imp ?? "medium",
    effort: o.effort === undefined ? null : o.effort, legacyMinutes: null, isCompleted: false, completedAt: null,
    createdAt: o.created ?? new Date(Date.UTC(2026, 0, 1, 0, seq)).toISOString(), updatedAt: "",
  };
}
const day = (n: number) => new Date(Date.UTC(2026, 10, 4 + n)).toISOString().slice(0, 10);
const run = (tasks: Task[], nowTime = "10:00", avail = 120) => basicRecommend({ tasks, projects: [], availableMinutes: avail, today: TODAY, nowTime });
const reasonOf = (r: ReturnType<typeof run>, id: string) => r.taskRankings.find((x) => x.taskId === id)!.reason;

describe("기본 추천 이유: 순위는 그대로", () => {
  it("대표 샘플의 순서가 고정되어 있다(점수·정렬 불변)", () => {
    const tasks = [
      mk("기획서", { due: TODAY, time: "18:00", imp: "high", effort: "long" }),
      mk("세금계산서", { due: day(1), imp: "high", effort: "short" }),
      mk("주간보고", { due: day(2), effort: "medium" }),
      mk("블로그", { due: day(6), effort: "medium" }),
      mk("포트폴리오", { effort: "long" }),
      mk("영수증", { due: day(8), imp: "low", effort: "short" }),
      mk("메일함", { imp: "low", effort: "short" }),
    ];
    expect(run(tasks).taskRankings.map((x) => x.taskId)).toEqual(["기획서", "세금계산서", "주간보고", "블로그", "포트폴리오", "영수증", "메일함"]);
  });
});

describe("기본 추천 이유: 근거 중심·구조 다양성", () => {
  const many = () => [
    mk("a", { due: day(0), time: "18:00", imp: "high", effort: "long" }), mk("b", { due: day(1), imp: "high", effort: "short" }),
    mk("c", { due: day(2) }), mk("d", { due: day(6) }), mk("e", { imp: "medium", effort: "long" }),
    mk("f", { due: day(9), imp: "low", effort: "short" }), mk("g", { imp: "low", effort: "short" }), mk("h", { imp: "low" }), mk("i", { imp: "low" }),
  ];
  const one = (t: Task) => run([t, mk("x", { due: day(40), imp: "high" })]).taskRankings.find((r) => r.taskId === t.id)!.reason;

  it("순위·배치를 설명하는 표현과 옛 만능 문장을 쓰지 않는다", () => {
    for (const x of run(many()).taskRankings) {
      expect(x.reason).not.toMatch(/앞 순위|앞 작업|이 자리|뒤에|앞에|뒤로|다음 순서|먼저 두었|뒀어요|두었어요|덜 급|우선순위 차이/);
      expect(x.reason).not.toMatch(/앞선 작업을 마친 뒤|잠깐 집중하면|작업 가능|확보한 시간/);
    }
  });
  it("조건 유형에 따라 문장 구조가 달라진다", () => {
    expect(one(mk("u1", { due: day(1), imp: "medium" }))).toBe("내일까지 끝내야 해요.");
    expect(one(mk("u2", { due: day(1), imp: "high" }))).toBe("내일까지 끝내야 하는 중요한 작업이에요.");
    expect(one(mk("u3", { due: day(2), imp: "low" }))).toContain("기한이 며칠 남지 않았지만 중요도는 낮아요");
    expect(one(mk("u4", { due: day(5), imp: "high" }))).toBe("일주일 안에 끝내야 하는 중요한 작업이에요.");
    expect(one(mk("u5", { due: day(20), imp: "medium" }))).toBe("기한에 여유가 있고 중요도는 보통이에요.");
    expect(one(mk("u6", { imp: "high" }))).toBe("기한은 없지만 중요도가 높은 작업이에요.");
  });
  it("같은 정보를 한 문장 안에서 되풀이하지 않는다(마감·중요도·기한 단어가 연속 반복되지 않음)", () => {
    for (const x of run(many()).taskRankings) {
      for (const w of ["마감", "중요도", "기한"]) expect(x.reason.split(w).length - 1).toBeLessThanOrEqual(1);
    }
  });
  it("마감(기한)과 중요도를 따로 말하고, 순위는 점수대로다", () => {
    const r = run([mk("급함", { due: day(3), imp: "low" }), mk("중요", { due: day(20), imp: "high" })]);
    expect(r.taskRankings.map((x) => x.taskId)).toEqual(["중요", "급함"]);
    expect(reasonOf(r, "급함")).toBe("기한이 며칠 남지 않았지만 중요도는 낮아요.");
    expect(reasonOf(r, "중요")).toBe("기한은 여유 있지만 중요도가 높은 작업이에요.");
  });
  it("마감이 없는 작업을 마감이 있는 작업과 날짜로 직접 비교하지 않는다", () => {
    const r = run([mk("a", { due: day(5) }), mk("b", { due: day(6) }), mk("c")]);
    expect(reasonOf(r, "c")).toBe("기한이 없고 중요도는 보통이에요.");
    for (const x of r.taskRankings) expect(x.reason).not.toMatch(/없는 .*보다|보다 .*가까/);
  });
});

describe("기본 추천 이유: 같은 중요도 비교는 점수 근거가 있을 때만", () => {
  it("같은 중요도 작업 중 기한이 가장 가까우면(며칠/일주일 구간) 그렇게 말한다", () => {
    const r = run([mk("a", { due: day(2) }), mk("b", { due: day(6) }), mk("c")]);
    expect(reasonOf(r, "a")).toBe("기한이 며칠 남지 않았고, 같은 중요도 작업 중 가장 빨라요.");
    expect(reasonOf(r, "b")).toBe("일주일 안에 끝내면 되고, 중요도는 보통이에요.");
    expect(reasonOf(run([mk("a", { due: day(5) }), mk("c")]), "a")).toBe("일주일 안에 끝내면 되고, 같은 중요도 작업 중 가장 빨라요.");
  });
  it("비교 대상이 없거나 중요도가 다르면, 오늘·내일·지남이면 붙이지 않는다", () => {
    expect(reasonOf(run([mk("a", { due: day(2), imp: "high" }), mk("b", { due: day(3), imp: "low" })]), "a")).not.toContain("같은 중요도");
    expect(reasonOf(run([mk("a", { due: day(1) }), mk("b")]), "a")).not.toContain("같은 중요도");
    expect(reasonOf(run([mk("a", { due: day(-1) }), mk("b")]), "a")).not.toContain("같은 중요도");
  });
  it("작업 가능 시간은 어떤 이유에도 근거로 나오지 않고, 바꿔도 이유가 같다", () => {
    const tasks = [mk("a", { due: day(2), effort: "long" }), mk("b", { imp: "low", effort: "short" }), mk("c", { imp: "low", effort: "short" })];
    const base = run(tasks, "10:00", 120).taskRankings.map((x) => x.reason);
    for (const m of [60, 360]) expect(run(tasks, "10:00", m).taskRankings.map((x) => x.reason)).toEqual(base);
  });
});

describe("기본 추천 이유: 동점·동일 조건", () => {
  it("조건이 완전히 같으면 같은 이유가 나오고 등록 순서라고만 밝힌다", () => {
    const r = run([mk("a", { created: "2026-11-01T00:00:00Z" }), mk("b", { created: "2026-11-01T00:01:00Z" }), mk("c", { created: "2026-11-01T00:02:00Z" })]);
    expect(r.taskRankings.map((x) => x.taskId)).toEqual(["a", "b", "c"]);
    for (const id of ["a", "b", "c"]) expect(reasonOf(r, id)).toBe("기한이 없고 중요도는 보통이에요. 정렬 기준이 같아 등록 순서를 따랐어요.");
  });
  it("점수가 같고 마감일만 다르면(지난 낮음 vs 내일 보통) 정렬은 마감일 기준이고 그 근거를 말한다", () => {
    const r = run([mk("내일", { due: day(1), imp: "medium" }), mk("지남", { due: day(-2), imp: "low" })]);
    expect(r.taskRankings.map((x) => x.taskId)).toEqual(["지남", "내일"]);
    expect(reasonOf(r, "지남")).toBe("마감이 지났어요. 일정을 확인해 보세요. 조건이 비슷한 작업 중 더 일찍 끝내야 해요.");
    expect(reasonOf(r, "내일")).toBe("내일까지 끝내야 해요.");
  });
  it("점수가 같고 기한 있는 쪽 vs 없는 쪽: 기한 있는 쪽이 앞이고 그 근거만 말한다", () => {
    const r = run([mk("없음", { imp: "high" }), mk("14일", { due: day(14), imp: "high" })]);
    expect(r.taskRankings[0].taskId).toBe("14일");
    expect(reasonOf(r, "14일")).toBe("기한은 여유 있지만 중요도가 높은 작업이에요. 조건이 비슷한 작업 중 더 일찍 끝내야 해요.");
    expect(reasonOf(r, "없음")).toBe("기한은 없지만 중요도가 높은 작업이에요.");
  });
  it("점수가 같고 규모만 다르면 규모가 작은 쪽이 앞이고 규모 근거를 한 번만 말한다", () => {
    const r = run([mk("큼", { effort: "long", imp: "low" }), mk("작음", { effort: "short", imp: "low" })]);
    expect(r.taskRankings.map((x) => x.taskId)).toEqual(["작음", "큼"]);
    expect(reasonOf(r, "작음")).toBe("기한이 없고 중요도도 낮아요. 조건이 비슷한 작업 중 규모가 더 작아요.");
    expect(reasonOf(r, "큼")).toBe("기한이 없고 중요도도 낮아요.");
  });
  it("규모 미정과 1~2시간은 정렬에서는 같은 구간이라 등록순으로 갈리고, 규모가 같다고는 하지 않는다", () => {
    const r = run([mk("미정", { imp: "low", effort: null, created: "2026-11-01T00:00:00Z" }), mk("중간", { imp: "low", effort: "medium", created: "2026-11-01T00:01:00Z" })]);
    expect(r.taskRankings.map((x) => x.taskId)).toEqual(["미정", "중간"]);
    for (const x of r.taskRankings) {
      expect(x.reason).toContain("정렬 기준이 같아 등록 순서를 따랐어요");
      expect(x.reason).not.toMatch(/규모가 (같|더)/);
    }
  });
  it("규모 미정은 보통으로 취급한다(미정 vs 짧음 → 짧음이 앞)", () => {
    const r = run([mk("미정", { imp: "low", effort: null }), mk("짧음", { imp: "low", effort: "short" })]);
    expect(r.taskRankings[0].taskId).toBe("짧음");
  });
});

describe("기본 추천 이유: 경계 조건", () => {
  const first = (t: Task, now = "10:00") => run([t, mk("x", { due: day(30), imp: "low" })], now).taskRankings[0].reason;
  it("마감 지남", () => expect(first(mk("a", { due: day(-1) }))).toContain("마감이 지났"));
  it("오늘 마감 시각 지남", () => expect(first(mk("a", { due: TODAY, time: "09:00" }))).toContain("마감 시간이 지났"));
  it("오늘 마감: 시각이 3시간 이내일 때만 시각 임박(점수 가점)을 말한다", () => {
    expect(first(mk("a", { due: TODAY, time: "12:00" }))).toContain("마감 시각이 가까");
    expect(first(mk("a", { due: TODAY, time: "13:00" }))).toContain("마감 시각이 가까"); // 정확히 180분
    expect(first(mk("a", { due: TODAY, time: "13:01" }))).not.toContain("시각이 가까");
    expect(first(mk("a", { due: TODAY, time: "22:00" }))).toContain("오늘까지 끝내야");
    expect(first(mk("a", { due: TODAY }))).toContain("오늘까지 끝내야");
  });
  it("내일 마감", () => expect(first(mk("a", { due: day(1), imp: "high" }))).toBe("내일까지 끝내야 하는 중요한 작업이에요."));
  it("3일/4일, 7일/8일 경계", () => {
    expect(first(mk("a", { due: day(3) }))).toContain("며칠");
    expect(first(mk("a", { due: day(4) }))).toContain("일주일 안");
    expect(first(mk("a", { due: day(7) }))).toContain("일주일 안");
    expect(first(mk("a", { due: day(8) }))).toContain("여유가 있고");
  });
  it("큰 작업의 조기 착수 가점이 붙는 경우(마감 3일 이내)에만 먼저 시작을 말한다", () => {
    expect(first(mk("a", { due: day(2), effort: "long" }))).toContain("먼저 시작해");
    expect(first(mk("a", { due: day(3), effort: "long" }))).toContain("먼저 시작해");
    expect(first(mk("a", { due: day(4), effort: "long", imp: "high" }))).not.toContain("먼저 시작해");
    expect(first(mk("a", { imp: "high", effort: "long" }))).not.toContain("먼저 시작해");
    expect(first(mk("a", { due: day(2), effort: "short" }))).not.toContain("먼저 시작해");
  });
  it("가점이 실제 순위에 영향을 준다(같은 조건의 짧은 작업보다 큰 작업이 앞)", () => {
    const r = run([mk("짧음", { due: day(2), imp: "high", effort: "short" }), mk("큼", { due: day(2), imp: "high", effort: "long" })]);
    expect(r.taskRankings.map((x) => x.taskId)).toEqual(["큼", "짧음"]);
    expect(reasonOf(r, "큼")).toContain("먼저 시작해");
    expect(reasonOf(r, "짧음")).not.toMatch(/규모|시작해/);
  });
});

describe("기본 추천 이유: 입력과 모순되지 않는다(무작위 입력, 고정 시드)", () => {
  let s = 20261104;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  it("마감·중요도·규모 주장이 해당 작업의 값과 맞고, 숫자·지어낸 날짜가 없다", () => {
    for (let k = 0; k < 400; k++) {
      const n = 2 + Math.floor(rnd() * 9);
      const tasks = Array.from({ length: n }, (_, i) => {
        const off = pick([null, -2, 0, 0, 1, 2, 3, 4, 7, 8, 14, 20]);
        return mk(`k${k}-${i}`, {
          due: off === null ? null : day(off),
          time: off === 0 ? pick([null, "08:00", "12:00", "22:00"]) : null,
          imp: pick<Importance>(["high", "medium", "low"]),
          effort: pick<Effort | null>(["short", "medium", "long", null]),
        });
      });
      const r = run(tasks, "10:00");
      const facts = buildFacts({ currentDate: TODAY, currentTime: "10:00", planDate: TODAY, availableMinutes: 120, tasks });
      for (const row of r.taskRankings) {
        const t = tasks.find((x) => x.id === row.taskId)!;
        const text = row.reason;
        expect(text).not.toMatch(/\d/);
        expect(findUngrounded(text, facts)).toEqual([]);
        const own = text.split(/(?<=[.])\s/)[0];
        if (!t.dueDate) expect(own).not.toMatch(/오늘|내일|며칠|일주일|지나|여유가 있고|여유 있지만/);
        if (t.dueDate && t.dueDate > day(7)) expect(own).not.toMatch(/며칠 안|일주일 안|오늘|내일/);
        if (t.importance !== "high") expect(text).not.toMatch(/중요한 일|중요도가 높/);
        if (t.effort !== "long") expect(text).not.toMatch(/규모가 (커서|큰)/);
        if (t.effort !== "short") expect(text).not.toContain("규모가 작아");
        if (t.effort === null) expect(text).not.toMatch(/규모가 (커|큰|작아)/);
        expect(text.length).toBeLessThanOrEqual(100);
      }
    }
  });
});
