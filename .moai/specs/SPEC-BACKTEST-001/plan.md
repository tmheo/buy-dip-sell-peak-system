# SPEC-BACKTEST-001 구현 계획

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-BACKTEST-001 |
| **제목** | 백테스트 엔진 구현 계획 |
| **생성일** | 2026-01-16 |

---

## 1. 마일스톤 개요

### Phase 1: 핵심 엔진 구현 (Primary Goal)

| 작업 | 설명 | 산출물 |
|------|------|--------|
| 타입 정의 | 백테스트 관련 TypeScript 타입 정의 | `src/backtest/types.ts` |
| 전략 설정 | Pro1/Pro2/Pro3 매개변수 상수 정의 | `src/backtest/strategy.ts` |
| 주문 계산 | LOC/MOC 주문 가격 및 수량 계산 로직 | `src/backtest/order.ts` |
| 사이클 관리 | 사이클 상태 및 티어 관리 클래스 | `src/backtest/cycle.ts` |
| 엔진 구현 | 메인 백테스트 실행 엔진 | `src/backtest/engine.ts` |

### Phase 2: 성과 지표 및 검증 (Secondary Goal)

| 작업 | 설명 | 산출물 |
|------|------|--------|
| 지표 계산 | 수익률, MDD, 승률 계산 로직 | `src/backtest/metrics.ts` |
| 검증 테스트 | 기준값 일치 검증 테스트 | `src/backtest/__tests__/` |
| 인덱스 파일 | 모듈 내보내기 정리 | `src/backtest/index.ts` |

### Phase 3: API 연동 (Final Goal)

| 작업 | 설명 | 산출물 |
|------|------|--------|
| API 엔드포인트 | REST API 구현 | `src/app/api/backtest/route.ts` |
| 에러 처리 | 입력 검증 및 에러 응답 | API 내 통합 |
| 통합 테스트 | API 엔드포인트 테스트 | `src/app/api/backtest/__tests__/` |

---

## 2. 기술적 접근 방식

### 2.1 아키텍처 설계

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Next.js)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  POST /api/backtest                                  │    │
│  │  - 입력 검증 (Zod)                                   │    │
│  │  - 에러 처리                                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backtest Engine Layer                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │ BacktestEngine│  │ CycleManager │  │ OrderCalculator│   │
│  │  - run()      │  │  - 티어 관리  │  │  - LOC 계산   │   │
│  │  - simulate() │  │  - 사이클 관리│  │  - MOC 계산   │   │
│  └───────────────┘  └───────────────┘  └───────────────┘   │
│  ┌───────────────┐  ┌───────────────┐                       │
│  │StrategyConfig │  │ MetricsCalc  │                       │
│  │  - Pro1/2/3   │  │  - 수익률     │                       │
│  │  - 매개변수   │  │  - MDD        │                       │
│  └───────────────┘  └───────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer (SQLite)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Database (기존)                                     │    │
│  │  - getPricesByDateRange()                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 설계 원칙

#### 매개변수화된 단일 알고리즘

- Pro1, Pro2, Pro3는 동일한 `BacktestEngine.run()` 메서드 사용
- 차이점은 `StrategyConfig` 객체의 매개변수로만 표현
- 새로운 전략 추가 시 매개변수 설정만 추가

```typescript
// 전략 설정 예시
const PRO_STRATEGIES: Record<string, StrategyConfig> = {
  Pro1: {
    name: 'Pro1',
    tierRatios: [0.05, 0.10, 0.15, 0.20, 0.25, 0.25],
    buyThreshold: -0.0001,
    sellThreshold: 0.0001,
    stopLossDay: 10,
  },
  Pro2: { /* ... */ },
  Pro3: { /* ... */ },
};
```

#### 소수점 처리

- 가격 계산: 소수점 둘째자리 **버림** (floor)
- 수량 계산: 정수로 **버림** (floor)
- JavaScript 부동소수점 오차 방지를 위한 유틸리티 함수 사용

```typescript
// 소수점 버림 유틸리티
function floorToDecimal(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.floor(value * multiplier) / multiplier;
}
```

#### 상태 관리

