# SPEC-TRADING-001: 트레이딩 주문 체결 및 보유 현황 수정

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-TRADING-001 |
| **제목** | 트레이딩 주문 체결 로직 및 보유 현황 표시 수정 |
| **상태** | Planned |
| **우선순위** | High |
| **생성일** | 2026-01-24 |
| **라이프사이클** | spec-anchored |
| **관련 SPEC** | SPEC-BACKTEST-001 |

---

## 1. 환경 (Environment)

### 1.1 기술 스택

| 구성요소 | 기술 | 버전 |
|----------|------|------|
| 런타임 | Node.js | 20.x LTS |
| 언어 | TypeScript | 5.7.3 |
| 프레임워크 | Next.js | 15.x (App Router) |
| 데이터베이스 | SQLite | better-sqlite3 v11.7.0 |
| 수학 라이브러리 | decimal.js | 최신 안정 버전 |

### 1.2 영향받는 파일

| 파일 | 역할 | 수정 범위 |
|------|------|----------|
| `src/database/trading.ts` | 주문 생성 및 체결 로직 | 주요 수정 |
| `src/app/api/trading/accounts/[id]/orders/route.ts` | 주문 API 엔드포인트 | 중간 수정 |
| `src/app/trading/[accountId]/_client.tsx` | 트레이딩 UI 컴포넌트 | 경미한 수정 |
| `src/utils/trading-core.ts` | 가격 계산 유틸리티 | 참조만 |

### 1.3 현재 데이터 흐름

```
사용자 요청 (GET /api/trading/accounts/[id]/orders)
    ↓
generateDailyOrders() - 전일 종가 기준 주문 생성
    ↓
주문 목록 반환 (executed: false)
    ↓
UI 표시 (보유 현황: 비어있음, 주문: 미체결)
```

**문제점**: `processOrderExecution()`이 호출되지 않아 주문이 체결되지 않음

---

## 2. 가정 (Assumptions)

### 2.1 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 | 오류 시 영향 |
|----|------|--------|------|-------------|
| A1 | 사이클 시작일에는 Tier 1 매수가 자동 체결되어야 한다 | High | 레퍼런스 사이트 동작 확인 | 트레이딩 시작 불가 |
| A2 | 종가 데이터가 있으면 해당 일자의 주문은 체결 처리되어야 한다 | High | LOC 주문의 정의 | 주문 미체결 누적 |
| A3 | 보유 현황은 체결된 매수 주문을 즉시 반영해야 한다 | High | 사용자 기대 | UI와 실제 상태 불일치 |
| A4 | 오늘의 주문은 오늘 종가 확정 후 체결 처리된다 | High | LOC 주문 규칙 | 미래 체결 불가 |

### 2.2 기술 가정

| ID | 가정 | 신뢰도 | 근거 | 검증 방법 |
|----|------|--------|------|----------|
| T1 | 종가 데이터는 장 마감 후 DB에 존재한다 | High | 기존 데이터 수집 시스템 | DB 조회 |
| T2 | 이전 거래일의 주문은 체결 판정이 가능하다 | High | 종가 데이터 존재 | 가격 데이터 확인 |
| T3 | 주문 생성과 체결은 원자적으로 처리되어야 한다 | Medium | 데이터 일관성 | 트랜잭션 테스트 |

### 2.3 근본 원인 분석 (Five Whys)

**표면 문제**: 보유 현황 테이블이 비어있고, 주문 테이블에 Tier 1 BUY만 표시됨

1. **Why 1**: 주문이 체결되지 않았기 때문
2. **Why 2**: `processOrderExecution()`이 호출되지 않기 때문
3. **Why 3**: GET API가 주문 생성만 하고 체결 처리를 하지 않기 때문
4. **Why 4**: 체결 처리가 별도 POST 요청으로 분리되어 있기 때문
5. **Root Cause**: 이전 거래일 주문의 자동 체결 메커니즘이 없음

---

## 3. 요구사항 (Requirements)

### 3.1 기능적 요구사항

