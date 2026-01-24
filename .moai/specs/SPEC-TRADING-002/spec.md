# SPEC-TRADING-002: 수익 현황 (Profit Status) 기능

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-TRADING-002 |
| **제목** | 트레이딩 상세 페이지 수익 현황 기능 추가 |
| **상태** | Planned |
| **우선순위** | High |
| **생성일** | 2026-01-24 |
| **라이프사이클** | spec-anchored |
| **관련 SPEC** | SPEC-TRADING-001 |

---

## 1. 환경 (Environment)

### 1.1 기술 스택

| 구성요소 | 기술 | 버전 |
|----------|------|------|
| 런타임 | Node.js | 20.x LTS |
| 언어 | TypeScript | 5.7.3 |
| 프레임워크 | Next.js | 15.x (App Router) |
| UI 프레임워크 | React | 19.x |
| CSS 프레임워크 | Bootstrap | 5.3.3 (Solar Theme) |
| 데이터베이스 | SQLite | better-sqlite3 v11.7.0 |
| 수학 라이브러리 | decimal.js | 최신 안정 버전 |

### 1.2 영향받는 파일

| 파일 | 역할 | 수정 범위 |
|------|------|----------|
| `src/database/schema.ts` | DB 스키마 정의 | 신규 테이블 추가 |
| `src/database/trading.ts` | 주문 체결 로직 | 수익 기록 추가 |
| `src/types/trading.ts` | 타입 정의 | 신규 타입 추가 |
| `src/app/api/trading/accounts/[id]/profits/route.ts` | 수익 API | 신규 생성 |
| `src/components/trading/ProfitStatusTable.tsx` | UI 컴포넌트 | 신규 생성 |
| `src/app/trading/[accountId]/_client.tsx` | 상세 페이지 | 컴포넌트 추가 |

### 1.3 현재 상태 분석

**현재 구조**:
```
트레이딩 상세 페이지
├── AccountSettingsCard (계좌 설정)
├── AssetSummary (자산 요약)
├── TierHoldingsTable (티어 보유 현황)
└── DailyOrdersTable (당일 주문)
```

**누락된 기능**:
- 매도 체결 시 수익/손실 기록 없음
- 과거 거래 내역 조회 불가
- 월별 수익 현황 시각화 없음

### 1.4 레퍼런스 사이트 분석

| 요소 | 설명 |
|------|------|
| 월별 섹션 | 2025-12 상세 내역, 2026-01 상세 내역 (접기/펼치기) |
| 테이블 컬럼 | 날짜, 전략, 원금($), 수익금($), 수익률, 작업 |
| 소계 | 월별 소계 (합계 행) |
| 총 수익 | 전체 수익 요약 섹션 |

---

## 2. 가정 (Assumptions)

### 2.1 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 | 오류 시 영향 |
|----|------|--------|------|-------------|
| A1 | 매도 체결 시 자동으로 수익 기록이 생성되어야 한다 | High | 사용자 요구사항 | 수동 기록 필요 |
| A2 | 같은 날 여러 티어가 매도되면 각각 별도 기록이 생성된다 | High | 사용자 요구사항 | 티어별 분석 불가 |
| A3 | 과거 월 데이터는 기본적으로 접혀있고 클릭 시 펼쳐진다 | Medium | UX 편의성 | 화면 복잡도 증가 |
| A4 | 수익률은 티어별 매수금액 대비로 계산한다 | High | 레퍼런스 사이트 | 부정확한 수익률 |

### 2.2 기술 가정

| ID | 가정 | 신뢰도 | 근거 | 검증 방법 |
|----|------|--------|------|----------|
| T1 | 수익 기록은 매도 체결 시점에 동기적으로 생성된다 | High | 데이터 일관성 | 체결 로직 테스트 |
| T2 | Decimal.js로 모든 금융 계산을 수행한다 | High | CLAUDE.local.md 규칙 | 코드 리뷰 |
| T3 | 수익 기록 테이블은 trading_accounts와 외래키 관계를 가진다 | High | CASCADE 삭제 필요 | DB 스키마 검토 |

### 2.3 근본 원인 분석 (Five Whys)

**표면 문제**: 과거 거래 수익을 확인할 수 없음

1. **Why 1**: 수익 기록이 없기 때문
2. **Why 2**: 매도 체결 시 수익을 저장하지 않기 때문
3. **Why 3**: 수익 기록 테이블이 존재하지 않기 때문
4. **Why 4**: 초기 설계 시 현재 보유 현황만 고려했기 때문
5. **Root Cause**: 거래 이력 추적 기능이 설계에서 누락됨

---

## 3. 요구사항 (Requirements)

### 3.1 기능적 요구사항

#### REQ-001: 수익 기록 자동 생성

**[Event-Driven]** **WHEN** 매도 주문이 체결되면 **THEN** 시스템은 해당 티어의 수익 기록을 자동으로 생성해야 한다.

