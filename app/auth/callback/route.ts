import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase OAuth(PKCE) 콜백. 코드를 세션으로 교환해 쿠키에 저장한 뒤 홈으로 돌려보낸다.
 * 취소·오류는 쿼리(auth=cancelled|error)로 알려 화면이 원인에 맞게 안내한다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (searchParams.get("error") || !code) {
    const denied = searchParams.get("error") === "access_denied" || searchParams.get("error_code") === "access_denied";
    return NextResponse.redirect(`${origin}/?auth=${denied || !searchParams.get("error") ? "cancelled" : "error"}`);
  }
  if (!url || !key) return NextResponse.redirect(`${origin}/?auth=error`);

  const store = await cookies();
  const response = NextResponse.redirect(`${origin}/?auth=ok`);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value, options }) => {
          store.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }
  return response;
}