#### REQ-001: 이전 거래일 주문 자동 체결

**[Event-Driven]** **WHEN** 오늘 주문을 조회하면 **THEN** 시스템은 종가 데이터가 있는 이전 거래일의 미체결 주문을 먼저 체결 처리해야 한다.

**상세 규칙**:
- 이전 거래일 = 주말 제외한 직전 거래일
- 종가 데이터가 있으면 체결 판정 실행
- 체결 후 `tier_holdings` 테이블 즉시 업데이트

#### REQ-002: 사이클 시작일 첫 매수 체결

**[State-Driven]** **IF** 모든 티어가 비어있고 (사이클 시작) **AND** 이전 거래일 종가 데이터가 존재하면 **THEN** 시스템은 Tier 1 매수 주문을 자동 생성하고 체결 조건을 확인해야 한다.

**체결 조건**:
- 당일 종가 <= 매수 지정가 (전일 종가 x (1 + buyThreshold))
- 체결 시 매수가 = 당일 종가

#### REQ-003: 보유 현황 실시간 반영

**[Ubiquitous]** 시스템은 **항상** 체결된 매수 주문을 `tier_holdings` 테이블에 즉시 반영해야 한다:
- `buyPrice`: 체결가 (종가)
- `shares`: 체결 수량
- `buyDate`: 체결일
- `sellTargetPrice`: 매수가 기준 매도 목표가

#### REQ-004: 당일 주문 표시

**[Event-Driven]** **WHEN** 주문 목록을 조회하면 **THEN** 시스템은 다음 주문을 표시해야 한다:
- 보유 티어에 대한 매도 주문 (LOC 또는 MOC)
- 다음 빈 티어에 대한 매수 주문 (LOC)

#### REQ-005: 주문 가격 참조 일관성

**[Ubiquitous]** 시스템은 **항상** 다음 가격 참조 규칙을 따라야 한다:
- 매수 지정가 계산: 전일 종가 기준
- 매수 체결 판정: 당일 종가 <= 매수 지정가
- 매수 체결가: 당일 종가
- 매도 지정가 계산: 해당 티어 매수 체결가 기준

### 3.2 비기능적 요구사항

#### REQ-006: 응답 시간

**[Ubiquitous]** 시스템은 **항상** 주문 조회 API를 500ms 이내에 응답해야 한다.

#### REQ-007: 데이터 일관성

**[Unwanted]** 시스템은 주문 체결과 보유 현황 업데이트 사이에 불일치 상태를 허용**하지 않아야 한다**.

### 3.3 제약사항

#### CON-001: 미래 체결 금지

**[Unwanted]** 시스템은 종가 데이터가 없는 날짜의 주문을 체결**하지 않아야 한다**.

#### CON-002: 중복 체결 방지

**[Unwanted]** 시스템은 이미 체결된 주문을 다시 체결**하지 않아야 한다**.

---

## 4. 명세 (Specifications)

### 4.1 수정된 데이터 흐름

```
사용자 요청 (GET /api/trading/accounts/[id]/orders?date=today)
    ↓
┌─────────────────────────────────────────────────────┐
│ 1. 이전 거래일 미체결 주문 체결 처리                │
│    - getPreviousTradingDate(today)                  │
│    - 종가 데이터 확인                               │
│    - processOrderExecution(prevDate)                │
│    - tier_holdings 업데이트                         │
└─────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────┐
│ 2. 오늘 주문 생성                                   │
│    - 업데이트된 holdings 기반                       │
│    - generateDailyOrders(today)                     │
└─────────────────────────────────────────────────────┘
    ↓
주문 목록 반환 + 업데이트된 보유 현황
```

### 4.2 API 수정 명세

#### GET /api/trading/accounts/[id]/orders

**기존 동작**:
1. 기존 주문 조회
2. 없으면 주문 생성
3. 주문 목록 반환

**수정된 동작**:
1. **[NEW]** 이전 거래일 미체결 주문 체결 처리
2. 기존 주문 조회
3. 없으면 주문 생성 (업데이트된 holdings 기반)
4. 주문 목록 반환

