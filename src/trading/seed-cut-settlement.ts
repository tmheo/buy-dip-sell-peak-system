/**
 * 시드 감액 정산 (GLOSSARY.md, ADR-0006, #118)
 *
 * 직전 마감 예수금보다 큰 시드 감액은 적용일 주문표가 보유 티어를 모두 팔아 사이클을 끝낸다
 * (시드 감액으로 사이클을 끝내는 날). 그날 사이클 자본은 이미 새 시드지만 감액분은 팔기 전이라
 * 아직 증권사에 있다. 매도가 체결된 뒤 사용자는 `옛 시드 + 끝난 사이클 실현손익 - 새 시드`만큼
 * 출금한다(음수이면 그만큼 입금한다).
 *
 * 사이클이 시드 감액으로 끝났다는 표시는 저장하지 않는다(ADR-0006). 끝난 사이클의 마지막 매도일
 * 아침 상태를 수익 기록과 시드 이력으로 다시 조립해, 그날 주문표가 쓴 판정 함수
 * (src/strategy의 endsCycleBySeedCut)로 다시 확인한다. "그날 주문표가 매수 없는 MOC 전량이었나"로
 * 보면, 보유 티어 전부가 같은 날 손절일에 걸린 날과 예수금 이내 감액이 겹칠 때 틀린다.
 */

import Decimal from "decimal.js";

import {
  getCycleProfitRecords,
  getSeedCapitalAndCutOn,
  runInReadSnapshot,
  type DbExecutor,
} from "@/database/trading";
import type { CycleState } from "@/strategy";
import { endsCycleBySeedCut, getStrategyParams } from "@/strategy";
import type { ProfitRecord, TradingAccount } from "@/types/trading";

import { toStrategyHoldings } from "./orders";

/**
 * 시드 감액 정산 - 시드 감액으로 사이클이 끝난 뒤 증권사 잔고를 새 시드에 맞추는 계산
 *
 * 계산 과정의 중간값(cashAtCycleEnd)까지 여기서 낸다 - 화면은 파생값을 다시 계산하지 않고
 * 그대로 보인다(ADR-0003).
 */
export interface SeedCutSettlement {
  // 시드 감액으로 끝난 사이클의 번호
  endedCycleNumber: number;
  // 옛 시드: 마지막 매도일 직전 거래일(가격 행 기준)의 시드
  previousSeed: number;
  // 끝난 사이클 실현손익: 그 사이클 수익 기록의 손익 합
  realizedPnl: number;
  // 사이클이 끝났을 때 증권사에 있어야 할 현금 = 옛 시드 + 끝난 사이클 실현손익
  cashAtCycleEnd: number;
  // 새 시드: 마지막 매도일의 시드
  newSeed: number;
  // 출금할 금액 = 사이클이 끝났을 때 증권사에 있어야 할 현금 - 새 시드 (음수이면 입금할 금액)
  withdrawal: number;
}

function sumProfit(records: ProfitRecord[]): number {
  return records.reduce((sum, record) => sum.add(record.profit), new Decimal(0)).toNumber();
}

/**
 * 지금 사이클 바로 앞의 사이클이 시드 감액으로 끝났으면 그 시드 감액 정산을 낸다.
 *
 * 지금 사이클이 시드 감액으로 끝난 사이클 바로 다음 사이클인 동안(다음 사이클의 첫 매수 전 포함)
 * 내보낸다. 하루만 보이면 그날 화면을 열지 않은 사용자가 출금액을 영영 모르게 된다.
 * 오늘이 지금 사이클을 시드 감액으로 끝내는 날이어도 앞 사이클의 정산을 낸다 - 지금 사이클의
 * 정산은 그 매도가 체결되어 사이클이 넘어간 뒤에 나온다.
 *
 * 마지막 매도일 X 아침의 사이클 상태:
 * - 보유 티어: X에 팔린 기록 전부 (그날 사이클이 끝났으므로 그날 아침 보유는 모두 팔렸다)
 * - 실현손익: 그 사이클에서 X 전에 팔린 기록의 손익 합
 * - 사이클 자본: X의 시드, 줄어든 사이클 자본: X 직전 거래일의 시드 - X의 시드
 *
 * @param account - 계좌 (지금 사이클 번호와 종목)
 * @param executor - 같은 시점에서 함께 읽을 실행자 (runInReadSnapshot 등). 없으면 이 함수의
 *   읽기만 묶는 읽기 시점을 새로 연다.
 * @returns 시드 감액 정산. 앞 사이클이 없거나 시드 감액으로 끝나지 않았으면 null
 */
export async function loadSeedCutSettlement(
  account: TradingAccount,
  executor?: DbExecutor
): Promise<SeedCutSettlement | null> {
  if (!executor) {
    return runInReadSnapshot((snapshot) => loadSeedCutSettlement(account, snapshot));
  }

  const endedCycleNumber = account.cycleNumber - 1;
  if (endedCycleNumber < 1) {
    return null;
  }
  const records = await getCycleProfitRecords(account.id, endedCycleNumber, executor);
  const lastSale = records.at(-1);
  if (!lastSale) {
    return null;
  }

  const sellDay = lastSale.sellDate;
  const soldOnSellDay = records.filter((record) => record.sellDate === sellDay);
  const soldBefore = records.filter((record) => record.sellDate < sellDay);
  const [{ seedCapital, capitalCut }, holdings] = await Promise.all([
    getSeedCapitalAndCutOn(account, sellDay, executor),
    toStrategyHoldings(
      account.ticker,
      soldOnSellDay.map((record) => ({
        tier: record.tier,
        shares: record.buyQuantity,
        buyPrice: record.buyPrice,
        buyDate: record.buyDate,
      })),
      sellDay,
      executor
    ),
  ]);
  const morningOfSellDay: CycleState = {
    // 전략은 사이클 경계에서만 바뀌므로, 끝난 사이클의 전략은 그 사이클 기록에 남은 전략이다
    strategy: getStrategyParams(lastSale.strategy),
    cycleCapital: seedCapital,
    capitalCut,
    holdings,
    cycleNumber: endedCycleNumber,
    realizedPnl: sumProfit(soldBefore),
  };
  if (!endsCycleBySeedCut(morningOfSellDay)) {
    return null;
  }

  // 시드 감액으로 끝난 날은 capitalCut > 0이므로 옛 시드 = 새 시드 + 줄어든 사이클 자본이다
  const previousSeed = new Decimal(seedCapital).add(capitalCut);
  const realizedPnl = sumProfit(records);
  const cashAtCycleEnd = previousSeed.add(realizedPnl);
  return {
    endedCycleNumber,
    previousSeed: previousSeed.toNumber(),
    realizedPnl,
    cashAtCycleEnd: cashAtCycleEnd.toNumber(),
    newSeed: seedCapital,
    withdrawal: cashAtCycleEnd.sub(seedCapital).toNumber(),
  };
}
