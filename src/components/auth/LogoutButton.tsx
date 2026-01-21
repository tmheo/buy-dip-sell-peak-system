/**
 * 로그아웃 버튼 컴포넌트
 */

import { signOut } from "@/auth";

export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut();
      }}
    >
      <button type="submit" className="btn btn-outline-secondary btn-sm">
        로그아웃
      </button>
    </form>
  );
}
