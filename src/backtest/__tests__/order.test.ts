/**
 * order.ts 단위 테스트
 * SPEC-BACKTEST-001 REQ-002, REQ-003, REQ-004, REQ-005
 */
import { describe, it, expect } from "vitest";
import {
  floorToDecimal,
  roundToDecimal,
  calculateBuyLimitPrice,
  calculateSellLimitPrice,
  calculateBuyQuantity,
  shouldExecuteBuy,
  shouldExecuteSell,
} from "../order";

describe("floorToDecimal", () => {
  it("소수점 2자리로 내림해야 한다", () => {
    expect(floorToDecimal(100.999, 2)).toBe(100.99);
    expect(floorToDecimal(100.991, 2)).toBe(100.99);
    expect(floorToDecimal(100.001, 2)).toBe(100.0);
  });

  it("소수점 0자리(정수)로 내림해야 한다", () => {
    expect(floorToDecimal(100.999, 0)).toBe(100);
    expect(floorToDecimal(100.001, 0)).toBe(100);
    expect(floorToDecimal(99.999, 0)).toBe(99);
  });

  it("소수점 3자리로 내림해야 한다", () => {
    expect(floorToDecimal(100.9999, 3)).toBe(100.999);
    expect(floorToDecimal(100.0001, 3)).toBe(100.0);
  });

  it("이미 정확한 값은 그대로 반환해야 한다", () => {
    expect(floorToDecimal(100.5, 2)).toBe(100.5);
    expect(floorToDecimal(100.0, 2)).toBe(100.0);
  });

  it("부동소수점 정밀도 문제를 처리해야 한다", () => {
    // 0.1 + 0.2 = 0.30000000000000004 같은 문제 처리
    expect(floorToDecimal(0.1 + 0.2, 2)).toBe(0.3);
  });
});

describe("roundToDecimal", () => {
  it("소수점 2자리로 반올림해야 한다", () => {
    // ROUND_HALF_UP: 0.5 이상이면 올림
    expect(roundToDecimal(100.995, 2)).toBe(101); // 0.005 >= 0.005 -> 올림
    expect(roundToDecimal(100.996, 2)).toBe(101.0);
    expect(roundToDecimal(100.994, 2)).toBe(100.99);
  });

  it("소수점 0자리(정수)로 반올림해야 한다", () => {
    expect(roundToDecimal(100.5, 0)).toBe(101);
    expect(roundToDecimal(100.4, 0)).toBe(100);
    expect(roundToDecimal(99.5, 0)).toBe(100);
  });

  it("소수점 3자리로 반올림해야 한다", () => {
    expect(roundToDecimal(100.9995, 3)).toBe(101.0);
    expect(roundToDecimal(100.9994, 3)).toBe(100.999);
  });

  it("부동소수점 정밀도 문제를 처리해야 한다", () => {
    expect(roundToDecimal(0.1 + 0.2, 2)).toBe(0.3);
  });
});

describe("calculateBuyLimitPrice", () => {
  describe("REQ-002: LOC 매수 주문 계산", () => {
    it("전일 종가 $100, buyThreshold -0.01%일 때 $99.99", () => {
      // 매수 지정가 = floor(100 × (1 + (-0.0001)), 2) = floor(99.99, 2) = 99.99
      const result = calculateBuyLimitPrice(100, -0.0001);
      expect(result).toBe(99.99);
    });

    it("전일 종가 $25.50, buyThreshold -0.01%일 때 정확히 계산", () => {
      // 매수 지정가 = floor(25.50 × 0.9999, 2) = floor(25.497, 2) = 25.49
      const result = calculateBuyLimitPrice(25.5, -0.0001);
      expect(result).toBe(25.49);
    });

    it("전일 종가 $100, buyThreshold -0.10%일 때 $99.90", () => {
      // 매수 지정가 = floor(100 × (1 + (-0.001)), 2) = floor(99.9, 2) = 99.90
      const result = calculateBuyLimitPrice(100, -0.001);
      expect(result).toBe(99.9);
    });

    it("전일 종가 $33.33, buyThreshold -0.01%일 때 정확히 계산", () => {
      // 매수 지정가 = floor(33.33 × 0.9999, 2) = floor(33.3267, 2) = 33.32
      const result = calculateBuyLimitPrice(33.33, -0.0001);
      expect(result).toBe(33.32);
    });
  });
});

