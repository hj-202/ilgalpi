export const TITLE_MAX = 100;
export const PROJECT_NAME_MAX = 30;

export const AVAIL_MIN = 5;
export const AVAIL_MAX = 1440;
export const AVAIL_DEFAULT = 120;

export const MAX_AI_TASKS = 30;
export const MAX_WARNINGS = 5;

export const REASON_MAX = {
  task: 100,
  project: 120,
  warning: 150,
} as const;

/** 이날 작업 가능한 시간 프리셋(분). 60은 '1시간 이내'(총시간 상한) */
export const AVAIL_PRESETS = [60, 120, 180, 240, 300, 360];

export const FEEDBACK_MAX = 1000;

export const EFFORT_OPTIONS = [
  { value: "short", label: "1시간 이내" },
  { value: "medium", label: "1~2시간" },
  { value: "long", label: "2시간 초과" },
] as const;

export const EFFORT_LABEL = {
  short: "1시간 이내",
  medium: "1~2시간",
  long: "2시간 초과",
} as const;

export const IMPORTANCE_LABEL = {
  high: "높음",
  medium: "보통",
  low: "낮음",
} as const;
