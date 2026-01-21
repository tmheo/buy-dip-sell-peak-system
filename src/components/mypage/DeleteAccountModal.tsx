"use client";

/**
 * 회원 탈퇴 확인 모달 컴포넌트
 */

import type React from "react";

interface DeleteAccountModalProps {
  id?: string;
  isDeleting: boolean;
  onConfirm: () => void;
}

const DEFAULT_MODAL_ID = "deleteAccountModal";

export default function DeleteAccountModal({
  id = DEFAULT_MODAL_ID,
  isDeleting,
  onConfirm,
}: DeleteAccountModalProps): React.ReactElement {
  return (
    <div
      className="modal fade"
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}Label`}
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content bg-dark">
          <div className="modal-header border-secondary">
            <h5 className="modal-title text-danger" id={`${id}Label`}>
              회원 탈퇴
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              data-bs-dismiss="modal"
              aria-label="Close"
              disabled={isDeleting}
            ></button>
          </div>
          <div className="modal-body">
            <p className="mb-2">정말로 탈퇴하시겠습니까?</p>
            <p className="text-warning mb-0">
              탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.
            </p>
          </div>
          <div className="modal-footer border-secondary">
            <button
              type="button"
              className="btn btn-secondary"
              data-bs-dismiss="modal"
              disabled={isDeleting}
            >
              취소
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "탈퇴 처리 중..." : "탈퇴하기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
