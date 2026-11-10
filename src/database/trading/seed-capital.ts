/**
 * 시드 이력 (ADR-0005, #116)
 *
 * 시드 금액은 적용일이 붙은 이력으로 남는다. 바꾼 시드는 바꾼 날(서버의 UTC 날짜)의
 * 다음 거래일 주문표부터 쓰이고, 그 전까지의 주문표와 체결은 옛 시드로 한다.
 * 어느 날의 사이클 자본은 언제나 이 이력에서 그날의 시드를 읽는다 - 계좌에 "지금 시드"를
 * 두지 않아, 지난 날짜에 지금 시드를 쓰는 길이 구조로 막힌다.
 */

import Decimal from "decimal.js";
import { and, asc, eq, gt } from "drizzle-orm";

import { getNextWeekday } from "@/lib/date";
import type { SeedHistoryEntry, SeedStatus, TradingAccount } from "@/types/trading";

import { db, type DbExecutor } from "../db-drizzle";
import { seedCapitalHistory, tradingAccounts } from "../schema/index";

import { CycleInProgressError } from "./errors";
import { getPreviousTradingClose } from "./orders";
import { getTotalShares } from "./tier-holdings";

/**
 * 어느 날의 시드 - 적용일이 그날 이하인 가장 최근 줄, 없으면 첫 줄.
 * 첫 시드는 첫 변경 전의 모든 날짜에 쓰인다. 그래서 사이클 시작일이 계좌를 만든 날보다
 * 앞이든 뒤든 이력을 고칠 일이 없다.
 *
 * @param history - 계좌의 시드 이력 (순서는 상관없다)
 * @param date - 기준일 (YYYY-MM-DD)
 */
export function seedCapitalOn(history: readonly SeedHistoryEntry[], date: string): number {
  if (history.length === 0) {
    throw new Error("시드 이력이 없다 - 계좌를 만들 때 첫 줄을 쓴다");
  }

  const sorted = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const applied = sorted.filter((entry) => entry.effectiveDate <= date);
  // 적용된 줄이 없으면 첫 줄을 쓴다. 첫 줄의 적용일은 계좌를 만든 날이지만, 이 대체 덕분에
  // 사이클 시작일이 그보다 앞서도 첫 시드가 사이클 시작일부터 쓰인다(ADR-0005).
  return (applied.at(-1) ?? sorted[0]).seedCapital;
}

/**
 * 어느 거래일의 시드와, 그날 줄어든 사이클 자본 (ADR-0006)
 * capitalCut = 직전 거래일의 시드 - 그날 시드, 줄지 않았으면 0.
 * 직전 거래일은 가격 행 기준이다 - 적용일은 주말만 건너뛰어 정하므로 휴장일일 수 있고,
 * 그러면 적용일 뒤의 실제 첫 거래일이 시드가 처음 줄어든 날이 된다.
 *
 * @param history - 계좌의 시드 이력
 * @param date - 기준일 (주문표 날짜 또는 체결 처리일)
 * @param previousTradingDate - 기준일의 직전 거래일 (가격 행 기준). 모르면 null - 줄어든 것으로 보지 않는다
 */
export function seedCapitalAndCutOn(
  history: readonly SeedHistoryEntry[],
  date: string,
  previousTradingDate: string | null
): { seedCapital: number; capitalCut: number } {
  const seedCapital = seedCapitalOn(history, date);
  if (previousTradingDate === null) {
    return { seedCapital, capitalCut: 0 };
  }
  const cut = new Decimal(seedCapitalOn(history, previousTradingDate)).sub(seedCapital);
  return { seedCapital, capitalCut: Decimal.max(0, cut).toNumber() };
}

