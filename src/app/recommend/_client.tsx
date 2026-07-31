"use client";

/**
 * 전략 추천 페이지 (클라이언트 컴포넌트)
 * 현재 시장 상황과 유사한 과거 구간을 분석하여 최적의 전략을 추천
 */
import type { FormEvent, ChangeEvent } from "react";
import { useState } from "react";
import dynamic from "next/dynamic";

import type { RecommendResult } from "@/recommend/types";
import type { ReferenceChartProps } from "@/components/recommend/ReferenceChart";
import type { SimilarPeriodCardProps } from "@/components/recommend/SimilarPeriodCard";
import type { StrategyScoreTableProps } from "@/components/recommend/StrategyScoreTable";
import type { RecommendationCardProps } from "@/components/recommend/RecommendationCard";
import { getTodayDate } from "@/lib/date";

// 동적 임포트 (SSR 비활성화 - Recharts는 클라이언트에서만 동작)
const ReferenceChart = dynamic<ReferenceChartProps>(
  () => import("@/components/recommend/ReferenceChart"),
  { ssr: false }
);
const SimilarPeriodCard = dynamic<SimilarPeriodCardProps>(
  () => import("@/components/recommend/SimilarPeriodCard"),
  { ssr: false }
);
const StrategyScoreTable = dynamic<StrategyScoreTableProps>(
  () => import("@/components/recommend/StrategyScoreTable"),
  { ssr: false }
);
const RecommendationCard = dynamic<RecommendationCardProps>(
  () => import("@/components/recommend/RecommendationCard"),
  { ssr: false }
);

interface RecommendForm {
  baseType: "today" | "specific";
  referenceDate: string;
  ticker: "SOXL" | "TQQQ";
}

