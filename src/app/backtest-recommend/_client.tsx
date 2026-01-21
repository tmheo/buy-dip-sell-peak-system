"use client";

/**
 * 백테스트 (추천 전략) 페이지 (클라이언트 컴포넌트)
 * 원본 UI와 동일한 레이아웃으로 구현
 */
import { useState, FormEvent } from "react";
import dynamic from "next/dynamic";
import type { RecommendBacktestResult } from "@/backtest-recommend";
import { STRATEGY_COLORS } from "@/backtest";
import type { StrategyName } from "@/backtest/types";
import { getTodayDate } from "@/lib/date";

// 동적 임포트 (SSR 비활성화)
const AssetMddChart = dynamic(
  () => import("@/components/backtest-recommend/AssetMddChart"),
  { ssr: false }
);

interface BacktestForm {
  startDate: string;
  endDate: string;
  symbol: "SOXL" | "TQQQ";
  initialCapital: number;
}

export default function BacktestRecommendPageClient() {
  const [form, setForm] = useState<BacktestForm>({
    startDate: "2025-01-01",
    endDate: getTodayDate(),
    symbol: "SOXL",
    initialCapital: 10000,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RecommendBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 백테스트 실행
  const runBacktest = async (): Promise<RecommendBacktestResult | null> => {
    try {
      const response = await fetch("/api/backtest-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: form.symbol,
          startDate: form.startDate,
          endDate: form.endDate,
          initialCapital: form.initialCapital,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || "백테스트 실행 실패");
      }

      return data.data as RecommendBacktestResult;
    } catch (err) {
      console.error("Recommend backtest error:", err);
      throw err;
    }
  };

  // 폼 제출 핸들러
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const backtestResult = await runBacktest();
      setResult(backtestResult);
    } catch (err) {
      console.error("Backtest error:", err);
      setError(err instanceof Error ? err.message : "백테스트 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  // 수익금 계산
  const profit = result ? result.finalAsset - result.initialCapital : 0;

  return (
    <div className="backtest-recommend-page">
      {/* 헤더 */}
      <section className="info-section">
        <h1 className="mb-1">
          <span role="img" aria-label="robot">🤖</span> 백테스트(추천전략)
        </h1>
        <p className="text-muted small mb-3">
          선택한 전략에 대한 기간별 백테스트 결과를 보여줍니다. 매수/매도 신호와 수익률을 확인하세요.
        </p>

        {/* 입력 폼 */}
        <form onSubmit={handleSubmit} className="row g-2 align-items-end mb-3">
          <div className="col-auto">
            <label htmlFor="startDate" className="form-label small mb-1">시작일</label>
            <input
              type="date"
              className="form-control form-control-sm"
              id="startDate"
              name="startDate"
              value={form.startDate}
              onChange={handleInputChange}
              disabled={isLoading}
              style={{ width: "130px" }}
            />
          </div>
          <div className="col-auto">
            <label htmlFor="endDate" className="form-label small mb-1">종료일</label>
            <input
              type="date"
              className="form-control form-control-sm"
              id="endDate"
              name="endDate"
              value={form.endDate}
              onChange={handleInputChange}
              disabled={isLoading}
              style={{ width: "130px" }}
            />
          </div>
          <div className="col-auto">
            <label htmlFor="symbol" className="form-label small mb-1">종목</label>
            <select
              className="form-select form-select-sm"
              id="symbol"
              name="symbol"
              value={form.symbol}
              onChange={handleInputChange}
              disabled={isLoading}
              style={{ width: "90px" }}
            >
              <option value="SOXL">SOXL</option>
              <option value="TQQQ">TQQQ</option>
            </select>
          </div>
          <div className="col-auto">
            <label htmlFor="initialCapital" className="form-label small mb-1">초기자본</label>
            <input
              type="number"
              className="form-control form-control-sm"
              id="initialCapital"
              name="initialCapital"
              value={form.initialCapital}
              onChange={handleInputChange}
              disabled={isLoading}
              min={1000}
              step={1000}
              style={{ width: "100px" }}
            />
          </div>
          <div className="col-auto">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  분석중...
                </>
              ) : (
                "실행"
              )}
            </button>
          </div>
        </form>
      </section>

      {/* 에러 메시지 */}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {/* 결과 영역 */}
      {result && (
        <>
          {/* 투자 상황 + 차트 (2열 레이아웃) */}
          <section className="info-section">
            <div className="row g-3">
              {/* 왼쪽: 투자 상황 */}
              <div className="col-12 col-lg-4">
                <div className="card bg-dark h-100">
                  <div className="card-header py-2">
                    <strong>📊 투자 상황</strong>
                  </div>
                  <div className="card-body py-2">
                    <table className="table table-dark table-sm mb-0" style={{ fontSize: "0.85rem" }}>
                      <tbody>
                        <tr>
                          <td className="text-muted">투자 기간</td>
                          <td className="text-end">{result.startDate} ~ {result.endDate}</td>
                        </tr>
                        <tr>
                          <td className="text-muted">초기 자본</td>
                          <td className="text-end">${result.initialCapital.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td className="text-muted">최종 자산</td>
                          <td className="text-end">${result.finalAsset.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td className="text-muted">수익금</td>
                          <td className={`text-end ${profit >= 0 ? "price-up" : "price-down"}`}>
                            {profit >= 0 ? "+" : ""}${profit.toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-muted">수익률</td>
                          <td className={`text-end ${result.returnRate >= 0 ? "price-up" : "price-down"}`}>
                            {result.returnRate >= 0 ? "+" : ""}{(result.returnRate * 100).toFixed(2)}%
                          </td>
                        </tr>
                        <tr>
                          <td className="text-muted">CAGR</td>
                          <td className={`text-end ${result.cagr >= 0 ? "price-up" : "price-down"}`}>
                            {result.cagr >= 0 ? "+" : ""}{(result.cagr * 100).toFixed(2)}%
                          </td>
                        </tr>
                        <tr>
                          <td className="text-muted">MDD</td>
                          <td className="text-end price-down">{(result.mdd * 100).toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <td className="text-muted">총 사이클</td>
                          <td className="text-end">{result.totalCycles}회</td>
                        </tr>
                        <tr>
                          <td className="text-muted">승률</td>
                          <td className="text-end">{(result.winRate * 100).toFixed(1)}%</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* 전략 사용 빈도 */}
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid #073642" }}>
                      <div className="text-muted small mb-2">📊 전략 사용 빈도</div>
                      {(() => {
                        const totalCycles = result.strategyStats.Pro1.cycles + result.strategyStats.Pro2.cycles + result.strategyStats.Pro3.cycles;
                        const strategyNames: StrategyName[] = ["Pro1", "Pro2", "Pro3"];

                        return strategyNames.map((name) => {
                          const stats = result.strategyStats[name];
                          const percent = totalCycles > 0 ? (stats.cycles / totalCycles) * 100 : 0;
                          return (
                            <div key={name} className="d-flex align-items-center mb-1" style={{ fontSize: "0.85rem" }}>
                              <span style={{ color: STRATEGY_COLORS[name], fontWeight: "bold", width: "40px" }}>{name}</span>
                              <span className="ms-2">{percent.toFixed(1)}%</span>
                              <span className="text-muted ms-1">({stats.cycles}회)</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* 오른쪽: 자산 및 MDD 차트 */}
              <div className="col-12 col-lg-8">
                <div className="card bg-dark h-100">
                  <div className="card-header py-2">
                    <strong>📈 자산 및 MDD 차트</strong>
                  </div>
                  <div className="card-body py-2">
                    <AssetMddChart
                      dailyHistory={result.dailyHistory}
                      initialCapital={result.initialCapital}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 매매 기록 테이블 */}
          <section className="info-section">
            <h5 className="mb-2">📋 매매 기록</h5>
            <div className="table-responsive">
              <table className="table table-sm table-dark table-hover mb-0" style={{ fontSize: "0.75rem" }}>
                <thead style={{ backgroundColor: "#073642" }}>
                  <tr>
                    <th>시작일</th>
                    <th>종료일</th>
                    <th className="text-end">시작일 RSI</th>
                    <th className="text-center">정배열</th>
                    <th className="text-center">전략</th>
                    <th className="text-end">자산</th>
                    <th className="text-end">수익률</th>
                    <th className="text-end">MDD</th>
                    <th className="text-end">누적 수익률</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let cumulativeReturn = 0;
                    return result.cycleStrategies.map((cycle, index) => {
                      // 누적 수익률 계산
                      const cycleReturn = (cycle.returnRate ?? 0) * 100;
                      cumulativeReturn = ((1 + cumulativeReturn / 100) * (1 + cycleReturn / 100) - 1) * 100;

                      return (
                        <tr key={`cycle-${index}`}>
                          <td>{cycle.startDate}</td>
                          <td>{cycle.endDate ?? "(진행중)"}</td>
                          <td
                            className="text-end"
                            style={cycle.startRsi >= 60 ? { color: "#dc322f" } : undefined}
                          >
                            {cycle.startRsi.toFixed(1)}
                          </td>
                          <td className="text-center">
                            <span
                              className="badge"
                              style={{
                                backgroundColor: cycle.isGoldenCross ? "#859900" : "#dc322f",
                                fontSize: "0.6rem",
                                padding: "2px 4px",
                              }}
                            >
                              {cycle.isGoldenCross ? "O" : "X"}
                            </span>
                          </td>
                          <td className="text-center">
                            <span
                              className="badge"
                              style={{
                                backgroundColor: STRATEGY_COLORS[cycle.strategy],
                                fontSize: "0.65rem",
                                padding: "2px 4px",
                              }}
                            >
                              {cycle.strategy}
                            </span>
                          </td>
                          <td className="text-end">
                            ${cycle.finalAsset?.toLocaleString() ?? "-"}
                          </td>
                          <td className={`text-end ${(cycle.returnRate ?? 0) >= 0 ? "price-up" : "price-down"}`}>
                            {cycle.returnRate !== null
                              ? `${cycle.returnRate >= 0 ? "+" : ""}${(cycle.returnRate * 100).toFixed(2)}%`
                              : "-"}
                          </td>
                          <td className={`text-end ${cycle.mdd < 0 ? "price-down" : ""}`}>
                            {(cycle.mdd * 100).toFixed(2)}%
                          </td>
                          <td className={`text-end ${cumulativeReturn >= 0 ? "price-up" : "price-down"}`}>
                            {cumulativeReturn >= 0 ? "+" : ""}{cumulativeReturn.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>

          {/* 일별 내역 테이블 */}
          <section className="info-section">
            <h5 className="mb-2">📋 일별 내역</h5>
            <div className="table-responsive" style={{ maxHeight: "calc(100vh - 400px)", overflowY: "auto" }}>
              <table className="table table-sm table-dark table-hover mb-0 daily-history-table" style={{ fontSize: "0.75rem" }}>
                <thead style={{ position: "sticky", top: 0, backgroundColor: "#073642", zIndex: 1 }}>
                  <tr>
                    <th>날짜</th>
                    <th className="text-end">종가</th>
                    <th className="text-center">전략</th>
                    <th className="text-center">매수</th>
                    <th className="text-center">매도</th>
                    <th className="text-center">손절</th>
                    <th className="text-end">보유수량</th>
                    <th className="text-end">보유금액</th>
                    <th className="text-end">예수금</th>
                    <th className="text-end">총자산</th>
                    <th className="text-end">등락률</th>
                    <th className="text-end">수익률</th>
                    <th className="text-end">MDD</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let peak = result.initialCapital;
                    let prevAsset = result.initialCapital;

                    return result.dailyHistory.map((snapshot, index) => {
                      // 등락률 (전일 대비)
                      const changeRate = prevAsset > 0
                        ? ((snapshot.totalAsset - prevAsset) / prevAsset) * 100
                        : 0;

                      // 수익률 (초기 대비)
                      const returnRate = ((snapshot.totalAsset - result.initialCapital) / result.initialCapital) * 100;

                      // MDD 계산
                      if (snapshot.totalAsset > peak) {
                        peak = snapshot.totalAsset;
                      }
                      const mdd = peak > 0 ? ((snapshot.totalAsset - peak) / peak) * 100 : 0;

                      prevAsset = snapshot.totalAsset;

                      // 매수/매도/손절 거래 분리
                      const buyTrades = snapshot.trades?.filter(t => t.type === "BUY") || [];
                      const sellTrades = snapshot.trades?.filter(t => t.type === "SELL") || [];
                      const stopTrades = snapshot.trades?.filter(t => t.type === "STOP_LOSS") || [];

                      return (
                        <tr key={`${snapshot.date}-${index}`}>
                          <td>{snapshot.date}</td>
                          <td className="text-end">${snapshot.adjClose.toFixed(2)}</td>
                          <td className="text-center">
                            <span
                              className="badge"
                              style={{
                                backgroundColor: STRATEGY_COLORS[snapshot.strategy],
                                fontSize: "0.65rem",
                                padding: "2px 4px",
                              }}
                            >
                              {snapshot.strategy}
                            </span>
                          </td>
                          <td className="text-center">
                            {buyTrades.length > 0 ? (
                              <div className="d-flex flex-wrap gap-1 justify-content-center">
                                {buyTrades.map((trade, idx) => (
                                  <span
                                    key={idx}
                                    className="badge"
                                    style={{
                                      backgroundColor: "#dc322f",
                                      fontSize: "0.6rem",
                                      padding: "2px 4px",
                                    }}
                                  >
                                    T{trade.tier}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="text-center">
                            {sellTrades.length > 0 ? (
                              <div className="d-flex flex-wrap gap-1 justify-content-center">
                                {sellTrades.map((trade, idx) => (
                                  <span
                                    key={idx}
                                    className="badge"
                                    style={{
                                      backgroundColor: "#2aa198",
                                      fontSize: "0.6rem",
                                      padding: "2px 4px",
                                    }}
                                  >
                                    T{trade.tier}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="text-center">
                            {stopTrades.length > 0 ? (
                              <div className="d-flex flex-wrap gap-1 justify-content-center">
                                {stopTrades.map((trade, idx) => (
                                  <span
                                    key={idx}
                                    className="badge"
                                    style={{
                                      backgroundColor: "#b58900",
                                      fontSize: "0.6rem",
                                      padding: "2px 4px",
                                    }}
                                  >
                                    T{trade.tier}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="text-end">{snapshot.activeTiers}</td>
                          <td className="text-end">${snapshot.holdingsValue.toLocaleString()}</td>
                          <td className="text-end">${snapshot.cash.toLocaleString()}</td>
                          <td className="text-end">${snapshot.totalAsset.toLocaleString()}</td>
                          <td className={`text-end ${changeRate >= 0 ? "price-up" : "price-down"}`}>
                            {changeRate >= 0 ? "+" : ""}{changeRate.toFixed(2)}%
                          </td>
                          <td className={`text-end ${returnRate >= 0 ? "price-up" : "price-down"}`}>
                            {returnRate >= 0 ? "+" : ""}{returnRate.toFixed(2)}%
                          </td>
                          <td className={`text-end ${mdd < 0 ? "price-down" : ""}`}>
                            {mdd.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* 결과 없을 때 안내 */}
      {!result && !isLoading && (
        <section className="info-section">
          <div className="alert alert-secondary">
            <p className="mb-0">백테스트를 실행하면 여기에 결과가 표시됩니다.</p>
          </div>
        </section>
      )}
    </div>
  );
}
