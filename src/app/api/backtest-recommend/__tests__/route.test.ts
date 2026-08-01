/**
 * POST /api/backtest-recommend 인증 테스트
 *
 * 세션 인증을 getAuthUserId로 통일한 뒤에도(이슈 #78) 인증 실패 응답이
 * 401 { error: "Unauthorized" } 그대로인지, 인증 전에 DB를 건드리지 않는지 확인한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/database/prices", () => ({
  getPriceRange: vi.fn(),
}));

import { mockLoggedIn, mockLoggedOut } from "@/lib/__tests__/auth-mock";
import { getPriceRange } from "@/database/prices";

import { POST } from "../route";

function createRequest(): Request {
  return new Request("http://localhost:3000/api/backtest-recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: "SOXL",
      startDate: "2025-01-02",
      endDate: "2025-01-11",
      initialCapital: 10000,
    }),
  });
}

describe("POST /api/backtest-recommend - 인증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("로그인하지 않은 요청은 401을 반환해야 한다", async () => {
    mockLoggedOut();

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(getPriceRange).not.toHaveBeenCalled();
  });

  it("로그인한 요청은 인증 단계를 통과해 백테스트로 진행해야 한다", async () => {
    mockLoggedIn("user-1");
    vi.mocked(getPriceRange).mockResolvedValue([]);

    const response = await POST(createRequest());

    expect(response.status).not.toBe(401);
    expect(getPriceRange).toHaveBeenCalled();
  });
});
