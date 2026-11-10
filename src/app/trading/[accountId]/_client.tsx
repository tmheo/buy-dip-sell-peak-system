"use client";

/**
 * 트레이딩 계좌 상세 클라이언트 컴포넌트
 */

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AccountSettingsCard from "@/components/trading/AccountSettingsCard";
import type {
  AccountSettingsChanges,
  AccountSettingsSaveResult,
} from "@/components/trading/AccountSettingsCard";
import AssetSummary from "@/components/trading/AssetSummary";
import TierHoldingsTable from "@/components/trading/TierHoldingsTable";
import DailyOrdersTable from "@/components/trading/DailyOrdersTable";
import ProfitStatusTable from "@/components/trading/ProfitStatusTable";
import { calculateAssetValues } from "@/components/trading/asset-values";
import { pendingSeedOrdersNote } from "@/components/trading/account-settings";
import { formatSeedAmount } from "@/components/trading/format";
import type { LatestClose } from "@/database/trading";
import type {
  CashBreakdown,
  CycleEndingSeedChange,
  ReducedBuy,
  SeedCutLimits,
  UnaffordableBuy,
} from "@/strategy";
import type { SeedCutSettlement } from "@/trading";
import type { TradingAccountDetail, DailyOrder } from "@/types/trading";

interface TradingDetailClientProps {
  accountId: string;
}

/**
 * 계좌 상세 응답
 * 예수금·계좌 현금·티어 금액(cashBreakdown)은 매매 규칙이 계산한 값을 그대로 쓴다 (ADR-0003).
 * 앞 사이클이 시드 감액으로 끝났으면 그 시드 감액 정산(seedCutSettlement)이 함께 온다 (#118).
 * 사이클 중이면 감액 경계(seedCutLimits)가 함께 온다 - 시드 변경 화면이 감액을 분류하는 데 쓴다 (#119).
 */
interface AccountResponse {
  account: TradingAccountDetail;
  cashBreakdown: CashBreakdown;
  latestClose: LatestClose | null;
  seedCutLimits: SeedCutLimits | null;
  seedCutSettlement: SeedCutSettlement | null;
}

interface OrdersResponse {
  date: string;
  orders: DailyOrder[];
  unaffordableBuy: UnaffordableBuy | null;
  reducedBuy: ReducedBuy | null;
}

interface AccountDetail {
  account: TradingAccountDetail;
  cash: CashBreakdown;
  latestClose: LatestClose | null;
  seedCutLimits: SeedCutLimits | null;
  seedCutSettlement: SeedCutSettlement | null;
}

interface ErrorBody {
  error?: string;
  details?: { fieldErrors?: Record<string, string[]> };
}

/** JSON 본문으로 PUT을 보낸다 */
function putJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * 실패한 응답의 오류 문장 - 검증 오류는 칸별 문장(details.fieldErrors)이 더 구체적이다.
 * 본문을 읽지 못하면 null
 */
async function errorMessage(response: Response): Promise<string | null> {
  const result: ErrorBody = await response.json().catch(() => ({}));
  return Object.values(result.details?.fieldErrors ?? {})[0]?.[0] ?? result.error ?? null;
}

/** 시드 변경 API의 409 본문 - 사이클을 끝낼 수 있는 감액이라며 지금의 분류로 다시 묻는다 */
interface SeedChangeConflictBody {
  classification: CycleEndingSeedChange;
  seedCutLimits: SeedCutLimits;
  effectiveDate: string;
}

