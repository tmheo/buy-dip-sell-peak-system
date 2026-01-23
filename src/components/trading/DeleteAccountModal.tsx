"use client";

/**
 * 트레이딩 계좌 삭제 확인 모달 컴포넌트
 */

import type React from "react";

interface DeleteAccountModalProps {
  accountName: string;
  isDeleting: boolean;
  onConfirm: () => void;
}

export default function DeleteAccountModal({
  accountName,
  isDeleting,
  onConfirm,
}: DeleteAccountModalProps): React.ReactElement {
  return (
    <div
      className="modal fade"
      id="deleteAccountModal"
      tabIndex={-1}
      aria-labelledby="deleteAccountModalLabel"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content bg-dark">
          <div className="modal-header border-secondary">
            <h5 className="modal-title text-danger" id="deleteAccountModalLabel">
              계좌 삭제
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
            <p className="mb-2">
              <strong className="text-light">{accountName}</strong> 계좌를 삭제하시겠습니까?
            </p>
            <p className="text-warning mb-0">
              삭제 시 모든 보유 현황 및 거래 기록이 삭제되며 복구할 수 없습니다.
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
              {isDeleting ? "삭제 중..." : "삭제하기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
