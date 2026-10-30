"use client";

import { GhostButton, Modal, PrimaryButton } from "./ui";

/**
 * 로그아웃 확인. 의견 보내기 모달과 같은 Modal·버튼 스타일을 쓴다.
 * 저장되지 않은 변경이 있을 때만 데이터 손실 경고를 이 모달 안에 보인다(별도의 확인창은 띄우지 않는다).
 */
export default function LogoutConfirmModal({
  unsavedChanges = false,
  onCancel,
  onConfirm,
}: {
  unsavedChanges?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="로그아웃하시겠어요?" onClose={onCancel}>
      {unsavedChanges && (
        <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#6f7176]">
          아직 저장되지 않은 변경이 있어요. 지금 로그아웃하면 변경 내용이 사라질 수 있어요.
        </p>
      )}
      <div className="mt-5 flex gap-[9px]">
        <GhostButton type="button" onClick={onCancel} className="min-h-[44px] flex-1 py-2.5">
          취소
        </GhostButton>
        <PrimaryButton type="button" onClick={onConfirm} className="min-h-[44px] flex-1 py-2.5">
          로그아웃
        </PrimaryButton>
      </div>
    </Modal>
  );
}
