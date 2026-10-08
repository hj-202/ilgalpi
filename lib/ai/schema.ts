/** Gemini 구조화 출력 스키마 (generationConfig.responseSchema). PRD §7-4 */
const ranking = (idKey: string) => ({
  type: "OBJECT",
  properties: {
    [idKey]: { type: "STRING" },
    rank: { type: "INTEGER" },
    reason: { type: "STRING" },
  },
  required: [idKey, "rank", "reason"],
  propertyOrdering: [idKey, "rank", "reason"],
});

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    taskRankings: { type: "ARRAY", items: ranking("taskId") },
    projectRankings: { type: "ARRAY", items: ranking("projectId") },
    focusPlan: {
      type: "OBJECT",
      properties: {
        taskIds: { type: "ARRAY", items: { type: "STRING" } },
        reason: { type: "STRING" },
      },
      required: ["taskIds", "reason"],
      propertyOrdering: ["taskIds", "reason"],
    },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["taskRankings", "projectRankings", "focusPlan", "warnings"],
  // 작업 단위 판단을 먼저 생성한 뒤 프로젝트 순위·Focus를 맞추도록 유도
  propertyOrdering: ["taskRankings", "projectRankings", "focusPlan", "warnings"],
};
