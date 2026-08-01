/**
 * API 라우트 공통 유틸리티 단위 테스트
 *
 * 크론 인증 헬퍼 requireCronAuth의 판정과 응답을 검증한다.
 * 이 헬퍼는 두 크론 route에 복제돼 있던 인증 블록을 그대로 옮겨온 것이라,
 * 상태 코드와 응답 본문이 기존과 동일한지가 검증의 핵심이다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// next-auth ESM 호환성 문제로 세션 인증 모듈은 대역으로 바꾼다
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { requireCronAuth } from "../api-utils";

/** 크론 요청용 NextRequest 생성 헬퍼 */
function createCronRequest(token?: string): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set("authorization", token);
  }
  return new NextRequest("http://localhost:3000/api/cron/update-prices", {
    method: "GET",
    headers,
  });
}

describe("requireCronAuth", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-secret-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("올바른 Bearer 토큰이면 null을 반환해 통과시켜야 한다", () => {
    expect(requireCronAuth(createCronRequest("Bearer test-secret-token"))).toBeNull();
  });

  it("CRON_SECRET이 없으면 500 Server misconfigured를 반환해야 한다", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = requireCronAuth(createCronRequest("Bearer test-secret-token"));

    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);
    await expect(response!.json()).resolves.toEqual({ error: "Server misconfigured" });
  });

  it("Authorization 헤더가 없으면 401을 반환해야 한다", async () => {
    const response = requireCronAuth(createCronRequest());

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
    await expect(response!.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("잘못된 토큰이면 401을 반환해야 한다", async () => {
    const response = requireCronAuth(createCronRequest("Bearer wrong-token"));

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
    await expect(response!.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("Bearer 형식이 아닌 인증 헤더면 401을 반환해야 한다", async () => {
    const response = requireCronAuth(createCronRequest("Token test-secret-token"));

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  it("길이가 다른 토큰에도 timingSafeEqual 예외 없이 401을 반환해야 한다", async () => {
    const response = requireCronAuth(createCronRequest("Bearer short"));

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  it("글자 수는 같지만 바이트 수가 다른 토큰도 예외 없이 401을 반환해야 한다", async () => {
    // "tést-secret-token"은 올바른 토큰과 글자 수가 같지만 UTF-8 바이트 수가 하나 더 많다
    const response = requireCronAuth(createCronRequest("Bearer tést-secret-token"));

    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
    await expect(response!.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
