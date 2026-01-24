# SPEC-TRADING-001: 구현 계획

## 추적성 태그

| 항목 | 값 |
|------|-----|
| **SPEC ID** | SPEC-TRADING-001 |
| **문서 유형** | Implementation Plan |
| **상태** | Draft |

---

## 1. 마일스톤

### Primary Goal: 이전 거래일 자동 체결 구현

**목표**: 주문 조회 시 이전 거래일 미체결 주문 자동 체결

**작업 항목**:

1. **API 엔드포인트 수정** (`src/app/api/trading/accounts/[id]/orders/route.ts`)
   - GET 핸들러에 이전 거래일 체결 로직 추가
   - `processPreviousDayExecution()` 호출 추가
   - 체결 결과를 응답에 포함

2. **체결 처리 함수 추가** (`src/database/trading.ts`)
   - `processPreviousDayExecution()` 함수 신규 생성
   - 이전 거래일 미체결 주문 조회
   - 종가 데이터 존재 시 체결 처리
   - 체결 후 holdings 자동 업데이트

**의존성**: 없음 (독립 작업)

**검증 기준**:
- [ ] 이전 거래일 미체결 주문이 자동 체결됨
- [ ] 체결 후 tier_holdings 테이블 업데이트됨
- [ ] 중복 체결 방지 확인

---

### Secondary Goal: 사이클 시작 로직 검증

**목표**: 사이클 시작일 Tier 1 매수 정상 동작 확인

**작업 항목**:

1. **주문 생성 로직 검증** (`src/database/trading.ts:generateDailyOrders`)
   - 빈 holdings 상태에서 Tier 1 매수 주문 생성 확인
   - 전일 종가 기준 매수 지정가 계산 검증
   - 수량 계산 검증 (decimal.js 정밀도)

2. **체결 판정 로직 검증** (`src/database/trading.ts:processOrderExecution`)
   - 종가 <= 지정가 조건 확인
   - 체결가 = 종가 설정 확인
   - sellTargetPrice 계산 검증

**의존성**: Primary Goal 완료 후

**검증 기준**:
- [ ] 사이클 시작 시 Tier 1 매수 주문 생성됨
- [ ] 체결 조건 만족 시 정상 체결됨
- [ ] Holdings에 정확한 값 저장됨

---

### Final Goal: UI 보유 현황 표시 수정

**목표**: 보유 현황 테이블에 체결된 포지션 표시

**작업 항목**:

1. **데이터 정합성 확인**
   - API 응답에 최신 holdings 포함 확인
   - 클라이언트 상태 업데이트 확인

2. **UI 컴포넌트 검증** (`src/app/trading/[accountId]/_client.tsx`)
   - `TierHoldingsTable` 데이터 바인딩 확인
   - 보유일 계산 로직 확인

**의존성**: Secondary Goal 완료 후

**검증 기준**:
- [ ] 보유 현황 테이블에 Tier 1 표시됨
- [ ] 보유일 정확히 계산됨
- [ ] 매도 목표가 표시됨

---

## 2. 기술적 접근 방식

### 2.1 핵심 변경 사항

#### API 레이어 변경

```typescript
// GET /api/trading/accounts/[id]/orders
export async function GET(request: Request, { params }: RouteParams) {
  // ... 인증 및 계좌 확인 ...

  // [NEW] 이전 거래일 미체결 주문 체결 처리
  const prevExecutionResults = processPreviousDayExecution(
    id,
    date,
    account.ticker
  );

  // 기존 주문 조회 (체결 처리 후)
  let orders = getDailyOrders(id, date);

  // 주문이 없으면 자동 생성 (업데이트된 holdings 기반)
  if (orders.length === 0) {
    const holdings = getTierHoldings(id); // 체결로 업데이트된 holdings
    orders = generateDailyOrders(...);
  }

  return NextResponse.json({
    date,
    orders,
    executedPreviousOrders: prevExecutionResults, // [NEW]
  });
}
```

#### 데이터베이스 레이어 변경

```typescript
// src/database/trading.ts

/**
 * 이전 거래일 미체결 주문 체결 처리
 */
export function processPreviousDayExecution(
  accountId: string,
  currentDate: string,
  ticker: Ticker
): ExecutionResult[] {
  const prevDate = getPreviousTradingDate(currentDate);

  // 종가 데이터 확인
  const closePrice = getClosingPrice(ticker, prevDate);
  if (!closePrice) {
    return [];
  }

  // 이전 거래일 미체결 주문 확인
  const orders = getDailyOrders(accountId, prevDate);
  const hasUnexecutedOrders = orders.some(o => !o.executed);

  if (!hasUnexecutedOrders) {
    return [];
  }

  // 체결 처리
  return processOrderExecution(accountId, prevDate, ticker);
}
```

