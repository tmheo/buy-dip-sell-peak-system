/**
 * 일별 가격 데이터 인터페이스
 */
export interface DailyPrice {
  id?: number;
  ticker?: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
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
export type Command = "init" | "init-all" | "update" | "update-all" | "query" | "help";
