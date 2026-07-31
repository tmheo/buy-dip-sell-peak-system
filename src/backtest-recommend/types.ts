/**
 * 추천 전략 백테스트 타입
 * #64: 결과는 BacktestResult 상위집합 하나로 통일됐다(#61).
 * 아래 별칭들은 기존 소비자(UI 컴포넌트)의 import 경로를 보존한다.
 */
import type { BacktestResult, DailySnapshot } from "@/backtest/types";

export type { CycleStrategyInfo, StrategyUsageStats } from "@/backtest/types";

/**
 * 추천 전략 백테스트 요청
 * BacktestRequest와 달리 전략을 받지 않는다 - 전략은 추천이 결정한다
 */
export interface RecommendBacktestRequest {
  /** 티커 심볼 */
  ticker: "SOXL" | "TQQQ";
  /** 시작 날짜 (YYYY-MM-DD) */
  startDate: string;
  /** 종료 날짜 (YYYY-MM-DD) */
  endDate: string;
  /** 초기 투자금 */
  initialCapital: number;
}

/** 추천 전략 백테스트 결과 (= 통일된 백테스트 결과) */
export type RecommendBacktestResult = BacktestResult;

/** 전략 정보가 포함된 일별 스냅샷 (= 통일된 일별 스냅샷, 전략 필드 포함) */
export type DailySnapshotWithStrategy = DailySnapshot;
