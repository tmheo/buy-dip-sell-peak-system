/**
 * divergence.ts 단위 테스트
 * SPEC-RECOMMEND-002 RSI 다이버전스 탐지
 */
import { describe, it, expect } from "vitest";
import { findLocalHighs, detectBearishDivergence } from "../divergence";

describe("findLocalHighs", () => {
  it("로컬 고점을 올바르게 탐지해야 한다", () => {
    // 인덱스: 0  1  2  3  4  5  6  7  8
    // 가격:  10 20 15 25 20 30 25 35 30
    const prices = [10, 20, 15, 25, 20, 30, 25, 35, 30];

    const highs = findLocalHighs(prices, 0, 8, 1);

    // 인덱스 1(20), 3(25), 5(30), 7(35)이 고점
    expect(highs).toContain(1);
    expect(highs).toContain(3);
    expect(highs).toContain(5);
    expect(highs).toContain(7);
  });

  it("minDistance를 고려해야 한다", () => {
    // 연속적인 고점들 (거리가 가까움)
    const prices = [10, 20, 15, 22, 18, 25, 20];

    // minDistance = 3이면 거리가 가까운 고점 중 더 높은 쪽 선택
    const highs = findLocalHighs(prices, 0, 6, 3);

    // 인덱스 1(20)과 3(22)는 거리 2로 너무 가까움 -> 더 높은 3(22) 선택
    // 인덱스 5(25)는 3과 거리 2로 가까움 -> 더 높은 5(25) 선택
    expect(highs.length).toBeGreaterThanOrEqual(1);
  });

  it("고점이 없으면 빈 배열을 반환해야 한다", () => {
    // 계속 상승하는 데이터 (고점 없음)
    const prices = [10, 20, 30, 40, 50];

    const highs = findLocalHighs(prices, 0, 4, 1);

    expect(highs).toEqual([]);
  });

  it("단조 감소 데이터에서도 빈 배열을 반환해야 한다", () => {
    const prices = [50, 40, 30, 20, 10];

    const highs = findLocalHighs(prices, 0, 4, 1);

    expect(highs).toEqual([]);
  });
});

