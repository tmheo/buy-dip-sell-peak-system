"use client";

/**
 * Pro 전략 결과 카드 컴포넌트
 * 전략 정보, 백테스트 결과, 잔여 티어 정보, 자산/MDD 차트 포함
 */
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { BacktestResult, RemainingTier, StrategyName } from "@/backtest/types";

// 전략별 분할 비율 표시
const STRATEGY_RATIOS: Record<StrategyName, string> = {
  Pro1: "5.0% / 10.0% / 15.0% / 20.0% / 25.0% / 25%",
  Pro2: "10.0% / 15.0% / 20.0% / 25.0% / 20.0% / 10.0%",
  Pro3: "16.7% / 16.7% / 16.7% / 16.7% / 16.7% / 16.7%",
};

// 전략별 매수/매도 조건
const STRATEGY_CONDITIONS: Record<StrategyName, { buyThreshold: string; sellThreshold: string }> = {
  Pro1: { buyThreshold: "-0.01%", sellThreshold: "+0.01%" },
  Pro2: { buyThreshold: "-0.01%", sellThreshold: "+1.50%" },
  Pro3: { buyThreshold: "-0.10%", sellThreshold: "+2.00%" },
};

// 전략별 손절일 (추후 UI 확장 시 사용 예정)
// Pro1: 10일, Pro2: 10일, Pro3: 12일

interface ProResultCardProps {
  result: BacktestResult;
  cardNumber: 1 | 2 | 3;
  // Y축 범위 통일을 위한 props (3개 전략 비교용)
  sharedYAxisRange?: {
    assetMax: number; // 자산 Y축 최대값
    mddMin: number; // MDD Y축 최소값 (음수)
  };
}