### 2.2 가격 참조 정리

| 단계 | 사용 가격 | 함수 |
|------|----------|------|
| 매수 지정가 계산 | 전일 종가 | `calculateBuyLimitPrice(prevClose, threshold)` |
| 매수 체결 판정 | 당일 종가 | `shouldExecuteBuy(closePrice, limitPrice)` |
| 매수 체결가 기록 | 당일 종가 | `updateTierHolding(..., buyPrice: closePrice)` |
| 매도 지정가 계산 | 매수 체결가 | `calculateSellLimitPrice(buyPrice, threshold)` |

### 2.3 데이터 흐름 시퀀스

```
2026-01-23 (사이클 시작일):
┌────────────────────────────────────────────────────────────┐
│ 1. 주문 조회 요청 (date=2026-01-23)                        │
│ 2. 이전 거래일(2026-01-22) 체결 확인 → 없음 (첫 거래)     │
│ 3. 오늘 주문 생성:                                         │
│    - Holdings: 비어있음 → Tier 1 매수 생성                 │
│    - 매수 지정가: floor(61.66 * 0.9999, 2) = $61.65       │
│    - 수량: floor(500 / 61.65) = 8주 (5% 시드)            │
│ 4. 주문 반환 (미체결 상태)                                 │
└────────────────────────────────────────────────────────────┘

2026-01-24 (다음 거래일):
┌────────────────────────────────────────────────────────────┐
│ 1. 주문 조회 요청 (date=2026-01-24)                        │
│ 2. 이전 거래일(2026-01-23) 체결 처리:                      │
│    - 종가: $61.60                                          │
│    - Tier 1 매수: $61.60 <= $61.65 → 체결!                │
│    - Holdings 업데이트: Tier 1 = 8주 @ $61.60             │
│ 3. 오늘 주문 생성:                                         │
│    - Holdings: Tier 1 보유 → Tier 1 매도 + Tier 2 매수    │
│ 4. 주문 반환 + 이전 체결 결과                              │
└────────────────────────────────────────────────────────────┘
```

---

## 3. 위험 및 대응 계획

### Risk 1: 체결 순서 의존성

**위험**: 매도와 매수 주문의 체결 순서가 결과에 영향

**대응**:
- 매도 주문을 먼저 처리
- 매도 체결 후 현금 잔고 업데이트
- 업데이트된 잔고로 매수 주문 처리

### Risk 2: 중복 체결

**위험**: 같은 주문이 여러 번 체결될 수 있음

**대응**:
- `order.executed` 플래그 확인
- 체결 전 상태 검증
- 트랜잭션 사용 고려

### Risk 3: 가격 데이터 누락

**위험**: 특정 날짜의 종가 데이터가 없을 수 있음

**대응**:
- `getClosingPrice()` null 체크
- null인 경우 체결 처리 스킵
- 사용자에게 데이터 누락 안내 (Optional)

---

## 4. 구현 순서

### Phase 1: 핵심 로직 구현

1. `processPreviousDayExecution()` 함수 작성
2. GET API 핸들러에 함수 호출 추가
3. 단위 테스트 작성

### Phase 2: 통합 테스트

1. 사이클 시작 시나리오 테스트
2. 연속 체결 시나리오 테스트
3. 손절 시나리오 테스트

### Phase 3: UI 검증

1. 보유 현황 테이블 데이터 확인
2. 주문 테이블 데이터 확인
3. 사용자 플로우 테스트

---

## 5. 테스트 계획

### 단위 테스트

```typescript
describe('processPreviousDayExecution', () => {
  it('이전 거래일 미체결 매수 주문을 체결해야 함', () => {
    // Given: 2026-01-23 미체결 Tier 1 매수 주문
    // When: 2026-01-24에 조회
    // Then: 주문 체결, holdings 업데이트
  });

  it('종가 데이터 없으면 체결하지 않아야 함', () => {
    // Given: 종가 데이터 없는 날짜
    // When: 체결 처리 시도
    // Then: 빈 결과 반환
  });

  it('이미 체결된 주문은 스킵해야 함', () => {
    // Given: executed=true인 주문
    // When: 체결 처리
    // Then: 중복 체결 안됨
  });
});
```

### 통합 테스트

```typescript
describe('Trading Cycle Flow', () => {
  it('사이클 시작부터 첫 매수까지 정상 동작해야 함', () => {
    // 1. 빈 계좌 생성
    // 2. 2026-01-23 주문 조회 → Tier 1 매수 주문 생성
    // 3. 2026-01-24 주문 조회 → Tier 1 매수 체결, Holdings 확인
    // 4. 2026-01-24 주문 → Tier 1 매도 + Tier 2 매수
  });
});
```

---

## 6. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-24 | manager-spec | 초기 계획 작성 |