describe("calculateSellLimitPrice", () => {
  describe("REQ-004: LOC 매도 주문 계산", () => {
    it("매수 체결가 $100, sellThreshold +0.01%일 때 $100.01", () => {
      // 매도 지정가 = floor(100 × (1 + 0.0001), 2) = floor(100.01, 2) = 100.01
      const result = calculateSellLimitPrice(100, 0.0001);
      expect(result).toBe(100.01);
    });

    it("매수 체결가 $100, sellThreshold +1.50%일 때 $101.50", () => {
      // 매도 지정가 = floor(100 × 1.015, 2) = floor(101.5, 2) = 101.50
      const result = calculateSellLimitPrice(100, 0.015);
      expect(result).toBe(101.5);
    });

    it("매수 체결가 $100, sellThreshold +2.00%일 때 $102.00", () => {
      // 매도 지정가 = floor(100 × 1.02, 2) = floor(102, 2) = 102.00
      const result = calculateSellLimitPrice(100, 0.02);
      expect(result).toBe(102.0);
    });

    it("매수 체결가 $25.49, sellThreshold +1.50%일 때 정확히 계산", () => {
      // 매도 지정가 = floor(25.49 × 1.015, 2) = floor(25.87235, 2) = 25.87
      const result = calculateSellLimitPrice(25.49, 0.015);
      expect(result).toBe(25.87);
    });
  });
});

describe("calculateBuyQuantity", () => {
  describe("REQ-002: 매수 수량 계산", () => {
    it("티어 금액 $1000, 매수 지정가 $100일 때 10주", () => {
      // 매수 수량 = floor(1000 ÷ 100, 0) = 10
      const result = calculateBuyQuantity(1000, 100);
      expect(result).toBe(10);
    });

    it("티어 금액 $1000, 매수 지정가 $33.33일 때 30주", () => {
      // 매수 수량 = floor(1000 ÷ 33.33, 0) = floor(30.003, 0) = 30
      const result = calculateBuyQuantity(1000, 33.33);
      expect(result).toBe(30);
    });

    it("티어 금액 $500, 매수 지정가 $25.49일 때 19주", () => {
      // 매수 수량 = floor(500 ÷ 25.49, 0) = floor(19.615, 0) = 19
      const result = calculateBuyQuantity(500, 25.49);
      expect(result).toBe(19);
    });

    it("티어 금액이 지정가보다 작으면 0주", () => {
      const result = calculateBuyQuantity(50, 100);
      expect(result).toBe(0);
    });

    it("매수 지정가가 0이면 에러를 발생시켜야 한다", () => {
      expect(() => calculateBuyQuantity(1000, 0)).toThrow("limitPrice must be greater than 0");
    });

    it("매수 지정가가 음수면 에러를 발생시켜야 한다", () => {
      expect(() => calculateBuyQuantity(1000, -100)).toThrow("limitPrice must be greater than 0");
    });

    it("티어 금액이 0이면 0주를 반환해야 한다", () => {
      const result = calculateBuyQuantity(0, 100);
      expect(result).toBe(0);
    });

    it("티어 금액이 음수면 0주를 반환해야 한다", () => {
      const result = calculateBuyQuantity(-100, 100);
      expect(result).toBe(0);
    });
  });
});

describe("shouldExecuteBuy", () => {
  describe("REQ-003: LOC 매수 체결 판정", () => {
    it("당일 종가가 매수 지정가보다 낮으면 체결", () => {
      // IF 당일 종가 ≤ 매수 지정가 THEN 매수 체결
      expect(shouldExecuteBuy(99.0, 99.99)).toBe(true);
      expect(shouldExecuteBuy(90.0, 99.99)).toBe(true);
    });

    it("당일 종가가 매수 지정가와 같으면 체결", () => {
      expect(shouldExecuteBuy(99.99, 99.99)).toBe(true);
    });

    it("당일 종가가 매수 지정가보다 높으면 미체결", () => {
      expect(shouldExecuteBuy(100.0, 99.99)).toBe(false);
      expect(shouldExecuteBuy(110.0, 99.99)).toBe(false);
    });
  });
});

describe("shouldExecuteSell", () => {
  describe("REQ-005: LOC 매도 체결 판정", () => {
    it("당일 종가가 매도 지정가보다 높으면 체결", () => {
      // IF 당일 종가 ≥ 매도 지정가 THEN 매도 체결
      expect(shouldExecuteSell(102.0, 101.5)).toBe(true);
      expect(shouldExecuteSell(110.0, 101.5)).toBe(true);
    });

    it("당일 종가가 매도 지정가와 같으면 체결", () => {
      expect(shouldExecuteSell(101.5, 101.5)).toBe(true);
    });

    it("당일 종가가 매도 지정가보다 낮으면 미체결", () => {
      expect(shouldExecuteSell(101.0, 101.5)).toBe(false);
      expect(shouldExecuteSell(90.0, 101.5)).toBe(false);
    });
  });
});
