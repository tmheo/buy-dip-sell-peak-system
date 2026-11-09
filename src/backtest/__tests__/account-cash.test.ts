/**
 * 계좌 현금 정합성 테스트 (ADR-0003, DB 연동)
 *
 * 주문표의 매수 주문은 주문을 만든 시점(전일 마감)의 계좌 현금을 넘지 않아야 한다.
 * ADR-0001 규칙에서는 손절 손실이 예수금에 반영되지 않아 SOXL 전체 기간에서
 * 계좌 현금보다 큰 매수 주문이 Pro1 10건, Pro2 36건, Pro3 52건 나왔다 (#88).
 *
 * DB 연동 테스트는 DATABASE_URL을 직접 넘겨야 돈다:
 * DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npx vitest run ...
 */
import { describe, it, expect, beforeAll } from "vitest";
import { BacktestEngine } from "../engine";
import { getAllPricesByTicker } from "@/database/prices";
import type { Strategy } from "@/types/trading";
import type { DailyPrice } from "@/types";

const STRATEGIES: Strategy[] = ["Pro1", "Pro2", "Pro3"];
const INITIAL_CAPITAL = 10000;

/** 전체 기간 판정에 필요한 최소 거래일 수 (2010-03 ~ 약 16년치) */
const MIN_FULL_PERIOD_DAYS = 4000;

describe("SOXL 전체 기간 - 계좌 현금보다 큰 매수 주문", () => {
  let prices: DailyPrice[] = [];
  let hasData = false;

  beforeAll(async () => {
    try {
      prices = await getAllPricesByTicker("SOXL");
      hasData = prices.length >= MIN_FULL_PERIOD_DAYS;
      if (!hasData) {
        console.log(
          `[INFO] 계좌 현금 테스트 건너뜀: 가격 데이터 부족 (${prices.length}일 / 최소 ${MIN_FULL_PERIOD_DAYS}일 필요)`
        );
      }
    } catch {
      console.log("[INFO] 계좌 현금 테스트 건너뜀: 데이터베이스 접근 불가");
    }
  });

  it.each(STRATEGIES)(
    "%s: 매수 주문 금액이 전일 마감 계좌 현금을 넘는 날이 없어야 한다",
    async (strategy) => {
      if (!hasData) return;

      const result = await new BacktestEngine(strategy).run(
        {
          ticker: "SOXL",
          strategy,
          startDate: prices[0].date,
          endDate: prices[prices.length - 1].date,
          initialCapital: INITIAL_CAPITAL,
        },
        prices
      );

      // 스냅샷 현금은 계좌 현금이고, 주문표는 전일 마감 상태로 만든다
      const excessOrders = result.dailyHistory.slice(1).flatMap((snapshot, i) => {
        const cashAtOrder = result.dailyHistory[i].cash;
        return snapshot.orders
          .filter((order) => order.type === "BUY" && order.amount > cashAtOrder)
          .map((order) => ({ date: snapshot.date, amount: order.amount, cashAtOrder }));
      });

      expect(excessOrders).toEqual([]);
    }
  );
});
