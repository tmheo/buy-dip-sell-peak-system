/**
 * 사용자 프로필 카드 컴포넌트
 */

interface UserProfileProps {
  name: string | null;
  email: string;
  image: string | null;
  createdAt: Date;
}

export default function UserProfile({ name, email, image, createdAt }: UserProfileProps) {
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
          <img
            src={image}
            alt={displayName}
            className="rounded-circle mb-3"
            width={96}
            height={96}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            className="rounded-circle bg-secondary d-flex align-items-center justify-content-center mx-auto mb-3"
            style={{ width: 96, height: 96, fontSize: "2.5rem" }}
          >
            {initial}
          </div>
        )}

        <h4 className="card-title text-light mb-2">{displayName}</h4>
        <p className="text-secondary mb-3">{email}</p>

        <hr className="border-secondary" />

        <div className="text-start">
          <div className="row mb-2">
            <div className="col-4 text-secondary">이름</div>
            <div className="col-8 text-light">{name ?? "-"}</div>
          </div>
          <div className="row mb-2">
            <div className="col-4 text-secondary">이메일</div>
            <div className="col-8 text-light">{email}</div>
          </div>
          <div className="row">
            <div className="col-4 text-secondary">가입일</div>
            <div className="col-8 text-light">{formattedDate}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
