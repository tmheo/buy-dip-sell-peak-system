/**
 * 실계좌 일일 마감 스케줄러 정책 (#80)
 *
 * 어느 계좌를 처리할지(활성 판정), 얼마나 오래 처리할지(시간 예산),
 * 실패와 시간 초과를 어떻게 다룰지(계좌별 격리, 다음 실행 이월)를 이 모듈이 소유한다.
 * 거래일 단위 마감 처리 자체는 processHistoricalOrders가 소유한다.
 */

import {
  getActiveTradingAccounts,
  getTradingAccountByIdWithoutOwnerCheck,
} from "@/database/trading";

import { processHistoricalOrders } from "./execution";

/**
 * 처리 시간 예산 (ms). Vercel 함수 제한(maxDuration 60초)보다 짧게 잡아
 * FUNCTION_INVOCATION_TIMEOUT(504) 대신 정상 응답으로 종료하고,
 * 남은 작업은 다음 실행이 이어받도록 한다.
 */
const TIME_BUDGET_MS = 50_000;

/**
 * 활성 계좌 판정 기간 (일). 이 기간 내에 계좌 상세 화면이 조회된 계좌만
 * 스케줄러가 처리한다.
 */
const ACTIVE_WINDOW_DAYS = 14;

/** 계좌 하나의 마감 처리 결과. error가 있으면 그 계좌만 실패한 것이다. */
export interface AccountCloseResult {
  accountId: string;
  executed: number;
  error?: string;
}

/**
 * 마감 처리 한 회차의 결과.
 * accountId를 지정했는데 그런 계좌가 없으면 아무것도 처리하지 않고 알린다.
 */
export type DailyCloseOutcome =
  | {
      status: "completed";
      accountCount: number;
      processedCount: number;
      skippedCount: number;
      failedCount: number;
      results: AccountCloseResult[];
    }
  | { status: "account-not-found"; accountId: string };

/**
 * 활성 계좌의 미처리 거래일을 마감 처리한다.
 *
 * 처리 대상은 최근 ACTIVE_WINDOW_DAYS일 안에 조회된 계좌다 - 아무도 보지 않는 계좌를
 * 처리하지 않아 불필요한 계산을 건너뛴다. accountId를 지정하면 활동 여부와 무관하게
 * 그 계좌만 처리한다. 밀린 거래일을 한 계좌에 몰아서 따라잡을 때처럼,
 * 사람이 직접 대상을 지정하는 경우를 위한 것이다.
 *
 * 시간 예산을 넘기면 남은 계좌는 처리하지 않고 반환한다. processHistoricalOrders가
 * 거래일 단위로 진행 상태를 영속화하므로, 다음 실행이 lastProcessedDate로 이어받는다.
 *
 * @param options.accountId - 지정 시 해당 계좌만 처리
 */
export async function processDailyClose(
  options: { accountId?: string | null } = {}
): Promise<DailyCloseOutcome> {
  const { accountId } = options;

  console.log(
    accountId
      ? `=== 일일 마감 처리 시작 (계좌 ${accountId} 한정) ===`
      : "=== 일일 마감 처리 시작 ==="
  );
  const startTime = Date.now();
  const deadline = startTime + TIME_BUDGET_MS;
  const today = new Date().toISOString().split("T")[0];

  let accounts;
  if (accountId) {
    // 소유자 확인은 크론 인증이 대신한다 - 스케줄러는 사용자 세션 없이 돈다.
    const account = await getTradingAccountByIdWithoutOwnerCheck(accountId);
    if (!account) {
      return { status: "account-not-found", accountId };
    }
    accounts = [account];
  } else {
    const activeSince = new Date(startTime - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    accounts = await getActiveTradingAccounts(activeSince);
  }

  const results: AccountCloseResult[] = [];
  let skippedCount = 0;

  for (const account of accounts) {
    // 시간 예산 초과 시 남은 계좌는 다음 실행으로 미룬다 (lastProcessedDate로 자가 복구)
    if (Date.now() >= deadline) {
      skippedCount = accounts.length - results.length;
      break;
    }

    // 한 계좌의 실패가 다른 계좌 처리를 막지 않도록 개별 try/catch
    try {
      const executed = await processHistoricalOrders(
        account.id,
        account.cycleStartDate,
        account.lastProcessedDate,
        today,
        account.ticker,
        account.strategy,
        account.seedCapital,
        deadline
      );
      results.push({ accountId: account.id, executed: executed.length });
    } catch (error) {
      console.error(`[${account.id}] 마감 처리 실패:`, error);
      results.push({
        accountId: account.id,
        executed: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const elapsed = Date.now() - startTime;
  const failedCount = results.filter((result) => result.error).length;
  console.log(
    `=== 일일 마감 처리 완료 (${elapsed}ms, 계좌 ${accounts.length}개, ` +
      `처리 ${results.length}개, 미처리 ${skippedCount}개, 실패 ${failedCount}개) ===`
  );

  return {
    status: "completed",
    accountCount: accounts.length,
    processedCount: results.length,
    skippedCount,
    failedCount,
    results,
  };
}