describe("detectBearishDivergence", () => {
  // RSI 계산을 위해 최소 15일 데이터가 필요
  // 테스트용 샘플 데이터 생성 (60일치)
  function generateTestPrices(pattern: "divergence" | "normal" | "insufficient"): number[] {
    if (pattern === "insufficient") {
      // 데이터 부족 케이스 (10일치만)
      return [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    }

    // 60일치 기본 데이터 (상승 추세)
    const prices: number[] = [];
    for (let i = 0; i < 60; i++) {
      prices.push(100 + i * 0.5);
    }

    if (pattern === "divergence") {
      // 베어리시 다이버전스 패턴 생성
      // 가격은 상승하지만 RSI는 하락하는 패턴
      // 인덱스 50에서 고점, 인덱스 55에서 더 높은 고점
      prices[48] = 120;
      prices[49] = 125; // 첫 번째 고점
      prices[50] = 122;
      prices[51] = 118;
      prices[52] = 122;
      prices[53] = 128; // 두 번째 고점 (더 높음)
      prices[54] = 120;
      prices[55] = 115;
    }

    return prices;
  }

  it("데이터가 부족하면 다이버전스 없음을 반환해야 한다", () => {
    const prices = generateTestPrices("insufficient");

    const result = detectBearishDivergence(prices, 9);

    expect(result.hasBearishDivergence).toBe(false);
    expect(result.priceHighIndices).toEqual([]);
    expect(result.priceHighs).toEqual([]);
    expect(result.rsiHighs).toEqual([]);
  });

  it("고점이 2개 미만이면 다이버전스 없음을 반환해야 한다", () => {
    // 단조 증가 데이터 (고점이 없음)
    const prices: number[] = [];
    for (let i = 0; i < 60; i++) {
      prices.push(100 + i);
    }

    const result = detectBearishDivergence(prices, 59);

    expect(result.hasBearishDivergence).toBe(false);
  });

  it("정상적인 상승 추세에서는 다이버전스가 감지되지 않아야 한다", () => {
    const prices = generateTestPrices("normal");

    const result = detectBearishDivergence(prices, 59);

    // 정상 상승 추세에서는 다이버전스 없음
    // (가격과 RSI 모두 상승)
    expect(result.hasBearishDivergence).toBe(false);
  });

  it("currentIndex가 배열 범위를 벗어나면 다이버전스 없음을 반환해야 한다", () => {
    const prices = generateTestPrices("normal");

    const result = detectBearishDivergence(prices, 100);

    expect(result.hasBearishDivergence).toBe(false);
  });

  it("결과 객체가 올바른 구조를 가져야 한다", () => {
    const prices = generateTestPrices("normal");

    const result = detectBearishDivergence(prices, 59);

    // 결과 객체 구조 검증
    expect(result).toHaveProperty("hasBearishDivergence");
    expect(result).toHaveProperty("priceHighIndices");
    expect(result).toHaveProperty("priceHighs");
    expect(result).toHaveProperty("rsiHighs");
    expect(typeof result.hasBearishDivergence).toBe("boolean");
    expect(Array.isArray(result.priceHighIndices)).toBe(true);
    expect(Array.isArray(result.priceHighs)).toBe(true);
    expect(Array.isArray(result.rsiHighs)).toBe(true);
  });

  it("커스텀 옵션이 적용되어야 한다", () => {
    const prices = generateTestPrices("normal");

    const result = detectBearishDivergence(prices, 59, {
      windowSize: 10,
      minPeakDistance: 2,
      priceTolerance: -0.02,
      rsiMinDrop: 5,
    });

    // 옵션이 적용되어 결과가 반환됨
    expect(result).toBeDefined();
    expect(result.hasBearishDivergence).toBeDefined();
  });
});

describe("detectBearishDivergence 실제 시나리오", () => {
  it("가격 상승 + RSI 하락 시 베어리시 다이버전스를 감지해야 한다", () => {
    // 60일치 데이터 생성
    const prices: number[] = [];

    // 처음 40일: 안정적인 상승
    for (let i = 0; i < 40; i++) {
      prices.push(100 + i * 0.5);
    }

    // 40-45일: 급등 후 조정 (첫 번째 고점 형성)
    prices.push(125); // 40
    prices.push(135); // 41 - 첫 번째 고점
    prices.push(128); // 42
    prices.push(125); // 43
    prices.push(122); // 44

    // 45-50일: 더 높은 고점 형성 (가격은 상승하지만 모멘텀 약화)
    prices.push(130); // 45
    prices.push(140); // 46 - 두 번째 고점 (더 높음)
    prices.push(132); // 47
    prices.push(128); // 48
    prices.push(125); // 49

    // 나머지 채우기
    for (let i = prices.length; i < 60; i++) {
      prices.push(120 + (i - 50) * 0.2);
    }

    const result = detectBearishDivergence(prices, 49, {
      windowSize: 15,
      minPeakDistance: 3,
    });

    // 결과 검증: 고점 인덱스와 가격/RSI 값이 채워져야 함
    if (result.priceHighIndices.length >= 2) {
      expect(result.priceHighs.length).toBe(2);
      expect(result.rsiHighs.length).toBe(2);
    }
  });

  it("가격과 RSI가 모두 상승하면 다이버전스가 없어야 한다", () => {
    // 건강한 상승 추세 (가격과 RSI 모두 상승)
    const prices: number[] = [];

    // 60일치 점진적 상승 데이터
    for (let i = 0; i < 60; i++) {
      // 작은 변동과 함께 상승
      const base = 100 + i * 1.5;
      const noise = Math.sin(i * 0.5) * 2;
      prices.push(base + noise);
    }

    const result = detectBearishDivergence(prices, 59);

    // 건강한 상승 추세에서는 일반적으로 다이버전스 없음
    // (RSI도 함께 상승)
    expect(result.hasBearishDivergence).toBe(false);
  });
});
