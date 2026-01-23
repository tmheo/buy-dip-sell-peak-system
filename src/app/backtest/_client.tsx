"use client";

/**
 * 백테스트 결과 페이지 (클라이언트 컴포넌트)
 * Pro 1,2,3 전략의 백테스트 결과를 시각화
 */
import { useState, FormEvent } from "react";
import dynamic from "next/dynamic";
import type { BacktestResult, StrategyName } from "@/backtest/types";

// 동적 임포트 (SSR 비활성화 - Recharts는 클라이언트에서만 동작)
const PriceChart = dynamic(() => import("@/components/backtest/PriceChart"), { ssr: false });
const MetricsCharts = dynamic(() => import("@/components/backtest/MetricsCharts"), { ssr: false });
const ProResultCard = dynamic(() => import("@/components/backtest/ProResultCard"), { ssr: false });

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function getTodayDate(): string {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

interface BacktestForm {
  startDate: string;
  endDate: string;
  symbol: string;
  initialCapital: number;
}

interface BacktestResults {
  pro1: BacktestResult | null;
  pro2: BacktestResult | null;
  pro3: BacktestResult | null;
}

export default function BacktestPageClient() {
  const [form, setForm] = useState<BacktestForm>({
    startDate: "2025-01-01",
    endDate: getTodayDate(),
    symbol: "SOXL",
    initialCapital: 10000,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 단일 전략 백테스트 실행
  const runSingleBacktest = async (strategy: StrategyName): Promise<BacktestResult | null> => {
    try {
      const response = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: form.symbol,
          strategy,
          startDate: form.startDate,
          endDate: form.endDate,
          initialCapital: form.initialCapital,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error(`${strategy} backtest failed:`, data.error);
        return null;
      }

      return data.data as BacktestResult;
    } catch (err) {
      console.error(`${strategy} backtest error:`, err);
      return null;
    }
  };

  // 폼 제출 핸들러
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      // Pro1, Pro2, Pro3 병렬 실행
      const [pro1, pro2, pro3] = await Promise.all([
        runSingleBacktest("Pro1"),
        runSingleBacktest("Pro2"),
        runSingleBacktest("Pro3"),
      ]);

      if (!pro1 && !pro2 && !pro3) {
        setError("백테스트 실행에 실패했습니다. 날짜 범위와 종목을 확인해주세요.");
        return;
      }

      setResults({ pro1, pro2, pro3 });
    } catch (err) {
      console.error("Backtest error:", err);
      setError("백테스트 중 오류가 발생했습니다.");
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

  // 첫 번째 성공한 결과 (차트 데이터용)
  const firstResult = results?.pro1 || results?.pro2 || results?.pro3;

  // 3개 전략의 Y축 범위 통일을 위한 계산
  const sharedYAxisRange = (() => {
    if (!results) return undefined;

    const allResults = [results.pro1, results.pro2, results.pro3].filter(Boolean);
    if (allResults.length === 0) return undefined;

    // 모든 전략의 일별 자산에서 최대값 찾기
    let assetMax = 0;
    let mddMin = 0;

    allResults.forEach((result) => {
      if (!result) return;

      let peak = result.initialCapital;
      result.dailyHistory.forEach((d) => {
        // 최대 자산
        if (d.totalAsset > assetMax) {
          assetMax = d.totalAsset;
        }
        // 피크 업데이트
        if (d.totalAsset > peak) {
          peak = d.totalAsset;
        }
        // MDD 계산 (음수 퍼센트)
        const mdd = peak > 0 ? ((d.totalAsset - peak) / peak) * 100 : 0;
        if (mdd < mddMin) {
          mddMin = mdd;
        }
      });
    });

    // 여유 마진 추가 (10%)
    assetMax = assetMax * 1.1;
    mddMin = mddMin * 1.1;

    return { assetMax, mddMin };
  })();

  return (
    <div className="backtest-page">
      {/* 헤더 */}
      <section className="info-section">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h1 className="mb-1">
              <span role="img" aria-label="chart">
                📊
              </span>{" "}
              백테스트 (기본)
            </h1>
            <p className="lead mb-0">과거 데이터를 기반으로 Pro 전략의 성과를 검증합니다.</p>
          </div>

          {/* 인라인 폼 */}
          <form onSubmit={handleSubmit} className="d-flex align-items-end gap-2 flex-wrap">
            {/* 시작일 */}
            <div>
              <label htmlFor="startDate" className="form-label small mb-1">
                시작일
              </label>
              <input
                type="date"
                className="form-control form-control-sm"
                id="startDate"
                name="startDate"
                value={form.startDate}
                onChange={handleInputChange}
                disabled={isLoading}
                required
                style={{ width: "140px" }}
              />
            </div>

            {/* 종료일 */}
            <div>
              <label htmlFor="endDate" className="form-label small mb-1">
                종료일
              </label>
              <input
                type="date"
                className="form-control form-control-sm"
                id="endDate"
                name="endDate"
                value={form.endDate}
                onChange={handleInputChange}
                disabled={isLoading}
                required
                style={{ width: "140px" }}
              />
            </div>

            {/* 종목 선택 */}
            <div>
              <label htmlFor="symbol" className="form-label small mb-1">
                종목 선택
              </label>
              <select
                className="form-select form-select-sm"
                id="symbol"
                name="symbol"
                value={form.symbol}
                onChange={handleInputChange}
                disabled={isLoading}
                style={{ width: "100px" }}
              >
                <option value="SOXL">SOXL</option>
                <option value="TQQQ">TQQQ</option>
              </select>
            </div>

            {/* 초기자본 */}
            <div>
              <label htmlFor="initialCapital" className="form-label small mb-1">
                초기자본
              </label>
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

            {/* 백테스트 실행 버튼 */}
            <div>
              <button
                type="submit"
                className="btn btn-success btn-sm"
                disabled={isLoading}
                style={{ height: "31px" }}
              >
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-1"
                      role="status"
                      aria-hidden="true"
                    ></span>
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
      {results && firstResult && (
        <>
          {/* 가격 차트 */}
          <PriceChart data={firstResult.dailyHistory} ticker={form.symbol} />

          {/* 6개 기술적 지표 차트 */}
          <MetricsCharts
            dailyMetrics={firstResult.dailyTechnicalMetrics}
            finalMetrics={firstResult.technicalMetrics}
          />

          {/* Pro 1,2,3 결과 카드 */}
          <div className="row">
            {results.pro1 && <ProResultCard result={results.pro1} cardNumber={1} sharedYAxisRange={sharedYAxisRange} />}
            {results.pro2 && <ProResultCard result={results.pro2} cardNumber={2} sharedYAxisRange={sharedYAxisRange} />}
            {results.pro3 && <ProResultCard result={results.pro3} cardNumber={3} sharedYAxisRange={sharedYAxisRange} />}
          </div>
        </>
      )}

      {/* 결과 없을 때 안내 */}
      {!results && !isLoading && (
        <section className="info-section">
          <div className="alert alert-secondary">
            <p className="mb-0">백테스트를 실행하면 여기에 결과가 표시됩니다.</p>
          </div>

          {/* 백테스트 안내 */}
          <div className="card bg-dark mt-4">
            <div className="card-body">
              <h5 className="card-title">백테스트란?</h5>
              <p className="card-text">
                백테스트는 과거 주가 데이터를 사용하여 특정 투자 전략이 어떤 성과를 냈을지
                시뮬레이션하는 방법입니다.
              </p>
              <h5 className="card-title mt-4">Pro 전략 비교</h5>
              <ul className="mb-0">
                <li>
                  <strong>Pro1</strong>: 5%/10%/15%/20%/25%/25% 분할, 매수 -0.01%, 매도 +0.01%, 손절
                  10일
                </li>
                <li>
                  <strong>Pro2</strong>: 10%/15%/20%/25%/20%/10% 분할, 매수 -0.01%, 매도 +1.50%,
                  손절 10일
                </li>
                <li>
                  <strong>Pro3</strong>: 균등 분할 (16.7%), 매수 -0.10%, 매도 +2.00%, 손절 12일
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
