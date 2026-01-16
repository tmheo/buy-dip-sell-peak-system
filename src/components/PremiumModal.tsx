"use client";

// PremiumModal 컴포넌트 - 프리미엄 기능 모달
// Client Component - 모달 상호작용을 위해

interface PremiumModalProps {
  id?: string;
  title?: string;
  message?: string;
}

export default function PremiumModal({
  id = "premiumModal",
  title = "프리미엄 기능",
  message = "이 기능은 프리미엄 사용자만 이용할 수 있습니다.",
}: PremiumModalProps) {
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
            <h5 className="modal-title" id={`${id}Label`}>
              {title}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body">
            <p className="mb-0">{message}</p>
          </div>
          <div className="modal-footer border-secondary">
            <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
