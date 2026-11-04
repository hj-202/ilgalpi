/*
 * 추천 이유 문구의 품질 검사(반복 문구, 입력과 모순되는 마감·규모 표현).
 * 검사만 하며 추천 결과를 바꾸거나 거부하지 않는다. 결과는 서버 로그의 개수로만 남긴다.
 * (결과에 반영하는 정책은 별도 승인 후 결정한다.) 이유 원문은 반환 값에 id로만 연결되고 로그에는 남지 않는다.
 */

export interface QualityTask {
  id: string;
  dueDate: string | null;
  dueTime: string | null;
  /** 오늘 기준 남은 일수(음수=지남, null=마감 없음) */
  daysUntilDue: number | null;
  /** 마감 시각이 있을 때 지금부터 남은 분(음수=지남) */
  minutesUntilDue: number | null;
  importance: string;
  /** "1시간 이내" | "1~2시간" | "2시간 초과" | null */
  effort: string | null;
}

export type ContradictionKind =
  | "deadline_on_undated"
  | "claims_today_but_not"
  | "claims_tomorrow_but_not"
  | "claims_overdue_but_not"
  | "claims_imminent_but_far"
  | "claims_light_but_large"
  | "claims_heavy_but_small"
  | "claims_size_but_unknown";

export interface QualityReport {
  /** 같은 문장이 조건이 다른 둘 이상의 작업에 쓰인 묶음(작업 id) */
  duplicates: string[][];
  contradictions: Array<{ taskId: string; kind: ContradictionKind }>;
}

const normalize = (text: string) => text.replace(/[\s.,!?·'"‘’“”~…-]/g, "");

/** 다른 작업과 비교하는 문장은 '이 작업 자신'에 대한 주장이 아닐 수 있어 마감·규모 모순 검사에서 제외한다 */
const COMPARATIVE = /보다|다른 (작업|일)|앞선|앞 순위|뒤에|뒤로|먼저 둔/;

const sameConditions = (a: QualityTask, b: QualityTask) =>
  a.dueDate === b.dueDate && a.dueTime === b.dueTime && a.importance === b.importance && a.effort === b.effort;

export function checkReasonQuality(rankings: Array<{ taskId: string; reason: string }>, tasks: QualityTask[]): QualityReport {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const report: QualityReport = { duplicates: [], contradictions: [] };

  // 반복 문구: 정규화한 문장이 같고, 조건까지 같은 작업끼리만 있는 묶음은 정당한 반복으로 본다
  const groups = new Map<string, string[]>();
  for (const r of rankings) {
    const key = normalize(r.reason);
    if (key) groups.set(key, [...(groups.get(key) ?? []), r.taskId]);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const ts = ids.map((id) => byId.get(id)).filter((t): t is QualityTask => t !== undefined);
    if (ts.length >= 2 && ts.every((t) => sameConditions(t, ts[0]))) continue;
    report.duplicates.push(ids);
  }

  const add = (taskId: string, kind: ContradictionKind) => report.contradictions.push({ taskId, kind });
  for (const r of rankings) {
    const t = byId.get(r.taskId);
    if (!t) continue;
    const text = r.reason;
    if (COMPARATIVE.test(text)) continue;
    const d = t.daysUntilDue;
    if (d === null) {
      if (/마감/.test(text) && !/(없|않|미정|아직)/.test(text)) add(t.id, "deadline_on_undated");
    } else {
      if (/오늘\s*(이\s*)?마감|오늘까지/.test(text) && d !== 0) add(t.id, "claims_today_but_not");
      if (/내일\s*(이\s*)?마감|내일까지/.test(text) && d !== 1) add(t.id, "claims_tomorrow_but_not");
      const passed = d < 0 || (d === 0 && t.minutesUntilDue !== null && t.minutesUntilDue < 0);
      if (/마감(이|을)?\s*지났|마감(이|을)?\s*지나|기한이 지/.test(text) && !passed) add(t.id, "claims_overdue_but_not");
      if (/마감이 (임박|코앞)|곧 마감|마감이 가까/.test(text) && d > 7) add(t.id, "claims_imminent_but_far");
    }
    if (t.effort === "2시간 초과" && /금방|잠깐|짧게 (끝|마)|짧은 (작업|일)|가볍게|간단/.test(text)) add(t.id, "claims_light_but_large");
    if (t.effort === "1시간 이내" && /오래 걸|시간이 많이|규모가 (크|큰)|긴 작업이에요|부담이 큰/.test(text)) add(t.id, "claims_heavy_but_small");
    if (t.effort === null && /금방 (끝|마)|오래 걸|짧게 (끝|마)/.test(text)) add(t.id, "claims_size_but_unknown");
  }
  return report;
}
