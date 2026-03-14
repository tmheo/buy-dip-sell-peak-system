"use client";

/**
 * 백테스트 (추천 전략) 페이지 (클라이언트 컴포넌트)
 * 원본 UI와 동일한 레이아웃으로 구현
 */
import { useState } from "react";
import dynamic from "next/dynamic";

import type { ChangeEvent, FormEvent } from "react";
import type { RecommendBacktestResult } from "@/backtest-recommend";
import type { Strategy } from "@/types/trading";

import { STRATEGY_COLORS } from "@/backtest";
import { getTodayDate, getYearStartDate } from "@/lib/date";

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
    startDate: getYearStartDate(),
    endDate: getTodayDate(),
    symbol: "SOXL",
    initialCapital: 10000,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RecommendBacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDailyHistoryOpen, setIsDailyHistoryOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!form.initialCapital || form.initialCapital < 1000) {
      setError("초기 자본은 최소 $1,000 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

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

      if (response.status === 401) {
        window.location.href = "/info";
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || data.message || "백테스트 실행 실패");
        return;
      }

      setResult(data.data as RecommendBacktestResult);
    } catch (err) {
      console.error("Recommend backtest error:", err);
      setError("백테스트 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  }

  // 수익금 계산
  const profit = result ? result.finalAsset - result.initialCapital : 0;

  return (
    <div className="backtest-recommend-page">
      {/* 헤더 */}
      <section className="info-section">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h1 className="mb-1">
              <span role="img" aria-label="robot">🤖</span> 백테스트(추천전략)
            </h1>
            <p className="lead mb-0">
              추천된 전략으로 진행했을 경우를 백테스트합니다.
            </p>
          </div>

          {/* 인라인 폼 */}
          <form onSubmit={handleSubmit} className="d-flex align-items-end gap-2 flex-wrap">
            <div>
              <label htmlFor="startDate" className="form-label small mb-1">시작일</label>
              <input
                type="date"
                className="form-control form-control-sm form-input-date"
                id="startDate"
                name="startDate"
                value={form.startDate}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>
            <div>
              <label htmlFor="endDate" className="form-label small mb-1">종료일</label>
              <input
                type="date"
                className="form-control form-control-sm form-input-date"
                id="endDate"
                name="endDate"
                value={form.endDate}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>
            <div>
              <label htmlFor="symbol" className="form-label small mb-1">종목 선택</label>
              <select
                className="form-select form-select-sm form-input-select"
                id="symbol"
                name="symbol"
                value={form.symbol}
                onChange={handleInputChange}
                disabled={isLoading}
              >
                <option value="SOXL">SOXL</option>
                <option value="TQQQ">TQQQ</option>
              </select>
            </div>
            <div>
              <label htmlFor="initialCapital" className="form-label small mb-1">초기자본</label>
              <input
                type="number"
                className="form-control form-control-sm form-input-capital"
                id="initialCapital"
                name="initialCapital"
                value={form.initialCapital || ""}
                onChange={handleInputChange}
                disabled={isLoading}
                min={1000}
                step={1000}
              />
            </div>
            <div>
              <button
                type="submit"
                className="btn btn-success btn-sm form-input-btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    분석 중...
                  </>
                ) : (
                  "🚀 백테스트 실행"
                )}
              </button>
            </div>
          </form>
        </div>
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
                        const strategyNames: Strategy[] = ["Pro1", "Pro2", "Pro3"];

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
            <h5
              className="mb-2 d-flex align-items-center"
              style={{ cursor: "pointer", userSelect: "none" }}
              onClick={() => setIsDailyHistoryOpen(!isDailyHistoryOpen)}
            >
              <span style={{ display: "inline-block", width: "1em", marginRight: "0.25em" }}>
                {isDailyHistoryOpen ? "▼" : "▶"}
              </span>
              📋 일별 내역
              <small className="text-muted ms-2">({result.dailyHistory.length}일)</small>
            </h5>
            {isDailyHistoryOpen && (
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
                          <td className="text-end">{snapshot.totalShares}</td>
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
            )}
          </section>
        </>
      )}

      {/* 결과 없을 때 안내 */}
      {!result && !isLoading && (
        <section className="info-section">
          <div className="alert alert-secondary">
            <p className="mb-0">백테스트를 실행하면 여기에 결과가 표시됩니다.</p>
          </div>

          {/* 추천 전략 백테스트 안내 */}
          <div className="card bg-dark mt-4">
            <div className="card-body">
              <h5 className="card-title">추천 전략 백테스트란?</h5>
              <p className="card-text">
                추천 전략 백테스트는 매 사이클마다 시장 상황에 맞는 최적의 전략을 동적으로 선택하여
                시뮬레이션합니다. 과거 유사 구간의 성과를 분석하여 Pro1, Pro2, Pro3 중 가장 적합한 전략을
                자동으로 추천받아 진행합니다.
              </p>
              <h5 className="card-title mt-4">추천 시스템 특징</h5>
              <ul className="mb-0">
                <li>
                  <strong>동적 전략 전환</strong>: 사이클 시작 시점의 기술적 지표를 분석하여 최적 전략 선택
                </li>
                <li>
                  <strong>유사 구간 분석</strong>: RSI, 이격도, MA 기울기, ROC, 변동성을 기반으로 과거
                  유사 구간 탐색
                </li>
                <li>
                  <strong>SOXL 전용 하향 규칙</strong>: 다음 조건 충족 시 보수적 전략으로 자동 하향
                  (Pro3→Pro2→Pro1)
                  <ul className="mt-1 mb-0">
                    <li>조건 1: RSI ≥ 60 AND 역배열</li>
                    <li>조건 2: RSI 다이버전스 AND 이격도 &lt; 120 AND 기준일 RSI ≥ 60</li>
                  </ul>
                </li>
              </ul>
              <h5 className="card-title mt-4">주의사항</h5>
              <ul className="mb-0">
                <li>과거 성과가 미래 수익을 보장하지 않습니다.</li>
                <li>백테스트 결과는 거래 수수료, 세금 등을 반영하지 않을 수 있습니다.</li>
                <li>실제 거래에서는 슬리피지(체결가 차이)가 발생할 수 있습니다.</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
