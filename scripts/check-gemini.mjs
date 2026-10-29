// 로컬에서 Gemini 연동이 실제로 되는지 확인한다. 키 값은 출력하지 않는다.
//   npm run check:gemini            (1단계: Gemini 직접 호출)
//   npm run dev → 다른 터미널에서 같은 명령 (2단계: /api/recommend 전체 경로까지)
import { existsSync, readFileSync } from "node:fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return false;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
}

const hasFile = loadEnvLocal();
const key = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => console.log(`✗ ${m}`);

console.log(`.env.local: ${hasFile ? "있음" : "없음"}, GEMINI_API_KEY: ${key ? `설정됨(길이 ${key.length})` : "비어 있음"}, 모델: ${model}`);
if (!key) {
  bad("GEMINI_API_KEY가 없습니다. https://aistudio.google.com/apikey 에서 키를 발급해 .env.local에 GEMINI_API_KEY=... 로 넣고, 개발 서버를 다시 시작하세요.");
  process.exit(1);
}

// 1단계: Gemini 직접 호출 (앱과 같은 엔드포인트·인증·구조화 출력 형식)
const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
const body = (withThinking) => ({
  contents: [{ role: "user", parts: [{ text: 'JSON으로만 답하세요: {"ok": true} 형태.' }] }],
  generationConfig: {
    temperature: 0,
    responseMimeType: "application/json",
    responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
    ...(withThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
  },
});
async function ping(withThinking) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body(withThinking)),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let direct;
try {
  direct = await ping(true);
  if (direct.status === 400 && /thinking/i.test(direct.json?.error?.message ?? "")) {
    console.log("  (thinkingLevel 설정이 거부되어 설정 없이 재시도합니다 — 앱도 같은 방식으로 폴백합니다)");
    direct = await ping(false);
  }
} catch (e) {
  bad(`Gemini에 연결하지 못했습니다(네트워크/타임아웃): ${e.name}`);
  process.exit(1);
}
if (direct.status === 200) {
  const text = direct.json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  ok(`Gemini 직접 호출 성공 (HTTP 200, 모델 ${model}, 응답 ${text.slice(0, 40)})`);
} else {
  const msg = direct.json?.error?.message ?? "";
  const hint =
    direct.status === 400 && /api key/i.test(msg) ? "→ API 키가 올바르지 않습니다."
    : direct.status === 403 ? "→ 키 권한/지역 제한/결제 설정을 확인하세요."
    : direct.status === 404 ? "→ 모델 이름(GEMINI_MODEL)을 확인하세요."
    : direct.status === 429 ? "→ 사용량 한도 초과입니다. 잠시 후 다시 시도하세요."
    : "";
  bad(`Gemini 직접 호출 실패: HTTP ${direct.status} ${msg.slice(0, 200)} ${hint}`);
  process.exit(1);
}

// 2단계: 로컬 서버의 /api/recommend 전체 경로
const base = process.env.CHECK_BASE_URL || "http://localhost:3000";
const today = new Date();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tomorrow = new Date(today.getTime() + 86400000);
const sample = {
  currentDate: ymd(today),
  planDate: ymd(today),
  currentTime: `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  availableMinutes: 120,
  projects: [],
  tasks: [
    { id: "a", projectId: null, title: "지원서 제출", dueDate: ymd(tomorrow), dueTime: "18:00", importance: "high", effort: "short", isCompleted: false },
    { id: "b", projectId: null, title: "포트폴리오 전체 수정", dueDate: null, dueTime: null, importance: "medium", effort: "long", isCompleted: false },
    { id: "c", projectId: null, title: "장보기", dueDate: null, dueTime: null, importance: "low", effort: null, isCompleted: false },
  ],
};
let res;
const t0 = Date.now();
try {
  res = await fetch(`${base}/api/recommend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sample), signal: AbortSignal.timeout(60000) });
} catch {
  console.log(`- ${base} 에 개발 서버가 없어 2단계(/api/recommend)는 건너뜁니다. 'npm run dev' 후 다시 실행하면 전체 경로를 확인합니다.`);
  process.exit(0);
}
const data = await res.json();
if (!data.ok) {
  bad(`/api/recommend 실패: ${data.error?.code} — ${data.error?.message}`);
  if (data.error?.code === "MISSING_API_KEY") console.log("  개발 서버가 키 설정 전에 시작됐을 수 있습니다. 서버를 재시작하세요.");
  process.exit(1);
}
ok(`/api/recommend 성공 (모델 ${data.meta.model}, 시도 ${data.meta.attempts}회, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
for (const r of data.recommendation.taskRankings) {
  const t = sample.tasks.find((x) => x.id === r.taskId);
  console.log(`   ${r.rank}. ${t.title} — ${r.reason}`);
}
if (data.recommendation.warnings.length) console.log("   주의:", data.recommendation.warnings.join(" / "));
