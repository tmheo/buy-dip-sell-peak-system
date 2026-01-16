"use client";

// Backtest 페이지 - 백테스트 실행
// Client Component - 폼 상태 관리를 위해

import { useState, FormEvent } from "react";

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function getTodayDate(): string {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

interface BacktestForm {
  startDate: string;
  endDate: string;
  symbol: string;
  mode: string;
}

export default function BacktestPage() {
  const [form, setForm] = useState<BacktestForm>({
    startDate: "2025-01-01",
    endDate: getTodayDate(),
    symbol: "SOXL",
    mode: "Pro",
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    // 시뮬레이션을 위한 지연 (실제 API 호출 없음)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsLoading(false);
    // 실제 구현에서는 여기서 백테스트 결과를 처리
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="backtest-page">
      {/* 헤더 */}
      <section className="info-section">
        <h1>
          <span role="img" aria-label="chart">
            &#x1F4CA;
          </span>{" "}
          백테스트 (기본)
        </h1>
        <p className="lead">과거 데이터를 기반으로 투자 전략의 성과를 검증합니다.</p>
      </section>

      {/* 백테스트 폼 */}
      <section className="info-section">
        <h2>백테스트 설정</h2>
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            {/* 시작 날짜 */}
            <div className="col-12 col-md-6">
              <label htmlFor="startDate" className="form-label">
                시작 날짜
              </label>
              <input
                type="date"
                className="form-control"
                id="startDate"
                name="startDate"
                value={form.startDate}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>

            {/* 종료 날짜 */}
            <div className="col-12 col-md-6">
              <label htmlFor="endDate" className="form-label">
                종료 날짜
              </label>
              <input
                type="date"
                className="form-control"
                id="endDate"
                name="endDate"
                value={form.endDate}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>

            {/* 종목 선택 */}
            <div className="col-12 col-md-6">
              <label htmlFor="symbol" className="form-label">
                종목
              </label>
              <select
                className="form-select"
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

            {/* 모드 선택 */}
            <div className="col-12 col-md-6">
              <label htmlFor="mode" className="form-label">
                Pro/Custom
              </label>
              <select
                className="form-select"
                id="mode"
                name="mode"
                value={form.mode}
                onChange={handleInputChange}
                disabled={isLoading}
              >
                <option value="Pro">Pro</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            {/* 제출 버튼 */}
            <div className="col-12">
              <button type="submit" className="btn btn-success btn-lg" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    분석 중...
                  </>
                ) : (
                  "백테스트 실행"
                )}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* 결과 영역 (추후 구현) */}
      <section className="info-section">
        <h2>백테스트 결과</h2>
        <div className="alert alert-secondary">
          <p className="mb-0">백테스트를 실행하면 여기에 결과가 표시됩니다.</p>
        </div>
      </section>

      {/* 안내 */}
      <section className="info-section">
        <h2>백테스트 안내</h2>
        <div className="card bg-dark">
          <div className="card-body">
            <h5 className="card-title">백테스트란?</h5>
            <p className="card-text">
              백테스트는 과거 주가 데이터를 사용하여 특정 투자 전략이 어떤 성과를 냈을지
              시뮬레이션하는 방법입니다.
            </p>
            <h5 className="card-title mt-4">주의사항</h5>
            <ul className="mb-0">
              <li>과거 성과가 미래 수익을 보장하지 않습니다.</li>
              <li>백테스트 결과는 거래 수수료, 세금 등을 반영하지 않을 수 있습니다.</li>
              <li>실제 거래에서는 슬리피지(체결가 차이)가 발생할 수 있습니다.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