**기록 항목**:
- 계좌 ID
- 티어 번호
- 매수일, 매수가, 매수 수량
- 매도일, 매도가
- 수익금 (= 매도금액 - 매수금액)
- 수익률 (= 수익금 / 매수금액 * 100)
- 전략 (Pro1/Pro2/Pro3)
- 티커 (SOXL/TQQQ)

#### REQ-002: 다중 티어 개별 기록

**[Event-Driven]** **WHEN** 같은 날 여러 티어가 매도 체결되면 **THEN** 시스템은 각 티어에 대해 별도의 수익 기록을 생성해야 한다.

**예시**:
- 가격 급등으로 티어 1, 2, 3이 동시 매도 → 3개의 수익 기록 생성

#### REQ-003: 수익 현황 테이블 표시

**[Event-Driven]** **WHEN** 트레이딩 상세 페이지를 열면 **THEN** 시스템은 수익 현황 테이블을 표시해야 한다.

**표시 항목**:
- 날짜 (매도일)
- 티어 번호
- 전략
- 매수금액 ($)
- 매도금액 ($)
- 수익금 ($)
- 수익률 (%)

#### REQ-004: 월별 접기/펼치기

**[State-Driven]** **IF** 수익 기록이 현재 월이 아닌 경우 **THEN** 해당 월의 섹션은 기본적으로 접힌 상태로 표시된다.

**동작**:
- 현재 월: 펼쳐진 상태 (expanded)
- 과거 월: 접힌 상태 (collapsed)
- 클릭 시 토글

#### REQ-005: 월별 소계 표시

**[Ubiquitous]** 시스템은 **항상** 각 월의 마지막에 소계 행을 표시해야 한다.

**소계 항목**:
- 총 거래 수
- 총 매수금액
- 총 매도금액
- 총 수익금
- 평균 수익률

#### REQ-006: 수익 현황 API

**[Event-Driven]** **WHEN** GET /api/trading/accounts/[id]/profits 요청이 들어오면 **THEN** 시스템은 해당 계좌의 모든 수익 기록을 월별로 그룹화하여 반환해야 한다.

### 3.2 비기능적 요구사항

#### REQ-007: 정밀도 보장

**[Ubiquitous]** 시스템은 **항상** 모든 금융 계산에 Decimal.js를 사용하여 부동소수점 오차를 방지해야 한다.

#### REQ-008: 응답 시간

**[Ubiquitous]** 시스템은 **항상** 수익 조회 API를 500ms 이내에 응답해야 한다.

### 3.3 제약사항

#### CON-001: 매도 체결만 기록

**[Unwanted]** 시스템은 매수 체결에 대해 수익 기록을 생성**하지 않아야 한다**.

#### CON-002: 수익 기록 변경 불가

**[Unwanted]** 시스템은 이미 생성된 수익 기록을 수정**하지 않아야 한다** (읽기 전용).

---

## 4. 명세 (Specifications)

### 4.1 데이터베이스 스키마

#### 신규 테이블: profit_records

```sql
CREATE TABLE IF NOT EXISTS profit_records (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    tier INTEGER NOT NULL CHECK(tier >= 1 AND tier <= 7),
    ticker TEXT NOT NULL CHECK(ticker IN ('SOXL', 'TQQQ')),
    strategy TEXT NOT NULL CHECK(strategy IN ('Pro1', 'Pro2', 'Pro3')),
    buy_date TEXT NOT NULL,
    buy_price REAL NOT NULL,
    buy_quantity INTEGER NOT NULL,
    sell_date TEXT NOT NULL,
    sell_price REAL NOT NULL,
    buy_amount REAL NOT NULL,      -- 매수금액 = buy_price * buy_quantity
    sell_amount REAL NOT NULL,     -- 매도금액 = sell_price * buy_quantity
    profit REAL NOT NULL,          -- 수익금 = sell_amount - buy_amount
    profit_rate REAL NOT NULL,     -- 수익률 = profit / buy_amount * 100
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES trading_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profit_records_account_id
ON profit_records(account_id);

CREATE INDEX IF NOT EXISTS idx_profit_records_sell_date
ON profit_records(account_id, sell_date DESC);
```

### 4.2 타입 정의

```typescript
/**
 * 수익 기록 엔티티
 */
export interface ProfitRecord {
  id: string;
  accountId: string;
  tier: number;
  ticker: Ticker;
  strategy: Strategy;
  buyDate: string;
  buyPrice: number;
  buyQuantity: number;
  sellDate: string;
  sellPrice: number;
  buyAmount: number;
  sellAmount: number;
  profit: number;
  profitRate: number;
  createdAt: string;
}

/**
 * 월별 수익 요약
 */
export interface MonthlyProfitSummary {
  yearMonth: string;         // YYYY-MM
  records: ProfitRecord[];
  totalTrades: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalProfit: number;
  averageProfitRate: number;
}

/**
 * 수익 현황 API 응답
 */
export interface ProfitStatusResponse {
  accountId: string;
  months: MonthlyProfitSummary[];
  grandTotal: {
    totalTrades: number;
    totalBuyAmount: number;
    totalSellAmount: number;
    totalProfit: number;
    averageProfitRate: number;
  };
}
```

