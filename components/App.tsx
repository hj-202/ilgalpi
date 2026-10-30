"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import {
  dismissAuthMessage,
  initAuth,
  refreshClock,
  retryAccountLoad,
  retrySync,
  signOut,
  useAppStore,
  type AuthMessage,
} from "@/hooks/useAppStore";
import type { LoadNotice } from "@/lib/storage";
import HistoryView from "./HistoryView";
import HomeView from "./HomeView";
import ImportModal from "./ImportModal";
import LogoutConfirmModal from "./LogoutConfirmModal";
import MyPage from "./MyPage";
import Onboarding from "./Onboarding";
import StartScreen from "./StartScreen";
import { HomeIcon, RecordIcon, ToastHost } from "./ui";

const NOTICE_TEXT: Record<Exclude<LoadNotice, null>, string> = {
  corrupt: "저장된 데이터를 읽지 못해 새로 시작했어요. 이전 데이터는 브라우저에 그대로 남아 있어요.",
  unavailable: "이 브라우저에서는 데이터를 저장할 수 없어요. 새로고침하면 내용이 사라져요.",
  "migrated-effort":
    "예상 소요시간이 새 기준(1시간 이내 / 1~2시간 / 2시간 초과)으로 바뀌었어요. 기존 분 단위 값은 가까운 옵션으로 옮기고 원래 값은 보관돼요.",
  migrated: "이전 버전의 할 일과 완료 기록을 새 버전으로 옮겼어요. 원본은 그대로 보관돼요.",
  "migrated-estimated":
    "이전 버전의 할 일을 새 버전으로 옮겼어요. 일부 완료 기록은 날짜 정보가 없어 오늘로 배치했어요(추정값). 원본은 그대로 보관돼요.",
};

const AUTH_TEXT: Record<Exclude<AuthMessage, null>, string> = {
  cancelled: "로그인을 취소했어요. 비회원으로 계속 사용할 수 있어요.",
  error: "로그인하지 못했어요. 잠시 후 다시 시도해 주세요. 비회원으로는 계속 사용할 수 있어요.",
  expired: "로그인이 만료되어 로그아웃됐어요. 다시 로그인해 주세요. 저장하지 못한 변경이 있었다면 반영되지 않았을 수 있어요.",
  unconfigured: "로그인 설정이 연결되지 않아 시작할 수 없어요.",
};

function Skeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] animate-pulse bg-white px-5 py-6" aria-busy="true" aria-label="불러오는 중">
      <div className="h-7 w-24 rounded bg-chip" />
      <div className="mt-6 h-28 rounded-[19px] bg-chip" />
      <div className="mt-6 h-40 rounded-xl bg-chip" />
    </div>
  );
}

