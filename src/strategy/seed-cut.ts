/**
 * 시드 감액의 경계와 분류 (ADR-0004, ADR-0006, #117)
 *
 * 실계좌에서 오늘 바꾼 시드는 다음 거래일(적용일)부터 쓰인다. 적용일 주문표는 감액이 그 직전
 * 거래일까지 마감된 예수금보다 크면 보유 티어를 모두 판다(endsCycleBySeedCut). 바꾸는 순간에는
 * 오늘 주문표가 아직 체결되지 않았으므로, 사이클이 끝날지는 오늘 매수의 체결에 달려 있을 수 있다.
 * 이 모듈은 그 경계 두 값과, 경계로 본 시드 변경의 분류를 낸다. 계좌 상세 화면과 시드 변경 API가
 * 같은 함수를 써서 화면이 보인 분류와 서버가 확인하는 분류가 어긋나지 않게 한다.
 */
import Decimal from "decimal.js";

import { availableCash } from "./calculations";
import { planOrdersDetailed } from "./plan-orders";
import type { CycleState, SeedChangeKind, SeedCutLimits } from "./types";

/**
 * 오늘 시드를 줄일 때의 감액 경계
 *
 * - closedCash: 직전 거래일까지 마감된 예수금. 이보다 큰 감액은 사이클을 끝낸다.
 * - cashIfTodayBuyFills: 오늘 주문표의 매수가 지정가 × 수량으로 체결된다고 쳤을 때의 예수금(0 하한).
 *   이보다 큰 감액은 오늘 매수가 체결되면 사이클을 끝낸다. 당일 매도는 예수금을 줄이지 않으므로
 *   (매도 대금이 손실을 늘 넘는다) 매수만 뺀다. 오늘 체결될 매수가 없으면 closedCash와 같다.
 *
 * @param state - 오늘의 사이클 상태 (loadCycleState(account, 오늘))
 * @param prevClose - 오늘 주문표를 만드는 직전 거래일 종가 (adjClose). 오늘 체결될 매수가 없으면
 *   null이다 - 오늘이 거래일이 아니어서 오늘 주문표가 체결되지 않거나, 직전 종가가 없어 주문표를
 *   만들 수 없을 때다
 */
export function seedCutLimits(state: CycleState, prevClose: number | null): SeedCutLimits {
  const closedCash = availableCash(state);
  if (prevClose === null) {
    return { closedCash, cashIfTodayBuyFills: closedCash };
  }

  const buyCost = planOrdersDetailed(state, prevClose)
    .intents.filter((intent) => intent.type === "BUY")
    .reduce(
      (sum, intent) => sum.add(new Decimal(intent.limitPrice).mul(intent.shares)),
      new Decimal(0)
    );
  const cashIfTodayBuyFills = Decimal.max(0, new Decimal(closedCash).sub(buyCost)).toNumber();
  return { closedCash, cashIfTodayBuyFills };
}

/**
 * 시드 변경의 분류
 *
 * - increase: 늘린다
 * - ends: 감액이 직전 마감 예수금보다 커서 적용일에 보유 티어를 모두 팔고 사이클을 끝낸다
 * - depends: 오늘 매수가 체결돼야만 감액이 예수금을 넘는다 - 끝날지는 오늘 체결에 달렸다
 * - keep: 사이클이 이어진다 (바꾸지 않는 경우 포함)
 *
 * 감액이 경계와 같으면 예수금이 0으로 남고 사이클은 이어진다.
 *
 * @param oldSeed - 오늘의 시드 (적용일 직전 거래일의 시드)
 * @param newSeed - 새 시드
 * @param limits - seedCutLimits의 감액 경계
 */
export function classifySeedChange(
  oldSeed: number,
  newSeed: number,
  limits: SeedCutLimits
): SeedChangeKind {
  const cut = new Decimal(oldSeed).sub(newSeed);
  if (cut.lt(0)) return "increase";
  if (cut.gt(limits.closedCash)) return "ends";
  if (cut.gt(limits.cashIfTodayBuyFills)) return "depends";
  return "keep";
}

/** 사이클을 끝낼 수 있어 저장 전에 사용자의 확인을 받는 분류 (ends, depends) */
export type CycleEndingSeedChange = Extract<SeedChangeKind, "depends" | "ends">;

/**
 * 사이클을 끝낼 수 있는 시드 변경인지 - 그렇다면 사용자가 확인한 뒤에만 저장한다.
 *
 * @param kind - classifySeedChange의 분류
 */
export function mayEndCycle(kind: SeedChangeKind): kind is CycleEndingSeedChange {
  return kind === "depends" || kind === "ends";
}

/** 사이클을 끝낼 가능성의 순서 - 이어감 < 오늘 매수에 달림 < 사이클 끝 */
const CYCLE_END_RANK: Record<CycleEndingSeedChange, number> = { depends: 1, ends: 2 };

/**
 * 사용자가 확인한 분류로는 모자라 이 시드 변경을 저장하기 전에 다시 확인받아야 하는지.
 *
 * 화면이 분류를 보인 뒤 오늘 주문표가 체결돼 경계가 바뀌었을 수 있다. 지금의 분류가 사이클을
 * 끝낼 수 있고, 사용자가 확인한 것보다 더 끝날 수 있는 분류이면(오늘 매수에 달림을 확인했는데
 * 사이클 끝이 됐다) 다시 묻는다. 확인한 것보다 덜 끝나는 분류가 됐으면 그대로 저장한다.
 *
 * @param kind - 지금의 감액 경계로 본 분류 (classifySeedChange)
 * @param confirmed - 사용자가 확인한 분류. 확인하지 않았으면 null
 */
export function needsSeedChangeConfirmation(
  kind: SeedChangeKind,
  confirmed: CycleEndingSeedChange | null
): boolean {
  if (!mayEndCycle(kind)) return false;
  return confirmed === null || CYCLE_END_RANK[kind] > CYCLE_END_RANK[confirmed];
}
