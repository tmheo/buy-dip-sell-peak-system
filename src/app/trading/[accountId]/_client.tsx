"use client";

/**
 * 트레이딩 계좌 상세 클라이언트 컴포넌트
 */

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AccountSettingsCard from "@/components/trading/AccountSettingsCard";
import type { UpdateAccountData } from "@/components/trading/AccountSettingsCard";
import AssetSummary from "@/components/trading/AssetSummary";
import TierHoldingsTable from "@/components/trading/TierHoldingsTable";
import DailyOrdersTable from "@/components/trading/DailyOrdersTable";
import ProfitStatusTable from "@/components/trading/ProfitStatusTable";
import { calculateAssetValues } from "@/components/trading/asset-values";
import type { LatestClose } from "@/database/trading";
import type { CashBreakdown, UnaffordableBuy } from "@/strategy";
import type { TradingAccountWithHoldings, DailyOrder } from "@/types/trading";

interface TradingDetailClientProps {
  accountId: string;
}

/**
 * 계좌 상세 응답
 * 예수금·계좌 현금·티어 금액(cashBreakdown)은 매매 규칙이 계산한 값을 그대로 쓴다 (ADR-0003).
 */
interface AccountResponse {
  account: TradingAccountWithHoldings;
  cashBreakdown: CashBreakdown;
  latestClose: LatestClose | null;
}

interface OrdersResponse {
  date: string;
  orders: DailyOrder[];
  unaffordableBuy: UnaffordableBuy | null;
}

interface AccountDetail {
  account: TradingAccountWithHoldings;
  cash: CashBreakdown;
  latestClose: LatestClose | null;
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

  const fetchAccount = useCallback(async (): Promise<void> => {
    setIsLoading(true);
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [accountId, router]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  async function handleSave(data: UpdateAccountData): Promise<void> {
    setIsSaving(true);

    try {
      const response = await fetch(`/api/trading/accounts/${accountId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "설정 저장에 실패했습니다.");
      }

      await fetchAccount();
    } catch (err) {
      alert(err instanceof Error ? err.message : "설정 저장에 실패했습니다.");
    } finally {
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
            <button type="button" className="btn btn-outline-primary" onClick={fetchAccount}>
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

  const { account, cash, latestClose } = detail;
  const assetValues = calculateAssetValues(account.totalShares, cash, latestClose);

  return (
    <div className="container py-4">
      <div className="d-flex align-items-center mb-4">
        <Link href="/trading" className="btn btn-outline-secondary me-3">
          &larr; 목록
        </Link>
        <h2 className="text-light mb-0">계좌 상세</h2>
      </div>

      {/* Settings Section */}
      <AccountSettingsCard account={account} onSave={handleSave} isSaving={isSaving} />

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
        />
      )}

      {/* Profit Status Section (SPEC-TRADING-002) */}
      <ProfitStatusTable accountId={accountId} />
    </div>
  );
}