- 불변성 유지: 각 일별 상태는 새 객체로 생성
- 사이클 단위 명확한 구분
- 일별 스냅샷으로 디버깅 및 시각화 지원

### 2.3 데이터베이스 쿼리

기존 `src/database/index.ts`의 쿼리 함수 활용:

```typescript
// 기존 함수 사용
SELECT_PRICES_BY_DATE_RANGE = `
SELECT id, ticker, date, open, high, low, close, volume, created_at as createdAt
FROM daily_prices
WHERE ticker = ? AND date >= ? AND date <= ?
ORDER BY date ASC
`;
```

---

## 3. 구현 세부 계획

### 3.1 Phase 1 세부 작업

#### Task 1.1: 타입 정의 (`src/backtest/types.ts`)

```typescript
// 구현할 타입 목록
- StrategyName: 'Pro1' | 'Pro2' | 'Pro3'
- StrategyConfig: 전략 설정
- TierState: 티어 상태
- CycleState: 사이클 상태
- BacktestRequest: API 요청
- BacktestResult: API 응답
- DailySnapshot: 일별 스냅샷
- TradeAction: 거래 행동 타입
```

#### Task 1.2: 전략 설정 (`src/backtest/strategy.ts`)

```typescript
// 구현할 내용
- PRO_STRATEGIES 상수 객체
- getStrategy(name: StrategyName): StrategyConfig 함수
- validateStrategy(config: StrategyConfig): boolean 함수
```

#### Task 1.3: 주문 계산 (`src/backtest/order.ts`)

```typescript
// 구현할 함수
- calculateBuyLimitPrice(prevClose: number, threshold: number): number
- calculateSellLimitPrice(buyPrice: number, threshold: number): number
- calculateBuyQuantity(amount: number, limitPrice: number): number
- shouldExecuteBuy(close: number, limitPrice: number): boolean
- shouldExecuteSell(close: number, limitPrice: number): boolean
```

#### Task 1.4: 사이클 관리 (`src/backtest/cycle.ts`)

```typescript
// 구현할 클래스
class CycleManager {
  private state: CycleState;

  constructor(initialCapital: number, strategy: StrategyConfig);

  // 티어 관리
  getNextBuyTier(): number | null;
  getTierAmount(tier: number): number;
  activateTier(tier: number, buyPrice: number, shares: number, date: string): void;
  deactivateTier(tier: number, sellPrice: number): number; // 반환: 매도 금액

  // 사이클 관리
  incrementDay(): void;
  getDayCount(): number;
  isStopLossDay(): boolean;
  endCycle(): void;
  startNewCycle(): void;

  // 상태 조회
  getActiveTiers(): TierState[];
  getCash(): number;
  getTotalAsset(currentPrice: number): number;
}
```

#### Task 1.5: 엔진 구현 (`src/backtest/engine.ts`)

```typescript
// 구현할 클래스
class BacktestEngine {
  private db: Database;
  private strategy: StrategyConfig;

  constructor(db: Database, strategy: StrategyConfig);

  run(request: BacktestRequest): BacktestResult;

  private simulateDay(
    cycle: CycleManager,
    prevPrice: DailyPrice,
    currentPrice: DailyPrice
  ): DailySnapshot;

  private handleStopLoss(cycle: CycleManager, price: DailyPrice): TradeAction;
  private handleSellOrders(cycle: CycleManager, price: DailyPrice): TradeAction[];
  private handleBuyOrders(cycle: CycleManager, prevPrice: DailyPrice, price: DailyPrice): TradeAction | null;
}
```

### 3.2 Phase 2 세부 작업

#### Task 2.1: 지표 계산 (`src/backtest/metrics.ts`)

```typescript
// 구현할 함수
- calculateReturn(initial: number, final: number): number
- calculateMDD(history: DailySnapshot[]): number
- calculateWinRate(cycles: CycleResult[]): number
- calculateMetrics(history: DailySnapshot[]): PerformanceMetrics
```

#### Task 2.2: 검증 테스트

