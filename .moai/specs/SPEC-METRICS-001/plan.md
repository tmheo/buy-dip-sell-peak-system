# SPEC-METRICS-001 구현 계획

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-METRICS-001 |
| **제목** | 기술적 지표 차트 데이터 구현 계획 |
| **생성일** | 2026-01-17 |

---

## 1. 구현 마일스톤

### 1.1 우선순위: High - 타입 정의 및 인터페이스 확장

**목표**: 새로운 타입을 정의하고 기존 인터페이스를 확장한다.

**작업 항목**:

| 작업 | 파일 | 설명 |
|------|------|------|
| TechnicalMetrics 인터페이스 정의 | `src/backtest/types.ts` | 6개 기술적 지표를 담는 새 인터페이스 |
| DailySnapshot 확장 | `src/backtest/types.ts` | ma20, ma60 필드 추가 |
| BacktestResult 확장 | `src/backtest/types.ts` | technicalMetrics 필드 추가 |

**완료 조건**:
- TypeScript 컴파일 성공
- 기존 코드와 하위 호환성 유지

### 1.2 우선순위: High - 기본 지표 계산 함수 구현

**목표**: SMA, RSI, ROC, Volatility 계산 함수를 구현한다.

**작업 항목**:

| 작업 | 함수명 | 설명 |
|------|--------|------|
| 단순이동평균 | `calculateSMA` | MA20, MA60 계산용 범용 SMA 함수 |
| RSI 계산 | `calculateRSI` | Wilder의 EMA 방식 RSI(14) |
| ROC 계산 | `calculateROC` | 12일 변화율 |
| 변동성 계산 | `calculateVolatility` | 20일 연율화 변동성 |

**의존성**:
- 마일스톤 1.1 완료 필요

**완료 조건**:
- 각 함수별 단위 테스트 통과
- 에지 케이스 (데이터 부족, 0 나누기) 처리

### 1.3 우선순위: High - 종합 지표 계산 함수 구현

**목표**: 6개 지표를 한 번에 계산하는 종합 함수를 구현한다.

**작업 항목**:

| 작업 | 함수명 | 설명 |
|------|--------|------|
| 정배열 계산 | `calculateGoldenCross` | (MA20-MA60)/MA60 × 100 |
| 기울기 계산 | `calculateMASlope` | MA20 10일 기울기 |
| 이격도 계산 | `calculateDisparity` | 주가/MA20 × 100 |
| 종합 계산 | `calculateTechnicalMetrics` | 6개 지표 통합 계산 |

**의존성**:
- 마일스톤 1.2 완료 필요

**완료 조건**:
- 모든 지표가 정확히 계산됨
- null 처리가 일관됨

### 1.4 우선순위: Medium - 엔진 통합

**목표**: BacktestEngine에 지표 계산을 통합한다.

**작업 항목**:

| 작업 | 파일 | 설명 |
|------|------|------|
| createSnapshot 수정 | `src/backtest/engine.ts` | ma20, ma60 계산 추가 |
| run 메서드 수정 | `src/backtest/engine.ts` | 종료 시 technicalMetrics 생성 |
| 가격 배열 추출 | `src/backtest/engine.ts` | adjClose 배열 구성 |

**의존성**:
- 마일스톤 1.3 완료 필요

**완료 조건**:
- 백테스트 실행 시 지표가 자동 계산됨
- 기존 테스트가 통과됨

### 1.5 우선순위: Medium - 단위 테스트 작성

**목표**: 새로운 함수들에 대한 포괄적인 테스트를 작성한다.

**작업 항목**:

| 작업 | 테스트 케이스 | 설명 |
|------|--------------|------|
| SMA 테스트 | TC-001 ~ TC-003 | 정상 계산, 데이터 부족, 경계값 |
| RSI 테스트 | TC-004 ~ TC-006 | 과매수/과매도, 극단값, 초기화 |
| ROC 테스트 | TC-007 ~ TC-008 | 상승/하락, 데이터 부족 |
| Volatility 테스트 | TC-009 ~ TC-010 | 정상 계산, 연율화 검증 |
| 종합 테스트 | TC-011 ~ TC-013 | 통합 계산, null 처리 |

**의존성**:
- 마일스톤 1.4 완료 필요

**완료 조건**:
- 테스트 커버리지 85% 이상
- 모든 테스트 통과

### 1.6 우선순위: Low - 성능 최적화

**목표**: 지표 계산이 백테스트 성능에 미치는 영향을 최소화한다.

