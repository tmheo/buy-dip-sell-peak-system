# SPEC-PERFORMANCE-001: 추천 API 성능 개선

## 개요

| 항목 | 내용 |
|------|------|
| **문서 ID** | SPEC-PERFORMANCE-001 |
| **작성일** | 2026-01-21 |
| **목표** | 추천 API 응답 시간 3-5초 → 100ms 이하 (98% 개선) |
| **상태** | 계획 |

---

## 1. 현재 문제 분석

### 1.1 병목 구간 식별

| 순위 | 병목 구간 | 소요 시간 | 시간 복잡도 | 원인 |
|------|----------|----------|-------------|------|
| 1 | 과거 기술적 지표 계산 | **2-3초** | O(m×n) | 4000회 반복 × 매번 SMA/RSI 재계산 |
| 2 | 유사 구간 백테스트 | **1-2초** | O(k×s×t) | 9개 백테스트 순차 실행 |
| 3 | DB 조회 + 기타 | **0.5-1초** | O(n) | 전체 컬럼 반환 |
| **합계** | | **3-5초** | | |

### 1.2 상세 분석

#### 과거 기술적 지표 계산 (2-3초)

**현재 코드** (`src/app/api/recommend/route.ts:234-243`):
```typescript
for (let i = 59; i <= maxHistoricalIndex; i++) {
  const metrics = calculateTechnicalMetrics(adjClosePrices, i);  // 매번 O(n)
  historicalMetrics.push({ dateIndex: i, date: dates[i], metrics });
}
```

**문제점**:
- 2010년부터 현재까지 ~4000개 거래일 순회
- 각 인덱스에서 SMA, RSI, 변동성 등 5개 지표를 처음부터 재계산
- 과거 데이터는 불변임에도 매 API 호출마다 동일 연산 반복

#### 백테스트 순차 실행 (1-2초)

**현재 코드** (`src/app/api/recommend/route.ts:267-336`):
```typescript
for (const period of similarPeriodsRaw) {           // 3회
  for (const strategy of ["Pro1", "Pro2", "Pro3"]) { // 3회
    const engine = new BacktestEngine(strategy);
    const result = engine.run(...);  // 순차 실행
  }
}
```

**문제점**:
- 9개 백테스트가 완전히 독립적임에도 순차 실행
- 각 백테스트는 ~300ms 소요 → 총 2.7초

---

## 2. 개선 방안

### 2.1 Phase 1: 기술적 지표 DB 저장

#### 핵심 아이디어
- 과거 기술적 지표는 **불변 데이터** → 한 번 계산 후 영구 저장
- Yahoo Finance 데이터 수집 시점에 지표도 함께 계산하여 저장
- API 호출 시 DB 조회만으로 즉시 응답

#### 구현 내용

**1. 스키마 변경** - `daily_metrics` 테이블 생성

```sql
CREATE TABLE IF NOT EXISTS daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL DEFAULT 'SOXL',
    date TEXT NOT NULL,
    ma20 REAL,
    ma60 REAL,
    ma_slope REAL,
    disparity REAL,
    rsi14 REAL,
    roc12 REAL,
    volatility20 REAL,
    golden_cross REAL,
    is_golden_cross INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_ticker_date ON daily_metrics(ticker, date);
```

**2. 지표 계산 서비스** - `src/services/metricsCalculator.ts` (신규)

```typescript
export interface DailyMetricRow {
  ticker: string;
  date: string;
  ma20: number | null;
  ma60: number | null;
  maSlope: number | null;
  disparity: number | null;
  rsi14: number | null;
  roc12: number | null;
  volatility20: number | null;
  goldenCross: number | null;
  isGoldenCross: boolean;
}

export function calculateMetricsBatch(
  prices: number[],
  dates: string[],
  ticker: string,
  startIndex: number,
  endIndex: number
): DailyMetricRow[]
```

**3. CLI 핸들러 수정** - `src/index.ts`

