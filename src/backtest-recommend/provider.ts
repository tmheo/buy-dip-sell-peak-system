/**
 * 추천 서비스 → 전략 결정 공급자(StrategyProvider) 어댑터
 * #64: recommendOrDefault를 BacktestEngine의 전략 결정 경계(#63)에 꽂는다.
 * 추천 불가 재현 의미("부족하면 기본 전략 Pro2 + 사유")는 recommendOrDefault가 소유한다.
 */
import type { DailyPrice } from "@/types";
import type { StrategyProvider } from "@/backtest/types";
import type { SimilarityConfig } from "@/recommend/types";
import { recommendOrDefault } from "@/recommend/service";

/**
 * 추천 전략 공급자 생성
 *
 * @param ticker - 티커 심볼
 * @param prices - 전체 가격 데이터 (핫 루프용: 서비스가 DB 재조회 없이 사용)
 * @param similarityConfig - 커스텀 유사도 설정 (지정하면 메모리 캐시와 추천 기록(DB)을
 *   전부 우회해 기본 설정의 결과와 섞이지 않는다)
 */
export function createRecommendProvider(
  ticker: "SOXL" | "TQQQ",
  prices: DailyPrice[],
  similarityConfig?: SimilarityConfig
): StrategyProvider {
  return async (referenceDate) => {
    const recommendation = await recommendOrDefault(ticker, referenceDate, {
      prices,
      similarityConfig,
    });
    return {
      strategy: recommendation.strategy,
      reason: recommendation.reason,
      metrics: {
        rsi14: recommendation.metrics.rsi14,
        isGoldenCross: recommendation.metrics.isGoldenCross,
      },
    };
  };
}