### 4.3 수익 기록 생성 로직

```typescript
/**
 * 매도 체결 시 수익 기록 생성
 * processOrderExecution() 내부에서 호출
 */
function createProfitRecord(
  accountId: string,
  holding: TierHolding,
  sellDate: string,
  sellPrice: number,
  ticker: Ticker,
  strategy: Strategy
): ProfitRecord {
  const buyAmount = new Decimal(holding.buyPrice!)
    .mul(holding.shares)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  const sellAmount = new Decimal(sellPrice)
    .mul(holding.shares)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toNumber();

  const profit = new Decimal(sellAmount)
    .sub(buyAmount)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  const profitRate = new Decimal(profit)
    .div(buyAmount)
    .mul(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  // DB 삽입 및 반환
  return insertProfitRecord({
    accountId,
    tier: holding.tier,
    ticker,
    strategy,
    buyDate: holding.buyDate!,
    buyPrice: holding.buyPrice!,
    buyQuantity: holding.shares,
    sellDate,
    sellPrice,
    buyAmount,
    sellAmount,
    profit,
    profitRate,
  });
}
```

### 4.4 API 명세

#### GET /api/trading/accounts/[id]/profits

**요청**:
```
GET /api/trading/accounts/{accountId}/profits
Authorization: Bearer {session}
```

**응답** (200 OK):
```json
{
  "accountId": "abc-123",
  "months": [
    {
      "yearMonth": "2026-01",
      "records": [
        {
          "id": "rec-001",
          "tier": 1,
          "ticker": "SOXL",
          "strategy": "Pro1",
          "buyDate": "2026-01-15",
          "buyPrice": 61.60,
          "buyQuantity": 8,
          "sellDate": "2026-01-20",
          "sellPrice": 62.50,
          "buyAmount": 492.80,
          "sellAmount": 500.00,
          "profit": 7.20,
          "profitRate": 1.46
        }
      ],
      "totalTrades": 1,
      "totalBuyAmount": 492.80,
      "totalSellAmount": 500.00,
      "totalProfit": 7.20,
      "averageProfitRate": 1.46
    }
  ],
  "grandTotal": {
    "totalTrades": 1,
    "totalBuyAmount": 492.80,
    "totalSellAmount": 500.00,
    "totalProfit": 7.20,
    "averageProfitRate": 1.46
  }
}
```

### 4.5 UI 컴포넌트 구조

```
ProfitStatusTable
├── 헤더 섹션
│   └── "수익 현황" 제목
├── 월별 섹션 (반복)
│   ├── 월 헤더 (2026-01 상세 내역) [접기/펼치기 아이콘]
│   ├── 수익 기록 테이블
│   │   ├── 테이블 헤더 (날짜, 티어, 전략, 매수금액, 매도금액, 수익금, 수익률)
│   │   ├── 기록 행 (반복)
│   │   └── 소계 행
│   └── 구분선
└── 총계 섹션
    └── 전체 수익 요약
```

### 4.6 컴포넌트 Props

```typescript
interface ProfitStatusTableProps {
  accountId: string;
}

interface MonthSectionProps {
  yearMonth: string;
  records: ProfitRecord[];
  summary: {
    totalTrades: number;
    totalBuyAmount: number;
    totalSellAmount: number;
    totalProfit: number;
    averageProfitRate: number;
  };
  isExpanded: boolean;
  onToggle: () => void;
}
```

---

## 5. 추적성 (Traceability)

### 5.1 관련 문서

| 문서 | 경로 | 관계 |
|------|------|------|
| 주문 체결 SPEC | `.moai/specs/SPEC-TRADING-001/` | 선행 (매도 체결 로직) |
| 백테스트 수익 계산 | `src/backtest/cycle.ts:deactivateTier()` | 참조 (동일 계산 로직) |
| 트레이딩 타입 | `src/types/trading.ts` | 확장 |
| 트레이딩 DB | `src/database/trading.ts` | 확장 |

### 5.2 코드 참조

| 요구사항 | 영향받는 코드 |
|----------|--------------|
| REQ-001 | `src/database/trading.ts:processOrderExecution` (수정) |
| REQ-002 | `src/database/trading.ts:createProfitRecord` (신규) |
| REQ-003 | `src/components/trading/ProfitStatusTable.tsx` (신규) |
| REQ-004 | `src/components/trading/MonthSection.tsx` (신규) |
| REQ-005 | `src/components/trading/ProfitStatusTable.tsx` (신규) |
| REQ-006 | `src/app/api/trading/accounts/[id]/profits/route.ts` (신규) |
| REQ-007 | 모든 계산 코드 |

---

## 6. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-24 | manager-spec | 초기 SPEC 작성 |