export default function ProResultCard({ result, cardNumber, sharedYAxisRange }: ProResultCardProps) {
  const strategy = result.strategy;
  const conditions = STRATEGY_CONDITIONS[strategy];

  // MDD 차트 데이터 계산 - 인덱스를 포함하여 고유성 확보
  const chartData = result.dailyHistory.map((d, index) => {
    // 누적 최고 자산
    let peak = result.initialCapital;
    for (let i = 0; i <= index; i++) {
      if (result.dailyHistory[i].totalAsset > peak) {
        peak = result.dailyHistory[i].totalAsset;
      }
    }

    // MDD 계산 (음수 퍼센트)
    const mdd = peak > 0 ? ((d.totalAsset - peak) / peak) * 100 : 0;

    return {
      index, // 고유 인덱스 추가
      date: d.date.slice(5), // MM-DD (표시용)
      fullDate: d.date,
      자산: d.totalAsset,
      MDD: mdd,
    };
  });

  // 잔여 티어 요약 정보 계산
  const remainingTiersSummary = calculateRemainingTiersSummary(result.remainingTiers);

  // 색상 (Pro1: 파랑, Pro2: 초록, Pro3: 보라)
  const colors = {
    1: { primary: "#268bd2", secondary: "#1a6fb5" },
    2: { primary: "#2aa198", secondary: "#1d7872" },
    3: { primary: "#6c71c4", secondary: "#4f5490" },
  };
  const cardColor = colors[cardNumber];

  return (
    <div className="col-12 col-lg-4 mb-4">
      <div className="card bg-dark h-100" style={{ borderColor: cardColor.primary }}>
        {/* 헤더 */}
        <div
          className="card-header text-white text-center"
          style={{ backgroundColor: cardColor.secondary }}
        >
          <strong>{strategy}</strong>
        </div>

        <div className="card-body">
          {/* 분할 비율 */}
          <div className="mb-3">
            <small className="text-muted">분할 비율</small>
            <div style={{ fontSize: "0.85rem" }}>{STRATEGY_RATIOS[strategy]}</div>
          </div>

          {/* 매수/매도 조건 */}
          <div className="row mb-3" style={{ fontSize: "0.85rem" }}>
            <div className="col-6">
              <small className="text-muted d-block">매수 기준</small>
              <span className="price-down">{conditions.buyThreshold}</span>
            </div>
            <div className="col-6">
              <small className="text-muted d-block">매도 기준</small>
              <span className="price-up">{conditions.sellThreshold}</span>
            </div>
          </div>

          <hr className="border-secondary" />

          {/* 백테스트 결과 */}
          <div className="row g-2 mb-3">
            <div className="col-6">
              <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                <small className="text-muted d-block">💰 초기 투자금</small>
                <strong>${result.initialCapital.toLocaleString()}</strong>
              </div>
            </div>
            <div className="col-6">
              <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                <small className="text-muted d-block">💵 최종 자산</small>
                <strong>${result.finalAsset.toLocaleString()}</strong>
              </div>
            </div>
            <div className="col-6">
              <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                <small className="text-muted d-block">📈 수익률</small>
                <strong className={result.returnRate >= 0 ? "price-up" : "price-down"}>
                  {(result.returnRate * 100).toFixed(2)}%
                </strong>
              </div>
            </div>
            <div className="col-6">
              <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                <small className="text-muted d-block">📊 CAGR</small>
                <strong className={result.cagr >= 0 ? "price-up" : "price-down"}>
                  {(result.cagr * 100).toFixed(2)}%
                </strong>
              </div>
            </div>
            <div className="col-12">
              <div className="p-2 rounded" style={{ backgroundColor: "#073642" }}>
                <small className="text-muted d-block">📉 최대 낙폭(MDD)</small>
                <strong className="price-down">{(result.mdd * 100).toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          <hr className="border-secondary" />

          {/* 잔여 티어 정보 */}
          <div className="mb-3">
            <small className="text-muted d-block mb-2">잔여 티어 (보유 주식)</small>
            {result.remainingTiers.length > 0 ? (
              <div className="p-2 rounded" style={{ backgroundColor: "#073642", fontSize: "0.85rem" }}>
                <div className="row g-1">
                  <div className="col-6">
                    <small className="text-muted">보유 티어</small>
                    <div>{result.remainingTiers.map((t) => t.tier).join(", ")}</div>
                  </div>
                  <div className="col-6">
                    <small className="text-muted">전체 수량</small>
                    <div>{remainingTiersSummary.totalShares}주</div>
                  </div>
                  <div className="col-6">
                    <small className="text-muted">평단가</small>
                    <div>${remainingTiersSummary.avgPrice.toFixed(2)}</div>
                  </div>
                  <div className="col-6">
                    <small className="text-muted">현재가</small>
                    <div>${remainingTiersSummary.currentPrice.toFixed(2)}</div>
                  </div>
                  <div className="col-6">
                    <small className="text-muted">수익금</small>
                    <div className={remainingTiersSummary.totalProfitLoss >= 0 ? "price-up" : "price-down"}>
                      ${remainingTiersSummary.totalProfitLoss.toFixed(2)}
                    </div>
                  </div>
                  <div className="col-6">
                    <small className="text-muted">수익률</small>
                    <div className={remainingTiersSummary.returnRate >= 0 ? "price-up" : "price-down"}>
                      {(remainingTiersSummary.returnRate * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted text-center p-2" style={{ backgroundColor: "#073642", borderRadius: "4px" }}>
                손절일 없음 ×
              </div>
            )}
          </div>

          <hr className="border-secondary" />

          {/* 자산 및 MDD 차트 */}
          <div>
            <small className="text-muted d-block mb-2">{strategy} 자산 및 MDD 차트</small>
            <div style={{ height: "180px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#073642" />
                  <XAxis dataKey="index" hide />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    stroke="#93a1a1"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    domain={sharedYAxisRange ? [0, sharedYAxisRange.assetMax] : ["auto", "auto"]}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#ff5370"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={sharedYAxisRange ? [sharedYAxisRange.mddMin, 0] : ["auto", 0]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#002b36",
                      border: "1px solid #073642",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                    }}
                    formatter={(value, name) => {
                      if (value === undefined) return ["N/A", String(name)];
                      if (name === "MDD") return [`${Number(value).toFixed(1)}%`, String(name)];
                      return [`$${Number(value).toLocaleString()}`, String(name)];
                    }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        return payload[0].payload.fullDate;
                      }
                      return label;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="MDD"
                    fill="rgba(255, 83, 112, 0.3)"
                    stroke="#ff5370"
                    strokeWidth={1}
                    name="MDD"
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="자산"
                    stroke={cardColor.primary}
                    strokeWidth={2}
                    dot={false}
                    name="자산"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 잔여 티어 요약 계산 함수
function calculateRemainingTiersSummary(remainingTiers: RemainingTier[]) {
  if (remainingTiers.length === 0) {
    return {
      totalShares: 0,
      totalCost: 0,
      totalValue: 0,
      totalProfitLoss: 0,
      avgPrice: 0,
      currentPrice: 0,
      returnRate: 0,
    };
  }

  const totalShares = remainingTiers.reduce((sum, t) => sum + t.shares, 0);
  const totalCost = remainingTiers.reduce((sum, t) => sum + t.shares * t.buyPrice, 0);
  const totalValue = remainingTiers.reduce((sum, t) => sum + t.currentValue, 0);
  const totalProfitLoss = remainingTiers.reduce((sum, t) => sum + t.profitLoss, 0);
  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
  const currentPrice = remainingTiers[0]?.currentPrice ?? 0;
  const returnRate = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0;

  return {
    totalShares,
    totalCost,
    totalValue,
    totalProfitLoss,
    avgPrice,
    currentPrice,
    returnRate,
  };
}
