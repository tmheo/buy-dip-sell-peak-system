/**
 * 사용자 프로필 카드 컴포넌트
 */

import type React from "react";
import Image from "next/image";

interface UserProfileProps {
  name: string | null;
  email: string;
  image: string | null;
  createdAt: Date;
}

interface ProfileRowProps {
  label: string;
  value: string;
  isLast?: boolean;
}

function ProfileRow({ label, value, isLast = false }: ProfileRowProps): React.ReactElement {
  return (
    <div className={isLast ? "row" : "row mb-2"}>
      <div className="col-4 text-secondary">{label}</div>
      <div className="col-8 text-light">{value}</div>
    </div>
  );
}

const AVATAR_SIZE = 96;

export default function UserProfile({ name, email, image, createdAt }: UserProfileProps): React.ReactElement {
  const displayName = name ?? email.split("@")[0];
  const initial = displayName.charAt(0).toUpperCase();

  const formattedDate = createdAt.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="card bg-dark border-secondary">
      <div className="card-body text-center">
        {image ? (
          <Image
            src={image}
            alt={displayName}
            className="rounded-circle mb-3"
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            className="rounded-circle bg-secondary d-flex align-items-center justify-content-center mx-auto mb-3"
            style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, fontSize: "2.5rem" }}
          >
            {initial}
          </div>
        )}

        <h4 className="card-title text-light mb-2">{displayName}</h4>
        <p className="text-secondary mb-3">{email}</p>

        <hr className="border-secondary" />

        <div className="text-start">
          <ProfileRow label="이름" value={name ?? "-"} />
          <ProfileRow label="이메일" value={email} />
          <ProfileRow label="가입일" value={formattedDate} isLast />
        </div>
      </div>
    </div>
  );
}