```typescript
// handleInit() 수정
await insertPrices(prices, ticker);
const metrics = calculateMetricsBatch(adjClosePrices, dates, ticker, 59, prices.length - 1);
await insertMetrics(metrics, ticker);
console.log(`✅ ${metrics.length}개 기술적 지표 저장 완료`);

// handleUpdate() 수정
await insertPrices(newPrices, ticker);
const allPrices = await getPricesByDateRange({ startDate: '2010-01-01', endDate: today }, ticker);
const startIdx = Math.max(59, allPrices.length - newPrices.length - 60);
const metrics = calculateMetricsBatch(adjClosePrices, dates, ticker, startIdx, allPrices.length - 1);
await upsertMetrics(metrics, ticker);  // UPSERT로 기존 데이터 갱신
```

**4. 추천 API 수정** - `src/app/api/recommend/route.ts`

```typescript
// 변경 전: 매번 계산
for (let i = 59; i <= maxHistoricalIndex; i++) {
  const metrics = calculateTechnicalMetrics(adjClosePrices, i);
}

// 변경 후: DB 조회
const historicalMetrics = await getMetricsByDateRange(
  { startDate: lookbackDateStr, endDate: maxHistoricalDate },
  ticker
);
```

#### 예상 효과
- **시간**: 2-3초 → ~50ms (DB 인덱스 조회)
- **개선율**: **98%**

---

### 2.2 Phase 2: 백테스트 병렬화

#### 핵심 아이디어
- 9개 백테스트 (3 구간 × 3 전략)는 서로 독립적
- `Promise.all()`을 사용하여 동시 실행

#### 구현 내용

**1. 백테스트 병렬 실행** - `src/app/api/recommend/route.ts`

```typescript
// 변경 전: 순차 실행 (9회 × 300ms = 2.7초)
for (const period of similarPeriodsRaw) {
  for (const strategy of strategies) {
    const result = engine.run(...);
  }
}

// 변경 후: 병렬 실행
const backtestPromises = similarPeriodsRaw.flatMap(period =>
  strategies.map(async strategy => {
    const engine = new BacktestEngine(createBacktestParameters(strategy));
    const result = await runBacktestAsync(engine, period);
    return { period, strategy, result };
  })
);

const allResults = await Promise.all(backtestPromises);

// 결과 그룹화
const resultsByPeriod = groupBy(allResults, r => r.period.dateIndex);
```

**2. 비동기 백테스트 래퍼** - `src/backtest/engine.ts`

```typescript
export async function runBacktestAsync(
  engine: BacktestEngine,
  request: BacktestRequest,
  prices: DailyPrice[],
  startIdx: number
): Promise<BacktestResult> {
  // CPU 집약적 작업을 다음 이벤트 루프로 지연
  return new Promise(resolve => {
    setImmediate(() => {
      const result = engine.run(request, prices, startIdx);
      resolve(result);
    });
  });
}
```

#### 예상 효과
- **시간**: 1-2초 → ~300ms (가장 긴 백테스트 1개 시간)
- **개선율**: **66-85%**

---

### 2.3 Phase 3: 추가 최적화 (선택)

#### DB 쿼리 최적화

```sql
-- 변경 전: 전체 컬럼
SELECT * FROM daily_prices WHERE ticker = ? AND date BETWEEN ? AND ?

-- 변경 후: 필요 컬럼만
SELECT date, adj_close FROM daily_prices WHERE ticker = ? AND date BETWEEN ? AND ?
```

- **효과**: 메모리 사용 50% 감소, DB I/O 60% 감소

#### 슬라이딩 윈도우 SMA (배치 계산 시)

```typescript
// 변경 전: O(period) per index
for (let i = startIndex; i <= endIndex; i++) {
  const ma20 = calculateSMA(prices, 20, i);  // 매번 20개 합산
}

// 변경 후: O(1) per index
let smaSum = prices.slice(startIndex - 19, startIndex + 1).reduce((a, b) => a + b, 0);
for (let i = startIndex; i <= endIndex; i++) {
  if (i > startIndex) {
    smaSum = smaSum - prices[i - 20] + prices[i];
  }
  const ma20 = smaSum / 20;
}
```

- **효과**: 배치 계산 속도 20배 향상

---

## 3. 구현 계획

### 3.1 파일 변경 목록

