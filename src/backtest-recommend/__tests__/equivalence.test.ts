/**
 * 구 RecommendBacktestEngine ↔ 신 facade(runRecommendBacktest) 동등성 테스트 (#64)
 *
 * 순수 구조 리팩토링의 증명 장치: 같은 입력(가격·추천 순서)에서 두 구현의
 * 결과 전체가 완전히 일치해야 한다. 골든 값 이동이 없음을 보인다.
 *
 * 이 커밋에서는 구 엔진이 아직 살아 있어 두 구현을 나란히 돌려 비교하고,
 * 구 엔진의 결과가 커밋된 픽스처(__fixtures__/old-engine-result.ts)와도
 * 일치함을 확인한다. 다음 커밋에서 구 엔진을 삭제하면 이 테스트는
 * 픽스처와의 비교로 전환되어 동등성 증명이 저장소에 남는다.
 *
 * 시나리오는 공급자 계약(#61)의 세 호출 시점을 모두 지난다:
 * 초기 추천, 첫 매수 전 재평가(전략 교체 포함), 사이클 완료 익일 재추천.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DailyPrice } from "@/types";
import type { Strategy } from "@/types/trading";
import type { Recommendation } from "@/recommend/types";
import { getStrategyParams } from "@/strategy";
import { recommendOrDefault } from "@/recommend/service";
import { RecommendBacktestEngine } from "../engine";
import { runRecommendBacktest } from "../run";
import { OLD_ENGINE_RESULT } from "./__fixtures__/old-engine-result";

vi.mock("@/recommend/service", () => ({
  recommendOrDefault: vi.fn(),
  DEFAULT_STRATEGY: "Pro2",
}));

const mockedRecommend = vi.mocked(recommendOrDefault);

// close를 adjClose와 다르게 두어, 엔진이 close를 쓰면 동등성이 깨지게 한다
function createMockPrice(date: string, adjClose: number): DailyPrice {
  return {
    date,
    open: adjClose + 50,
    high: adjClose + 50,
    low: adjClose + 50,
    close: adjClose + 50,
    adjClose,
    volume: 1000000,
  };
}

/**
 * 기준일에 따라 결정론적으로 다른 전략을 돌려주는 추천
 * (일(day) % 3 → Pro1/Pro2/Pro3) - 재평가 중 전략 교체가 실제로 일어난다
 */
function deterministicRecommendation(referenceDate: string): Recommendation {
  const day = Number(referenceDate.slice(8, 10));
  const strategy: Strategy = (["Pro1", "Pro2", "Pro3"] as const)[day % 3];
  return {
    referenceDate,
    strategy,
    reason: `${referenceDate} 기준 ${strategy} 추천`,
    metrics: {
      goldenCross: day / 10,
      isGoldenCross: day % 2 === 0,
      maSlope: 0,
      disparity: 0,
      rsi14: 30 + day,
      roc12: 0,
      volatility20: 0,
    },
    tierRatios: [...getStrategyParams(strategy).tierRatios],
  };
}

// 상승(매수 없는 재평가) → 하락(다중 티어 매수) → 반등(전량 매도·사이클 완료)
// → 새 사이클 → 급락 → 반등을 지나는 시나리오 (픽스처 생성 입력과 동일해야 한다)
const PRICES: DailyPrice[] = [
  createMockPrice("2025-01-01", 100), // lookback (초기 추천 기준일)
  createMockPrice("2025-01-02", 100), // 백테스트 시작
  createMockPrice("2025-01-03", 101), // 재평가 (매수 없음)
  createMockPrice("2025-01-06", 102), // 재평가 (전략 교체)
  createMockPrice("2025-01-07", 100),
  createMockPrice("2025-01-08", 97),
  createMockPrice("2025-01-09", 94),
  createMockPrice("2025-01-10", 99),
  createMockPrice("2025-01-13", 103),
  createMockPrice("2025-01-14", 106),
  createMockPrice("2025-01-15", 104),
  createMockPrice("2025-01-16", 98),
  createMockPrice("2025-01-17", 92),
  createMockPrice("2025-01-21", 85),
  createMockPrice("2025-01-22", 90),
  createMockPrice("2025-01-23", 95),
];

const REQUEST = {
  ticker: "SOXL" as const,
  startDate: PRICES[1].date,
  endDate: PRICES[PRICES.length - 1].date,
  initialCapital: 10000,
};

describe("구 엔진 ↔ 신 facade 동등성", () => {
  beforeEach(() => {
    mockedRecommend.mockReset();
    mockedRecommend.mockImplementation(async (_ticker, referenceDate) =>
      deterministicRecommendation(referenceDate)
    );
  });

  it("같은 입력에서 구 엔진과 결과 전체가 완전히 일치해야 한다", async () => {
    const oldResult = await new RecommendBacktestEngine("SOXL", PRICES).run(REQUEST, 1);

    mockedRecommend.mockClear();
    const newResult = await runRecommendBacktest(REQUEST, PRICES, 1);

    // 시나리오가 의미 있게 깊은지 확인 (여러 사이클 + 전략 다양성)
    expect(oldResult.totalCycles).toBeGreaterThanOrEqual(2);
    expect(new Set(oldResult.cycleStrategies.map((c) => c.strategy)).size).toBeGreaterThanOrEqual(
      2
    );

    // 신 결과는 구 결과의 상위집합(strategy 필드 추가)이다
    const { strategy: _added, ...comparable } = newResult;
    expect(comparable).toEqual(oldResult);

    // 커밋된 픽스처는 구 엔진의 결과 그대로다 (구 엔진 삭제 후 증명의 앵커)
    expect(oldResult).toEqual(OLD_ENGINE_RESULT);
  });
});