**작업 항목**:

| 작업 | 설명 |
|------|------|
| SMA 슬라이딩 윈도우 | 이전 합계 재사용으로 O(n) 계산 |
| RSI 누적 계산 | Wilder EMA 특성 활용 |
| 메모이제이션 | MA 값 캐싱으로 중복 계산 방지 |

**완료 조건**:
- 1년치 데이터 백테스트 5초 이내 유지

---

## 2. 기술적 접근 방식

### 2.1 계산 효율성 전략

#### SMA 슬라이딩 윈도우
```typescript
// 비효율적 방법: 매번 전체 합계 계산 O(n×period)
// 효율적 방법: 슬라이딩 윈도우 O(n)
let sum = 0;
for (let i = 0; i < period; i++) {
  sum += prices[i];
}
const smaValues = [sum / period];
for (let i = period; i < prices.length; i++) {
  sum = sum - prices[i - period] + prices[i];
  smaValues.push(sum / period);
}
```

#### 일괄 계산 vs 개별 계산
- **선택**: 일괄 계산 (모든 날짜의 MA를 한 번에 계산)
- **이유**: DailySnapshot에 매일 MA20/MA60을 포함해야 하므로

### 2.2 정밀도 관리

```typescript
import Decimal from "decimal.js";

// 모든 지표 계산에 Decimal 사용
function calculateSMA(prices: number[], period: number, index: number): number | null {
  if (index < period - 1) return null;

  let sum = new Decimal(0);
  for (let i = index - period + 1; i <= index; i++) {
    sum = sum.add(prices[i]);
  }
  return sum.div(period).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}
```

### 2.3 Null 처리 전략

| 상황 | 처리 방법 |
|------|----------|
| 데이터 부족 (index < required) | `null` 반환 |
| 분모가 0 | `null` 반환 |
| 하나의 지표라도 null | TechnicalMetrics 전체 `null` |

### 2.4 RSI Wilder EMA 구현

```typescript
function calculateRSI(prices: number[], index: number): number | null {
  const period = 14;
  if (index < period) return null;

  // 1. 가격 변화 계산
  const changes: number[] = [];
  for (let i = 1; i <= index; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // 2. 초기 평균 (첫 14일)
  let avgGain = new Decimal(0);
  let avgLoss = new Decimal(0);
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain = avgGain.add(changes[i]);
    else avgLoss = avgLoss.add(Math.abs(changes[i]));
  }
  avgGain = avgGain.div(period);
  avgLoss = avgLoss.div(period);

  // 3. Wilder Smoothed EMA (15일째부터)
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = avgGain.mul(13).add(gain).div(14);
    avgLoss = avgLoss.mul(13).add(loss).div(14);
  }

  // 4. RSI 계산
  if (avgLoss.isZero()) return 100;
  const rs = avgGain.div(avgLoss);
  const rsi = new Decimal(100).sub(new Decimal(100).div(rs.add(1)));
  return rsi.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}
```

---

## 3. 아키텍처 설계

### 3.1 모듈 구조

```
src/backtest/
├── types.ts              # 타입 정의
│   ├── TechnicalMetrics  # NEW: 기술적 지표 인터페이스
│   ├── DailySnapshot     # EXTENDED: ma20, ma60 추가
│   └── BacktestResult    # EXTENDED: technicalMetrics 추가
│
├── metrics.ts            # 지표 계산 함수
│   ├── calculateReturn   # 기존
│   ├── calculateMDD      # 기존
│   ├── calculateWinRate  # 기존
│   ├── calculateSMA      # NEW: 단순이동평균
│   ├── calculateRSI      # NEW: RSI(14)
│   ├── calculateROC      # NEW: ROC(12)
│   ├── calculateVolatility       # NEW: 20일 변동성
│   ├── calculateGoldenCross      # NEW: 정배열
│   ├── calculateMASlope          # NEW: MA 기울기
│   ├── calculateDisparity        # NEW: 이격도
│   └── calculateTechnicalMetrics # NEW: 종합 지표
│
├── engine.ts             # 백테스트 엔진
│   ├── createSnapshot    # MODIFIED: ma20, ma60 계산 추가
│   └── run               # MODIFIED: technicalMetrics 생성
│
└── __tests__/
    └── metrics.test.ts   # EXTENDED: 새 함수 테스트
```

### 3.2 데이터 흐름

