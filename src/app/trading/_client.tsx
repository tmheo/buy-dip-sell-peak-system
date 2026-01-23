"use client";

/**
 * 트레이딩 계좌 목록 클라이언트 컴포넌트
 */

import type React from "react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AccountListTable from "@/components/trading/AccountListTable";
import DeleteAccountModal from "@/components/trading/DeleteAccountModal";
import type { TradingAccount, TierHolding } from "@/types/trading";

interface AccountWithHoldings extends TradingAccount {
  holdings: TierHolding[];
  totalShares: number;
}

interface AccountsResponse {
  accounts: AccountWithHoldings[];
}

export default function TradingListClient(): React.ReactElement {
  const [accounts, setAccounts] = useState<AccountWithHoldings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountWithHoldings | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAccounts = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/trading/accounts");

      if (!response.ok) {
        throw new Error("계좌 목록을 불러오는데 실패했습니다.");
      }

      const data: AccountsResponse = await response.json();
      setAccounts(data.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  function handleDeleteClick(account: AccountWithHoldings): void {
    setSelectedAccount(account);
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!selectedAccount) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/trading/accounts/${selectedAccount.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "계좌 삭제에 실패했습니다.");
      }

      // Close modal and refresh list
      const modalElement = document.getElementById("deleteAccountModal");
      if (modalElement) {
        // Bootstrap modal close
        const bootstrap = (window as unknown as { bootstrap?: { Modal: { getInstance: (el: Element) => { hide: () => void } | null } } }).bootstrap;
        const modal = bootstrap?.Modal.getInstance(modalElement);
        modal?.hide();
      }

      await fetchAccounts();
      setSelectedAccount(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "계좌 삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="container py-4">
      <div className="mb-4">
        <h2 className="text-light mb-0">트레이딩 계좌</h2>
      </div>

      {isLoading ? (
        <div className="card bg-dark border-secondary">
          <div className="card-body text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">로딩 중...</span>
            </div>
            <p className="text-secondary mt-3 mb-0">계좌 목록을 불러오는 중...</p>
          </div>
        </div>
      ) : error ? (
        <div className="card bg-dark border-danger">
          <div className="card-body text-center py-5">
            <p className="text-danger mb-3">{error}</p>
            <button type="button" className="btn btn-outline-primary" onClick={fetchAccounts}>
              다시 시도
            </button>
          </div>
        </div>
      ) : (
        <>
          <AccountListTable accounts={accounts} onDeleteClick={handleDeleteClick} />

          <div className="d-flex justify-content-between align-items-center mt-3">
            <span className="text-secondary">계좌 수: {accounts.length}</span>
            <Link href="/trading/new" className="btn btn-outline-primary">
              새 계좌 만들기
            </Link>
          </div>
        </>
      )}

      <DeleteAccountModal
        accountName={selectedAccount?.name ?? ""}
        isDeleting={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