export default function RecommendPageClient() {
  const [form, setForm] = useState<RecommendForm>({
    baseType: "today",
    referenceDate: getTodayDate(),
    ticker: "SOXL",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: form.ticker,
          referenceDate: form.referenceDate,
          baseType: form.baseType,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || data.error || "전략 추천 분석에 실패했습니다.");
        return;
      }

      setResult(data.data as RecommendResult);
    } catch (err) {
      console.error("Recommend API error:", err);
      setError("전략 추천 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleBaseTypeChange(e: ChangeEvent<HTMLInputElement>): void {
    const baseType = e.target.value as "today" | "specific";
    setForm((prev) => ({
      ...prev,
      baseType,
      referenceDate: baseType === "today" ? getTodayDate() : prev.referenceDate,
    }));
  }

  return (
    <div className="recommend-page">
      {/* 헤더 */}
      <section className="info-section">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h1 className="mb-1">
              <span role="img" aria-label="recommend">
                🎯
              </span>{" "}
              전략 추천
            </h1>
            <p className="lead mb-0">
              현재 시장 상황과 유사한 과거 구간을 분석하여 최적의 전략을 추천합니다.
            </p>
          </div>

          {/* 인라인 폼 */}
          <form onSubmit={handleSubmit} className="d-flex align-items-end gap-2 flex-wrap">
            {/* 기준 선택 */}
            <div>
              <label className="form-label small mb-1">기준 선택</label>
              <div className="d-flex gap-3">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="baseType"
                    id="baseTypeToday"
                    value="today"
                    checked={form.baseType === "today"}
                    onChange={handleBaseTypeChange}
                    disabled={isLoading}
                  />
                  <label className="form-check-label" htmlFor="baseTypeToday">
                    오늘
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="baseType"
                    id="baseTypeSpecific"
                    value="specific"
                    checked={form.baseType === "specific"}
                    onChange={handleBaseTypeChange}
                    disabled={isLoading}
                  />
                  <label className="form-check-label" htmlFor="baseTypeSpecific">
                    특정일
                  </label>
                </div>
              </div>
            </div>

            {/* 기준 날짜 */}
            <div>
              <label htmlFor="referenceDate" className="form-label small mb-1">
                기준 날짜
              </label>
              <input
                type="date"
                className="form-control form-control-sm form-input-date"
                id="referenceDate"
                name="referenceDate"
                value={form.referenceDate}
                onChange={handleInputChange}
                disabled={isLoading || form.baseType === "today"}
                required
              />
            </div>

            {/* 종목 선택 */}
            <div>
              <label htmlFor="ticker" className="form-label small mb-1">
                종목 선택
              </label>
              <select
                className="form-select form-select-sm form-input-select"
                id="ticker"
                name="ticker"
                value={form.ticker}
                onChange={handleInputChange}
                disabled={isLoading}
              >
                <option value="SOXL">SOXL</option>
                <option value="TQQQ">TQQQ</option>
              </select>
            </div>

            {/* 분석 실행 버튼 */}
            <div>
              <button
                type="submit"
                className="btn btn-success btn-sm form-input-btn"
                disabled={isLoading}
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
                  "🎯 전략 분석"
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
          {/* 기준일 정보 */}
          <div className="alert alert-info mb-4">
            <strong>분석 기준일:</strong> {result.referenceDate} | <strong>분석 구간:</strong>{" "}
            {result.analysisPeriod.startDate} ~ {result.analysisPeriod.endDate} (20 거래일)
          </div>

          {/* 기준일 차트 및 지표 */}
          <ReferenceChart
            metrics={result.metrics}
            ticker={form.ticker}
            analysisPeriod={result.analysisPeriod}
            chartData={result.referenceChartData}
            referenceDate={result.referenceDate}
          />

          {/* 유사 구간 Top 3 */}
          <h4 className="mb-3">유사 구간 Top 3</h4>
          <div className="row mb-4">
            {result.similarPeriods.map((period, index) => (
              <SimilarPeriodCard key={index} period={period} rank={(index + 1) as 1 | 2 | 3} />
            ))}
          </div>

          {/* 전략 점수 테이블 */}
          <StrategyScoreTable
            strategyScores={result.strategyScores}
            downgradeInfo={result.downgradeInfo}
          />

          {/* 추천 전략 카드 */}
          <RecommendationCard
            recommendation={result.recommendedStrategy}
            referenceDate={result.referenceDate}
            isGoldenCross={result.metrics.isGoldenCross}
            skipPro1Exclusion={result.downgradeInfo?.skipPro1Exclusion}
          />
        </>
      )}

      {/* 결과 없을 때 안내 */}
      {!result && !isLoading && (
        <section className="info-section">
          <div className="alert alert-secondary">
            <p className="mb-0">전략 분석을 실행하면 여기에 결과가 표시됩니다.</p>
          </div>

          {/* 전략 추천 안내 */}
          <div className="card bg-dark mt-4">
            <div className="card-body">
              <h5 className="card-title">전략 추천 시스템이란?</h5>
              <p className="card-text">
                현재 시장의 기술적 지표를 분석하여 과거 유사한 상황에서 가장 좋은 성과를 보인 전략을
                추천합니다.
              </p>

              <h5 className="card-title mt-4">분석 방법</h5>
              <ol className="mb-3">
                <li>기준일 기준 20 거래일의 기술적 지표(6개)를 계산합니다.</li>
                <li>과거 데이터에서 유사한 지표 패턴을 가진 구간 Top 3를 찾습니다.</li>
                <li>
                  각 유사 구간의 이후 20 거래일 성과를 Pro1/Pro2/Pro3 전략으로 백테스트합니다.
                </li>
                <li>수익률과 MDD를 종합하여 점수를 계산하고 최적 전략을 추천합니다.</li>
              </ol>

              <h5 className="card-title mt-4">점수 계산 공식</h5>
              <p className="card-text mb-3">
                <code>점수 = 수익률 x e^(MDD x 0.01)</code>
              </p>
              <p className="card-text small text-muted">
                MDD가 클수록 (손실이 클수록) 점수가 낮아지는 방식으로, 안정성과 수익성을 균형있게
                평가합니다.
              </p>

              <h5 className="card-title mt-4">주의사항</h5>
              <ul className="mb-0">
                <li>과거 유사 구간의 성과가 미래 수익을 보장하지 않습니다.</li>
                <li>시장 상황에 따라 다른 전략이 더 적합할 수 있습니다.</li>
                <li>정배열(MA20 &gt; MA60) 상황에서는 Pro1 전략이 제외됩니다.</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