**응답 예시** (2026-01-24):
```json
{
  "date": "2026-01-24",
  "orders": [
    {
      "tier": 1,
      "type": "SELL",
      "orderMethod": "LOC",
      "limitPrice": 62.83,
      "shares": 146,
      "executed": false
    },
    {
      "tier": 2,
      "type": "BUY",
      "orderMethod": "LOC",
      "limitPrice": 61.53,
      "shares": 151,
      "executed": false
    }
  ],
  "executedPreviousOrders": [
    {
      "date": "2026-01-23",
      "tier": 1,
      "type": "BUY",
      "limitPrice": 61.6,
      "shares": 146,
      "executed": true
    }
  ]
}
```

### 4.3 함수 수정 명세

#### 새 함수: processPreviousDayExecution()

```typescript
/**
 * 이전 거래일 주문 체결 처리
 * @param accountId - 계좌 ID
 * @param currentDate - 현재 날짜 (YYYY-MM-DD)
 * @param ticker - 종목
 * @returns 체결 결과 목록
 */
function processPreviousDayExecution(
  accountId: string,
  currentDate: string,
  ticker: Ticker
): ExecutionResult[];
```

**의사코드**:
```
함수 processPreviousDayExecution(accountId, currentDate, ticker):
    prevDate = getPreviousTradingDate(currentDate)

    // 종가 데이터 확인
    closePrice = getClosingPrice(ticker, prevDate)
    IF closePrice가 없으면:
        RETURN []

    // 이전 거래일 미체결 주문 조회
    orders = getDailyOrders(accountId, prevDate)
    IF 미체결 주문이 없으면:
        RETURN []

    // 체결 처리
    results = processOrderExecution(accountId, prevDate, ticker)
    RETURN results
```

### 4.4 검증 시나리오

**시나리오 1: 사이클 시작**
- 시작 조건: 모든 티어 비어있음, 사이클 시작일 = 2026-01-23
- 2026-01-22 종가: $61.66
- 2026-01-23 종가: $61.60
- 매수 임계값: -0.01% (Pro1)
- 예상 매수 지정가: floor(61.66 * 0.9999, 2) = $61.65
- 체결 조건: 61.60 <= 61.65 (만족)
- 예상 결과:
  - Tier 1 매수 체결: 146주 @ $61.60
  - Holdings: Tier 1 = {shares: 146, buyPrice: 61.60, buyDate: 2026-01-23}

**시나리오 2: 다음 날 주문 조회**
- 조회일: 2026-01-24
- 사전 조건: Tier 1 보유 (146주 @ $61.60)
- 예상 주문:
  - Tier 1 SELL (LOC): $62.83 (= floor(61.60 * 1.02, 2)), 146주
  - Tier 2 BUY (LOC): $61.53 (= floor(61.54 * 0.9999, 2)), 151주

---

## 5. 추적성 (Traceability)

### 5.1 관련 문서

| 문서 | 경로 | 관계 |
|------|------|------|
| 백테스트 SPEC | `.moai/specs/SPEC-BACKTEST-001/` | 참조 (동일 로직) |
| 전략 가이드 | `docs/떨사오팔_Pro_투자전략_가이드_초보자용.md` | 참조 |
| 트레이딩 타입 | `src/types/trading.ts` | 구현 |
| 트레이딩 코어 | `src/utils/trading-core.ts` | 구현 |

### 5.2 코드 참조

| 요구사항 | 영향받는 코드 |
|----------|--------------|
| REQ-001 | `src/app/api/trading/accounts/[id]/orders/route.ts:GET` |
| REQ-002 | `src/database/trading.ts:generateDailyOrders` |
| REQ-003 | `src/database/trading.ts:processOrderExecution` |
| REQ-004 | `src/database/trading.ts:generateDailyOrders` |
| REQ-005 | `src/utils/trading-core.ts` |

---

## 6. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-24 | manager-spec | 초기 SPEC 작성 |
