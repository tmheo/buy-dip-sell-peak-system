"use client";

/**
 * PROTOTYPE - 버려질 코드. main에 합치지 않는다 (#93 예수금 감소의 화면 표시).
 *
 * 질문: 순실현손실 때문에 예수금이 줄었을 때, 그 이유를 계좌 상세 화면에서 어떻게 보여 줄까?
 * 시안 다섯 개를 ?variant= 로, 계좌 상태 세 개를 ?scenario= 로 바꿔 본다.
 *
 * 예수금은 ADR-0003의 새 규칙으로 계산한다:
 *   예수금 = max(0, min(시드 - Σ 티어 매수금액, 계좌 현금))
 *   계좌 현금 = 시드 - Σ 티어 매수금액 + Σ 이번 사이클 실현손익
 */

import type React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AccountSettingsCard from "@/components/trading/AccountSettingsCard";
import AssetSummary from "@/components/trading/AssetSummary";
import InvestmentRatioBar from "@/components/trading/InvestmentRatioBar";
import TierHoldingsTable from "@/components/trading/TierHoldingsTable";
import DailyOrdersTable from "@/components/trading/DailyOrdersTable";
import PrototypeSwitcher from "@/components/PrototypeSwitcher";
import { getStrategyParams, calculateSellLimitPrice } from "@/strategy";
import { calculateBuyLimitPrice, calculateBuyQuantity } from "@/strategy/calculations";
import type { TierHolding, DailyOrder, TradingAccountWithHoldings } from "@/types/trading";

// =====================================================
// 가상 계좌 (Pro2, 시드 $10,000, 1-5번 티어 보유, 다음 매수는 6번 티어)
// =====================================================

const SEED = 10000;
const STRATEGY = "Pro2" as const;
const TODAY = "2026-11-09";
const PREV_CLOSE = 28.9;
const params = getStrategyParams(STRATEGY);

const HELD: Array<{ tier: number; buyPrice: number; shares: number; buyDate: string }> = [
  { tier: 1, buyPrice: 29.8, shares: 33, buyDate: "2026-11-05" },
  { tier: 2, buyPrice: 34.1, shares: 43, buyDate: "2026-10-28" },
  { tier: 3, buyPrice: 33.05, shares: 60, buyDate: "2026-10-29" },
  { tier: 4, buyPrice: 32.4, shares: 77, buyDate: "2026-10-30" },
  { tier: 5, buyPrice: 31.75, shares: 62, buyDate: "2026-11-02" },
];

interface Realized {
  tier: number;
  method: "LOC" | "MOC";
  pnl: number;
}

