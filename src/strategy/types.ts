/**
 * 떨사오팔 매매 규칙 모듈의 공개 타입 정의
 * #43: 백테스트와 실계좌가 공유하는 단일 규칙 모듈
 *
 * 가격 불변식: 이 모듈에 입력되는 모든 가격(전일 종가, DayBar.close)은
 * 분할·배당이 조정된 연속 시계열(adjClose)이어야 한다.
 */
import type { Strategy } from "@/types/trading";

// ============================================================
// 상수
// ============================================================

/** 기본 티어 개수 (티어 1-6) */
export const BASE_TIER_COUNT = 6;

/** 예비 티어 번호 */
export const RESERVE_TIER_NUMBER = 7;

/** 최소 티어 번호 */
export const MIN_TIER_NUMBER = 1;

/** 최대 티어 번호 (예비 티어 포함, 전체 티어 수와 같다) */
export const MAX_TIER_NUMBER = RESERVE_TIER_NUMBER;

// ============================================================
// 전략 파라미터
// ============================================================

/**
 * 전략 파라미터 세트
 * 임계값은 소수 비율 (예: -0.0001 = -0.01%)
 */
export interface StrategyParams {
  // 전략 이름
  name: Strategy;
  // 기본 티어(1-6)별 사이클 자본 대비 투자 비율 (합 = 1)
  tierRatios: readonly [number, number, number, number, number, number];
  // 매수 임계값 (전일 종가 대비 하락률, 소수)
  buyThreshold: number;
  // 매도 임계값 (매수가 대비 상승률, 소수)
  sellThreshold: number;
  // 손절일 (실제 거래일 기준 보유일 수, 도달 시 MOC 매도)
  stopLossDays: number;
}

// ============================================================
// 사이클 상태
// ============================================================

/**
 * 티어 보유 상태
 */
export interface TierHolding {
  // 티어 번호 (1-7, 7은 예비 티어)
  tier: number;
  // 매수 체결가 (adjClose 기준)
  buyPrice: number;
  // 보유 수량
  shares: number;
  // 매수 체결일
  buyDate: string;
  // 매수 후 경과 거래일 수 (매수 당일 = 0, settle마다 1씩 증가)
  holdingDays: number;
}

/**
 * 사이클 상태
 * 예수금은 저장하지 않는다 - `사이클 자본 - Σ(활성 티어 투자원금)`으로 파생 (ADR-0001)
 */
export interface CycleState {
  // 전략 파라미터
  strategy: StrategyParams;
  // 사이클 자본: 티어 비율을 곱하는 기준 금액, 사이클 동안 고정
  cycleCapital: number;
  // 활성 티어 보유 목록
  holdings: TierHolding[];
  // 사이클 번호
  cycleNumber: number;
}

// ============================================================
// 주문과 체결
// ============================================================

/**
 * 주문 의도
 * planOrders가 전일 종가 기준으로 생성하는 주문표의 한 줄.
 * 모든 주문은 장 마감 전에 동시에 제출된다.
 *
 * 매수는 항상 LOC, 매도는 LOC(목표가) 또는 MOC(손절)이며,
 * MOC 주문에는 지정가가 없다(limitPrice: null).
 */
export type OrderIntent =
  | {
      type: "BUY";
      tier: number;
      orderMethod: "LOC";
      limitPrice: number;
      shares: number;
    }
  | {
      type: "SELL";
      tier: number;
      orderMethod: "LOC";
      limitPrice: number;
      shares: number;
    }
  | {
      type: "SELL";
      tier: number;
      orderMethod: "MOC";
      limitPrice: null;
      shares: number;
    };

/**
 * 하루 치 가격 데이터
 * close는 분할·배당 조정된 연속 시계열(adjClose)의 당일 종가여야 한다.
 */
export interface DayBar {
  // 거래일 (YYYY-MM-DD)
  date: string;
  // 당일 종가 (adjClose)
  close: number;
}

/**
 * 체결 결과
 */
export interface Execution {
  // 체결된 주문
  order: OrderIntent;
  // 체결가 (당일 종가)
  price: number;
  // 체결 금액 (체결가 × 수량, 소수점 2자리)
  amount: number;
  // 실현 손익 (매도 체결에만 존재)
  profit?: number;
}

/**
 * 사이클 이벤트
 * 보유 티어 전량 매도로 사이클이 완료되면 통지된다.
 */
export interface CycleEvent {
  type: "CYCLE_COMPLETED";
  // 완료된 사이클 번호
  cycleNumber: number;
}

/**
 * settle 결과
 */
export interface SettleResult {
  // 상태 전이 결과
  newState: CycleState;
  // 체결 목록 (미체결 주문은 포함하지 않는다)
  executions: Execution[];
  // 사이클 완료 이벤트
  events: CycleEvent[];
}