/**
 * 시드를 바꾼 뒤의 이력.
 * 적용일은 오늘의 다음 거래일이다. 앞으로의 휴장일은 알 수 없으므로 주말만 건너뛴다 -
 * 적용일이 휴장일이면 그다음 거래일이 실제 첫 적용일이 된다(seedStatus).
 * 적용 전 줄(적용일이 오늘 뒤)은 많아야 하나이고, 새 변경이 그 줄을 지우고 쓴다.
 * 새 시드가 오늘의 시드와 같으면 적용 전 줄만 지운다(되돌리기).
 * 오늘 이하의 줄은 이미 주문표에 쓰였을 수 있으므로 고치지 않는다.
 *
 * @param history - 지금의 시드 이력
 * @param seedCapital - 새 시드
 * @param today - 오늘 (서버의 UTC 날짜, YYYY-MM-DD)
 */
export function changeSeedHistory(
  history: readonly SeedHistoryEntry[],
  seedCapital: number,
  today: string
): SeedHistoryEntry[] {
  const kept = history.filter((entry) => entry.effectiveDate <= today);
  if (seedCapital === seedCapitalOn(history, today)) {
    return kept;
  }
  return [...kept, { effectiveDate: getNextWeekday(today), seedCapital }];
}

/**
 * 화면에 보일 시드 상태.
 * 오늘 새 시드가 처음 적용됐는지는 "직전 거래일의 시드 ≠ 오늘의 시드"로 판정한다 -
 * 적용일이 휴장일이면 그다음 거래일이 실제 첫 적용일이기 때문이다.
 *
 * @param history - 계좌의 시드 이력
 * @param today - 오늘 (서버의 UTC 날짜, YYYY-MM-DD)
 * @param previousTradingDate - 오늘의 직전 거래일 (가격 행 기준). 모르면 null
 */
export function seedStatus(
  history: readonly SeedHistoryEntry[],
  today: string,
  previousTradingDate: string | null
): SeedStatus {
  const current = seedCapitalOn(history, today);
  const pending = history.find((entry) => entry.effectiveDate > today) ?? null;
  const previous =
    previousTradingDate === null ? current : seedCapitalOn(history, previousTradingDate);

  return {
    current,
    pending: pending && { ...pending },
    appliedToday: previous === current ? null : { previous, current },
  };
}

/** 계좌의 시드 이력 (적용일 순) */
async function getSeedHistory(
  accountId: string,
  executor: DbExecutor
): Promise<SeedHistoryEntry[]> {
  return executor
    .select({
      effectiveDate: seedCapitalHistory.effectiveDate,
      seedCapital: seedCapitalHistory.seedCapital,
    })
    .from(seedCapitalHistory)
    .where(eq(seedCapitalHistory.accountId, accountId))
    .orderBy(asc(seedCapitalHistory.effectiveDate));
}

/** 이력과 가격 행 기준 직전 거래일로 화면용 시드 상태를 만든다 */
async function toSeedStatus(
  history: SeedHistoryEntry[],
  ticker: TradingAccount["ticker"],
  today: string,
  executor: DbExecutor
): Promise<SeedStatus> {
  const previousClose = await getPreviousTradingClose(ticker, today, executor);
  return seedStatus(history, today, previousClose?.date ?? null);
}

/**
 * 계좌를 만들 때 첫 시드를 쓴다 - 계좌 생성과 같은 트랜잭션에서 부른다.
 * 적용일은 만든 날이지만, 첫 시드는 첫 변경 전의 모든 날짜에 쓰인다(seedCapitalOn).
 *
 * @param today - 만든 날 (서버의 UTC 날짜, YYYY-MM-DD)
 */
export async function insertInitialSeed(
  accountId: string,
  seedCapital: number,
  today: string,
  executor: DbExecutor
): Promise<void> {
  await executor
    .insert(seedCapitalHistory)
    .values({ accountId, effectiveDate: today, seedCapital });
}

/**
 * 어느 날의 시드 - 그날 주문표·체결의 사이클 자본이다.
 *
 * @param date - 기준일 (주문표 날짜 또는 체결 처리일, YYYY-MM-DD)
 * @param executor - 같은 시점에서 함께 읽을 실행자 (runInReadSnapshot 등)
 */
export async function getSeedCapitalOn(
  accountId: string,
  date: string,
  executor: DbExecutor = db
): Promise<number> {
  return seedCapitalOn(await getSeedHistory(accountId, executor), date);
}

