/**
 * 사이클 상태 관리
 * SPEC-BACKTEST-001 REQ-006, REQ-007, REQ-008
 */
import Decimal from "decimal.js";
import type { StrategyConfig, TierState } from "./types";
import { BASE_TIER_COUNT, RESERVE_TIER_NUMBER, MIN_TIER_NUMBER } from "./types";
import { calculateSellLimitPrice } from "@/utils/trading-core";

/**
 * 사이클 관리 클래스
 * 티어 매수/매도, 예수금 관리, 사이클 종료/시작을 담당
 * 모든 금융 계산은 decimal.js를 사용하여 부동소수점 오차 제거
 */
export class CycleManager {
  private cycleNumber: number = 1;
  private startDate: string;
  private initialCapital: Decimal;
  private cash: Decimal;
  private dayCount: number = 0;
  private tiers: Map<number, TierState> = new Map();
  private strategy: StrategyConfig;
  private hasTraded: boolean = false;
  private cycleInitialCapital: Decimal;

  /**
   * 사이클 관리자 생성
   *
   * @param initialCapital - 초기 투자금
   * @param strategy - 전략 설정
   * @param startDate - 사이클 시작일
   */
  constructor(initialCapital: number, strategy: StrategyConfig, startDate: string) {
    this.initialCapital = new Decimal(initialCapital);
    this.cycleInitialCapital = new Decimal(initialCapital);
    this.cash = new Decimal(initialCapital);
    this.strategy = strategy;
    this.startDate = startDate;
  }

