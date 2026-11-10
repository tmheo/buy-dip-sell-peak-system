"use client";

/**
 * PROTOTYPE - 버려질 코드. main에 합치지 않는다 (#106).
 * 세 시안이 같이 쓰는 조각: 머리글, 시안 조작판, 보유 현황 표, 감액 구간 막대, 안내 문구.
 */

import type React from "react";
import Link from "next/link";
import { getStrategyParams, RESERVE_TIER_NUMBER } from "@/strategy";
import { DATES, MIN_SEED, OLD_SEED, md, usd } from "./_model";
import type { HoldingRow, Model, Preview, SeedChangeKind } from "./_model";

export function Header(): React.ReactElement {
  return (
    <div className="d-flex align-items-center mb-4">
      <Link href="/trading" className="btn btn-outline-secondary me-3">
        &larr; 목록
      </Link>
      <h2 className="text-light mb-0">계좌 상세</h2>
    </div>
  );
}

// =====================================================
// 시안 조작판 (시안의 일부가 아니다)
// =====================================================

export interface Controls {
  setSeed: (seed: number | null, phase?: string) => void;
  setFlag: (name: "loss" | "fill", on: boolean) => void;
}

const QUICK_SEEDS: Array<{ seed: number; label: string }> = [
  { seed: 12000, label: "+$2,000 증액" },
  { seed: 8000, label: "-$2,000 (예수금 이내)" },
  { seed: 6000, label: "-$4,000 (오늘 매수에 달림)" },
  { seed: 3000, label: "-$7,000 (사이클 끝)" },
];