/**
 * 어느 날의 시드와 그날 줄어든 사이클 자본 (seedCapitalAndCutOn) - 그날 사이클 상태의 입력이다.
 * 이력과 직전 거래일을 같은 실행자로 읽는다.
 *
 * @param account - 계좌 (직전 거래일을 가격 행으로 찾으려고 종목을 쓴다)
 * @param date - 기준일 (주문표 날짜 또는 체결 처리일, YYYY-MM-DD)
 * @param executor - 같은 시점에서 함께 읽을 실행자 (runInReadSnapshot 등)
 */
export async function getSeedCapitalAndCutOn(
  account: Pick<TradingAccount, "id" | "ticker">,
  date: string,
  executor: DbExecutor = db
): Promise<{ seedCapital: number; capitalCut: number }> {
  const [history, previousClose] = await Promise.all([
    getSeedHistory(account.id, executor),
    getPreviousTradingClose(account.ticker, date, executor),
  ]);
  return seedCapitalAndCutOn(history, date, previousClose?.date ?? null);
}

/**
 * 화면에 보일 시드 상태 (오늘의 시드, 적용 전 변경, 오늘 처음 적용된 시드)
 *
 * @param account - 계좌 (직전 거래일을 가격 행으로 찾으려고 종목을 쓴다)
 * @param today - 오늘 (서버의 UTC 날짜, YYYY-MM-DD)
 */
export async function getSeedStatus(
  account: Pick<TradingAccount, "id" | "ticker">,
  today: string,
  executor: DbExecutor = db
): Promise<SeedStatus> {
  const history = await getSeedHistory(account.id, executor);
  return toSeedStatus(history, account.ticker, today, executor);
}

/**
 * 시드를 바꾼다 (한 트랜잭션). 새 시드는 오늘의 다음 거래일부터 쓰인다(changeSeedHistory).
 *
 * 쓰는 줄은 언제나 적용일이 오늘 뒤인 줄뿐이다. 일일 마감은 어제까지, 화면 진입은 오늘까지
 * 읽으므로 이미 쓰였을 수 있는 줄은 건드리지 않는다.
 * 같은 계좌의 동시 변경은 계좌 행 잠금으로 차례를 세운다 - 나중 변경은 먼저 커밋된 변경을
 * 보고 그 위에 덮어쓴다. (계좌, 적용일) 유일 제약은 이 잠금을 거치지 않는 쓰기까지 막는다.
 *
 * 사이클 중 변경(ADR-0004)은 #117에서 연다. 그때까지는 보유 티어가 있으면
 * CycleInProgressError를 던진다.
 *
 * @param seedCapital - 새 시드 (검증은 호출 경로가 마쳤다)
 * @param today - 바꾼 날 (서버의 UTC 날짜, YYYY-MM-DD)
 * @param executor - 트랜잭션을 열 실행자. 트랜잭션이면 그 안의 저장점으로 묶인다.
 * @returns 바꾼 뒤의 시드 상태. 계좌가 없거나 다른 사용자의 것이면 null
 */
export async function changeSeedCapital(
  accountId: string,
  userId: string,
  seedCapital: number,
  today: string,
  executor: DbExecutor = db
): Promise<SeedStatus | null> {
  return executor.transaction(async (tx) => {
    const [account] = await tx
      .select({ ticker: tradingAccounts.ticker })
      .from(tradingAccounts)
      .where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.userId, userId)))
      .for("update");
    if (!account) {
      return null;
    }

    if ((await getTotalShares(accountId, tx)) > 0) {
      throw new CycleInProgressError();
    }

    const history = changeSeedHistory(await getSeedHistory(accountId, tx), seedCapital, today);
    const pending = history.filter((entry) => entry.effectiveDate > today);

    await tx
      .delete(seedCapitalHistory)
      .where(
        and(
          eq(seedCapitalHistory.accountId, accountId),
          gt(seedCapitalHistory.effectiveDate, today)
        )
      );
    if (pending.length > 0) {
      await tx.insert(seedCapitalHistory).values(pending.map((entry) => ({ accountId, ...entry })));
    }

    return toSeedStatus(history, account.ticker, today, tx);
  });
}