const SCENARIOS: Record<string, { name: string; realized: Realized[] }> = {
  reduced: {
    name: "손절 1회",
    realized: [
      { tier: 1, method: "LOC", pnl: 14.82 },
      { tier: 1, method: "MOC", pnl: -310.5 },
    ],
  },
  zero: {
    name: "손절 3회",
    realized: [
      { tier: 1, method: "LOC", pnl: 14.82 },
      { tier: 1, method: "MOC", pnl: -310.5 },
      { tier: 2, method: "MOC", pnl: -420.3 },
      { tier: 3, method: "MOC", pnl: -375.62 },
    ],
  },
  profit: {
    name: "수익만",
    realized: [{ tier: 1, method: "LOC", pnl: 14.82 }],
  },
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function buildModel(scenarioKey: string) {
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.reduced;
  const holdings: TierHolding[] = HELD.map((h) => ({
    id: `h${h.tier}`,
    accountId: "proto",
    tier: h.tier,
    buyPrice: h.buyPrice,
    shares: h.shares,
    buyDate: h.buyDate,
    sellTargetPrice: calculateSellLimitPrice(h.buyPrice, params.sellThreshold),
    createdAt: TODAY,
    updatedAt: TODAY,
  }));
  const invested = round2(HELD.reduce((s, h) => s + h.buyPrice * h.shares, 0));
  const uninvested = round2(SEED - invested);
  const netRealized = round2(scenario.realized.reduce((s, r) => s + r.pnl, 0));
  const netLoss = netRealized < 0 ? -netRealized : 0;
  const accountCash = round2(uninvested + netRealized);
  const available = Math.max(0, Math.min(uninvested, accountCash));
  const reduction = round2(uninvested - available);

  const nextTier = 6;
  const nominalAmount = round2(SEED * params.tierRatios[nextTier - 1]);
  const buyAmount = Math.min(nominalAmount, available);
  const buyLimit = calculateBuyLimitPrice(PREV_CLOSE, params.buyThreshold);
  const buyShares = calculateBuyQuantity(buyAmount, buyLimit);
  const nominalShares = calculateBuyQuantity(nominalAmount, buyLimit);

  const orders: DailyOrder[] = holdings.map((h) => ({
    id: `s${h.tier}`,
    accountId: "proto",
    date: TODAY,
    tier: h.tier,
    type: "SELL",
    orderMethod: "LOC",
    limitPrice: h.sellTargetPrice ?? 0,
    shares: h.shares,
    executed: false,
    createdAt: TODAY,
    updatedAt: TODAY,
  }));
  if (buyShares > 0) {
    orders.unshift({
      id: "b6",
      accountId: "proto",
      date: TODAY,
      tier: nextTier,
      type: "BUY",
      orderMethod: "LOC",
      limitPrice: buyLimit,
      shares: buyShares,
      executed: false,
      createdAt: TODAY,
      updatedAt: TODAY,
    });
  }

  const account: TradingAccountWithHoldings = {
    id: "proto",
    userId: "proto",
    name: "프로토타입 계좌",
    ticker: "SOXL",
    seedCapital: SEED,
    strategy: STRATEGY,
    cycleStartDate: "2026-10-01",
    cycleNumber: 3,
    lastProcessedDate: "2026-11-06",
    lastViewedAt: TODAY,
    createdAt: TODAY,
    updatedAt: TODAY,
    holdings,
    totalShares: HELD.reduce((s, h) => s + h.shares, 0),
    isCycleInProgress: true,
  };

  return {
    account,
    orders,
    realized: scenario.realized,
    invested,
    uninvested,
    netRealized,
    netLoss,
    accountCash,
    available,
    reduction,
    isReduced: reduction > 0,
    nextTier,
    nominalAmount,
    buyAmount,
    buyLimit,
    buyShares,
    nominalShares,
  };
}

type Model = ReturnType<typeof buildModel>;

// =====================================================
// 공통 조각
// =====================================================

function usd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function Header(): React.ReactElement {
  return (
    <div className="d-flex align-items-center mb-4">
      <Link href="/trading" className="btn btn-outline-secondary me-3">
        &larr; 목록
      </Link>
      <h2 className="text-light mb-0">계좌 상세</h2>
    </div>
  );
}

function Settings({ m }: { m: Model }): React.ReactElement {
  return <AccountSettingsCard account={m.account} onSave={async () => {}} isSaving={false} />;
}

function Tile({
  label,
  children,
  className = "col-md-6 col-lg-4",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={className}>
      <div className="p-3 bg-secondary bg-opacity-25 rounded h-100">
        <div className="text-secondary small mb-1">{label}</div>
        {children}
      </div>
    </div>
  );
}

/** 자산 현황 카드. 예수금 칸만 시안별로 갈아 끼운다. 총자산은 계좌 현금 + 평가금으로 고쳐 그린다. */
function AssetCard({ m, cashTile }: { m: Model; cashTile: React.ReactNode }): React.ReactElement {
  const total = m.accountCash + m.invested;
  const cashRatio = total > 0 ? (m.accountCash / total) * 100 : 100;
  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">자산 현황</h5>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <Tile label="총자산">
            <div className="h4 mb-0 text-light">{usd(total)}</div>
          </Tile>
          <Tile label="SOXL 수량">
            <div className="h4 mb-0 text-light">{m.account.totalShares.toLocaleString()} 주</div>
          </Tile>
          <Tile label="SOXL 평가금">
            <div className="h4 mb-0 text-light">
              {usd(m.invested)}
              <span className="ms-2 small text-success">(+0.00%)</span>
            </div>
          </Tile>
          {cashTile}
          <Tile label="투자비중">
            <InvestmentRatioBar cashRatio={cashRatio} stockRatio={100 - cashRatio} />
          </Tile>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// 시안 0: 지금 화면 그대로 (설명 없음, 비교 기준)
// =====================================================

function Variant0({ m }: { m: Model }): React.ReactElement {
  return (
    <>
      <Header />
      <Settings m={m} />
      {/* 지금 화면은 예수금을 서버 규칙이 아니라 "시드 - 투자 중"으로 직접 계산한다 (_client.tsx calculateAssetValues) */}
      <AssetSummary
        totalAssets={SEED}
        totalShares={m.account.totalShares}
        stockValue={m.invested}
        cashBalance={m.uninvested}
        profitRate={0}
        ticker="SOXL"
      />
      <TierHoldingsTable
        holdings={m.account.holdings}
        seedCapital={SEED}
        strategy={STRATEGY}
        cashBalance={m.uninvested}
      />
      <DailyOrdersTable orders={m.orders} ticker="SOXL" date={TODAY} />
    </>
  );
}

// =====================================================
// 시안 A: 예수금 칸에 계산식을 펼쳐 보인다
// =====================================================

function VariantA({ m }: { m: Model }): React.ReactElement {
  const row = (label: string, value: string, cls = "text-light") => (
    <div className="d-flex justify-content-between small">
      <span className="text-secondary">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
  const cashTile = (
    <Tile label="예수금" className="col-md-6 col-lg-4">
      <div className="h4 mb-2 text-light">{usd(m.available)}</div>
      {m.isReduced && (
        <div className="border-top border-secondary pt-2">
          {row("시드", usd(SEED))}
          {row("− 투자 중", usd(m.invested))}
          {row("− 이번 사이클 순실현손실", usd(m.reduction), "text-danger")}
          <div className="border-top border-secondary mt-1 pt-1">
            {row("= 예수금", usd(m.available))}
          </div>
        </div>
      )}
    </Tile>
  );
  return (
    <>
      <Header />
      <Settings m={m} />
      <AssetCard m={m} cashTile={cashTile} />
      <TierHoldingsTable
        holdings={m.account.holdings}
        seedCapital={SEED}
        strategy={STRATEGY}
        cashBalance={m.available}
      />
      <DailyOrdersTable orders={m.orders} ticker="SOXL" date={TODAY} />
    </>
  );
}

// =====================================================
// 시안 B: 순실현손실이 있을 때만 안내 문구를 띄운다
// =====================================================

function VariantB({ m }: { m: Model }): React.ReactElement {
  const cashTile = (
    <Tile label="예수금">
      <div className="h4 mb-0 text-light">{usd(m.available)}</div>
    </Tile>
  );
  return (
    <>
      <Header />
      <Settings m={m} />
      {m.isReduced && (
        <div className="alert alert-warning mb-4" role="alert">
          <div className="fw-bold mb-1">
            이번 사이클의 실현 손실 {usd(m.reduction)}만큼 예수금이 줄었습니다.
          </div>
          <div className="small">
            손절로 생긴 손실은 사이클이 끝날 때까지 메우지 않으므로, 계좌에 남은 현금{" "}
            {usd(m.available)}까지만 매수합니다.{" "}
            {m.buyShares > 0
              ? `${m.nextTier}번 티어는 비율대로라면 ${usd(m.nominalAmount)}(${m.nominalShares}주)이지만 오늘은 ${usd(m.buyAmount)}(${m.buyShares}주)만 주문합니다.`
              : `${m.nextTier}번 티어는 살 수 있는 금액이 1주 가격보다 작아 오늘 매수 주문이 없습니다.`}{" "}
            예비 티어는 매수하지 않습니다.
          </div>
        </div>
      )}
      <AssetCard m={m} cashTile={cashTile} />
      <TierHoldingsTable
        holdings={m.account.holdings}
        seedCapital={SEED}
        strategy={STRATEGY}
        cashBalance={m.available}
      />
      <DailyOrdersTable orders={m.orders} ticker="SOXL" date={TODAY} />
    </>
  );
}

// =====================================================
// 시안 C: 티어 표와 주문표에서 줄어든 티어를 직접 표시한다
// =====================================================

function ReducedTierTable({ m }: { m: Model }): React.ReactElement {
  const byTier = new Map(m.account.holdings.map((h) => [h.tier, h]));
  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">보유 현황</h5>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover mb-0">
            <thead>
              <tr>
                <th className="text-center">티어</th>
                <th className="text-center">비율</th>
                <th className="text-end">할당 시드</th>
                <th className="text-center">매수일</th>
                <th className="text-end">매수시드</th>
                <th className="text-end">매수가격</th>
                <th className="text-end">수량</th>
                <th className="text-end">매도목표</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }, (_, i) => i + 1).map((tier) => {
                const h = byTier.get(tier);
                const isReserve = tier === 7;
                const nominal = isReserve ? 0 : SEED * params.tierRatios[tier - 1];
                const isNext = tier === m.nextTier;
                const reduced = isNext && m.isReduced && m.buyAmount < nominal;
                return (
                  <tr key={tier} className={h ? "table-active" : ""}>
                    <td className="text-center">
                      <span className={h ? "badge bg-success" : "badge bg-secondary"}>
                        {isReserve ? "예비" : tier}
                      </span>
                    </td>
                    <td className="text-center">
                      {isReserve ? "-" : `${(params.tierRatios[tier - 1] * 100).toFixed(1)}%`}
                    </td>
                    <td className="text-end">
                      {reduced ? (
                        <>
                          <s className="text-secondary me-2">{usd(nominal)}</s>
                          <span className="text-warning">{usd(m.buyAmount)}</span>
                          <div>
                            <span
                              className="badge bg-warning text-dark"
                              title={`이번 사이클 순실현손실 ${usd(m.reduction)}만큼 예수금이 줄었습니다`}
                            >
                              예수금 부족으로 축소
                            </span>
                          </div>
                        </>
                      ) : (
                        usd(nominal)
                      )}
                    </td>
                    <td className="text-center">
                      {h?.buyDate ? h.buyDate.replaceAll("-", ". ") + "." : "-"}
                    </td>
                    <td className="text-end">
                      {h && h.buyPrice ? usd(h.buyPrice * h.shares) : "-"}
                    </td>
                    <td className="text-end">{h?.buyPrice ? usd(h.buyPrice) : "-"}</td>
                    <td className="text-end">
                      {h ? <span className="text-success">{h.shares}</span> : "-"}
                    </td>
                    <td className="text-end">
                      {h?.sellTargetPrice ? usd(h.sellTargetPrice) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {m.isReduced && (
        <div className="card-footer border-secondary">
          <small className="text-secondary">
            * 이번 사이클 순실현손실 {usd(m.reduction)}만큼 예수금이 줄어, 다음에 사는 티어가
            비율보다 적게 삽니다.
          </small>
        </div>
      )}
    </div>
  );
}

function AnnotatedOrders({ m }: { m: Model }): React.ReactElement {
  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary d-flex justify-content-between align-items-center">
        <h5 className="mb-0 text-light">오늘의 주문표</h5>
        <small className="text-secondary">2026년 11월 9일</small>
      </div>
      <div className="card-body p-0">
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
            {m.isReduced && m.buyShares === 0 && (
              <tr>
                <td className="text-center">SOXL</td>
                <td className="text-center">
                  <span className="badge bg-secondary">{m.nextTier}</span>
                </td>
                <td className="text-center">
                  <span className="badge trading-buy">매수</span>
                </td>
                <td className="text-center text-secondary" colSpan={3}>
                  예수금 {usd(m.available)}로는 1주도 살 수 없어 주문하지 않습니다
                </td>
              </tr>
            )}
            {m.orders.map((o) => (
              <tr key={o.id}>
                <td className="text-center">SOXL</td>
                <td className="text-center">
                  <span className="badge bg-secondary">{o.tier}</span>
                </td>
                <td className="text-center">
                  <span className={`badge ${o.type === "BUY" ? "trading-buy" : "trading-sell"}`}>
                    {o.type === "BUY" ? "매수" : "매도"}
                  </span>
                </td>
                <td className="text-center">
                  <span className="badge bg-info">{o.orderMethod}</span>
                </td>
                <td className="text-end">{usd(o.limitPrice)}</td>
                <td className="text-end">
                  {o.type === "BUY" && m.isReduced && m.buyShares < m.nominalShares ? (
                    <>
                      <s className="text-secondary me-2">{m.nominalShares}</s>
                      <span className="text-warning">{o.shares}</span>
                    </>
                  ) : (
                    o.shares
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-footer border-secondary">
        <small className="text-secondary">* 주문표는 매일 AM 9시~10시에 갱신됩니다.</small>
      </div>
    </div>
  );
}

function VariantC({ m }: { m: Model }): React.ReactElement {
  const cashTile = (
    <Tile label="예수금">
      <div className="h4 mb-0 text-light">{usd(m.available)}</div>
    </Tile>
  );
  return (
    <>
      <Header />
      <Settings m={m} />
      <AssetCard m={m} cashTile={cashTile} />
      <ReducedTierTable m={m} />
      <AnnotatedOrders m={m} />
    </>
  );
}

// =====================================================
// 시안 D: 예수금을 "두 금액 중 작은 쪽"으로 보인다 (규칙의 min을 그대로)
// =====================================================

function VariantD({ m }: { m: Model }): React.ReactElement {
  const line = (label: string, sub: string, value: number, chosen: boolean) => (
    <div
      className={`d-flex justify-content-between align-items-baseline px-2 py-1 rounded ${
        chosen ? "bg-info bg-opacity-25" : ""
      }`}
    >
      <span>
        <span className={chosen ? "text-light" : "text-secondary"}>{label}</span>
        <span className="text-secondary small ms-1">{sub}</span>
      </span>
      <span className={chosen ? "text-light fw-bold" : "text-secondary"}>{usd(value)}</span>
    </div>
  );
  const cashChosen = m.accountCash < m.uninvested;
  const cashTile = (
    <Tile label="예수금 (두 금액 중 작은 쪽)" className="col-md-12 col-lg-4">
      <div className="h4 mb-2 text-light">{usd(m.available)}</div>
      {line("아직 안 산 시드", "(시드 − 투자 중)", m.uninvested, !cashChosen)}
      {line(
        "계좌 현금",
        `(실현손익 ${m.netRealized >= 0 ? "+" : "−"}${usd(Math.abs(m.netRealized))} 반영)`,
        m.accountCash,
        cashChosen
      )}
    </Tile>
  );
  return (
    <>
      <Header />
      <Settings m={m} />
      <AssetCard m={m} cashTile={cashTile} />
      <TierHoldingsTable
        holdings={m.account.holdings}
        seedCapital={SEED}
        strategy={STRATEGY}
        cashBalance={m.available}
      />
      <DailyOrdersTable orders={m.orders} ticker="SOXL" date={TODAY} />
    </>
  );
}

// =====================================================
// 전환
// =====================================================

const VARIANTS = [
  { key: "0", name: "지금 화면", Component: Variant0 },
  { key: "A", name: "계산식", Component: VariantA },
  { key: "B", name: "안내 문구", Component: VariantB },
  { key: "C", name: "티어 표 표시", Component: VariantC },
  { key: "D", name: "두 금액 비교", Component: VariantD },
];

export default function PrototypeClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const variantKey = searchParams.get("variant") ?? "0";
  const scenarioKey = searchParams.get("scenario") ?? "reduced";
  const m = buildModel(scenarioKey);
  const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0];
  const { Component } = variant;

  return (
    <div className="container py-4" style={{ paddingBottom: 96 }}>
      <Component m={m} />
      <div className="small text-secondary font-monospace mb-5">
        [상태] 시드 {usd(SEED)} · 투자 중 {usd(m.invested)} · 아직 안 산 시드 {usd(m.uninvested)} ·
        이번 사이클 실현손익 {usd(m.netRealized)} · 계좌 현금 {usd(m.accountCash)} · 예수금{" "}
        {usd(m.available)} · 6번 티어 {usd(m.buyAmount)} / {m.buyShares}주 (비율대로면{" "}
        {m.nominalShares}주)
      </div>
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant.key}
        scenarios={Object.entries(SCENARIOS).map(([key, s]) => ({ key, name: s.name }))}
        currentScenario={scenarioKey}
      />
    </div>
  );
}
