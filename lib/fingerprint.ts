import type { AnalysisTask, StoredRecommendation, Task } from "./types";

export function fingerprint(task: AnalysisTask): string {
  return [
    task.projectId ?? "-",
    task.title,
    task.dueDate ?? "-",
    task.importance,
    task.estimatedMinutes,
  ].join("|");
}

/**
 * 추천이 현재 입력과 맞지 않는지(재분석 필요) 판정한다. PRD §5-3-4 S1~S5.
 * 완료 처리 자체는 stale 조건이 아니다.
 */
export function isRecommendationStale(
  rec: StoredRecommendation,
  tasks: Task[],
  availableMinutes: number,
  today: string,
): boolean {
  if (rec.generatedForDate !== today) return true; // S5
  if (rec.availableMinutes !== availableMinutes) return true; // S4

  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const [id, fp] of Object.entries(rec.taskFingerprints)) {
    const task = byId.get(id);
    if (!task) return true; // S2
    if (fingerprint(task) !== fp) return true; // S3
  }
  return tasks.some((t) => !t.isCompleted && !(t.id in rec.taskFingerprints)); // S1
}
