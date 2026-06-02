# SPEC-SPLIT-001: 액면분할(Stock Split) 대응 계획

## 개요

| 항목 | 내용 |
|------|------|
| **문서 ID** | SPEC-SPLIT-001 |
| **작성일** | 2026-06-02 |
| **대상 종목** | SOXL (TQQQ 등 모든 지원 티커 공통) |
| **목표** | 액면분할 발생 시 가격 시계열·지표·보유 포지션·거래 기록의 정합성을 무손실로 복원하기 위한 대응 절차(런북) 및 향후 구현 방향 정의 |
| **상태** | 계획 |

> **한 줄 요약**: 이 시스템은 가격을 **증분으로만 적재**하고 기존 행을 **덮어쓰지 않는다**.
> 반면 Yahoo Finance는 분할 시 **과거 가격을 소급 조정**한다. 따라서 분할이 실제로 일어나면
> 가격 시계열에 불연속이 생기고, 지표가 왜곡되며, 보유 포지션의 매도 목표가가 영원히
> 미체결되어 사이클이 멈춘다. 사전에 대응 절차를 정의해 둔다.

---

## 1. 배경

SOXL 주가가 지속적으로 상승하면서 액면분할(예: 2:1, 3:1) 가능성이 제기되고 있다. 운용사가
분할을 단행하면 ex-date(권리락일)에 주당 가격이 분할 비율만큼 낮아지고 보유 주식 수는 같은
비율만큼 늘어난다(자산 가치는 중립). 증권사 계좌의 보유 단가·수량은 자동으로 조정되지만,
**이 시스템의 DB는 자동으로 조정되지 않으므로** 수동(또는 향후 자동화) 대응이 필요하다.

본 문서는 실제 분할 일정이 확정되기 전 사전 대비용 계획이며, **코드 변경 없이** 대응 원칙과
절차를 정의한다. 실제 분할 시 도입할 코드 변경안은 5장에 설계 수준으로 정리한다.

---

## 2. 현재 동작 분석 — 무엇이 깨지는가

### 2.1 데이터 흐름 요약

| 데이터 | 저장 위치 | 분할 영향 컬럼 | 사용처 |
|--------|-----------|----------------|--------|
| 일봉 가격 | `daily_prices` | `open/high/low/close/adjClose` | 지표 계산, 주문 기준가 |
| 기술적 지표 | `daily_metrics` | `ma20/ma60/maSlope/disparity/rsi14/roc12/...` | 추천/신호 |
| 보유 현황 | `tier_holdings` | `buyPrice`, `shares`, `sellTargetPrice` | 매도 주문 생성 |
| 거래 기록 | `profit_records` | `buyPrice/sellPrice/buyQuantity/buyAmount/sellAmount` | 손익 표시 |
| 일일 주문 | `daily_orders` | `limitPrice`, `shares` | 체결 시뮬레이션 |

### 2.2 핵심 함정 — 증분 적재 + `onConflictDoNothing`

증분 업데이트는 **마지막 저장일 이후 신규일만** 가져온다:

```typescript
// src/services/dataFetcher.ts:168 (fetchSince)
const nextDay = new Date(startDate);
nextDay.setDate(nextDay.getDate() + 1);
// ... period1 = 다음날부터 today 까지만 조회
```

그리고 삽입은 충돌 시 **무시**한다 (기존 행 절대 갱신 안 됨):

```typescript
// src/database/prices.ts:24 (insertDailyPrices)
await db.insert(dailyPrices).values(data).onConflictDoNothing();
```

Yahoo Finance는 분할이 발생하면 **과거 전체 `adjClose`(및 `close`)를 소급 조정**(2:1이면
반토막)한다. 그러나 위 두 가지 때문에 DB의 과거 행은 **분할 전 가격 그대로 남고**, ex-date
이후 신규 행만 분할 후(낮아진) 가격으로 들어온다 → **분할 경계에서 가격이 2배 점프하는
불연속**이 생긴다.

### 2.3 영향 1 — 가격 시계열 불연속

