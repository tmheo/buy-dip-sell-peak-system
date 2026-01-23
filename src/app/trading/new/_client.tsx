"use client";

/**
 * 트레이딩 계좌 생성 클라이언트 컴포넌트
 */

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AccountForm from "@/components/trading/AccountForm";
import type { AccountFormData } from "@/components/trading/AccountForm";

export default function TradingNewClient(): React.ReactElement {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: AccountFormData): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/trading/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "계좌 생성에 실패했습니다.");
      }

      router.push("/trading");
    } catch (err) {
      setError(err instanceof Error ? err.message : "계좌 생성에 실패했습니다.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <div className="d-flex align-items-center mb-4">
            <Link href="/trading" className="btn btn-outline-secondary me-3">
              &larr; 목록
            </Link>
            <h2 className="text-light mb-0">새 계좌 만들기</h2>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <div className="card bg-dark border-secondary">
            <div className="card-body">
              <AccountForm
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                mode="create"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
