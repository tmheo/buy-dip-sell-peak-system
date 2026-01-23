"use client";

/**
 * 오늘의 주문표 테이블 컴포넌트
 */

import type React from "react";
import type { DailyOrder } from "@/types/trading";

interface DailyOrdersTableProps {
  orders: DailyOrder[];
  ticker: string;
  date: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getTierLabel(tier: number): string {
  if (tier === 7) return "예비";
  return `${tier}`;
}

export default function DailyOrdersTable({
  orders,
  ticker,
  date,
}: DailyOrdersTableProps): React.ReactElement {
  const formattedDate = new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary d-flex justify-content-between align-items-center">
        <h5 className="mb-0 text-light">오늘의 주문표</h5>
        <small className="text-secondary">{formattedDate}</small>
      </div>
      <div className="card-body p-0">
        {orders.length === 0 ? (
          <div className="p-4 text-center text-secondary">
            오늘 예정된 주문이 없습니다.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover mb-0">
              <thead>
                <tr>
                  <th className="text-center">종목</th>
                  <th className="text-center">티어</th>
                  <th className="text-center">구분</th>
                  <th className="text-center">주문방법</th>
                  <th className="text-end">주문가</th>
                  <th className="text-end">수량</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="text-center">{ticker}</td>
                    <td className="text-center">
                      <span className="badge bg-secondary">{getTierLabel(order.tier)}</span>
                    </td>
                    <td className="text-center">
                      <span
                        className={`badge ${
                          order.type === "BUY" ? "trading-buy" : "trading-sell"
                        }`}
                      >
                        {order.type === "BUY" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge bg-info">{order.orderMethod}</span>
                    </td>
                    <td className="text-end">{formatCurrency(order.limitPrice)}</td>
                    <td className="text-end">{order.shares.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card-footer border-secondary">
        <small className="text-secondary">
          * 주문표는 매일 AM 9시~10시에 갱신됩니다.
        </small>
      </div>
    </div>
  );
}