ex-date를 기준으로 과거(높은 가격)와 미래(낮은 가격)가 한 시계열에 섞인다. 차트가 끊기고,
이후 모든 가격 기반 연산이 오염된다.

### 2.4 영향 2 — 지표 붕괴 (최소 60거래일)

모든 지표는 `adjClose` 배열로 계산된다:

```typescript
// src/index.ts:332 (init-metrics)
const adjClosePrices = prices.map((p) => p.adjClose);
const metrics = calculateMetricsBatch(adjClosePrices, dates, ticker, 59, prices.length - 1);
```

`calculateMetricsBatch`(`src/services/metricsCalculator.ts`)의 MA20/MA60, RSI14, ROC12,
변동성, 이격도, 골든크로스가 모두 연속된 `adjClose`를 전제로 한다. 분할 경계 전후 값이
섞이면 **MA60은 분할 후에도 약 60거래일간** 분할 전 높은 가격을 평균에 포함 → 이동평균이
실제보다 높게 산출되고, 이격도·골든크로스·RSI·ROC가 전부 왜곡되어 **허위 매수/매도
신호**가 발생한다.

### 2.5 영향 3 — 보유 포지션 매도 불가 (치명적)

`tier_holdings.buyPrice`는 **분할 전 체결가**로 저장돼 있고, 매도 주문은 매일 이 값에서
목표가를 재계산한다:

```typescript
// src/database/trading/orders.ts:230 (generateDailyOrders, 일반 매도 LOC)
const sellPrice = calculateSellLimitPrice(holding.buyPrice, sellThreshold);
```

예) 분할 전 `buyPrice = $50`, Pro2 임계값 1.5% → 매도 목표가 ≈ `$50.75`. 분할(2:1) 후 시장
가격은 ≈ `$25`이므로 **매도 목표가에 영원히 도달하지 못한다** → 해당 티어가 매도되지 않아
**사이클이 정지**하고, 화면 손익은 거대한 가짜 손실(−50%)로 표시된다. 손절일(`STOP_LOSS_DAYS`)
도달 시 MOC로 강제 매도되긴 하나, 정상 전략 흐름이 망가진다.

### 2.6 영향 4 — 주문 생성 기준가

`getClosingPrice`는 `adjClose`를 사용한다:

```typescript
// src/database/trading/orders.ts:96
.select({ adjClose: dailyPrices.adjClose })
```

ex-date 이후 신규 종가는 분할 후 정상 스케일로 들어오지만, 2.3의 불연속과 2.4의 오염된
지표가 함께 작용하면 매수 수량·신호 판단이 어긋난다.

### 2.7 영향 5 — 종료된 거래 기록 표시 불일치

`profit_records`의 `buyPrice/sellPrice/buyQuantity`는 분할 전 스케일로 남는다. 달러 기준
`profit`/`profitRate`는 정확하지만, 단가·수량이 현재 시장 스케일과 달라 표시 일관성이
깨진다.

---

## 3. 대응 원칙

분할 비율을 `R`로 정의한다(가격은 `1/R`배, 수량은 `R`배로 변한다). ex-date(권리락일)를
기준일로 삼는다. 아래 공식은 정분할·역분할·분수분할 모두에 동일하게 적용된다.

| 유형 | 예시 | `R` | 가격 | 수량 |
|------|------|-----|------|------|
| 정분할(Forward) | 2:1 | `2` | `÷ 2` | `× 2` |
| 정분할(Forward) | 3:1 | `3` | `÷ 3` | `× 3` |
| 역분할(Reverse) | 1:2 | `0.5` | `× 2` | `× 0.5` |
| 분수분할(Fractional) | 3:2 | `1.5` | `÷ 1.5` | `× 1.5` |

> 역분할 시 수량이 정수로 떨어지지 않거나 단주(fractional share)가 발생할 수 있다. 증권사
> 처리 방식(반올림/현금 정산)을 확인해 `tier_holdings.shares`를 실제 계좌와 일치시킨다.

