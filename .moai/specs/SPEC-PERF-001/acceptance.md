---
spec_id: SPEC-PERF-001
version: "1.0.0"
created: 2026-01-30
updated: 2026-01-30
---

# SPEC-PERF-001 수락 기준

## 1. 테스트 시나리오

### TC-01: 유사도 함수 하위 호환성

**Given** 기존 코드에서 `calculateExponentialSimilarity(vectorA, vectorB)` 형태로 호출하고 있을 때
**When** 수정된 similarity.ts 파일로 교체하면
**Then** 기존 모든 테스트가 동일한 결과로 통과해야 한다

**검증 방법**:
```bash
npm test -- --grep "similarity"
```

**기대 결과**:
- 기존 테스트 케이스 100% 통과
- 동일한 입력에 대해 동일한 출력값

---

### TC-02: 커스텀 파라미터 유사도 계산

**Given** 커스텀 가중치 `[0.3, 0.4, 0.1, 0.1, 0.1]`과 허용오차 `[40, 80, 5, 35, 25]`가 주어졌을 때
**When** `calculateExponentialSimilarity(vectorA, vectorB, { weights, tolerances })`를 호출하면
**Then** 커스텀 파라미터를 사용한 유사도 값을 반환해야 한다

**검증 방법**:
```typescript
const result = calculateExponentialSimilarity(
  [5, 10, 50, 15, 20],
  [6, 12, 48, 14, 22],
  {
    weights: [0.3, 0.4, 0.1, 0.1, 0.1],
    tolerances: [40, 80, 5, 35, 25]
  }
);
// 기본 파라미터 결과와 다른 값이어야 함
const defaultResult = calculateExponentialSimilarity(
  [5, 10, 50, 15, 20],
  [6, 12, 48, 14, 22]
);
expect(result).not.toEqual(defaultResult);
```

---

### TC-03: 랜덤 파라미터 생성 - 가중치 정규화

**Given** 50개의 랜덤 파라미터 조합 생성을 요청했을 때
**When** `generateRandomParams(50)`을 실행하면
**Then** 모든 조합의 가중치 합이 정확히 1.0이어야 한다

**검증 방법**:
```typescript
const params = generateRandomParams(50);
for (const p of params) {
  const sum = p.weights.reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - 1.0)).toBeLessThan(1e-10);
}
```

---

### TC-04: 랜덤 파라미터 생성 - 허용오차 범위

**Given** 랜덤 파라미터 생성을 요청했을 때
**When** 파라미터가 생성되면
**Then** 각 허용오차 값이 지정된 범위 내에 있어야 한다

**검증 방법**:
```typescript
const TOLERANCE_RANGES = {
  maSlope: { min: 10, max: 100 },
  disparity: { min: 30, max: 200 },
  rsi: { min: 1, max: 20 },
  roc: { min: 10, max: 100 },
  volatility: { min: 10, max: 80 }
};

const params = generateRandomParams(50);
for (const p of params) {
  expect(p.tolerances[0]).toBeGreaterThanOrEqual(10);
  expect(p.tolerances[0]).toBeLessThanOrEqual(100);
  expect(p.tolerances[1]).toBeGreaterThanOrEqual(30);
  expect(p.tolerances[1]).toBeLessThanOrEqual(200);
  // ... (모든 지표에 대해)
}
```

---

### TC-05: 변형 파라미터 생성

**Given** 기준 파라미터 `{ weights: [0.3, 0.4, 0.1, 0.1, 0.1], tolerances: [40, 80, 5, 35, 25] }`가 주어졌을 때
**When** `generateVariations(baseParams, 10)`을 실행하면
**Then** 10개의 변형이 생성되고, 각 값이 기준값의 +/-10% 범위 내에 있어야 한다

**검증 방법**:
```typescript
const base = {
  weights: [0.3, 0.4, 0.1, 0.1, 0.1],
  tolerances: [40, 80, 5, 35, 25]
};
const variations = generateVariations(base, 10);

expect(variations.length).toBe(10);
for (const v of variations) {
  for (let i = 0; i < 5; i++) {
    expect(v.tolerances[i]).toBeGreaterThanOrEqual(base.tolerances[i] * 0.9);
    expect(v.tolerances[i]).toBeLessThanOrEqual(base.tolerances[i] * 1.1);
  }
  // 가중치 합은 여전히 1.0
  const sum = v.weights.reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - 1.0)).toBeLessThan(1e-10);
}
```

---

### TC-06: 백테스트 실행 - 커스텀 파라미터

**Given** 커스텀 유사도 파라미터가 설정되었을 때
**When** 해당 파라미터로 백테스트를 실행하면
**Then** 베이스라인과 다른 결과(수익률, MDD, 사이클 수)가 나와야 한다

**검증 방법**:
```typescript
const customParams = {
  weights: [0.25, 0.35, 0.15, 0.1, 0.15],
  tolerances: [45, 100, 6, 45, 35]
};
const customResult = await runBacktestWithParams(config, customParams);
const baselineResult = await runBacktestWithParams(config, null); // 기본값

// 결과가 달라야 함 (동일할 확률은 매우 낮음)
const isDifferent =
  customResult.returnRate !== baselineResult.returnRate ||
  customResult.mdd !== baselineResult.mdd ||
  customResult.totalCycles !== baselineResult.totalCycles;

expect(isDifferent).toBe(true);
```

---

### TC-07: 결과 분석 - 전략 점수 계산

