export const TITLE_MAX = 100;
export const PROJECT_NAME_MAX = 30;

export const EST_MIN = 15;
export const EST_MAX = 480;
export const EST_DEFAULT = 30;

export const AVAIL_MIN = 15;
export const AVAIL_MAX = 720;
export const AVAIL_DEFAULT = 120;

export const MAX_AI_TASKS = 30;
export const MAX_FOCUS = 3;
export const MAX_WARNINGS = 5;

export const REASON_MAX = {
  task: 100,
  project: 120,
  focus: 200,
  warning: 150,
} as const;

export const EST_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240];
export const AVAIL_PRESETS = [30, 60, 90, 120, 180, 240, 360];

export const IMPORTANCE_LABEL = {
  high: "높음",
  medium: "보통",
  low: "낮음",
} as const;
