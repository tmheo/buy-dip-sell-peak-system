/**
 * DELETE /api/user/delete 테스트
 *
 * 세션 인증을 getAuthUserId로 통일한 뒤에도(이슈 #78) 인증 실패 응답이
 * 401 { error: "Unauthorized" } 그대로이고, 삭제 대상이 로그인한 사용자인지 확인한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

const deleteWhere = vi.fn();
vi.mock("@/database/db-drizzle", () => ({
  db: {
    delete: vi.fn(() => ({ where: deleteWhere })),
  },
}));

import { mockLoggedIn, mockLoggedOut } from "@/lib/__tests__/auth-mock";
import { db } from "@/database/db-drizzle";
import { users } from "@/database/schema/index";

import { DELETE } from "../route";

describe("DELETE /api/user/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("로그인하지 않은 요청은 401을 반환하고 아무것도 삭제하지 않아야 한다", async () => {
    mockLoggedOut();

    const response = await DELETE();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("로그인한 사용자의 계정을 삭제하고 success를 반환해야 한다", async () => {
    mockLoggedIn("user-1");

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(db.delete).toHaveBeenCalledWith(users);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
