"use client";

import { useState } from "react";
import { signInWithGoogle, startAsGuest } from "@/hooks/useAppStore";
import { supabaseConfigured } from "@/lib/supabase/client";
import { introSub, introTitle, showToast } from "./ui";

/**
 * 온보딩 이후 1회 시작 화면. 워드마크 · 메인/서브 카피 · 두 개의 시작 버튼만 둔다(추가 텍스트·장식 없음).
 */
export default function StartScreen() {
  const [busy, setBusy] = useState(false);

  const google = async () => {
    if (!supabaseConfigured) {
      showToast("지금은 Google 로그인을 시작할 수 없어요. 로그인 없이 시작해 주세요.");
      return;
    }
    setBusy(true);
    const r = await signInWithGoogle();
    if (r === "error") {
      setBusy(false);
      showToast("로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-white px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(clamp(56px,10.5dvh,96px),env(safe-area-inset-top))]">
      <p className="text-center text-[44px] font-black leading-none tracking-[-2.14px] text-[#19191b]" aria-label="일갈피">
        일갈피<span className="text-primary">.</span>
      </p>

      <main className="flex flex-1 flex-col items-center justify-start pt-[clamp(88px,15dvh,140px)] text-center">
        <h1 className={introTitle}>
          <span className="block">할 일은 많은데</span>
          <span className="block">뭐부터 해야 할지 모르겠다면?</span>
        </h1>
        <p className={`mt-4 ${introSub}`}>
          <span className="block">복잡한 할 일의 갈피를 잡고</span>
          <span className="block">지금 가장 중요한 일부터 시작해 보세요</span>
        </p>
      </main>

      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={google}
          disabled={busy}
          aria-disabled={!supabaseConfigured || busy}
          className={`inline-flex min-h-14 w-full items-center justify-center rounded-2xl border border-[#747775] bg-white px-4 text-[18px] font-medium text-[#1f1f1f] transition-colors hover:bg-[#f8f8f8] ${!supabaseConfigured || busy ? "opacity-60" : ""}`}
        >
          <GoogleG />
          <span className="ml-[13px]">Google로 계속하기</span>
        </button>
        <button
          type="button"
          onClick={startAsGuest}
          disabled={busy}
          className="mt-2 inline-flex min-h-12 items-center justify-center px-4 text-[13.5px] font-normal text-[#6b6c73] hover:text-ink"
        >
          로그인 없이 시작하기
        </button>
      </div>
    </div>
  );
}

/** Google 공식 컬러 "G" 로고. 버튼 전체를 비율대로 키운 크기(가이드 20px 기준 ×1.3) */
function GoogleG() {
  return (
    <svg width="26" height="26" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
