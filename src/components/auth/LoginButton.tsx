/**
 * Google 로그인 버튼 컴포넌트
 */

import { signIn } from "@/auth";

export function LoginButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      <button type="submit" className="btn btn-outline-primary btn-sm">
        로그인
      </button>
    </form>
  );
}