function Banner({ children, onClose, tone = "plain", action }: { children: React.ReactNode; onClose?: () => void; tone?: "plain" | "error"; action?: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mb-3 flex items-start justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-xs ${tone === "error" ? "border-primary/40 text-primary-dark" : "border-line text-[#65676e]"}`}
    >
      <p className="leading-relaxed">{children}</p>
      <div className="-my-1 flex shrink-0 items-center">
        {action}
        {onClose && (
          <button type="button" onClick={onClose} className="min-h-[36px] px-2 text-ink">
            닫기
          </button>
        )}
      </div>
    </div>
  );
}

type View = "home" | "records" | "history";

export default function App() {
  const store = useAppStore();
  const [view, setView] = useState<View>("home");
  const [selectedState, setSelected] = useState<string | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // 세션 복원·탭 복귀·자정 경과 때 오늘 날짜를 다시 계산한다(AI는 자동 호출하지 않는다)
  useEffect(() => {
    initAuth();
    const onVisible = () => document.visibilityState === "visible" && refreshClock();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshClock);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        refreshClock();
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshClock);
      clearTimeout(timer);
    };
  }, []);

  // 지난 실행 기록 전체보기는 브라우저 뒤로가기와 함께 동작한다
  useEffect(() => {
    const onPop = () => setView((v) => (v === "history" ? "records" : v));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const openHistory = useCallback(() => {
    window.history.pushState({ ilgalpi: "history" }, "");
    setView("history");
  }, []);
  const leaveHistory = useCallback(() => {
    if ((window.history.state as { ilgalpi?: string } | null)?.ilgalpi === "history") window.history.back();
    else setView("records");
  }, []);
  const openDate = useCallback((ymd: string) => {
    track("History Detail Viewed");
    const fromHistory = (window.history.state as { ilgalpi?: string } | null)?.ilgalpi === "history";
    setSelected(ymd);
    setView("home");
    if (fromHistory) window.history.back();
  }, []);

  if (!store) return <Skeleton />;
  const { app, today, notice, onboarded, started, auth, accountLoad, sync, authMessage } = store;

  // 세션 확인·계정 데이터 로드가 끝나기 전에는 비회원/로그인 UI를 확정해 보여주지 않는다
  if (auth.status === "checking" || (auth.status === "account" && accountLoad === "loading")) return <Skeleton />;
  if (auth.status === "account" && accountLoad === "error") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 bg-white px-8 text-center">
        <p role="alert" className="text-[15px] leading-relaxed">
          계정 데이터를 불러오지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={retryAccountLoad} className="min-h-[44px] rounded-xl bg-primary px-5 text-sm font-bold text-white">
            다시 시도
          </button>
          <button type="button" onClick={() => setConfirmLogout(true)} className="min-h-[44px] rounded-xl border border-line px-5 text-sm text-subtle">
            로그아웃
          </button>
        </div>
        {confirmLogout && (
          <LogoutConfirmModal
            onCancel={() => setConfirmLogout(false)}
            onConfirm={() => {
              setConfirmLogout(false);
              void signOut();
            }}
          />
        )}
      </div>
    );
  }
  if (!onboarded) return <Onboarding />;
  if (!started && auth.status === "guest") return (<><StartScreen /><ToastHost /></>);

  const selected = selectedState ?? today;
  const tabClass = (active: boolean) =>
    `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold ${active ? "text-primary" : "text-[#8a8b90]"}`;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-white shadow-[0_0_0_1px_#e3e5e9]">
      <main className="flex-1 px-5 pb-28 pt-6">
        {view === "home" && (
          <header className="mb-[21px]">
            <h1 className="text-[23px] font-extrabold leading-tight tracking-[-0.765px]">
              일갈피<span className="text-primary">.</span>
            </h1>
            <p className="text-[13px] text-[#76777c]">복잡한 하루 속, 지금 해야 할 일부터</p>
          </header>
        )}

        {notice && !dismissedNotice && <Banner onClose={() => setDismissedNotice(true)}>{NOTICE_TEXT[notice]}</Banner>}
        {authMessage && (
          <Banner tone={authMessage === "cancelled" ? "plain" : "error"} onClose={dismissAuthMessage}>
            {AUTH_TEXT[authMessage]}
          </Banner>
        )}
        {auth.status === "account" && sync.state === "error" && (
          <Banner
            tone="error"
            action={
              <button type="button" onClick={retrySync} className="min-h-[36px] px-2 font-bold underline underline-offset-2">
                다시 시도
              </button>
            }
          >
            변경 사항을 저장하지 못했어요. 이 기기에는 보이지만 계정에는 아직 저장되지 않았어요.
          </Banner>
        )}

        {view === "home" && <HomeView app={app} today={today} selected={selected} onSelect={setSelected} />}
        {view === "records" && <MyPage store={store} onOpenDate={openDate} onOpenHistory={openHistory} onGoHome={() => setView("home")} />}
        {view === "history" && <HistoryView tasks={app.tasks} today={today} onBack={leaveHistory} onOpenDate={openDate} />}
      </main>

      {view !== "history" && (
        <nav aria-label="주요 화면" className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[480px] -translate-x-1/2 border-t border-[#ededf0] bg-white/95 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <button type="button" aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")} className={tabClass(view === "home")}>
            <HomeIcon />홈
          </button>
          <button type="button" aria-current={view === "records" ? "page" : undefined} onClick={() => setView("records")} className={tabClass(view === "records")}>
            <RecordIcon />내 기록
          </button>
        </nav>
      )}

      {store.importOffer && <ImportModal offer={store.importOffer} state={store.importState} />}
      <ToastHost />
    </div>
  );
}
