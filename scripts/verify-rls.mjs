// 두 개의 테스트 계정으로 RLS가 실제로 계정 간 접근을 막는지 검증한다.
// 사용: Supabase 설정을 .env.local에 채운 뒤 `npm run verify:rls`
// 테스트 계정(임시 이메일/비밀번호)은 서비스 롤 키로 만들고, 끝나면 삭제한다. 키 값은 출력하지 않는다.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) { console.error("✗ .env.local에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY가 필요해요."); process.exit(1); }

const admin = createClient(url, service, { auth: { persistSession: false } });
const stamp = Date.now();
const pw = `Tmp-${stamp}-pw!`;
const users = [];
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "✓" : "✗"} ${name}`); if (!ok) failed++; };

async function mk(label) {
  const email = `rls-${label}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error("createUser:" + error.message);
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: pw });
  if (e2) throw new Error("signIn:" + e2.message);
  users.push(data.user.id);
  return { id: data.user.id, c };
}

try {
  const A = await mk("a"), B = await mk("b");
  const now = new Date().toISOString();
  const row = (uid) => ({ user_id: uid, id: "t1", title: "A의 비밀 할 일", planned_date: "2026-10-20", importance: "medium", created_at: now, updated_at: now });

  const ins = await A.c.from("tasks").insert(row(A.id));
  check("A가 자기 행을 저장할 수 있다", !ins.error);
  const rd = await B.c.from("tasks").select("*");
  check("B는 A의 행을 조회할 수 없다", !rd.error && rd.data.length === 0);
  const forged = await B.c.from("tasks").insert(row(A.id));
  check("B는 user_id를 A로 위조해 저장할 수 없다", !!forged.error);
  const upd = await B.c.from("tasks").update({ title: "해킹" }).eq("user_id", A.id).eq("id", "t1").select();
  check("B는 A의 행을 수정할 수 없다", !upd.error && upd.data.length === 0);
  const del = await B.c.from("tasks").delete().eq("user_id", A.id).eq("id", "t1").select();
  check("B는 A의 행을 삭제할 수 없다", !del.error && del.data.length === 0);
  const sameId = await B.c.from("tasks").insert(row(B.id));
  check("B는 같은 id로 자기 행을 따로 저장할 수 있다((user_id,id) 키)", !sameId.error);
  const still = await A.c.from("tasks").select("title").eq("id", "t1");
  check("A의 원본은 그대로다", still.data?.[0]?.title === "A의 비밀 할 일");

  const anonC = createClient(url, anon, { auth: { persistSession: false } });
  for (const t of ["tasks", "projects", "daily_available", "recommendations", "user_preferences"]) {
    const r = await anonC.from(t).select("*");
    check(`로그인하지 않은 anon은 ${t}를 읽을 수 없다`, !!r.error || (r.data ?? []).length === 0);
  }
  const fb = await A.c.from("feedback").select("*");
  check("로그인 사용자도 feedback을 읽을 수 없다", !!fb.error || (fb.data ?? []).length === 0);
  const fbIns = await anonC.from("feedback").insert({ message: "x" });
  check("anon은 feedback에 직접 쓸 수 없다", !!fbIns.error);
  const rl = await A.c.rpc("hit_rate_limit", { p_bucket: "x", p_subject: "y", p_window_seconds: 60, p_max: 1 });
  check("일반 사용자는 rate limit 함수를 호출할 수 없다", !!rl.error);

  // rate limit 카운터: 테이블은 anon·일반 사용자에게 막혀 있고, 서비스 롤 전용 함수가 실제로 카운트·차단한다.
  const rlTable = await anonC.from("rate_limits").select("*");
  check("anon은 rate_limits 테이블을 읽을 수 없다", !!rlTable.error || (rlTable.data ?? []).length === 0);
  const rlUser = await A.c.from("rate_limits").select("*");
  check("로그인 사용자도 rate_limits 테이블을 읽을 수 없다", !!rlUser.error || (rlUser.data ?? []).length === 0);
  const bucket = `verify-${stamp}`;
  const hit = () => admin.rpc("hit_rate_limit", { p_bucket: bucket, p_subject: "verify-subject", p_window_seconds: 3600, p_max: 2 });
  const [h1, h2, h3] = [await hit(), await hit(), await hit()];
  check("rate limit 함수: 한도 내 2회는 허용, 3회째는 차단", h1.data === true && h2.data === true && h3.data === false);
  await admin.from("rate_limits").delete().eq("bucket", bucket);
} catch (e) {
  console.error("✗ 검증을 끝내지 못했어요:", e.message);
  failed++;
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
console.log(failed === 0 ? "\n모든 RLS 검증을 통과했어요." : `\n${failed}개 항목이 실패했어요.`);
process.exit(failed === 0 ? 0 : 1);
