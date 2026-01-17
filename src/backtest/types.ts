/**
 * 백테스트 전용 타입 정의
 * SPEC-BACKTEST-001
 */

// ============================================================
// 상수 정의
// ============================================================

/** 기본 티어 개수 (티어 1-6) */
export const BASE_TIER_COUNT = 6;

/** 예비 티어 번호 */
export const RESERVE_TIER_NUMBER = 7;

/** 최소 티어 번호 */
export const MIN_TIER_NUMBER = 1;

/** 최대 티어 번호 (예비 티어 포함) */
export const MAX_TIER_NUMBER = RESERVE_TIER_NUMBER;

// ============================================================
// 타입 정의
// ============================================================

/**
 * 전략 이름 타입
 */
export type StrategyName = "Pro1" | "Pro2" | "Pro3";

/**
 * 전략 설정 인터페이스
 */
export interface StrategyConfig {
  // 전략 이름
  name: StrategyName;
  // 티어별 투자 비율 (6개 티어)
  tierRatios: [number, number, number, number, number, number];
  // 매수 임계값 (전일 대비 하락률)
  buyThreshold: number;
  // 매도 임계값 (매수가 대비 상승률)
  sellThreshold: number;
  // 손절일 (보유일 수 초과 시 MOC 매도)
  stopLossDay: number;
}

/**
 * 티어 상태 인터페이스
 */
export interface TierState {
  // 티어 번호 (1-7, 7은 예비 티어)
  tier: number;
  // 활성화 여부
  isActive: boolean;
  // 매수 체결가
  buyPrice: number;
  // 보유 수량
  shares: number;
  // 매수 체결일
  buyDate: string;
  // 매수 체결 시점의 거래일 인덱스 (손절일 계산용)
  buyDayIndex: number;
  // 매도 지정가
  sellLimitPrice: number;
}

/**
 * 사이클 상태 인터페이스
 */
export interface CycleState {
  // 사이클 번호
  cycleNumber: number;
  // 사이클 시작일
  startDate: string;
  // 사이클 종료일 (진행 중이면 null)
  endDate: string | null;
  // 사이클 시작 시 투자금
  initialCapital: number;
  // 사이클 종료 시 총 자산 (진행 중이면 null)
  finalAsset: number | null;
  // 티어 상태 배열
  tiers: TierState[];
  // 현재 예수금
  cash: number;
  // 사이클 시작 후 경과 일수
  dayCount: number;
}

/**
 * 백테스트 요청 인터페이스
 */
export interface BacktestRequest {
  // 티커 심볼
  ticker: string;
  // 전략 이름
  strategy: StrategyName;
  // 시작 날짜 (YYYY-MM-DD)
  startDate: string;
  // 종료 날짜 (YYYY-MM-DD)
  endDate: string;
  // 초기 투자금
  initialCapital: number;
}

/**
 * 잔여 티어 정보 인터페이스
 * 백테스트 종료 시점에 아직 매도되지 않은 보유 주식 정보
 */
export interface RemainingTier {
  // 티어 번호
  tier: number;
  // 매수 수량
  shares: number;
  // 매수 체결가
  buyPrice: number;
  // 매수 체결일
  buyDate: string;
  // 현재가 (백테스트 종료일 종가)
  currentPrice: number;
  // 평가 금액 (현재가 × 수량)
  currentValue: number;
  // 수익/손실 금액
  profitLoss: number;
  // 수익률 (소수점)
  returnRate: number;
}

/**
 * 백테스트 결과 인터페이스
 */
export interface BacktestResult {
  // 전략 이름
  strategy: StrategyName;
  // 시작 날짜
  startDate: string;
  // 종료 날짜
  endDate: string;
  // 초기 투자금
  initialCapital: number;
  // 최종 자산
  finalAsset: number;
  // 수익률 (소수점)
  returnRate: number;
  // 최대 낙폭 (MDD, 소수점)
  mdd: number;
  // 총 사이클 수
  totalCycles: number;
  // 승률 (소수점)
  winRate: number;
  // 일별 스냅샷 히스토리
  dailyHistory: DailySnapshot[];
  // 잔여 티어 (백테스트 종료 시 미매도 보유 주식)
  remainingTiers: RemainingTier[];
  // 완료된 사이클별 수익
  completedCycles: { profit: number }[];
}

/**
 * 일별 스냅샷 인터페이스
 */
export interface DailySnapshot {
  // 날짜
  date: string;
  // 시가
  open: number;
  // 고가
  high: number;
  // 저가
  low: number;
  // 종가 (실제 거래 체결 시 사용되는 가격)
  close: number;
  // 수정종가 (주식분할, 배당 등 반영, 수익률 계산에 사용)
  adjClose: number;
  // 현재 예수금
  cash: number;
  // 보유 주식 총 가치 (수정종가 기준, 수익률 계산용)
  holdingsValue: number;
  // 총 자산 (예수금 + 보유 주식 가치)
  totalAsset: number;
  // 당일 거래 내역 (체결된 거래만)
  trades: TradeAction[];
  // 당일 주문 내역 (체결/미체결 모두 포함)
  orders: OrderAction[];
  // 활성 티어 수
  activeTiers: number;
  // 현재 사이클 번호
  cycleNumber: number;
}

/**
 * 거래 행동 인터페이스
 */
export interface TradeAction {
  // 거래 유형
  type: "BUY" | "SELL" | "STOP_LOSS";
  // 티어 번호
  tier: number;
  // 체결가
  price: number;
  // 수량
  shares: number;
  // 거래 금액
  amount: number;
  // 거래 시간 (LOC/MOC)
  orderType: "LOC" | "MOC";
}

/**
 * 주문 계산 결과 인터페이스
 */
export interface OrderCalculation {
  // 지정가
  limitPrice: number;
  // 주문 수량
  shares: number;
  // 총 금액
  amount: number;
}

/**
 * 주문 상태 인터페이스
 * 체결 여부와 관계없이 모든 주문을 추적
 */
export interface OrderAction {
  // 주문 유형 (BUY: 매수, SELL: 매도)
  type: "BUY" | "SELL";
  // 티어 번호
  tier: number;
  // 지정가
  limitPrice: number;
  // 주문 수량
  shares: number;
  // 주문 금액
  amount: number;
  // 주문 방식 (LOC/MOC)
  orderType: "LOC" | "MOC";
  // 체결 여부
  executed: boolean;
  // 체결가 (체결된 경우에만)
  executedPrice?: number;
  // 체결 금액 (체결된 경우에만)
  executedAmount?: number;
  // 미체결 사유 (미체결인 경우에만)
  reason?: string;
}
