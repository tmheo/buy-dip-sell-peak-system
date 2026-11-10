/**
 * 수익 기록 테스트용 매도 체결
 * 보유 티어 하나를 settle로 실제로 팔아, 수익 기록이 받는 금액이 settle의 결과임을 보장한다.
 */
import { getStrategyParams, settle } from "@/strategy";
import type { Execution, TierHolding } from "@/strategy";
import type { Strategy } from "@/types/trading";

export interface SettledSaleInput {
  tier: number;
  buyDate: string;
  buyPrice: number;
  shares: number;
  sellDate: string;
  sellPrice: number;
  strategy?: Strategy;
}

/**
 * 보유 티어를 sellPrice에 MOC로 판 settle의 매도 체결을 돌려준다.
 */
export function settledSale(input: SettledSaleInput): {
  holding: TierHolding;
  execution: Execution;
} {
  const holding: TierHolding = {
    tier: input.tier,
    buyPrice: input.buyPrice,
    shares: input.shares,
    buyDate: input.buyDate,
    holdingDays: 1,
  };
  const { executions } = settle(
    {
      strategy: getStrategyParams(input.strategy ?? "Pro2"),
      cycleCapital: input.buyPrice * input.shares,
      capitalCut: 0,
      holdings: [holding],
      cycleNumber: 1,
      realizedPnl: 0,
    },
    [
      {
        type: "SELL",
        tier: input.tier,
        orderMethod: "MOC",
        limitPrice: null,
        shares: input.shares,
      },
    ],
    { date: input.sellDate, close: input.sellPrice }
  );
  return { holding, execution: executions[0] };
}