export default function TradingDetailClient({
  accountId,
}: TradingDetailClientProps): React.ReactElement {
  const router = useRouter();
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  // 주문표와 그 거래일은 주문 조회 응답에서만 온다 - 조회에 실패하면 둘 다 없다
  const [dailyOrders, setDailyOrders] = useState<OrdersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 저장 뒤 다시 읽을 때는 화면 전체를 로딩 표시로 바꾸지 않는다 - 보던 자리가 그대로 남는다
  const fetchAccount = useCallback(
    async (showLoading = true): Promise<void> => {
      if (showLoading) setIsLoading(true);
      setError(null);

      try {
        // 두 API는 서로 독립적이므로 병렬 호출 (마감 처리는 스케줄러가 담당)
        // 주문 조회는 비치명 경로이므로 allSettled로 부분 실패를 격리한다.
        const [ordersResult, accountResult] = await Promise.allSettled([
          fetch(`/api/trading/accounts/${accountId}/orders`),
          fetch(`/api/trading/accounts/${accountId}`),
        ]);

        setOrdersError(null);
        if (ordersResult.status === "fulfilled" && ordersResult.value.ok) {
          const ordersData: OrdersResponse = await ordersResult.value.json();
          setDailyOrders(ordersData);
        } else {
          setOrdersError("주문 정보를 불러오는데 실패했습니다.");
          setDailyOrders(null);
        }

        if (accountResult.status === "rejected") {
          throw new Error("계좌 정보를 불러오는데 실패했습니다.");
        }
        const accountRes = accountResult.value;
        if (!accountRes.ok) {
          if (accountRes.status === 404) {
            router.push("/trading");
            return;
          }
          throw new Error("계좌 정보를 불러오는데 실패했습니다.");
        }

        const accountData: AccountResponse = await accountRes.json();
        setDetail({
          account: accountData.account,
          cash: accountData.cashBreakdown,
          latestClose: accountData.latestClose,
          seedCutLimits: accountData.seedCutLimits,
          seedCutSettlement: accountData.seedCutSettlement,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [accountId, router]
  );

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  /**
   * 바꾼 것만 보낸다 - 시드는 적용일이 붙은 이력으로 따로 바꾼다 (ADR-0005).
   * 시드 변경이 확인을 요구하면(409) 알림창을 띄우지 않고 설정 카드가 다시 묻게 한다.
   */
  async function handleSave(changes: AccountSettingsChanges): Promise<AccountSettingsSaveResult> {
    setIsSaving(true);

    try {
      if (changes.settings) {
        const response = await putJson(`/api/trading/accounts/${accountId}`, changes.settings);
        if (!response.ok) {
          throw new Error((await errorMessage(response)) ?? "설정 저장에 실패했습니다.");
        }
      }
      if (changes.seed) {
        const response = await putJson(`/api/trading/accounts/${accountId}/seed`, changes.seed);
        // 화면을 연 뒤 감액 경계가 바뀌었다 - 알림창 대신 설정 카드가 응답으로 다시 묻는다
        if (response.status === 409) {
          const conflict: SeedChangeConflictBody = await response.json();
          return {
            status: "needsConfirmation",
            recheck: { seedCapital: changes.seed.seedCapital, ...conflict },
          };
        }
        if (!response.ok) {
          throw new Error((await errorMessage(response)) ?? "시드 저장에 실패했습니다.");
        }
      }
      return { status: "saved" };
    } catch (err) {
      alert(err instanceof Error ? err.message : "설정 저장에 실패했습니다.");
      return { status: "failed" };
    } finally {
      // 일부만 저장됐어도 화면이 저장된 값을 보이게 다시 읽는다
      await fetchAccount(false);
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="container py-4">
        <div className="card bg-dark border-secondary">
          <div className="card-body text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">로딩 중...</span>
            </div>
            <p className="text-secondary mt-3 mb-0">계좌 정보를 불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-4">
        <div className="card bg-dark border-danger">
          <div className="card-body text-center py-5">
            <p className="text-danger mb-3">{error}</p>
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => fetchAccount()}
            >
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="container py-4">
        <div className="card bg-dark border-secondary">
          <div className="card-body text-center py-5">
            <p className="text-secondary mb-3">계좌를 찾을 수 없습니다.</p>
            <Link href="/trading" className="btn btn-primary">
              목록으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { account, cash, latestClose, seedCutLimits, seedCutSettlement } = detail;
  const assetValues = calculateAssetValues(account.totalShares, cash, latestClose);
  const pendingSeedNote = pendingSeedOrdersNote(account.seed);

  return (
    <div className="container py-4">
      <div className="d-flex align-items-center mb-4">
        <Link href="/trading" className="btn btn-outline-secondary me-3">
          &larr; 목록
        </Link>
        <h2 className="text-light mb-0">계좌 상세</h2>
      </div>

      {/* Settings Section */}
      <AccountSettingsCard
        account={account}
        endsCycleBySeedCut={cash.endsCycleBySeedCut}
        seedCutSettlement={seedCutSettlement}
        seedCutLimits={seedCutLimits}
        onSave={handleSave}
        isSaving={isSaving}
      />

      {/* Asset Summary Section */}
      <AssetSummary
        ticker={account.ticker}
        totalShares={account.totalShares}
        values={assetValues}
        cash={cash}
        priceDate={latestClose?.date ?? null}
      />

      {/* Holdings Section */}
      <TierHoldingsTable holdings={account.holdings} strategy={account.strategy} cash={cash} />

      {/* Daily Orders Section */}
      {/* 시드 감액으로 사이클을 끝내는 날의 안내는 이 한 줄이 맡는다 (ADR-0006) - 여러 곳에 흩지 않는다 */}
      {cash.endsCycleBySeedCut && (
        <div className="alert alert-danger py-2 mb-2 small text-keep-all" role="status">
          오늘은 시드를 {formatSeedAmount(account.seed.current)}로 줄여 사이클을 끝내는 날입니다.
          보유 티어를 모두 MOC로 팔고, 매수 주문은 내지 않습니다.
        </div>
      )}
      {pendingSeedNote && (
        <div className="small text-secondary mb-2 text-keep-all">* {pendingSeedNote}</div>
      )}
      {ordersError && (
        <div className="alert alert-warning mb-4" role="alert">
          {ordersError}
        </div>
      )}
      {dailyOrders && (
        <DailyOrdersTable
          orders={dailyOrders.orders}
          ticker={account.ticker}
          date={dailyOrders.date}
          unaffordableBuy={dailyOrders.unaffordableBuy}
          reducedBuy={dailyOrders.reducedBuy}
        />
      )}

      {/* Profit Status Section (SPEC-TRADING-002) */}
      <ProfitStatusTable accountId={accountId} />
    </div>
  );
}