| 대상 | 보정 규칙 | 비고 |
|------|-----------|------|
| **가격(`daily_prices`)** | 전체 재적재 권장. 수동 보정 시 분할 이전 모든 행의 `open/high/low/close/adjClose`를 `÷ R`, `volume`은 `× R` | 시스템이 `volume`을 직접 쓰진 않으나 데이터 무결성·향후 분석을 위해 함께 보정 권장 |
| **지표(`daily_metrics`)** | 가격 보정 후 **전체 재계산** | 부분 재계산은 경계 오염 위험, 전체 재계산이 안전 |
| **보유(`tier_holdings`)** | 보유 티어(`shares > 0`)만: `shares × R`, `buyPrice ÷ R`, `sellTargetPrice` 재계산, **`buyDate` 유지** | `buyDate` 유지로 손절일 카운트 보존 |
| **거래 기록(`profit_records`)** | `buyPrice ÷ R`, `sellPrice ÷ R`, `buyQuantity × R` | `buyAmount/sellAmount/profit/profitRate` **불변**(검증 포인트) |
| **일일 주문(`daily_orders`)** | 분할일 전후 주문 삭제 후 재생성 | `deleteDailyOrders(accountId, date)` 활용 |

> **무손실 원칙**: 분할은 자산 가치 중립이다. 보정 후 `shares × buyPrice`(티어별 투자원금),
> 계정 총 평가금액, 누적 달러 손익이 **분할 전과 동일해야 한다**. 이는 사후 검증의 핵심
> 기준이다.

가격 보정은 정밀도 관례에 따라 **decimal.js**로 수행하고 소수점 2자리로 정규화한다
(`normalizePrice`, `src/services/dataFetcher.ts:10` 참조).

---

## 4. 권장 대응 절차 (런북)

> ⚠️ 모든 단계 시작 전 **DB 백업 필수**. 보정은 ex-date 기준 **단 1회만** 적용한다(중복
> 적용 시 가격이 `1/R²`로 깨진다).

### (0) 사전 준비
- [ ] 운용사 공시로 분할 비율 `R`과 ex-date 확인 (예: SOXL 2:1, 2026-07-01).
- [ ] `daily_prices`, `daily_metrics`, `tier_holdings`, `profit_records`, `daily_orders` 백업.
- [ ] 활성 계정 목록 및 각 계정의 보유 티어 현황 스냅샷 확보.
- [ ] **백업 복원 테스트**: 백업본을 별도 환경에 복원해 무결성 확인(백업 손상 시 영구 손실 방지).
- [ ] **드라이런(Dry-run)**: 프로덕션 DB 복사본에 전체 런북을 1회 예행 실행 →
      (6) 사후 검증 기준으로 결과 확인, 예상 소요 시간 측정 및 프로덕션 실행 일정 수립.

### 실행 타이밍
- **시점**: ex-date 장 마감 **이후(post-market)** 실행 권장. 그래야 Yahoo가 그날치 분할 반영
  데이터를 제공하고, 당일 매매 흐름과 겹치지 않는다.
- **크론 중지**: 가격 업데이트(`update-prices`)·주문 처리(`process-daily-orders`) 크론을
  **작업 시작 전 중지**하고, (6) 사후 검증 통과 후 재개. 보정 도중 크론·사용자 요청이 끼어들면
  경쟁 조건으로 중간 상태가 오염될 수 있다.
- **사용자 접근**: 작업 중 유지보수 모드(읽기 전용 또는 점검 안내)로 전환해 주문 생성·계정
  수정을 차단.

### 롤백 & 복구
- **단계별 결정 지점**: 각 단계((1) 가격 재적재 → (2) 지표 → (3) 보유 → (4) 거래기록 →
  (5) 주문) 직후 검증을 수행하고, 실패 시 **해당 단계까지의 백업으로 복원** 후 중단·원인 분석.
- **중간 백업**: 임시 대안(아래 (1))처럼 삭제가 포함된 단계는 **각 삭제/재적재 직후 중간 백업**을
  생성해 부분 완료 상태에서도 되돌릴 수 있게 한다.
- **복원 순서**: 의존성 역순으로 복원 — `daily_orders` → `profit_records` → `tier_holdings`
  → `daily_metrics` → `daily_prices`. 복원 후 (6) 사후 검증을 재실행.
