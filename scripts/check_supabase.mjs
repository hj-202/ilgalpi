import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envPath = new URL("../.env.local", import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const tables = ["projects", "tasks", "daily_available", "recommendations", "user_preferences", "feedback", "rate_limits"];
  for (const t of tables) {
    const { data, error } = await sb.from(t).select("*").limit(1);
    if (error) {
      console.log(`Table "${t}": ERROR`, {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    } else {
      console.log(`Table "${t}": OK (data count: ${data?.length})`);
    }
  }
}

check();
