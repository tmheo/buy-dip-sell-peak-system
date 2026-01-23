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
import type { TradingAccountWithHoldings, DailyOrder } from "@/types/trading";

interface TradingDetailClientProps {
  accountId: string;
}

interface AccountResponse {
  account: TradingAccountWithHoldings;
}

interface OrdersResponse {
  date: string;
  orders: DailyOrder[];
}

function getTodayLocal(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TradingDetailClient({
  accountId,
}: TradingDetailClientProps): React.ReactElement {
  const router = useRouter();
  const [account, setAccount] = useState<TradingAccountWithHoldings | null>(null);
  const [orders, setOrders] = useState<DailyOrder[]>([]);
  const [orderDate, setOrderDate] = useState<string>(getTodayLocal());
  const [isLoading, setIsLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchAccount = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [accountRes, ordersRes] = await Promise.all([
        fetch(`/api/trading/accounts/${accountId}`),
        fetch(`/api/trading/accounts/${accountId}/orders`),
      ]);

      if (!accountRes.ok) {
        if (accountRes.status === 404) {
          router.push("/trading");
          return;
        }
        throw new Error("계좌 정보를 불러오는데 실패했습니다.");
      }

      const accountData: AccountResponse = await accountRes.json();
      setAccount(accountData.account);

      setOrdersError(null);
      if (ordersRes.ok) {
        const ordersData: OrdersResponse = await ordersRes.json();
        setOrders(ordersData.orders);
        setOrderDate(ordersData.date);
      } else {
        setOrdersError("주문 정보를 불러오는데 실패했습니다.");
        setOrders([]);
      }
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

  // Calculate asset values
  function calculateAssetValues(acc: TradingAccountWithHoldings): {
    totalAssets: number;
    totalShares: number;
    stockValue: number;
    cashBalance: number;
    profitRate: number;
  } {
    const totalShares = acc.totalShares;
    // For now, we use estimated values since we don't have real-time price
    // In production, this would come from a price API
    const estimatedPrice = 30; // Placeholder price
    const stockValue = totalShares * estimatedPrice;

    // Calculate invested amount
    let investedAmount = 0;
    for (const holding of acc.holdings) {
      if (holding.shares > 0 && holding.buyPrice) {
        investedAmount += holding.shares * holding.buyPrice;
      }
    }

    const cashBalance = acc.seedCapital - investedAmount;
    const totalAssets = cashBalance + stockValue;
    const profitRate = investedAmount > 0 ? ((stockValue - investedAmount) / investedAmount) * 100 : 0;

    return {
      totalAssets,
      totalShares,
      stockValue,
      cashBalance,
      profitRate,
    };
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

  if (!account) {
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

  const assetValues = calculateAssetValues(account);

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
        totalAssets={assetValues.totalAssets}
        totalShares={assetValues.totalShares}
        stockValue={assetValues.stockValue}
        cashBalance={assetValues.cashBalance}
        profitRate={assetValues.profitRate}
        ticker={account.ticker}
      />

      {/* Holdings Section */}
      <TierHoldingsTable
        holdings={account.holdings}
        seedCapital={account.seedCapital}
        strategy={account.strategy}
      />

      {/* Daily Orders Section */}
      {ordersError && (
        <div className="alert alert-warning mb-4" role="alert">
          {ordersError}
        </div>
      )}
      <DailyOrdersTable orders={orders} ticker={account.ticker} date={orderDate} />
    </div>
  );
}