- **모니터링**: 각 단계의 변경 행 수·`shares × buyPrice` 합계·총 평가금액을 로깅하고, 분할 전
  스냅샷과 대조해 이상 시 즉시 중단.

### (1) 가격 히스토리 재정합
- [ ] **권장**: 전체 재적재. 단 현재 `init`/`update`는 둘 다 `onConflictDoNothing`이라
      기존 행을 덮어쓰지 못한다(2.2 참조) → **5장의 신규 코드가 필요**.
- [ ] **신규 코드 없이 진행하는 임시 대안** — ⚠️ **고위험. 최후의 수단으로만 사용**:
  > **위험성**: 삭제 후 재적재 방식은 (a) 백업 실패·손상 시 **데이터 영구 손실**, (b) 삭제와
  > 재적재 사이 장애 발생 시 **복구 불가**, (c) 가격 데이터 일시 부재로 활성 포지션 참조 오류,
  > (d) 크론·사용자 요청과의 **경쟁 조건** 위험을 동반한다. 가능하면 **5.1의 신규 코드(덮어쓰기/
  > 재적재 함수) 구현을 최우선**으로 하고, 본 방식은 그것이 불가능할 때만 사용한다.

  사용 시 전제: 위 "백업 복원 테스트" 완료 + 유지보수 모드(크론 중지·사용자 차단) 진입.
  1. 해당 티커의 `daily_metrics` 행 삭제. → **중간 백업 생성**
  2. 해당 티커의 `daily_prices` 행 삭제. → **중간 백업 생성**
  3. `npx tsx src/index.ts init --ticker SOXL` 재실행 → Yahoo에서 분할 반영된 전체
     히스토리를 새로 적재(빈 테이블이므로 충돌 없음). → 적재 행 수 검증

### (2) 지표 전체 재계산 및 검증
- [ ] `npx tsx src/index.ts init-metrics --ticker SOXL` (또는 init 단계에서 함께 계산됨).
- [ ] `npx tsx src/index.ts verify-metrics --ticker SOXL` 로 배치 계산 정합성 확인.

### (3) 활성 계정별 `tier_holdings` 보정
- [ ] 보유 티어(`shares > 0`)에 대해서만:
  - `shares ← shares × R`
  - `buyPrice ← buyPrice ÷ R`
  - `sellTargetPrice ← calculateSellLimitPrice(보정된 buyPrice, sellThreshold)`
  - `buyDate` 그대로 유지
- [ ] 갱신은 `updateTierHolding(accountId, tier, {...})`(`src/database/trading/tier-holdings.ts:46`) 사용.
- [ ] 검증: 티어별 `shares × buyPrice`가 분할 전과 동일한지 확인.

### (4) `profit_records` 과거 기록 보정
- [ ] `buyPrice ÷ R`, `sellPrice ÷ R`, `buyQuantity × R`.
- [ ] `buyAmount/sellAmount/profit/profitRate`는 **변경하지 않고**, 보정 후에도 동일한지 검증.

### (5) `daily_orders` 정리
- [ ] 분할일 전후의 미체결 주문 삭제: `deleteDailyOrders(accountId, date)`
      (`src/database/trading/orders.ts:141`).
- [ ] **부분 체결 주문 확인**: 분할 시점에 일부만 체결된 매수/매도 주문이 있었다면, 체결된 수량이
      `tier_holdings`에 올바르게 반영되었는지 확인하고 **분할 비율(`× R`)로 보정**한다. 단순
      삭제만으로는 체결 이력과 실제 보유 수량 간 불일치가 남을 수 있다.
- [ ] 다음 크론 실행 또는 화면 진입 시 보정된 보유/가격 기준으로 주문이 재생성되는지 확인.

### (6) 사후 검증
- [ ] 차트 연속성: ex-date 경계에서 가격 점프가 사라졌는지.
- [ ] 지표 정상화: MA20/MA60/이격도/골든크로스가 현재가 대비 합리적 범위인지.
- [ ] 매도 목표가가 현재 시장가 대비 도달 가능한 수준인지(2.5 문제 해소 확인).
- [ ] 총 평가금액·누적 달러 손익이 분할 전과 동일(무손실 원칙).

