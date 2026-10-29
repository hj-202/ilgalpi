import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** NEXT_PUBLIC_ 값은 빌드 시 인라인되므로 정적으로 참조해야 한다 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(URL_ && KEY);

let client: SupabaseClient | null = null;

/** 브라우저용 Supabase 클라이언트(공개 키 + 로그인 세션, RLS 하에서만 접근). 설정이 없으면 null */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  client ??= createBrowserClient(URL_!, KEY!);
  return client;
}