**Given** 백테스트 결과 `returnRate: 0.45, mdd: -0.18`이 주어졌을 때
**When** 전략 점수를 계산하면
**Then** `returnRate * exp(mdd * 0.01)` 공식에 따른 값이 나와야 한다

**검증 방법**:
```typescript
const returnRate = 0.45;  // 45%
const mdd = -0.18;        // -18%

const expectedScore = returnRate * Math.exp(mdd * 0.01);
// 0.45 * exp(-0.0018) ≈ 0.45 * 0.9982 ≈ 0.4492

const actualScore = calculateStrategyScore(returnRate, mdd);
expect(Math.abs(actualScore - expectedScore)).toBeLessThan(1e-6);
```

---

### TC-08: 결과 순위 결정

**Given** 여러 파라미터 조합의 백테스트 결과가 있을 때
**When** 분석을 수행하면
**Then** 전략 점수 내림차순으로 정렬되어야 한다

**검증 방법**:
```typescript
const results = await runOptimization(config);

for (let i = 1; i < results.candidates.length; i++) {
  expect(results.candidates[i - 1].metrics.strategyScore)
    .toBeGreaterThanOrEqual(results.candidates[i].metrics.strategyScore);
}
```

---

### TC-09: CLI 전체 실행

**Given** CLI 명령어가 준비되었을 때
**When** 다음 명령어를 실행하면
```bash
npx tsx src/optimize/cli.ts --ticker SOXL --start 2025-01-01 --end 2025-12-31
```
**Then** 다음 내용이 출력되어야 한다:
- 베이스라인 결과 (가중치, 허용오차, 수익률, MDD, 전략 점수)
- Top 3 후보 (순위, 파라미터, 지표, 개선율)
- 요약 (총 탐색 조합, 실행 시간, 최고 개선율)

**검증 방법**: 수동 실행 및 출력 검증

---

### TC-10: 베이스라인 일치 검증

**Given** 기본 파라미터로 최적화 모듈을 통해 백테스트를 실행할 때
**When** 결과의 베이스라인 지표를 확인하면
**Then** 기존 `RecommendBacktestEngine` 직접 실행 결과와 동일해야 한다

**검증 방법**:
```typescript
// 최적화 모듈 경유
const optResult = await runOptimization({
  ticker: "SOXL",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  initialCapital: 10000
});

// 직접 실행
const directResult = await runRecommendBacktest({
  ticker: "SOXL",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  initialCapital: 10000
});

expect(optResult.baseline.returnRate).toBeCloseTo(directResult.returnRate, 4);
expect(optResult.baseline.mdd).toBeCloseTo(directResult.mdd, 4);
```

---

## 2. 엣지 케이스

### EC-01: 빈 가격 데이터

**Given** 지정된 기간에 가격 데이터가 없을 때
**When** 최적화를 실행하면
**Then** 적절한 에러 메시지와 함께 종료되어야 한다

```typescript
expect(() => runOptimization({
  ticker: "SOXL",
  startDate: "2030-01-01",
  endDate: "2030-12-31"
})).toThrow("가격 데이터가 부족합니다");
```

---

### EC-02: 단일 조합 탐색

**Given** `randomCombinations: 1, variationsPerTop: 0`으로 설정했을 때
**When** 최적화를 실행하면
**Then** 베이스라인 + 1개 조합만 테스트되어야 한다

```typescript
const result = await runOptimization({
  ...config,
  randomCombinations: 1,
  variationsPerTop: 0,
  topCandidates: 0
});
expect(result.summary.totalCombinations).toBe(2); // 베이스라인 + 1
```

---

### EC-03: 극단적 파라미터 범위

**Given** 허용오차가 매우 작은 값(1 미만)일 때
**When** 유사도를 계산하면
**Then** 수치적 안정성이 보장되어야 한다 (NaN, Infinity 없음)

```typescript
const result = calculateExponentialSimilarity(
  [5, 10, 50, 15, 20],
  [6, 12, 48, 14, 22],
  {
    weights: [0.2, 0.2, 0.2, 0.2, 0.2],
    tolerances: [0.5, 0.5, 0.5, 0.5, 0.5]  // 극단적으로 작은 값
  }
);
expect(Number.isFinite(result)).toBe(true);
expect(Number.isNaN(result)).toBe(false);
```

---

## 3. 품질 게이트

### QG-01: 코드 커버리지

| 모듈 | 최소 커버리지 |
|------|--------------|
| param-generator.ts | 95% |
| backtest-runner.ts | 85% |
| analyzer.ts | 90% |
| similarity.ts (수정 부분) | 100% |

### QG-02: 린트 및 포맷

```bash
npm run lint      # 에러 0개
npm run format:check  # 통과
```

### QG-03: 타입 검사

```bash
npx tsc --noEmit  # 에러 0개
```

### QG-04: 성능

- 80개 조합 백테스트: 10분 이내 완료
- 단일 백테스트: 5초 이내 완료

---

## 4. Definition of Done

- [ ] 모든 테스트 시나리오(TC-01 ~ TC-10) 통과
- [ ] 모든 엣지 케이스(EC-01 ~ EC-03) 처리
- [ ] 품질 게이트(QG-01 ~ QG-04) 충족
- [ ] CLI 명령어로 전체 최적화 실행 가능
- [ ] 결과가 콘솔 및 JSON 형식으로 출력됨
- [ ] 기존 코드 하위 호환성 유지
- [ ] 코드 리뷰 완료
