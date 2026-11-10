"use client";

/**
 * PROTOTYPE - 버려질 코드. main에 합치지 않는다 (#106).
 *
 * A 설정 카드 안에서: 지금의 설정 변경 흐름을 그대로 두고 사이클 중에는 시드 칸만 열린다.
 *   안내와 감액 구간 막대가 입력 바로 아래 붙는다. 적용 전 변경은 시드 칸에 "→ 새 시드"로 보인다.
 *   보유 티어의 할당 시드는 비운다.
 * B 입출금 대화상자: "입금/출금"으로 묻고, 바뀌는 것을 전후 표로 보인 뒤 확인한다.
 *   적용 전 변경과 그 뒤의 안내는 화면 맨 위 띠 하나가 맡는다. 보유 티어는 지금 시드 × 비율에 표시를 붙인다.
 * C 시드 이력 카드: 시드를 따로 떼어 적용일이 붙은 이력 표로 관리한다. 예약·덮어쓰기·취소·출금 안내가
 *   모두 이력의 한 줄이다. 보유 티어는 매수할 때 적용된 시드 × 비율로 보인다.
 */

import type React from "react";
import { useState } from "react";
import AssetSummary from "@/components/trading/AssetSummary";
import DailyOrdersTable from "@/components/trading/DailyOrdersTable";
import { calculateAssetValues } from "@/components/trading/asset-values";
import { getStrategyParams } from "@/strategy";
import { DATES, MIN_SEED, OLD_SEED, classify, md, usd } from "./_model";
import type { Model } from "./_model";
import {
  CutZoneBar,
  HoldingsTable,
  LockedTag,
  WithdrawalBreakdown,
  describeChange,
  sellAllCashText,
} from "./_shared";
import type { Controls } from "./_shared";

interface VariantProps {
  m: Model;
  controls: Controls;
}

function Assets({ m }: { m: Model }): React.ReactElement {
  const values = calculateAssetValues(m.account.totalShares, m.cash, m.latestClose);
  return (
    <AssetSummary
      ticker={m.account.ticker}
      totalShares={m.account.totalShares}
      values={values}
      cash={m.cash}
      priceDate={m.latestClose.date}
    />
  );
}

function Orders({ m }: { m: Model }): React.ReactElement {
  return (
    <DailyOrdersTable
      orders={m.orders}
      ticker={m.account.ticker}
      date={m.date}
      unaffordableBuy={m.unaffordableBuy}
      reducedBuy={m.reducedBuy}
    />
  );
}

function StaticField({
  label,
  locked,
  children,
}: {
  label: string;
  locked?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="col-md-6 col-lg-4">
      <div className="text-secondary small mb-1">
        {label}
        {locked && <LockedTag />}
      </div>
      <div className="text-light">{children}</div>
    </div>
  );
}

function SeedInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <input
      type="number"
      inputMode="numeric"
      className="form-control form-control-sm bg-dark text-light border-secondary"
      value={value}
      min={MIN_SEED}
      step={1}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const TONE_TEXT: Record<string, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  secondary: "text-secondary",
};

// =====================================================
// 시안 A: 설정 카드 안에서
// =====================================================

