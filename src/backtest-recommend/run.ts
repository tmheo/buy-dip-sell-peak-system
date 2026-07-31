/**
 * 추천 전략 백테스트 facade
 * #64: BacktestEngine에 추천 공급자를 꽂아 돌리는 얇은 조립.
 * 하루 루프·사이클 경계·결과 조립은 전부 BacktestEngine(#63)이 소유한다.
 */
import type { DailyPrice } from "@/types";
import type { BacktestResult } from "@/backtest/types";
import { BacktestEngine } from "@/backtest/engine";
import type { SimilarityConfig } from "@/recommend/types";
import { DEFAULT_STRATEGY } from "@/recommend/service";
import { createRecommendProvider } from "./provider";
import type { RecommendBacktestRequest } from "./types";

/** 추천 백테스트 옵션 */
export interface RecommendBacktestOptions {
  /**
   * 커스텀 유사도 설정 (가중치·허용오차)
   * 지정하면 메모리 캐시와 추천 기록(DB)을 전부 우회해 기본 설정의 결과와 섞이지 않는다
   */
  similarityConfig?: SimilarityConfig;
}

/**
 * 추천 전략 백테스트 실행
 * 사이클 경계·첫 매수 전 재평가마다 추천 전략으로 동적 전환한다 (#61 공급자 계약).
 *
 * @param request - 백테스트 요청
 * @param allPrices - 전체 가격 데이터 (추천 lookback + 백테스트 기간, 날짜순 정렬)
 * @param backtestStartIndex - 백테스트 시작 인덱스 (이전 데이터는 추천·지표 계산용)
 * @param options - 추천 백테스트 옵션
 */
export async function runRecommendBacktest(
  request: RecommendBacktestRequest,
  allPrices: DailyPrice[],
  backtestStartIndex: number,
  options: RecommendBacktestOptions = {}
): Promise<BacktestResult> {
  const provider = createRecommendProvider(request.ticker, allPrices, options.similarityConfig);
  // 시작 전날 데이터가 없어 공급자를 부를 수 없으면 기본 전략으로 시작한다
  const engine = new BacktestEngine(DEFAULT_STRATEGY);
  return engine.run(
    { ...request, strategy: DEFAULT_STRATEGY },
    allPrices,
    backtestStartIndex,
    provider
  );
}
