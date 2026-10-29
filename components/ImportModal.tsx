"use client";

import { declineImport, runImport, type ImportOffer } from "@/hooks/useAppStore";
import { formatMonthDay } from "@/lib/date";
import { GhostButton, Modal, PrimaryButton, showToast } from "./ui";

/** 로그인 직후 비회원 기록 가져오기. 동의한 경우에만 이전하고 로컬 원본은 지우지 않는다. */
export default function ImportModal({ offer, state }: { offer: ImportOffer; state: "idle" | "running" | "error" }) {
  const running = state === "running";
  const range = offer.from && offer.to ? (offer.from === offer.to ? formatMonthDay(offer.from) : `${formatMonthDay(offer.from)} ~ ${formatMonthDay(offer.to)}`) : null;
  const go = async () => {
    if (await runImport()) showToast("이 기기의 기록을 계정으로 가져왔어요.");
  };
  return (
    <Modal title="이 기기의 기록을 계정으로 가져올까요?" onClose={declineImport} dismissible={!running}>
      <p className="mt-3 text-[13px] leading-relaxed text-[#6f7176]">
        할 일 {offer.tasks}개{range ? ` · ${range}` : ""}의 기록이 이 기기에 있어요. 가져와도 이 기기의 원본 기록은 그대로 남아요.
      </p>
      {state === "error" && (
        <p role="alert" className="mt-3 text-[13px] text-primary-dark">
          가져오지 못했어요. 이 기기의 기록은 그대로 보관되어 있어요. 다시 시도해 주세요.
        </p>
      )}
      <div className="mt-5 flex gap-[9px]">
        <GhostButton type="button" onClick={declineImport} disabled={running} className="min-h-[44px] flex-1 py-2.5">
          가져오지 않기
        </GhostButton>
        <PrimaryButton type="button" onClick={go} disabled={running} aria-busy={running} className="min-h-[44px] flex-1 py-2.5">
          {running ? "가져오는 중…" : state === "error" ? "다시 시도" : "가져오기"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