| Phase | 파일 | 변경 유형 | 설명 |
|-------|------|----------|------|
| 1 | `src/database/schema.ts` | 수정 | daily_metrics 테이블 추가 |
| 1 | `src/database/index.ts` | 수정 | 지표 CRUD 함수 추가 |
| 1 | `src/database/types.ts` | 수정 | DailyMetricRow 타입 추가 |
| 1 | `src/services/metricsCalculator.ts` | **신규** | 배치 지표 계산 서비스 |
| 1 | `src/index.ts` | 수정 | init/update 핸들러에 지표 저장 추가 |
| 1 | `src/app/api/recommend/route.ts` | 수정 | DB 조회로 변경 |
| 2 | `src/app/api/recommend/route.ts` | 수정 | 백테스트 병렬화 |
| 2 | `src/backtest/engine.ts` | 수정 | 비동기 래퍼 추가 (선택) |

### 3.2 마이그레이션 전략

```bash
# 1. 기존 데이터 백업
cp data/prices.db data/prices.db.backup

# 2. 스키마 마이그레이션 (daily_metrics 테이블 생성)
npm run dev migrate

# 3. 기존 가격 데이터로 지표 일괄 계산
npm run dev init-metrics -- --ticker SOXL
npm run dev init-metrics -- --ticker TQQQ

# 4. 검증
npm run dev verify-metrics
```

---

## 4. 검증 계획

### 4.1 단위 테스트

```typescript
// metricsCalculator.test.ts
describe('calculateMetricsBatch', () => {
  it('기존 calculateTechnicalMetrics와 동일한 결과 반환', () => {
    const batchResult = calculateMetricsBatch(prices, dates, 'SOXL', 59, 100);
    for (let i = 59; i <= 100; i++) {
      const legacyResult = calculateTechnicalMetrics(prices, i);
      expect(batchResult[i - 59].rsi14).toBeCloseTo(legacyResult.rsi14, 6);
    }
  });
});
```

### 4.2 통합 테스트

```bash
# 성능 측정
time curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"ticker":"SOXL","referenceDate":"today"}'

# 기대 결과
# 개선 전: real 3.5s
# 개선 후: real 0.1s
```

### 4.3 결과 정합성 검증

```typescript
// 개선 전 결과와 개선 후 결과가 동일한지 확인
const beforeResult = await fetchRecommend('SOXL', '2025-01-15');  // 개선 전 API
const afterResult = await fetchRecommend('SOXL', '2025-01-15');   // 개선 후 API

expect(afterResult.recommendedStrategy).toBe(beforeResult.recommendedStrategy);
expect(afterResult.similarPeriods.length).toBe(beforeResult.similarPeriods.length);
```

---

## 5. 예상 효과 요약

| 단계 | 개선 항목 | 개선 전 | 개선 후 | 개선율 |
|------|----------|---------|---------|--------|
| Phase 1 | 기술적 지표 DB 저장 | 2-3초 | 50ms | **98%** |
| Phase 2 | 백테스트 병렬화 | 1-2초 | 300ms | **70-85%** |
| **합계** | | **3-5초** | **~350ms** | **90-93%** |

---

## 6. 롤백 계획

문제 발생 시:

```bash
# 1. DB 복원
cp data/prices.db.backup data/prices.db

# 2. 코드 롤백
git revert HEAD~3  # Phase 1, 2 커밋 되돌리기

# 3. 서버 재시작
npm run build && npm run start
```

---

## 7. 참고 자료

### 관련 파일
- `src/app/api/recommend/route.ts` - 추천 API 메인 로직
- `src/recommend/similarity.ts` - 유사도 계산
- `src/recommend/score.ts` - 전략 점수 계산
- `src/backtest/metrics.ts` - 기술적 지표 계산
- `src/backtest/engine.ts` - 백테스트 엔진
- `src/database/index.ts` - DB 연결 및 쿼리

### 시간 복잡도 분석

| 연산 | 개선 전 | 개선 후 |
|------|---------|---------|
| 기술적 지표 | O(m×n) = 4000×4000 | O(1) DB 조회 |
| 백테스트 | O(k×s×t) = 3×3×1000 | O(t) = 1000 (병렬) |
| 전체 | ~16,000,000 연산 | ~1,000 연산 |