```
[DailyPrice[]] ─────────────────────────────────────────────────────────┐
      │                                                                 │
      ▼                                                                 │
[BacktestEngine.run()]                                                  │
      │                                                                 │
      ├─▶ [adjClose 배열 추출] ────────────────────────────────────────┐│
      │                                                                ││
      ▼                                                                ▼▼
[매일 반복] ──▶ [createSnapshot()] ─▶ [calculateSMA(20/60)] ─▶ [DailySnapshot with MA]
                                                                       │
                                                                       ▼
[백테스트 완료] ──▶ [calculateTechnicalMetrics()] ──▶ [TechnicalMetrics]
                                                              │
                                                              ▼
                                                    [BacktestResult]
```

---

## 4. 리스크 분석

### 4.1 기술적 리스크

| 리스크 | 가능성 | 영향 | 대응 방안 |
|--------|--------|------|----------|
| 부동소수점 오차로 인한 계산 오류 | Medium | High | Decimal.js 사용, 4자리 반올림 |
| RSI Wilder EMA 초기값 오류 | Medium | Medium | 충분한 테스트 케이스 작성 |
| 성능 저하 (O(n²) 계산) | Low | High | 슬라이딩 윈도우, 메모이제이션 적용 |
| 데이터 부족 시 예외 발생 | Low | Medium | 철저한 null 체크 |

### 4.2 호환성 리스크

| 리스크 | 가능성 | 영향 | 대응 방안 |
|--------|--------|------|----------|
| 기존 API 응답 구조 변경 | Low | High | 필드 추가만, 기존 필드 유지 |
| 기존 테스트 실패 | Medium | Medium | 타입 확장 시 optional 필드로 처리 |
| 프론트엔드 호환성 문제 | Low | Medium | 새 필드는 optional, 점진적 적용 |

---

## 5. 의존성 및 제약사항

### 5.1 외부 의존성

| 라이브러리 | 버전 | 용도 |
|------------|------|------|
| decimal.js | 현재 사용 버전 | 정밀 연산 |
| vitest | 최신 | 테스트 |

### 5.2 내부 의존성

| 모듈 | 의존 방향 | 설명 |
|------|----------|------|
| `metrics.ts` | `types.ts` | TechnicalMetrics 타입 사용 |
| `engine.ts` | `metrics.ts` | 지표 계산 함수 호출 |
| `engine.ts` | `types.ts` | 확장된 인터페이스 사용 |

### 5.3 제약사항

- **성능**: 기존 5초 이내 제약 유지
- **호환성**: 기존 API 응답 구조 유지
- **정확성**: 표준 기술적 분석 공식 준수

---

## 6. 검증 계획

### 6.1 단위 테스트

| 테스트 대상 | 테스트 케이스 수 | 목표 커버리지 |
|-------------|-----------------|--------------|
| calculateSMA | 5 | 100% |
| calculateRSI | 6 | 100% |
| calculateROC | 4 | 100% |
| calculateVolatility | 4 | 100% |
| calculateGoldenCross | 3 | 100% |
| calculateMASlope | 3 | 100% |
| calculateDisparity | 3 | 100% |
| calculateTechnicalMetrics | 5 | 100% |

### 6.2 통합 테스트

| 시나리오 | 검증 항목 |
|----------|----------|
| 전체 백테스트 실행 | DailySnapshot에 ma20/ma60 포함 확인 |
| 종료 시 지표 계산 | BacktestResult에 technicalMetrics 포함 확인 |
| 데이터 부족 케이스 | 적절한 null 반환 확인 |
| 성능 테스트 | 1년 데이터 5초 이내 완료 확인 |

### 6.3 검증 데이터

실제 SOXL 데이터를 사용하여 외부 도구(TradingView, Investing.com)의 기술적 지표와 비교 검증:

| 날짜 | 소스 | 검증 지표 |
|------|------|----------|
| 2025-12-19 | TradingView | MA20, MA60, RSI(14) |
| 2025-12-19 | Investing.com | ROC(12) |

---

## 7. 추적성

### 7.1 요구사항 ↔ 마일스톤 매핑

| 요구사항 | 마일스톤 |
|----------|----------|
| REQ-001, REQ-004, REQ-005 | 1.1, 1.2 |
| REQ-002, REQ-003 | 1.1, 1.3, 1.4 |
| REQ-006 ~ REQ-011 | 1.2, 1.3 |
| REQ-012 | 1.6 |
| REQ-013 | 1.2 |
| CON-001, CON-002, CON-003 | 모든 마일스톤 |

---

## 8. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-17 | manager-spec | 초기 계획 작성 |
