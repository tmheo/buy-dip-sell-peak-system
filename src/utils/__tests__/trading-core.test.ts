/**
 * 트레이딩 핵심 유틸리티 함수 테스트
 */
import { describe, it, expect } from "vitest";

import { calculateReserveTierSeed } from "../trading-core";

describe("calculateReserveTierSeed", () => {
  it("잔여 예수금 전액을 예비 티어 시드로 반환한다 (티어 1-6 모두 보유)", () => {
    // 실제 버그 재현 시나리오: 시드 $65,303.83, 티어 1-6 매수 완료
    const holdings = [
      { shares: 67, buyPrice: 157.5 },
      { shares: 61, buyPrice: 165.55 },
      { shares: 69, buyPrice: 136.81 },
      { shares: 79, buyPrice: 128.15 },
      { shares: 85, buyPrice: 109.54 },
      { shares: 99, buyPrice: 91.99 },
    ];

    expect(calculateReserveTierSeed(65303.83, holdings)).toBe(6671.13);
  });

  it("보유 티어가 없으면 시드 전액을 반환한다", () => {
    expect(calculateReserveTierSeed(10000, [])).toBe(10000);
  });

  it("수량이 0이거나 매수가가 없는 티어는 투자 금액에서 제외한다", () => {
    const holdings = [
      { shares: 0, buyPrice: 100 },
      { shares: 10, buyPrice: null },
      { shares: 5, buyPrice: 200 },
    ];

    expect(calculateReserveTierSeed(3000, holdings)).toBe(2000);
  });

  it("잔여 예수금이 음수면 0을 반환한다", () => {
    const holdings = [{ shares: 100, buyPrice: 150 }];

    expect(calculateReserveTierSeed(10000, holdings)).toBe(0);
  });

  it("잔여 예수금을 소수점 2자리로 내림한다", () => {
    // 10000 - 3 × 3333.333 = 0.001 → 0.00
    const holdings = [{ shares: 3, buyPrice: 3333.333 }];

    expect(calculateReserveTierSeed(10000, holdings)).toBe(0);
  });
});
