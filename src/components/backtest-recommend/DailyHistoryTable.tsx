"use client";

/**
 * 추천 백테스트 일별 히스토리 테이블
 * 날짜별 거래, 보유량, 자산 정보를 표시
 */
import type { DailySnapshotWithStrategy } from "@/backtest-recommend";
import { STRATEGY_COLORS } from "@/backtest";

interface DailyHistoryTableProps {
  dailyHistory: DailySnapshotWithStrategy[];
  initialCapital: number;
}

export default function DailyHistoryTable({
  dailyHistory,
  initialCapital,
}: DailyHistoryTableProps) {
  // MDD 계산용 누적 peak
  let peak = initialCapital;

  return (
    <section className="info-section">
      <h5 className="mb-3">📋 일별 거래 히스토리</h5>
      <div className="table-responsive" style={{ maxHeight: "600px", overflowY: "auto" }}>
        <table className="table table-sm table-dark table-hover" style={{ fontSize: "0.8rem" }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "#073642", zIndex: 1 }}>
            <tr>
              <th>날짜</th>
              <th className="text-end">종가</th>
              <th className="text-center">사이클</th>
              <th className="text-center">전략</th>
              <th className="text-center">거래</th>
              <th className="text-end">보유수량</th>
              <th className="text-end">보유금액</th>
              <th className="text-end">예수금</th>
              <th className="text-end">총자산</th>
              <th className="text-end">수익률</th>
              <th className="text-end">MDD</th>
            </tr>
          </thead>
          <tbody>
            {dailyHistory.map((snapshot, index) => {
              // 수익률 계산
              const returnRate = ((snapshot.totalAsset - initialCapital) / initialCapital) * 100;

              // MDD 계산
              if (snapshot.totalAsset > peak) {
                peak = snapshot.totalAsset;
              }
              const mdd = peak > 0 ? ((snapshot.totalAsset - peak) / peak) * 100 : 0;

              // 보유 주식 수
              const holdingShares = snapshot.totalShares;

              // 거래 정보 포맷
              const tradeInfo = formatTradeInfo(snapshot.trades);
              const strategyColor = STRATEGY_COLORS[snapshot.strategy];

              return (
                <tr key={`${snapshot.date}-${index}`}>
                  <td>{snapshot.date}</td>
                  <td className="text-end">${snapshot.adjClose.toFixed(2)}</td>
                  <td className="text-center">{snapshot.cycleNumber}</td>
                  <td className="text-center">
                    <span
                      className="badge"
                      style={{
                        backgroundColor: strategyColor,
                        fontSize: "0.7rem",
                      }}
                    >
                      {snapshot.strategy}
                    </span>
                  </td>
                  <td className="text-center">{tradeInfo}</td>
                  <td className="text-end">{holdingShares}개</td>
                  <td className="text-end">${snapshot.holdingsValue.toLocaleString()}</td>
                  <td className="text-end">${snapshot.cash.toLocaleString()}</td>
                  <td className="text-end">${snapshot.totalAsset.toLocaleString()}</td>
                  <td className={`text-end ${returnRate >= 0 ? "price-up" : "price-down"}`}>
                    {returnRate >= 0 ? "+" : ""}
                    {returnRate.toFixed(2)}%
                  </td>
                  <td className={`text-end ${mdd < 0 ? "price-down" : ""}`}>{mdd.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// 거래 정보 포맷 함수
function formatTradeInfo(trades: DailySnapshotWithStrategy["trades"]): React.ReactNode {
  if (!trades || trades.length === 0) {
    return <span className="text-muted">-</span>;
  }

  return (
    <div className="d-flex flex-wrap gap-1 justify-content-center">
      {trades.map((trade, idx) => {
        if (trade.type === "BUY") {
          return (
            <span
              key={idx}
              className="badge"
              style={{ backgroundColor: "#dc322f", fontSize: "0.65rem" }}
            >
              매수 T{trade.tier}
            </span>
          );
        } else if (trade.type === "SELL") {
          return (
            <span
              key={idx}
              className="badge"
              style={{ backgroundColor: "#2aa198", fontSize: "0.65rem" }}
            >
              매도 T{trade.tier}
            </span>
          );
        } else if (trade.type === "STOP_LOSS") {
          return (
            <span
              key={idx}
              className="badge"
              style={{ backgroundColor: "#b58900", fontSize: "0.65rem" }}
            >
              손절 T{trade.tier}
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}
