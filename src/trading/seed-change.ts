/**
 * 실계좌 시드 변경 조율 (ADR-0004, ADR-0005, ADR-0006, #117)
 *
 * 시드는 사이클 중에도 바꿀 수 있다. 직전 마감 예수금보다 많이 줄이면 적용일 주문표가 보유 티어를
 * 모두 팔아 사이클을 끝내고(src/strategy의 endsCycleBySeedCut), 오늘 매수가 체결돼야만 넘는 감액은
 * 그 체결에 달려 있다. 이 모듈은 오늘의 사이클 상태로 감액 경계를 새로 계산해 그런 감액인지 가리고,
 * 사용자가 확인한 뒤에만 시드 이력에 쓴다. 경계와 분류의 규칙은 src/strategy가 소유한다.
 */

import {
  changeSeedCapital,
  getPreviousTradingClose,
  getTradingAccountById,
  runInReadSnapshot,
  type DbExecutor,
} from "@/database/trading";
import type { CycleState, SeedCutLimits } from "@/strategy";
import { classifySeedChange, seedCutLimits } from "@/strategy";
import type { SeedStatus, TradingAccount } from "@/types/trading";

import { loadCycleState } from "./orders";

/**
 * 사이클 중 오늘 시드를 줄일 때의 감액 경계. 보유 티어가 없으면(사이클 사이) null이다.
 * 오늘 매수는 오늘 주문표를 만드는 직전 거래일 종가로 계산한다 - 주문표와 같은 입력이다.
 *
 * @param account - 계좌 (종목)
 * @param today - 오늘 (서버의 UTC 날짜, YYYY-MM-DD)
 * @param state - loadCycleState(account, today)로 조립한 오늘의 사이클 상태
 * @param executor - 사이클 상태와 같은 시점에서 읽을 실행자
 */
export async function loadSeedCutLimits(
  account: Pick<TradingAccount, "ticker">,
  today: string,
  state: CycleState,
  executor: DbExecutor
): Promise<SeedCutLimits | null> {
  if (state.holdings.length === 0) {
    return null;
  }
  const prevClose = await getPreviousTradingClose(account.ticker, today, executor);
  return seedCutLimits(state, prevClose?.adjClose ?? null);
}

/**
 * 시드 변경 결과.
 * needsConfirmation은 사이클을 끝낼 수 있는 감액인데 확인이 없어 쓰지 않았다는 뜻이고,
 * 서버가 새로 계산한 분류와 감액 경계를 함께 담는다.
 */
export type SeedChangeOutcome =
  | { status: "changed"; seed: SeedStatus }
  | {
      status: "needsConfirmation";
      classification: "depends" | "ends";
      seedCutLimits: SeedCutLimits;
    };

/**
 * 시드를 바꾼다. 새 시드는 오늘의 다음 거래일부터 쓰인다 (ADR-0005).
 *
 * 사이클 중 감액은 오늘의 사이클 상태로 감액 경계를 새로 계산해 분류한다. 사이클을 끝내거나
 * (ends) 오늘 체결에 따라 끝낼 수 있는(depends) 감액이면 confirmCycleEnd가 true일 때만 쓴다 -
 * 화면이 경계를 보인 뒤 주문표가 체결됐을 수 있어, 서버가 지금의 상태로 다시 묻게 한다.
 * 사이클 사이에는 묻지 않는다.
 *
 * 분류와 쓰기는 한 트랜잭션이 아니다. 그 사이에 일일 마감이 끝나 보유가 바뀌어도 판정은
 * 적용일 주문표가 그날의 상태로 다시 하므로 규칙이 어긋나지 않는다 - 이 분류는 사용자에게
 * 묻기 위한 것이다.
 *
 * @param seedCapital - 새 시드 (검증은 호출 경로가 마쳤다)
 * @param today - 바꾼 날 (서버의 UTC 날짜, YYYY-MM-DD)
 * @param confirmCycleEnd - 사이클이 끝날 수 있음을 사용자가 확인했는지
 * @returns 결과. 계좌가 없거나 다른 사용자의 것이면 null
 */
export async function changeSeed(
  accountId: string,
  userId: string,
  seedCapital: number,
  today: string,
  confirmCycleEnd: boolean
): Promise<SeedChangeOutcome | null> {
  const judged = await runInReadSnapshot(async (snapshot) => {
    const account = await getTradingAccountById(accountId, userId, snapshot);
    if (!account) return null;
    const state = await loadCycleState(account, today, snapshot);
    const limits = await loadSeedCutLimits(account, today, state, snapshot);
    return {
      limits,
      classification: limits && classifySeedChange(state.cycleCapital, seedCapital, limits),
    };
  });
  if (!judged) {
    return null;
  }

  const { limits, classification } = judged;
  if (limits && (classification === "depends" || classification === "ends") && !confirmCycleEnd) {
    return { status: "needsConfirmation", classification, seedCutLimits: limits };
  }

  const seed = await changeSeedCapital(accountId, userId, seedCapital, today);
  return seed && { status: "changed", seed };
}