export function FixturePanel({
  m,
  controls,
}: {
  m: Model;
  controls: Controls;
}): React.ReactElement {
  const { fixture } = m;
  return (
    <div
      className="mb-4 p-2 small"
      style={{
        border: "2px dashed #dc3545",
        borderRadius: 8,
        color: "#ccc",
        background: "rgba(220,53,69,0.06)",
      }}
    >
      <div className="fw-bold text-danger mb-1">PROTOTYPE 조작판 - 화면 시안이 아니다</div>
      <div className="mb-1">
        가상 계좌: SOXL · Pro2 · 시드 {usd(OLD_SEED, 0)} · 1-3번 티어 보유 · 바꾼 날{" "}
        {md(DATES.change)} · 적용일 {md(DATES.apply)}
      </div>
      <div className="d-flex flex-wrap gap-1 align-items-center mb-1">
        <span>저장한 새 시드로 바로 가기:</span>
        {QUICK_SEEDS.map((q) => (
          <button
            key={q.seed}
            type="button"
            className={`btn btn-sm py-0 ${fixture.newSeed === q.seed ? "btn-light" : "btn-outline-light"}`}
            onClick={() =>
              controls.setSeed(q.seed, fixture.phase === "before" ? "pending" : undefined)
            }
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="d-flex flex-wrap gap-3">
        <label className="d-flex align-items-center gap-1">
          <input
            type="checkbox"
            checked={fixture.withLoss}
            onChange={(e) => controls.setFlag("loss", e.target.checked)}
          />
          이번 사이클에 손절 손실 -$310.50
        </label>
        <label className="d-flex align-items-center gap-1">
          <input
            type="checkbox"
            checked={fixture.buyFilled}
            onChange={(e) => controls.setFlag("fill", e.target.checked)}
          />
          바꾼 날의 4번 티어 매수가 체결된다
        </label>
      </div>
    </div>
  );
}

// =====================================================
// 바꾸는 순간의 안내
// =====================================================

export interface ChangeNotice {
  tone: "info" | "success" | "warning" | "danger" | "secondary";
  title: string;
  lines: string[];
}

export function describeChange(
  kind: SeedChangeKind,
  newSeed: number,
  preview: Preview
): ChangeNotice {
  const diff = Math.abs(newSeed - OLD_SEED);
  const buy = preview.todayBuy;
  const applyLine = `새 시드는 ${md(DATES.apply)} 주문표부터 쓰입니다. 오늘 주문표는 지금 시드 ${usd(OLD_SEED, 0)} 그대로입니다.`;
  switch (kind) {
    case "invalid":
      return { tone: "danger", title: `시드는 ${usd(MIN_SEED, 0)} 이상이어야 합니다.`, lines: [] };
    case "same":
      return { tone: "secondary", title: "지금 시드와 같습니다.", lines: [] };
    case "increase":
      return {
        tone: "info",
        title: `${usd(diff, 0)}를 늘립니다`,
        lines: [`증권사 계좌에 ${usd(diff, 0)}를 입금하세요. 입금은 언제 해도 됩니다.`, applyLine],
      };
    case "keep":
      return {
        tone: "success",
        title: `${usd(diff, 0)}를 줄입니다 - 사이클은 이어집니다`,
        lines: [
          `${usd(diff, 0)} 출금은 오늘 주문이 체결된 뒤, ${md(DATES.apply)} 아침 9시 이후에 하세요. 그 전에 빼면 오늘 매수에 쓸 돈이 모자랄 수 있습니다.`,
          applyLine,
        ],
      };
    case "depends":
      return {
        tone: "warning",
        title: `${usd(diff, 0)}를 줄입니다 - 오늘 매수가 체결되면 사이클이 끝납니다`,
        lines: [
          `오늘 ${buy?.tier}번 티어 매수(최대 ${usd(buy?.maxCost ?? 0)})가 체결되면 예수금이 약 ${usd(preview.cashIfBuyFills)}로 줄어 감액이 예수금보다 커집니다.`,
          `그러면 ${md(DATES.apply)}에 매수 없이 보유 티어를 모두 MOC로 팔고 사이클이 끝납니다. 체결되지 않으면 사이클은 이어집니다.`,
          `어느 쪽인지는 ${md(DATES.apply)} 아침 주문표에서 확정됩니다. 출금은 그때 안내합니다.`,
        ],
      };
    case "ends":
      return {
        tone: "danger",
        title: `${usd(diff, 0)}를 줄입니다 - 사이클이 끝납니다`,
        lines: [
          `감액이 지금 예수금 ${usd(preview.closedCash)}보다 큽니다.`,
          `${md(DATES.apply)}에 매수 없이 보유 티어를 모두 MOC로 팔고 사이클이 끝납니다. 다음 사이클은 ${md(DATES.next)}부터 새 시드 ${usd(newSeed, 0)}로 시작합니다.`,
          `출금은 매도가 체결된 뒤(${md(DATES.next)} 아침 이후)에 합니다. 금액은 매도 가격에 달려 있어 그때 알려 드립니다.`,
        ],
      };
  }
}

/** 감액이 어느 구간인지 보이는 막대 (줄이는 금액 0부터 최소 시드까지) */
export function CutZoneBar({
  preview,
  newSeed,
}: {
  preview: Preview;
  newSeed: number;
}): React.ReactElement {
  const max = OLD_SEED - MIN_SEED;
  const pct = (v: number): number => Math.min(100, Math.max(0, (v / max) * 100));
  const keep = pct(preview.cashIfBuyFills);
  const depends = pct(preview.closedCash) - keep;
  const cut = OLD_SEED - newSeed;
  return (
    <div className="mb-2">
      <div className="position-relative" style={{ height: 14 }}>
        <div className="d-flex h-100 rounded overflow-hidden">
          <div className="bg-success" style={{ width: `${keep}%` }} />
          <div className="bg-warning" style={{ width: `${depends}%` }} />
          <div className="bg-danger flex-grow-1" />
        </div>
        {cut > 0 && (
          <div
            className="position-absolute top-0 h-100"
            style={{
              left: `calc(${pct(cut)}% - 2px)`,
              width: 4,
              background: "#fff",
              boxShadow: "0 0 0 1px #000",
            }}
          />
        )}
      </div>
      <div className="d-flex justify-content-between small text-secondary mt-1 flex-wrap gap-1">
        <span>
          <span className="text-success">■</span> {usd(preview.cashIfBuyFills, 0)}까지 이어감
        </span>
        <span>
          <span className="text-warning">■</span> {usd(preview.closedCash, 0)}까지 오늘 매수에 달림
        </span>
        <span>
          <span className="text-danger">■</span> 그 이상 사이클 끝
        </span>
      </div>
    </div>
  );
}

// =====================================================
// 보유 현황
// =====================================================

/**
 * 보유 중인 기본 티어의 할당 시드를 무엇으로 보일지:
 * - dash: 비운다 (산 금액은 매수시드 열에 있다)
 * - current: 지금 시드 × 비율 (지금 화면 그대로). 다른 시드로 산 티어에 표시를 붙인다
 * - buyTime: 매수할 때 적용된 시드 × 비율 (시드 이력에서 찾는다)
 */
export type HeldSeedMode = "dash" | "current" | "buyTime";

function fmtDate(date: string | null): string {
  if (!date) return "-";
  const [, m, d] = date.split("-");
  return `${m}.${d}`;
}

export function HoldingsTable({
  m,
  mode,
  footer,
}: {
  m: Model;
  mode: HeldSeedMode;
  footer?: React.ReactNode;
}): React.ReactElement {
  const ratios = getStrategyParams(m.account.strategy).tierRatios;
  const byTier = new Map<number, HoldingRow>(m.holdings.map((h) => [h.tier, h]));
  const rows = m.cash.tiers.map((t) => {
    const h = byTier.get(t.tier);
    const isReserve = t.tier === RESERVE_TIER_NUMBER;
    const ratio = isReserve ? 0 : ratios[t.tier - 1];
    let allocated: number | null = t.amount;
    let otherSeed = false;
    // 모두 파는 날에는 아무것도 사지 않는다 - 안 산 티어의 축소 표시는 틀린 말이 된다
    if (!h && m.isSellAllDay) allocated = null;
    if (h && !isReserve) {
      otherSeed = h.seedAtBuy !== m.appliedSeed;
      if (mode === "dash") allocated = null;
      if (mode === "buyTime") allocated = Math.floor(h.seedAtBuy * ratio * 100) / 100;
    }
    return { t, h, isReserve, ratio, allocated, otherSeed };
  });
  const sellAll = m.isSellAllDay;

  const allocatedCell = (r: (typeof rows)[number]): React.ReactNode => {
    if (r.allocated === null) return <span className="text-secondary">-</span>;
    if (r.t.isReduced && !r.h && !sellAll) {
      return (
        <>
          <s className="text-secondary me-2">{usd(r.t.nominalAmount ?? 0)}</s>
          <span className="text-warning">{usd(r.allocated)}</span>
        </>
      );
    }
    return usd(r.allocated);
  };

  const rowBadge = (r: (typeof rows)[number]): React.ReactNode => {
    if (sellAll && r.h) return <span className="badge bg-danger fw-normal">오늘 모두 매도</span>;
    if (mode === "current" && r.h && r.otherSeed)
      return (
        <span className="badge border border-info text-info fw-normal">
          시드 {usd(r.h.seedAtBuy, 0)}일 때 매수
        </span>
      );
    if (r.t.isReduced && !r.h && !sellAll)
      return <span className="badge bg-warning text-dark fw-normal">예수금 부족으로 축소</span>;
    return null;
  };

  return (
    <div className="card bg-dark border-secondary mb-4">
      <div className="card-header border-secondary">
        <h5 className="mb-0 text-light">보유 현황</h5>
      </div>
      <div className="card-body p-0">
        <div className="trading-desktop-table">
          <div className="table-responsive">
            <table className="table table-dark table-striped table-hover align-middle mb-0">
              <thead className="text-nowrap">
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
                {rows.map((r) => {
                  const badge = rowBadge(r);
                  return (
                    <tr key={r.t.tier} className={r.h ? "table-active" : ""}>
                      <td className="text-center">
                        <span className={r.h ? "badge bg-success" : "badge bg-secondary"}>
                          {r.isReserve ? "예비" : r.t.tier}
                        </span>
                      </td>
                      <td className="text-center">
                        {r.isReserve ? "-" : `${(r.ratio * 100).toFixed(1)}%`}
                      </td>
                      <td className="text-end">
                        {allocatedCell(r)}
                        {badge && <div className="mt-1">{badge}</div>}
                      </td>
                      <td className="text-center">{fmtDate(r.h?.buyDate ?? null)}</td>
                      <td className="text-end">
                        {r.h?.buyPrice ? usd(r.h.buyPrice * r.h.shares) : "-"}
                      </td>
                      <td className="text-end">{r.h?.buyPrice ? usd(r.h.buyPrice) : "-"}</td>
                      <td className="text-end">
                        {r.h ? <span className="text-success">{r.h.shares}</span> : "-"}
                      </td>
                      <td className="text-end">
                        {sellAll && r.h ? (
                          <span className="text-danger">MOC</span>
                        ) : r.h?.sellTargetPrice ? (
                          usd(r.h.sellTargetPrice)
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="trading-mobile-card p-2">
          {rows.map((r) => {
            const badge = rowBadge(r);
            return (
              <div
                key={r.t.tier}
                className={`card mb-2 bg-dark ${r.h ? "border-success" : "border-secondary"}`}
              >
                <div className="card-body py-2 px-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className={`tier-badge ${r.h ? "active" : "inactive"}`}>
                      {r.isReserve ? "예비" : r.t.tier}
                    </span>
                    <span className="small text-secondary">
                      {r.isReserve ? "예비" : `${(r.ratio * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between gap-2 small text-secondary">
                    <span>매수시드: {r.h?.buyPrice ? usd(r.h.buyPrice * r.h.shares) : "-"}</span>
                    <span>
                      수량: {r.h ? <span className="text-success">{r.h.shares}</span> : "-"}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between gap-2 small text-secondary">
                    <span>할당: {allocatedCell(r)}</span>
                    <span>매수일: {fmtDate(r.h?.buyDate ?? null)}</span>
                  </div>
                  {badge && <div className="mt-1">{badge}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {footer && (
        <div className="card-footer border-secondary">
          <small className="text-secondary" style={{ wordBreak: "keep-all" }}>
            {footer}
          </small>
        </div>
      )}
    </div>
  );
}

/** 잠긴 설정 칸의 표시 */
export function LockedTag(): React.ReactElement {
  return (
    <span
      className="badge border border-secondary text-secondary fw-normal ms-1"
      style={{ fontSize: "0.7rem" }}
    >
      사이클 중 잠김
    </span>
  );
}

/** 모두 파는 날의 예수금·계좌 현금 설명 */
export function sellAllCashText(m: Model): string {
  return (
    `새 시드 ${usd(m.appliedSeed, 0)}에서 아직 팔지 않은 투자 중 ${usd(m.cash.investedAmount)}를 빼서 ` +
    `계좌 현금이 ${usd(m.cash.accountCash)}, 예수금이 $0입니다. 오늘 매도가 체결되면 사이클이 끝나고 다시 맞춰집니다.`
  );
}

/** 사이클을 끝내는 감액의 출금 계산 줄 */
export function WithdrawalBreakdown({ m }: { m: Model }): React.ReactElement | null {
  const e = m.endedBySeedCut;
  if (!e) return null;
  const rows: Array<[string, string, string?]> = [
    ["옛 시드", usd(OLD_SEED)],
    [
      "+ 사이클 " + e.cycleNumber + " 실현손익",
      usd(e.realizedPnl),
      e.realizedPnl < 0 ? "text-danger" : "text-success",
    ],
    ["= 지금 증권사에 있어야 할 현금", usd(e.brokerCash)],
    ["− 새 시드", usd(m.appliedSeed)],
  ];
  return (
    <div className="small bg-dark rounded p-2" style={{ maxWidth: 380 }}>
      {rows.map(([label, value, cls]) => (
        <div key={label} className="d-flex justify-content-between gap-2">
          <span className="text-secondary">{label}</span>
          <span className={cls ?? "text-light"}>{value}</span>
        </div>
      ))}
      <div className="d-flex justify-content-between gap-2 border-top border-secondary mt-1 pt-1">
        <span className="text-secondary">
          = {e.withdrawal >= 0 ? "출금할 금액" : "입금할 금액"}
        </span>
        <span className="text-light fw-bold">{usd(Math.abs(e.withdrawal))}</span>
      </div>
    </div>
  );
}
