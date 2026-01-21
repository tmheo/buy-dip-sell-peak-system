"use client";

/**
 * 마이페이지 클라이언트 컴포넌트
 * UI 렌더링 및 회원 탈퇴 처리
 */

import { useState } from "react";
import UserProfile from "@/components/mypage/UserProfile";
import DeleteAccountModal from "@/components/mypage/DeleteAccountModal";

interface MyPageClientProps {
  name: string | null;
  email: string;
  image: string | null;
  createdAt: Date;
}

export default function MyPageClient({ name, email, image, createdAt }: MyPageClientProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch("/api/user/delete", {
        method: "DELETE",
      });

      if (response.ok) {
        window.location.href = "/";
      } else {
        const data = await response.json();
        alert(data.error ?? "회원 탈퇴에 실패했습니다.");
        setIsDeleting(false);
      }
    } catch {
      alert("회원 탈퇴에 실패했습니다.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <h2 className="text-light mb-4">마이페이지</h2>

          <UserProfile
            name={name}
            email={email}
            image={image}
            createdAt={createdAt}
          />

          <div className="mt-4 text-center">
            <button
              type="button"
              className="btn btn-outline-danger"
              data-bs-toggle="modal"
              data-bs-target="#deleteAccountModal"
            >
              회원 탈퇴
            </button>
          </div>

          <DeleteAccountModal
            isDeleting={isDeleting}
            onConfirm={handleDeleteAccount}
          />
        </div>
      </div>
    </div>
  );
}
