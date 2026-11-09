"use client";

/**
 * 오늘의 주문표 테이블 컴포넌트
 *
 * 예수금으로 1주도 살 수 없어 매수 주문이 없는 날에는 그 티어 줄에 이유를 보인다 (#98, 결정은 #93).
 * 그날인지는 주문 조회 응답(unaffordableBuy)이 알려 준다 - 화면이 규칙을 다시 계산하지 않는다.
 */

import type React from "react";
import type { UnaffordableBuy } from "@/strategy";
import type { DailyOrder } from "@/types/trading";
import { formatCurrency, getTierLabel } from "./format";

interface DailyOrdersTableProps {
  orders: DailyOrder[];
  ticker: string;
  date: string;
  unaffordableBuy: UnaffordableBuy | null;
}

export default function DailyOrdersTable({
  orders,
  ticker,
  date,
  unaffordableBuy,
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
        {orders.length === 0 && !unaffordableBuy ? (
          <div className="p-4 text-center text-secondary">오늘 예정된 주문이 없습니다.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover align-middle mb-0">
              {/* 머리글은 줄바꿈하지 않는다: 긴 안내 문구 줄이 있으면 열이 좁아져 머리글이 한 글자씩 꺾였다 */}
              <thead className="text-nowrap">
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
                {unaffordableBuy && (
                  <tr>
                    <td className="text-center">{ticker}</td>
                    <td className="text-center">
                      <span className="badge bg-secondary">
                        {getTierLabel(unaffordableBuy.tier)}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge trading-buy">매수</span>
                    </td>
                    {/* 좁은 화면에서 줄이 바뀔 때 낱말 중간에서 끊지 않는다 */}
                    <td className="text-secondary" colSpan={3} style={{ wordBreak: "keep-all" }}>
                      예수금 {formatCurrency(unaffordableBuy.availableCash)}로는 1주도 살 수 없어
                      주문하지 않습니다
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="text-center">{ticker}</td>
                    <td className="text-center">
                      <span className="badge bg-secondary">{getTierLabel(order.tier)}</span>
                    </td>
                    <td className="text-center">
                      <span
                        className={`badge ${order.type === "BUY" ? "trading-buy" : "trading-sell"}`}
                      >
                        {order.type === "BUY" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge bg-info">{order.orderMethod}</span>
                    </td>
                    <td className="text-end">
                      {order.orderMethod === "MOC" ? "-" : formatCurrency(order.limitPrice)}
                    </td>
                    <td className="text-end">{order.shares.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card-footer border-secondary">
        <small className="text-secondary">* 주문표는 매일 AM 9시~10시에 갱신됩니다.</small>
      </div>
    </div>
  );
}