export function VariantA({ m, controls }: VariantProps): React.ReactElement {
  const inCycle = m.account.isCycleInProgress;
  const editable = m.fixture.phase === "before" || m.fixture.phase === "pending";
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(m.pending?.seed ?? OLD_SEED));
  const [confirmed, setConfirmed] = useState(false);
  const newSeed = Number(input);
  const kind = classify(newSeed, m.preview);
  const notice = describeChange(kind, newSeed, m.preview);
  const risky = kind === "ends" || kind === "depends";
  const canSave = kind !== "invalid" && kind !== "same" && (!risky || confirmed);

  const save = (): void => {
    setEditing(false);
    setConfirmed(false);
    controls.setSeed(newSeed, "pending");
  };

  const seedCell = (): React.ReactNode => {
    if (m.pending) {
      return (
        <>
          <span className="text-secondary">{usd(OLD_SEED, 0)}</span>
          <span className="mx-2">→</span>
          <span className="text-warning fw-bold">{usd(m.pending.seed, 0)}</span>
          <div className="small text-secondary">{md(m.pending.effectiveDate)} 주문표부터</div>
          <div className="mt-1 d-flex gap-2">
            <button
              type="button"
              className="btn btn-link btn-sm p-0"
              onClick={() => setEditing(true)}
            >
              다시 바꾸기
            </button>
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-secondary"
              onClick={() => controls.setSeed(null, "before")}
            >
              되돌리기
            </button>
          </div>
        </>
      );
    }
    return (
      <>
        {usd(m.appliedSeed, 0)}
        {m.appliedSeed !== OLD_SEED && (
          <div className="small text-secondary">{md(DATES.apply)}부터</div>
        )}
      </>
    );
  };

  const pendingNotice = m.pending
    ? describeChange(classify(m.pending.seed, m.preview), m.pending.seed, m.preview)
    : null;
  const cut = OLD_SEED - m.appliedSeed;

  return (
    <>
      <div className="card bg-dark border-secondary mb-4">
        <div className="card-header border-secondary d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <h5 className="mb-0 text-light">{m.account.name}</h5>
          <div className="d-flex align-items-center gap-2">
            {m.isSellAllDay ? (
              <span className="badge bg-danger">사이클 종료 매도일</span>
            ) : (
              inCycle && <span className="badge bg-warning text-dark">사이클 진행 중</span>
            )}
            {editable && !editing && !m.pending && (
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => setEditing(true)}
              >
                {inCycle ? "시드 변경" : "설정 변경"}
              </button>
            )}
          </div>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <StaticField label="종목(Ticker)" locked={editing}>
              <span className="badge bg-info">{m.account.ticker}</span>
            </StaticField>
            <div className="col-md-6 col-lg-4">
              <div className="text-secondary small mb-1">시드($)</div>
              {editing ? (
                <SeedInput
                  value={input}
                  onChange={(v) => {
                    setInput(v);
                    setConfirmed(false);
                  }}
                />
              ) : (
                <div className="text-light">{seedCell()}</div>
              )}
            </div>
            <StaticField label="전략" locked={editing}>
              <span className="badge bg-secondary">{m.account.strategy}</span>
            </StaticField>
            <StaticField label="사이클 시작일" locked={editing}>
              2026년 10월 1일
            </StaticField>
            <StaticField label="회차(Cycle)">
              <span className="badge bg-primary">{m.account.cycleNumber}</span>
            </StaticField>

            {editing && (
              <div className="col-12">
                <div className="border border-secondary rounded p-3">
                  {kind !== "invalid" && kind !== "same" && kind !== "increase" && (
                    <CutZoneBar preview={m.preview} newSeed={newSeed} />
                  )}
                  <div className={`fw-bold mb-1 ${TONE_TEXT[notice.tone]}`}>{notice.title}</div>
                  {notice.lines.map((l) => (
                    <div
                      key={l}
                      className="small text-light mb-1"
                      style={{ wordBreak: "keep-all" }}
                    >
                      {l}
                    </div>
                  ))}
                  {risky && (
                    <label className="d-flex align-items-start gap-2 small mt-2 text-light">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {kind === "ends"
                        ? `${md(DATES.apply)}에 보유 티어를 모두 팔고 사이클을 끝내는 것을 확인했습니다.`
                        : "오늘 매수가 체결되면 보유 티어를 모두 팔고 사이클이 끝날 수 있음을 확인했습니다."}
                    </label>
                  )}
                  <div className="small text-secondary mt-2">
                    사이클 중에는 시드만 바꿀 수 있습니다. 종목·전략·사이클 시작일은 사이클이 끝나
                    보유 티어가 없을 때 바꿀 수 있습니다.
                  </div>
                </div>
              </div>
            )}

            {editing && (
              <div className="col-12">
                <button
                  type="button"
                  className={`btn btn-sm me-2 ${kind === "ends" ? "btn-danger" : "btn-primary"}`}
                  disabled={!canSave}
                  onClick={save}
                >
                  {kind === "ends" ? "사이클을 끝내고 저장" : "저장"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setEditing(false);
                    setConfirmed(false);
                  }}
                >
                  취소
                </button>
              </div>
            )}

            {!editing && pendingNotice && (
              <div className="col-12">
                <div
                  className={`alert alert-${pendingNotice.tone === "success" ? "info" : pendingNotice.tone} py-2 mb-0 small`}
                >
                  <div className="fw-bold">{pendingNotice.title}</div>
                  {pendingNotice.lines.map((l) => (
                    <div key={l} style={{ wordBreak: "keep-all" }}>
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {m.fixture.phase === "applied" && !m.isSellAllDay && cut !== 0 && (
              <div className="col-12">
                <div className="alert alert-info py-2 mb-0 small">
                  {cut > 0
                    ? `오늘부터 시드는 ${usd(m.appliedSeed, 0)}입니다. 어제 주문이 체결됐으니 이제 ${usd(cut, 0)}를 출금해도 됩니다.`
                    : `오늘부터 시드는 ${usd(m.appliedSeed, 0)}입니다. 아직 입금하지 않았다면 ${usd(-cut, 0)}를 입금하세요.`}
                </div>
              </div>
            )}
            {m.endedBySeedCut && (
              <div className="col-12">
                <div className="alert alert-warning py-2 mb-0 small">
                  <div className="fw-bold mb-1">
                    사이클 {m.endedBySeedCut.cycleNumber}이 시드 감액으로 끝났습니다. 증권사 잔고를
                    새 시드에 맞추세요.
                  </div>
                  <WithdrawalBreakdown m={m} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Assets m={m} />
      {m.isSellAllDay && (
        <div className="alert alert-danger small mt-n3 mb-4" style={{ wordBreak: "keep-all" }}>
          {sellAllCashText(m)}
        </div>
      )}
      <HoldingsTable
        m={m}
        mode="dash"
        footer={
          m.holdings.some((h) => h.seedAtBuy !== m.appliedSeed)
            ? "* 보유 중인 티어의 할당 시드는 비워 둡니다. 산 금액은 매수시드 열에 있습니다."
            : undefined
        }
      />
      {m.isSellAllDay && (
        <div className="alert alert-danger small mb-2" style={{ wordBreak: "keep-all" }}>
          오늘은 시드를 {usd(m.appliedSeed, 0)}로 줄여 사이클을 끝내는 날입니다. 보유 티어를 모두
          MOC로 팔고, 매수 주문은 내지 않습니다.
        </div>
      )}
      {m.pending && (
        <div className="small text-secondary mb-2">
          * 오늘 주문표는 지금 시드 {usd(OLD_SEED, 0)} 기준입니다. 새 시드는{" "}
          {md(m.pending.effectiveDate)} 주문표부터 쓰입니다.
        </div>
      )}
      <Orders m={m} />
    </>
  );
}

// =====================================================
// 시안 B: 입출금 대화상자 + 맨 위 띠
// =====================================================

function SeedDialog({
  m,
  onClose,
  controls,
}: {
  m: Model;
  onClose: () => void;
  controls: Controls;
}): React.ReactElement {
  const [direction, setDirection] = useState<"in" | "out">(
    m.pending && m.pending.seed < OLD_SEED ? "out" : "in"
  );
  const [amount, setAmount] = useState(
    m.pending ? String(Math.abs(m.pending.seed - OLD_SEED)) : ""
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const amt = Number(amount) || 0;
  const newSeed = direction === "in" ? OLD_SEED + amt : OLD_SEED - amt;
  const kind = classify(newSeed, m.preview);
  const notice = describeChange(kind, newSeed, m.preview);
  const ratios = getStrategyParams(m.account.strategy).tierRatios;
  const nextTier = m.preview.todayBuy?.tier ?? 4;
  // 적용일에 살 티어: 오늘 매수가 체결되면 그다음 티어 (어림)
  const expectedCash = (filled: boolean): number => {
    const base = filled ? m.preview.cashIfBuyFills : m.preview.closedCash;
    return Math.max(0, base + (newSeed - OLD_SEED));
  };
  const nextAmount = (filled: boolean): number => {
    const tier = filled ? nextTier + 1 : nextTier;
    return Math.min(Math.floor(newSeed * ratios[tier - 1] * 100) / 100, expectedCash(filled));
  };
  const cycleText: Record<string, string> = {
    increase: "이어감",
    keep: "이어감",
    depends: "오늘 매수가 체결되면 끝남",
    ends: `${md(DATES.apply)}에 모두 팔고 끝남`,
  };
  const moneyText =
    kind === "increase"
      ? `입금 ${usd(amt, 0)} (언제든)`
      : kind === "keep"
        ? `출금 ${usd(amt, 0)} (${md(DATES.apply)} 아침 이후)`
        : "매도가 체결된 뒤 금액을 알려 드립니다";
  const valid = kind !== "invalid" && kind !== "same" && amt > 0;
  const save = (): void => {
    controls.setSeed(newSeed, "pending");
    onClose();
  };

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-2"
      style={{ background: "rgba(0,0,0,0.6)", zIndex: 1500 }}
    >
      <div
        className="card bg-dark border-secondary w-100"
        style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="card-header border-secondary d-flex justify-content-between align-items-center">
          <h5 className="mb-0 text-light">시드 바꾸기</h5>
          <button
            type="button"
            className="btn-close btn-close-white"
            aria-label="닫기"
            onClick={onClose}
          />
        </div>
        <div className="card-body">
          {step === 1 && (
            <>
              <div className="btn-group w-100 mb-3" role="group">
                <button
                  type="button"
                  className={`btn ${direction === "in" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setDirection("in")}
                >
                  입금해서 늘리기
                </button>
                <button
                  type="button"
                  className={`btn ${direction === "out" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setDirection("out")}
                >
                  출금해서 줄이기
                </button>
              </div>
              <label className="form-label text-secondary small">
                {direction === "in" ? "입금할 금액($)" : "출금할 금액($)"}
              </label>
              <input
                type="number"
                inputMode="numeric"
                className="form-control bg-dark text-light border-secondary mb-2"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="small text-secondary mb-2">
                시드 {usd(OLD_SEED, 0)} → <span className="text-light">{usd(newSeed, 0)}</span>
                {direction === "out" && <> · 지금 예수금 {usd(m.preview.closedCash)}</>}
              </div>
              {kind === "invalid" && <div className="small text-danger">{notice.title}</div>}
            </>
          )}
          {step === 2 && (
            <>
              <div className="d-flex align-items-center gap-2 small mb-3 flex-wrap">
                <span className="badge bg-secondary">{md(DATES.change)} 오늘</span>
                <span className="text-secondary">주문표는 {usd(OLD_SEED, 0)}</span>
                <span>→</span>
                <span className="badge bg-primary">{md(DATES.apply)} 적용일</span>
                <span className="text-secondary">주문표부터 {usd(newSeed, 0)}</span>
              </div>
              <table className="table table-dark table-sm small mb-2">
                <thead>
                  <tr>
                    <th />
                    <th className="text-end">시드 그대로라면</th>
                    <th className="text-end">새 시드 (적용일 예상)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-secondary">시드</td>
                    <td className="text-end">{usd(OLD_SEED, 0)}</td>
                    <td className="text-end">{usd(newSeed, 0)}</td>
                  </tr>
                  {kind === "ends" ? (
                    <tr>
                      <td className="text-secondary">예수금</td>
                      <td className="text-end">{usd(m.preview.closedCash)}</td>
                      <td className="text-end text-danger">$0 · 모두 매도</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td className="text-secondary">예수금 · 오늘 매수 체결 시</td>
                        <td className="text-end">{usd(m.preview.cashIfBuyFills)}</td>
                        <td className="text-end">
                          {kind === "depends" ? (
                            <span className="text-danger">$0 · 모두 매도</span>
                          ) : (
                            usd(expectedCash(true))
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="text-secondary">예수금 · 미체결 시</td>
                        <td className="text-end">{usd(m.preview.closedCash)}</td>
                        <td className="text-end">{usd(expectedCash(false))}</td>
                      </tr>
                      <tr>
                        <td className="text-secondary">다음에 살 티어 금액 · 오늘 매수 체결 시</td>
                        <td className="text-end">
                          {nextTier + 1}번{" "}
                          {usd(Math.min(OLD_SEED * ratios[nextTier], m.preview.cashIfBuyFills))}
                        </td>
                        <td className="text-end">
                          {kind === "depends" ? "-" : `${nextTier + 1}번 ${usd(nextAmount(true))}`}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <td className="text-secondary">사이클</td>
                    <td className="text-end">진행 중</td>
                    <td
                      className={`text-end ${kind === "ends" || kind === "depends" ? "text-danger" : ""}`}
                    >
                      {cycleText[kind]}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-secondary">증권사에서 할 일</td>
                    <td colSpan={2} className="text-end">
                      {moneyText}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="small text-secondary" style={{ wordBreak: "keep-all" }}>
                {notice.lines[0]}
              </div>
            </>
          )}
          {step === 3 && (
            <div className="alert alert-danger mb-0" style={{ wordBreak: "keep-all" }}>
              <div className="fw-bold mb-2">
                이대로 저장하면 사이클 {m.account.cycleNumber}이 끝납니다
              </div>
              <div className="small mb-1">
                {kind === "ends"
                  ? `${md(DATES.apply)}에 매수 없이 보유 티어를 모두 MOC로 팝니다.`
                  : `오늘 ${nextTier}번 티어 매수가 체결되면 ${md(DATES.apply)}에 매수 없이 보유 티어를 모두 MOC로 팝니다.`}
              </div>
              <div className="small mb-1">
                다음 사이클은 {md(DATES.next)}부터 새 시드 {usd(newSeed, 0)}로 시작합니다.
              </div>
              <div className="small">
                팔기 전에는 출금할 돈이 없습니다. 출금 금액은 매도가 체결된 뒤 알려 드립니다.
              </div>
            </div>
          )}
        </div>
        <div className="card-footer border-secondary d-flex justify-content-end gap-2">
          {step > 1 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            >
              이전
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!valid}
              onClick={() => setStep(2)}
            >
              다음
            </button>
          )}
          {step === 2 &&
            (kind === "ends" || kind === "depends" ? (
              <button type="button" className="btn btn-warning btn-sm" onClick={() => setStep(3)}>
                다음
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={save}>
                저장
              </button>
            ))}
          {step === 3 && (
            <button type="button" className="btn btn-danger btn-sm" onClick={save}>
              사이클을 끝내도 저장
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TopBanner({
  m,
  controls,
  onEdit,
}: VariantProps & { onEdit: () => void }): React.ReactElement | null {
  const cut = OLD_SEED - m.appliedSeed;
  if (m.pending) {
    const kind = classify(m.pending.seed, m.preview);
    const n = describeChange(kind, m.pending.seed, m.preview);
    const tone = kind === "ends" ? "danger" : kind === "depends" ? "warning" : "info";
    return (
      <div className={`alert alert-${tone} mb-4`} style={{ wordBreak: "keep-all" }}>
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <div className="fw-bold">
              시드 변경 예정: {usd(OLD_SEED, 0)} → {usd(m.pending.seed, 0)} ·{" "}
              {md(m.pending.effectiveDate)} 주문표부터
            </div>
            {n.lines.map((l) => (
              <div key={l} className="small">
                {l}
              </div>
            ))}
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm btn-light" onClick={onEdit}>
              바꾸기
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={() => controls.setSeed(null, "before")}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (m.isSellAllDay) {
    return (
      <div className="alert alert-danger mb-4" style={{ wordBreak: "keep-all" }}>
        <div className="fw-bold">오늘은 사이클 {m.account.cycleNumber}을 끝내는 날입니다</div>
        <div className="small">
          시드를 {usd(m.appliedSeed, 0)}로 줄여 보유 티어를 모두 MOC로 팝니다. 매수 주문은 없습니다.
        </div>
        <div className="small">{sellAllCashText(m)}</div>
      </div>
    );
  }
  if (m.endedBySeedCut) {
    return (
      <div className="alert alert-warning mb-4">
        <div className="fw-bold mb-1">
          사이클 {m.endedBySeedCut.cycleNumber}이 시드 감액으로 끝났습니다. 증권사 잔고를 새 시드에
          맞추세요.
        </div>
        <WithdrawalBreakdown m={m} />
      </div>
    );
  }
  if (m.fixture.phase === "applied" && cut !== 0) {
    return (
      <div className="alert alert-success mb-4 small">
        오늘부터 시드 {usd(m.appliedSeed, 0)}.{" "}
        {cut > 0
          ? `어제 주문이 체결됐으니 이제 ${usd(cut, 0)}를 출금해도 됩니다.`
          : `아직이면 ${usd(-cut, 0)}를 입금하세요.`}
      </div>
    );
  }
  return null;
}

export function VariantB({ m, controls }: VariantProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const inCycle = m.account.isCycleInProgress;
  const editable = m.fixture.phase === "before" || m.fixture.phase === "pending";
  return (
    <>
      <TopBanner m={m} controls={controls} onEdit={() => setOpen(true)} />
      {open && <SeedDialog m={m} controls={controls} onClose={() => setOpen(false)} />}
      <div className="card bg-dark border-secondary mb-4">
        <div className="card-header border-secondary d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <h5 className="mb-0 text-light">{m.account.name}</h5>
          <div className="d-flex gap-2 align-items-center">
            {inCycle && <span className="badge bg-warning text-dark">사이클 진행 중</span>}
            {editable && !m.pending && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setOpen(true)}
              >
                시드 바꾸기
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={inCycle}
              title={
                inCycle ? "종목·전략·사이클 시작일은 사이클이 끝나면 바꿀 수 있습니다" : undefined
              }
            >
              설정 변경
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <StaticField label="종목(Ticker)">
              <span className="badge bg-info">{m.account.ticker}</span>
            </StaticField>
            <StaticField label="시드($)">{usd(m.appliedSeed, 0)}</StaticField>
            <StaticField label="전략">
              <span className="badge bg-secondary">{m.account.strategy}</span>
            </StaticField>
            <StaticField label="사이클 시작일">2026년 10월 1일</StaticField>
            <StaticField label="회차(Cycle)">
              <span className="badge bg-primary">{m.account.cycleNumber}</span>
            </StaticField>
          </div>
          {inCycle && (
            <div className="small text-secondary mt-3">
              종목·전략·사이클 시작일은 사이클이 끝나 보유 티어가 없을 때 바꿀 수 있습니다.
            </div>
          )}
        </div>
      </div>
      <Assets m={m} />
      <HoldingsTable m={m} mode="current" />
      <Orders m={m} />
    </>
  );
}

// =====================================================
// 시안 C: 시드 이력 카드
// =====================================================

export function VariantC({ m, controls }: VariantProps): React.ReactElement {
  const inCycle = m.account.isCycleInProgress;
  const editable = m.fixture.phase === "before" || m.fixture.phase === "pending";
  const [input, setInput] = useState(m.pending ? String(m.pending.seed) : "");
  const [confirming, setConfirming] = useState(false);
  const newSeed = Number(input);
  const kind = input === "" ? null : classify(newSeed, m.preview);
  const notice = kind ? describeChange(kind, newSeed, m.preview) : null;
  const cutNow = OLD_SEED - newSeed;
  const valid = kind !== null && kind !== "invalid" && kind !== "same";

  const reserve = (): void => {
    if ((kind === "ends" || kind === "depends") && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    controls.setSeed(newSeed, "pending");
  };

  const zones: Array<{ key: string; range: string; text: string; tone: string }> = [
    {
      key: "keep",
      range: `${usd(m.preview.cashIfBuyFills)} 이하`,
      text: "사이클이 이어집니다",
      tone: "success",
    },
    {
      key: "depends",
      range: `${usd(m.preview.cashIfBuyFills)} - ${usd(m.preview.closedCash)}`,
      text: `오늘 ${m.preview.todayBuy?.tier}번 티어 매수가 체결되면 끝납니다`,
      tone: "warning",
    },
    {
      key: "ends",
      range: `${usd(m.preview.closedCash)} 초과`,
      text: `${md(DATES.apply)}에 모두 팔고 끝납니다`,
      tone: "danger",
    },
  ];

  const statusCell = (row: Model["seedHistory"][number]): React.ReactNode => {
    if (row.status === "pending")
      return <span className="badge bg-warning text-dark">적용 예정</span>;
    if (row.status === "past") return <span className="badge bg-secondary">지난 시드</span>;
    if (m.isSellAllDay && row.effectiveDate === DATES.apply)
      return <span className="badge bg-danger">적용 중 · 오늘 모두 매도</span>;
    return <span className="badge bg-success">적용 중</span>;
  };

  const moneyCell = (
    row: Model["seedHistory"][number],
    prevSeed: number | null
  ): React.ReactNode => {
    if (prevSeed === null) return <span className="text-secondary">계좌 생성</span>;
    const diff = row.seed - prevSeed;
    if (diff > 0)
      return (
        <>
          입금 {usd(diff, 0)} <span className="text-secondary">· 언제든</span>
        </>
      );
    const k = classify(row.seed, m.preview, prevSeed);
    if (m.endedBySeedCut)
      return (
        <>
          출금 {usd(m.endedBySeedCut.withdrawal)} <span className="text-secondary">· 지금</span>
        </>
      );
    if (k === "ends" || m.isSellAllDay)
      return <span className="text-secondary">매도 체결 뒤 알림</span>;
    if (k === "depends" && row.status === "pending")
      return <span className="text-secondary">{md(DATES.apply)}에 확정</span>;
    return (
      <>
        출금 {usd(-diff, 0)}{" "}
        <span className="text-secondary">
          · {row.status === "pending" ? `${md(DATES.apply)} 아침 이후` : "지금"}
        </span>
      </>
    );
  };

  return (
    <>
      <div className="card bg-dark border-secondary mb-4">
        <div className="card-header border-secondary d-flex justify-content-between align-items-center">
          <h5 className="mb-0 text-light">{m.account.name}</h5>
          {inCycle && <span className="badge bg-warning text-dark">사이클 진행 중</span>}
        </div>
        <div className="card-body">
          <div className="row g-3">
            <StaticField label="종목(Ticker)" locked={inCycle}>
              <span className="badge bg-info">{m.account.ticker}</span>
            </StaticField>
            <StaticField label="시드($)">
              {usd(m.appliedSeed, 0)}{" "}
              <span className="small text-secondary">· 아래 시드 이력에서 변경</span>
            </StaticField>
            <StaticField label="전략" locked={inCycle}>
              <span className="badge bg-secondary">{m.account.strategy}</span>
            </StaticField>
            <StaticField label="사이클 시작일" locked={inCycle}>
              2026년 10월 1일
            </StaticField>
            <StaticField label="회차(Cycle)">
              <span className="badge bg-primary">{m.account.cycleNumber}</span>
            </StaticField>
          </div>
        </div>
      </div>

      <div className="card bg-dark border-secondary mb-4">
        <div className="card-header border-secondary">
          <h5 className="mb-0 text-light">시드 이력</h5>
        </div>
        <div className="card-body">
          {editable && (
            <div className="mb-3">
              <div className="d-flex gap-2 align-items-end flex-wrap">
                <div style={{ maxWidth: 200 }}>
                  <label className="form-label text-secondary small mb-1">
                    {m.pending ? "적용 예정 시드 고치기($)" : "새 시드($)"}
                  </label>
                  <SeedInput
                    value={input}
                    onChange={(v) => {
                      setInput(v);
                      setConfirming(false);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${confirming ? "btn-danger" : "btn-primary"}`}
                  disabled={!valid}
                  onClick={reserve}
                >
                  {confirming ? "사이클을 끝내도 예약" : `${md(DATES.apply)}부터 적용`}
                </button>
                {confirming && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => setConfirming(false)}
                  >
                    그만두기
                  </button>
                )}
              </div>
              {notice && (
                <div
                  className={`small mt-2 ${TONE_TEXT[notice.tone]}`}
                  style={{ wordBreak: "keep-all" }}
                >
                  {notice.title}
                  {notice.lines.length > 0 && (
                    <span className="text-secondary"> · {notice.lines[0]}</span>
                  )}
                </div>
              )}
              {kind !== null && kind !== "increase" && kind !== "invalid" && kind !== "same" && (
                <table
                  className="table table-dark table-sm small mt-2 mb-0"
                  style={{ maxWidth: 560 }}
                >
                  <thead>
                    <tr>
                      <th>줄이는 금액</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((z) => (
                      <tr key={z.key} className={z.key === kind ? "table-active" : ""}>
                        <td
                          className={z.key === kind ? `text-${z.tone} fw-bold` : "text-secondary"}
                        >
                          {z.range}
                        </td>
                        <td
                          className={z.key === kind ? `text-${z.tone} fw-bold` : "text-secondary"}
                        >
                          {z.text}
                          {z.key === kind && ` ← ${usd(cutNow, 0)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <div className="table-responsive">
            <table className="table table-dark table-sm align-middle mb-0 small">
              <thead className="text-nowrap">
                <tr>
                  <th>적용일</th>
                  <th className="text-end">시드</th>
                  <th>상태</th>
                  <th>증권사에서 할 일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...m.seedHistory].reverse().map((row, i, arr) => {
                  const prev = arr[i + 1]?.seed ?? null;
                  return (
                    <tr key={row.effectiveDate}>
                      <td className="text-nowrap">{md(row.effectiveDate)}</td>
                      <td className="text-end text-nowrap">
                        {usd(row.seed, 0)}
                        {prev !== null && (
                          <div className={row.seed > prev ? "text-info" : "text-warning"}>
                            {row.seed > prev ? "+" : "−"}
                            {usd(Math.abs(row.seed - prev), 0)}
                          </div>
                        )}
                      </td>
                      <td>{statusCell(row)}</td>
                      <td style={{ wordBreak: "keep-all" }}>{moneyCell(row, prev)}</td>
                      <td className="text-end text-nowrap">
                        {row.status === "pending" && (
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-secondary"
                            onClick={() => controls.setSeed(null, "before")}
                          >
                            취소
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {m.pending && (
            <div className="small text-secondary mt-2">
              * 적용 전에 다시 저장하면 이 줄을 덮어씁니다. 오늘 주문표는 지금 시드{" "}
              {usd(OLD_SEED, 0)} 기준입니다.
            </div>
          )}
          {m.endedBySeedCut && (
            <div className="mt-3">
              <div className="small text-warning fw-bold mb-1">
                사이클 {m.endedBySeedCut.cycleNumber}이 {md(DATES.apply)} 시드 감액으로 끝났습니다.
              </div>
              <WithdrawalBreakdown m={m} />
            </div>
          )}
          {m.isSellAllDay && (
            <div className="small text-danger mt-2" style={{ wordBreak: "keep-all" }}>
              {sellAllCashText(m)}
            </div>
          )}
        </div>
      </div>

      <Assets m={m} />
      <HoldingsTable
        m={m}
        mode="buyTime"
        footer={
          m.holdings.some((h) => h.seedAtBuy !== m.appliedSeed)
            ? "* 보유 중인 티어의 할당 시드는 그 티어를 살 때 적용된 시드 기준입니다."
            : undefined
        }
      />
      <Orders m={m} />
    </>
  );
}