  /**
   * 현재 예수금 반환
   */
  getCash(): number {
    return this.cash.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * 현재 사이클 번호 반환
   */
  getCycleNumber(): number {
    return this.cycleNumber;
  }

  /**
   * 현재 경과 일수 반환
   */
  getDayCount(): number {
    return this.dayCount;
  }

  /**
   * 다음 매수할 티어 번호 반환 (티어 고정 방식)
   * 티어 1-6 중 가장 낮은 빈 티어를 반환합니다.
   * 예: T2, T3 보유 중 → T1 반환 (가장 낮은 빈 티어)
   * 티어 1-6이 모두 활성화되고 예수금이 있으면 티어 7(예비) 반환
   *
   * @returns 다음 티어 번호 또는 null (매수 불가)
   */
  getNextBuyTier(): number | null {
    // 티어 고정 방식: 티어 1-6 중 가장 낮은 빈 티어 찾기
    for (let i = MIN_TIER_NUMBER; i <= BASE_TIER_COUNT; i++) {
      if (!this.tiers.has(i)) {
        return i;
      }
    }

    // REQ-008: 티어 1-6 모두 활성화 + 예수금 존재 시 예비 티어
    if (this.cash.gt(0) && !this.tiers.has(RESERVE_TIER_NUMBER)) {
      return RESERVE_TIER_NUMBER;
    }

    return null;
  }

  /**
   * 특정 티어의 투자 금액 반환
   * 티어 7은 잔여 예수금 전액
   *
   * @param tier - 티어 번호 (1-7)
   * @returns 투자 금액
   */
  getTierAmount(tier: number): number {
    if (tier === RESERVE_TIER_NUMBER) {
      // REQ-008: 예비 티어는 잔여 예수금 전액
      return this.cash.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
    }

    if (tier < MIN_TIER_NUMBER || tier > BASE_TIER_COUNT) {
      throw new Error(`Invalid tier number: ${tier}`);
    }

    const ratio = new Decimal(this.strategy.tierRatios[tier - 1]);
    return this.cycleInitialCapital.mul(ratio).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
  }

  /**
   * 티어 활성화 (매수 체결)
   *
   * @param tier - 티어 번호
   * @param buyPrice - 매수 체결가
   * @param shares - 매수 수량
   * @param date - 매수 체결일
   * @param dayIndex - 매수 시점의 거래일 인덱스
   */
  activateTier(
    tier: number,
    buyPrice: number,
    shares: number,
    date: string,
    dayIndex: number
  ): void {
    if (tier < MIN_TIER_NUMBER || tier > RESERVE_TIER_NUMBER) {
      throw new Error(`Invalid tier number: ${tier}`);
    }
    if (this.tiers.has(tier)) {
      throw new Error(`Tier ${tier} is already active`);
    }
    if (buyPrice <= 0 || shares <= 0) {
      throw new Error("buyPrice and shares must be positive");
    }
    const cost = new Decimal(buyPrice).mul(shares);
    if (cost.gt(this.cash)) {
      throw new Error("Insufficient cash for tier activation");
    }
    this.cash = this.cash.sub(cost);
    this.hasTraded = true;

    const sellLimitPrice = calculateSellLimitPrice(buyPrice, this.strategy.sellThreshold);

    this.tiers.set(tier, {
      tier,
      isActive: true,
      buyPrice,
      shares,
      buyDate: date,
      buyDayIndex: dayIndex,
      sellLimitPrice,
    });
  }

  /**
   * 티어 비활성화 (매도 체결)
   * 티어 고정 방식: 매도 후 티어 번호는 그대로 유지되며 빈 슬롯이 됩니다.
   * 다음 매수 시 getNextBuyTier()가 가장 낮은 빈 티어를 반환합니다.
   *
   * @param tier - 티어 번호
   * @param sellPrice - 매도 체결가
   * @returns 수익 (양수) 또는 손실 (음수)
   */
  deactivateTier(tier: number, sellPrice: number): number {
    const tierState = this.tiers.get(tier);
    if (!tierState) {
      throw new Error(`Tier ${tier} is not active`);
    }

    const proceeds = new Decimal(sellPrice).mul(tierState.shares);
    const cost = new Decimal(tierState.buyPrice).mul(tierState.shares);
    const profit = proceeds.sub(cost);

    this.cash = this.cash.add(proceeds);
    this.tiers.delete(tier);

    // 티어 고정 방식: 다른 티어 번호를 변경하지 않음
    // 빈 티어 슬롯은 다음 매수 시 getNextBuyTier()가 처리

    return profit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * 경과 일수 증가
   */
  incrementDay(): void {
    this.dayCount++;
  }

  /**
   * REQ-006: 현재 거래일 기준으로 손절일에 도달한 티어 목록 반환
   * 각 티어의 매수 거래일로부터 손절일이 경과한 티어만 반환 (거래일 기준)
   *
   * @param currentDayIndex - 현재 거래일 인덱스
   * @returns 손절일에 도달한 티어 목록
   */
  getTiersAtStopLossDay(currentDayIndex: number): TierState[] {
    const result: TierState[] = [];

    for (const tier of this.tiers.values()) {
      // 보유일 계산: 매수 다음날부터 카운트 (매수 당일 = 0일)
      // 예: 01.23 매수(index=13), 02.06(index=23) → 23-13=10일 보유
      // 10일 손절 설정: 10일째(보유일 >= 10)에 손절
      const holdingDays = currentDayIndex - tier.buyDayIndex;

      // 손절일 도달: 보유일 >= 손절일 (예: 10일 손절 = 10일째에 손절)
      if (holdingDays >= this.strategy.stopLossDay) {
        result.push(tier);
      }
    }

    return result;
  }

  /**
   * 활성화된 티어 목록 반환
   */
  getActiveTiers(): TierState[] {
    return Array.from(this.tiers.values());
  }

  /**
   * 현재가 기준 총 자산 계산
   *
   * @param currentPrice - 현재 주가
   * @returns 총 자산 (예수금 + 보유 주식 가치)
   */
  getTotalAsset(currentPrice: number): number {
    let holdingsValue = new Decimal(0);
    const price = new Decimal(currentPrice);
    for (const tier of this.tiers.values()) {
      holdingsValue = holdingsValue.add(price.mul(tier.shares));
    }
    return this.cash.add(holdingsValue).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * REQ-007: 사이클 완료 여부 확인
   * 한 번이라도 거래했고 현재 활성 티어가 없으면 사이클 완료
   */
  isCycleComplete(): boolean {
    return this.hasTraded && this.tiers.size === 0;
  }

  /**
   * 이번 사이클에 거래가 있었는지 확인
   */
  hasTradedThisCycle(): boolean {
    return this.hasTraded;
  }

  /**
   * REQ-007: 사이클 종료
   * 사이클 종료 시점의 총 자산(현재 예수금)을 다음 사이클의 초기자본으로 준비
   * 주의: 모든 티어가 매도 완료된 상태에서만 호출해야 함
   */
  endCycle(): void {
    // 사이클 종료 검증: 모든 티어가 매도 완료되어야 함
    if (this.tiers.size > 0) {
      throw new Error(`Cannot end cycle: ${this.tiers.size} active tier(s) remaining`);
    }

    // 사이클 종료 시점의 총 자산 = 현재 예수금 (모든 티어 매도 완료 상태)
    // cycleInitialCapital은 다음 사이클 시작 시 startNewCycle()에서 설정됨
    // 여기서는 상태 검증만 수행
  }

  /**
   * REQ-007: 새 사이클 시작 (풀복리)
   * 이전 사이클 종료 시 총 자산을 새 사이클의 초기자본으로 사용
   *
   * @param startDate - 새 사이클 시작일
   */
  startNewCycle(startDate: string): void {
    this.cycleNumber++;
    this.cycleInitialCapital = new Decimal(this.cash); // 풀복리: 현재 예수금이 새 초기자본
    this.dayCount = 0;
    this.startDate = startDate;
    this.hasTraded = false;
    this.tiers.clear();
  }

  /**
   * 현재 사이클 시작일 반환
   */
  getStartDate(): string {
    return this.startDate;
  }

  /**
   * 현재 사이클 초기자본 반환
   */
  getCycleInitialCapital(): number {
    return this.cycleInitialCapital.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * 전략 설정 변경
   * 추천 전략 백테스트에서 사이클 경계에서 전략을 동적으로 변경할 때 사용
   *
   * @param strategy - 새로운 전략 설정
   */
  setStrategy(strategy: StrategyConfig): void {
    this.strategy = strategy;
  }

  /**
   * 현재 전략 설정 반환
   */
  getStrategy(): StrategyConfig {
    return this.strategy;
  }
}