```typescript
// 테스트 케이스
describe('BacktestEngine', () => {
  it('Pro1 전략이 기준값과 일치해야 한다', async () => {
    const result = engine.run({
      ticker: 'SOXL',
      strategy: 'Pro1',
      startDate: '2025-01-02',
      endDate: '2025-12-19',
      initialCapital: 10000,
    });

    expect(result.finalAsset).toBeCloseTo(13472, 0);
    expect(result.returnRate).toBeCloseTo(0.3472, 2);
    expect(result.mdd).toBeCloseTo(-0.187, 2);
  });

  // Pro2, Pro3 테스트도 동일 구조
});
```

### 3.3 Phase 3 세부 작업

#### Task 3.1: API 엔드포인트

```typescript
// src/app/api/backtest/route.ts
import { z } from 'zod';
import { BacktestEngine } from '@/backtest/engine';
import { getStrategy } from '@/backtest/strategy';

const RequestSchema = z.object({
  ticker: z.string().default('SOXL'),
  strategy: z.enum(['Pro1', 'Pro2', 'Pro3']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  initialCapital: z.number().positive().default(10000),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = RequestSchema.parse(body);

    const engine = new BacktestEngine(db, getStrategy(validated.strategy));
    const result = engine.run(validated);

    return Response.json({ success: true, data: result });
  } catch (error) {
    // 에러 처리
  }
}
```

---

## 4. 리스크 및 대응 방안

### 4.1 기술적 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|----------|
| 부동소수점 정밀도 오차 | High | floorToDecimal 유틸리티로 일관된 처리 |
| 데이터 누락 (휴장일 등) | Medium | 데이터 연속성 검증 로직 추가 |
| 성능 저하 (대량 데이터) | Low | 스트리밍 처리 고려, 인덱스 활용 |

### 4.2 검증 리스크

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|----------|
| 기준값과 불일치 | High | 단계별 디버깅, 일별 스냅샷 비교 |
| 알고리즘 해석 오류 | Medium | 전략 가이드 재검토, 예시 시뮬레이션 |

---

## 5. 의존성

### 5.1 내부 의존성

| 모듈 | 용도 | 상태 |
|------|------|------|
| `src/database/index.ts` | 가격 데이터 조회 | 기존 구현 완료 |
| `src/types/index.ts` | DailyPrice 타입 | 기존 구현 완료 |

### 5.2 외부 의존성

| 패키지 | 용도 | 필요 여부 |
|--------|------|----------|
| `zod` | API 입력 검증 | 신규 추가 필요 |
| `vitest` | 단위 테스트 | 신규 추가 필요 |

---

## 6. 완료 기준

### 6.1 Phase 1 완료 기준

- [ ] 모든 타입 정의 완료 및 컴파일 통과
- [ ] 3개 전략 (Pro1/Pro2/Pro3) 설정 상수 정의
- [ ] LOC/MOC 주문 계산 함수 구현 및 단위 테스트 통과
- [ ] CycleManager 클래스 구현 및 단위 테스트 통과
- [ ] BacktestEngine 클래스 구현 및 기본 동작 확인

### 6.2 Phase 2 완료 기준

- [ ] 성과 지표 계산 함수 구현
- [ ] Pro1 기준값 검증 테스트 통과 (오차 ±1%)
- [ ] Pro2 기준값 검증 테스트 통과 (오차 ±1%)
- [ ] Pro3 기준값 검증 테스트 통과 (오차 ±1%)

### 6.3 Phase 3 완료 기준

- [ ] POST /api/backtest 엔드포인트 구현
- [ ] 입력 검증 및 에러 응답 처리
- [ ] API 통합 테스트 통과
- [ ] 프론트엔드 연동 확인

---

## 7. 추적성

| SPEC 요구사항 | 구현 작업 | Phase |
|--------------|----------|-------|
| REQ-001 | Task 1.2 전략 설정 | 1 |
| REQ-002, REQ-003 | Task 1.3 주문 계산 | 1 |
| REQ-004, REQ-005 | Task 1.3 주문 계산 | 1 |
| REQ-006 | Task 1.5 엔진 구현 | 1 |
| REQ-007, REQ-008 | Task 1.4 사이클 관리 | 1 |
| REQ-009 | Task 2.1 지표 계산 | 2 |
| REQ-010 | 전체 성능 검증 | 3 |
| REQ-011 | Task 2.2 검증 테스트 | 2 |
| REQ-012 | Task 3.1 API 엔드포인트 | 3 |
