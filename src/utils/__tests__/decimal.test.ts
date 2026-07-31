/**
 * 소수점 처리 함수 단위 테스트
 * (backtest/__tests__/order.test.ts에서 이식 - #48)
 */
import { describe, it, expect } from "vitest";
import { floorToDecimal, roundToDecimal } from "../decimal";

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
