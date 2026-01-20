/**
 * 일별 가격 데이터 인터페이스
 * close: 당일 종가 (원시 데이터)
 * adjClose: 수정종가 (주식분할, 배당 등 반영)
 */
export interface DailyPrice {
  id?: number;
  ticker?: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  createdAt?: string;
}

/**
 * Yahoo Finance에서 받아온 원시 데이터 인터페이스
 */
export interface YahooQuote {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

/**
 * 데이터 조회 옵션
 */
export interface QueryOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * CLI 명령어 타입
 */
export type Command =
  | "init"
  | "init-all"
  | "update"
  | "update-all"
  | "query"
  | "help"
  | "init-metrics"
  | "verify-metrics";

/**
 * 일별 기술적 지표 데이터 인터페이스 (SPEC-PERFORMANCE-001)
 * DB에 저장되는 사전 계산된 기술적 지표
 */
export interface DailyMetricRow {
  id?: number;
  ticker: string;
  date: string;
  ma20: number | null;
  ma60: number | null;
  maSlope: number | null;
  disparity: number | null;
  rsi14: number | null;
  roc12: number | null;
  volatility20: number | null;
  goldenCross: number | null;
  isGoldenCross: boolean;
  createdAt?: string;
}