---

## 5. 향후 구현 권장 (코드 변경 제안 — 현재 미구현)

실제 분할이 확정되면 다음을 도입해 절차를 자동화·원자화하는 것을 권장한다.

### 5.1 가격 덮어쓰기 지원
- `insertDailyPrices`에 upsert 옵션 추가(`onConflictDoUpdate`로 OHLC/adjClose 갱신), 또는
  `replaceAllPrices(ticker)` 함수(트랜잭션으로 delete → insert)를 신설.
  - 위치: `src/database/prices.ts`.

### 5.2 분할 자동 감지
- 현재 `fetchChartWithRetry`는 `result.quotes`만 읽는다(`src/services/dataFetcher.ts:84`).
  Yahoo `chart`의 **split 이벤트(events)** 를 함께 조회해, 일일 크론에서 신규 분할을 감지하면
  경고/대응 트리거를 발생시킨다.

### 5.3 분할 적용 CLI 명령
- `apply-split --ticker SOXL --ratio 2 --date 2026-07-01`:
  4장의 (1)~(5)를 **단일 트랜잭션**으로 원자 실행(가격 재적재·지표 재계산·보유 보정·기록
  보정·주문 정리). decimal.js 기반 보정으로 기존 정밀도 관례 유지.
- 위치: `src/index.ts` CLI 명령 추가 + `src/database/trading/`에 보정 헬퍼.

### 5.4 멱등성·안전장치
- 동일 ex-date에 대한 **중복 적용 방지**(적용 이력 기록 또는 가드).
- 적용 전후 무손실 검증(총 평가금액·손익 불변)을 명령 내부에서 자동 수행.

---

## 6. 검증 체크리스트 / 주의사항

- [ ] **백업 필수**: 모든 보정 작업 전 DB 스냅샷.
- [ ] **1회만 적용**: 동일 분할에 대해 중복 보정 금지(`1/R²` 손상 위험).
- [ ] **손익 중립 확인**: 보정 후 티어별 투자원금, 총 평가금액, 누적 달러 손익이 분할 전과
      일치.
- [ ] **`buyDate` 보존**: 손절일 카운트(`STOP_LOSS_DAYS`)가 어긋나지 않도록 유지.
- [ ] **전체 재계산 우선**: 지표는 부분 재계산보다 전체 재계산이 경계 오염을 확실히 제거.
- [ ] **부분 체결 주문 확인**: 분할 시점 부분 체결분이 보유 수량에 반영·보정되었는지 확인((5) 참조).
- [ ] **크론 중지/재개**: 작업 중 크론·사용자 접근 차단, 사후 검증 통과 후 재개.
- [ ] **TQQQ 등 타 티커 동일 적용**: 지원 티커 어디서든 분할 발생 시 같은 절차 적용.

---

## 부록: 참고 코드 위치

| 영역 | 파일 / 함수 |
|------|-------------|
| 데이터 페치 | `src/services/dataFetcher.ts` — `fetchAllHistory`, `fetchSince`, `normalizePrice` |
| 가격 적재 | `src/database/prices.ts` — `insertDailyPrices`(onConflictDoNothing) |
| 지표 계산 | `src/services/metricsCalculator.ts` — `calculateMetricsBatch` |
| CLI | `src/index.ts` — `init`, `update`, `init-metrics`, `verify-metrics` |
| 보유 보정 | `src/database/trading/tier-holdings.ts` — `updateTierHolding`, `getTierHoldings` |
| 주문 생성/정리 | `src/database/trading/orders.ts` — `generateDailyOrders`, `deleteDailyOrders`, `getClosingPrice`, `calculateSellLimitPrice` |
| 거래 기록 | `src/database/trading/profits.ts` |
| 전략 상수 | `src/types/trading.ts` — `SELL_THRESHOLDS`, `STOP_LOSS_DAYS` 등 |
