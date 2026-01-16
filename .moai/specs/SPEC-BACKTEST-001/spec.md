# SPEC-BACKTEST-001: 백테스트 엔진 구현

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-BACKTEST-001 |
| **제목** | 떨사오팔 Pro 백테스트 엔진 |
| **상태** | Planned |
| **우선순위** | High |
| **생성일** | 2026-01-16 |
| **라이프사이클** | spec-anchored |

---

## 1. 환경 (Environment)

### 1.1 기술 스택

| 구성요소 | 기술 | 버전 |
|----------|------|------|
| 런타임 | Node.js | 20.x LTS |
| 언어 | TypeScript | 5.7.3 |
| 프레임워크 | Next.js | 15.x (App Router) |
| 데이터베이스 | SQLite | better-sqlite3 v11.7.0 |
| 테스트 | Vitest | 최신 안정 버전 |

### 1.2 데이터 소스

- **데이터베이스 경로**: `data/prices.db`
- **테이블**: `daily_prices`
- **스키마**:
  ```sql
  CREATE TABLE daily_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL DEFAULT 'SOXL',
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ticker, date)
  );
  ```

### 1.3 기존 인터페이스

```typescript
interface DailyPrice {
  id?: number;
  ticker?: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  createdAt?: string;
}
```

---

## 2. 가정 (Assumptions)

### 2.1 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 |
|----|------|--------|------|
| A1 | 사용자는 SOXL 종가 데이터만 사용하여 백테스트를 실행한다 | High | 프로젝트 요구사항 |
| A2 | Pro1, Pro2, Pro3 전략은 동일한 알고리즘에 다른 매개변수를 적용한다 | High | 전략 가이드 문서 확인 |
| A3 | LOC 주문은 종가 기준으로 체결 여부를 판단한다 | High | 전략 가이드 섹션 4.4 |
| A4 | 매도 지정가는 해당 티어의 매수 체결가 기준으로 계산한다 | High | 전략 가이드 섹션 6 예시 |

### 2.2 기술 가정

| ID | 가정 | 신뢰도 | 근거 |
|----|------|--------|------|
| T1 | 데이터베이스에 백테스트 기간의 모든 거래일 데이터가 존재한다 | High | 기존 데이터 수집 시스템 |
| T2 | 동기식 better-sqlite3 API를 사용하여 성능 문제가 없다 | High | 기존 구현 검증 |
| T3 | 소수점 둘째자리 버림(floor) 연산은 JavaScript로 정확히 구현 가능하다 | Medium | 부동소수점 오차 가능성 |

---

## 3. 요구사항 (Requirements)

### 3.1 기능적 요구사항

#### REQ-001: 전략 매개변수 설정

**[Ubiquitous]** 시스템은 **항상** 다음 전략 매개변수를 지원해야 한다:

| 매개변수 | Pro1 | Pro2 | Pro3 |
|----------|------|------|------|
| 티어 비율 | 5%, 10%, 15%, 20%, 25%, 25% | 10%, 15%, 20%, 25%, 20%, 10% | 16.7% × 6 |
| 매수 기준 | -0.01% | -0.01% | -0.10% |
| 매도 기준 | +0.01% | +1.50% | +2.00% |
| 손절일 | 10일 | 10일 | 12일 |

#### REQ-002: LOC 매수 주문 계산

**[Event-Driven]** **WHEN** 새로운 거래일이 시작되면 **THEN** 시스템은 다음 공식으로 LOC 매수 주문을 계산해야 한다:
- 매수 지정가 = floor(전일 종가 × (1 + 매수 기준), 소수점 2자리)
- 매수 수량 = floor(티어 금액 ÷ 매수 지정가, 정수)

#### REQ-003: LOC 매수 체결 판정

**[State-Driven]** **IF** 당일 종가 ≤ 매수 지정가 **THEN** 매수 주문이 당일 종가로 체결된다.

#### REQ-004: LOC 매도 주문 계산

**[Event-Driven]** **WHEN** 특정 티어가 매수 체결되면 **THEN** 시스템은 다음 공식으로 LOC 매도 주문을 계산해야 한다:
- 매도 지정가 = floor(해당 티어 매수 체결가 × (1 + 매도 기준), 소수점 2자리)

#### REQ-005: LOC 매도 체결 판정

**[State-Driven]** **IF** 당일 종가 ≥ 매도 지정가 **THEN** 매도 주문이 당일 종가로 체결된다.

#### REQ-006: 손절일 MOC 매도

**[State-Driven]** **IF** 보유일수가 손절일에 도달 **THEN** 시스템은 MOC 주문으로 보유 티어 전량을 당일 종가에 무조건 매도해야 한다.

#### REQ-007: 사이클 관리 및 풀복리

**[Event-Driven]** **WHEN** 모든 보유 티어가 매도되면 **THEN** 현재 사이클이 종료되고 다음 사이클이 시작된다.

**[Ubiquitous]** 시스템은 **항상** 풀복리(Full Compound) 방식을 적용해야 한다:
- 사이클 종료 시 수익이 발생하면 → 다음 사이클 초기 투자금 = 이전 투자금 + 수익
- 사이클 종료 시 손실이 발생하면 → 다음 사이클 초기 투자금 = 이전 투자금 - 손실
- 각 사이클의 티어 금액은 해당 사이클의 총 투자금 기준으로 재계산된다

#### REQ-008: 예비 티어(7티어) 처리

**[State-Driven]** **IF** 티어 1~6이 모두 체결된 상태(풀티어)이고 잔여 예수금이 존재하며 추가 하락이 발생하면 **THEN** 시스템은 잔여 예수금 전액을 예비 티어(7티어)로 매수해야 한다.

**예비 티어 상세 규칙:**
- 예비 티어 매수 조건: 티어 1~6 모두 체결 + 당일 종가 ≤ 매수 지정가 (전일 종가 기준)
- 예비 티어 매수 금액: 남은 현금(예수금) 전액
- 예비 티어 매도 조건: 다른 티어와 동일하게 매수 체결가 기준 +X% 상승 시
- 손절일에는 예비 티어도 함께 MOC 매도

#### REQ-009: 성과 지표 계산

**[Ubiquitous]** 시스템은 **항상** 다음 성과 지표를 계산해야 한다:
- 최종 자산 (Final Asset)
- 수익률 (Return %)
- 최대 낙폭 (MDD %)
- 총 사이클 수
- 승률 (Win Rate %)

### 3.2 비기능적 요구사항

#### REQ-010: 성능

**[Ubiquitous]** 시스템은 **항상** 1년치 데이터(약 252 거래일) 백테스트를 5초 이내에 완료해야 한다.

#### REQ-011: 정확도 검증

**[Ubiquitous]** 시스템은 **항상** 다음 기준값과 일치하는 결과를 생성해야 한다:

| 전략 | 최종 자산 | 수익률 | MDD |
|------|-----------|--------|-----|
| Pro1 | $13,472 | 34.72% | -18.7% |
| Pro2 | $13,029 | 30.29% | -38.3% |
| Pro3 | $14,120 | 41.2% | -44.4% |

**검증 기간**: 2025-01-02 ~ 2025-12-19
**초기 투자금**: $10,000

#### REQ-012: API 엔드포인트

**[Event-Driven]** **WHEN** 프론트엔드가 백테스트 요청을 보내면 **THEN** 시스템은 REST API를 통해 결과를 반환해야 한다.

### 3.3 제약사항

#### CON-001: 단일 알고리즘

**[Unwanted]** 시스템은 Pro1, Pro2, Pro3에 대해 별도의 알고리즘을 구현**하지 않아야 한다**. 매개변수화된 단일 알고리즘만 사용한다.

#### CON-002: 매수 수량 계산

**[Unwanted]** 시스템은 정액 매수를 사용**하지 않아야 한다**. 항상 지정가 기준 수량 계산을 사용한다.

---

## 4. 명세 (Specifications)

### 4.1 디렉토리 구조

```
src/
├── backtest/
│   ├── engine.ts          # 백테스트 엔진 메인 클래스
│   ├── strategy.ts        # 전략 매개변수 정의
│   ├── cycle.ts           # 사이클 상태 관리
│   ├── order.ts           # LOC/MOC 주문 계산
│   ├── metrics.ts         # 성과 지표 계산
│   └── types.ts           # 백테스트 전용 타입
├── app/
│   └── api/
│       └── backtest/
│           └── route.ts   # API 엔드포인트
```

### 4.2 핵심 타입 정의

```typescript
// 전략 설정 타입
interface StrategyConfig {
  name: 'Pro1' | 'Pro2' | 'Pro3';
  tierRatios: number[];           // 예: [0.05, 0.10, 0.15, 0.20, 0.25, 0.25]
  buyThreshold: number;           // 예: -0.0001 (-0.01%)
  sellThreshold: number;          // 예: 0.0001 (+0.01%)
  stopLossDay: number;            // 예: 10
}

// 티어 상태 타입
interface TierState {
  tier: number;                   // 1-7
  shares: number;                 // 보유 주식 수
  buyPrice: number;               // 매수 체결가
  buyDate: string;                // 매수 체결일
  amount: number;                 // 투자 금액
}

// 사이클 상태 타입
interface CycleState {
  cycleNumber: number;
  startDate: string;
  activeTiers: TierState[];
  dayCount: number;               // 사이클 시작 후 경과일
  cash: number;                   // 현금 잔고
  peakAsset: number;              // 최고 자산 (MDD 계산용)
}

// 백테스트 결과 타입
interface BacktestResult {
  strategy: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalAsset: number;
  returnRate: number;             // 소수점 (0.3472 = 34.72%)
  mdd: number;                    // 소수점 (-0.187 = -18.7%)
  totalCycles: number;
  winRate: number;
  dailyHistory: DailySnapshot[];  // 일별 스냅샷
}

// 일별 스냅샷 타입
interface DailySnapshot {
  date: string;
  close: number;
  cash: number;
  holdings: number;               // 보유 주식 총 가치
  totalAsset: number;
  activeTiers: number[];          // 활성 티어 번호 목록
  action: 'buy' | 'sell' | 'stop_loss' | 'none';
  actionDetail?: string;
}
```

### 4.3 API 명세

#### POST /api/backtest

**요청 본문**:
```json
{
  "ticker": "SOXL",
  "strategy": "Pro2",
  "startDate": "2025-01-02",
  "endDate": "2025-12-19",
  "initialCapital": 10000
}
```

**응답 본문**:
```json
{
  "success": true,
  "data": {
    "strategy": "Pro2",
    "startDate": "2025-01-02",
    "endDate": "2025-12-19",
    "initialCapital": 10000,
    "finalAsset": 13029,
    "returnRate": 0.3029,
    "mdd": -0.383,
    "totalCycles": 15,
    "winRate": 0.867,
    "dailyHistory": [...]
  }
}
```

### 4.4 핵심 알고리즘 의사코드

```
함수 runBacktest(config, priceData):
    초기화: cash = initialCapital, activeTiers = [], cycleNum = 1

    각 거래일 price에 대해:
        1. 손절일 체크:
           IF dayCount >= stopLossDay AND activeTiers 비어있지 않음:
               MOC 매도 실행 (전량 종가 매도)
               사이클 종료 -> 새 사이클 시작

        2. 매도 주문 체크 (각 활성 티어):
           sellLimit = floor(tier.buyPrice * (1 + sellThreshold), 2)
           IF close >= sellLimit:
               매도 체결 (종가)
               티어 비활성화
           IF 모든 티어 매도됨:
               사이클 종료 -> 새 사이클 시작

        3. 매수 주문 체크 (다음 티어):
           IF 매수 가능한 티어 있음:
               buyLimit = floor(prevClose * (1 + buyThreshold), 2)
               IF close <= buyLimit:
                   shares = floor(tierAmount / buyLimit)
                   매수 체결 (종가, shares 주)
                   티어 활성화

        4. MDD 업데이트:
           totalAsset = cash + sum(tier.shares * close)
           peakAsset = max(peakAsset, totalAsset)
           drawdown = (totalAsset - peakAsset) / peakAsset
           mdd = min(mdd, drawdown)

        5. 일별 스냅샷 저장

    반환: BacktestResult
```

---

## 5. 추적성 (Traceability)

### 5.1 관련 문서

| 문서 | 경로 | 관계 |
|------|------|------|
| 전략 가이드 | `docs/떨사오팔_Pro_투자전략_가이드_초보자용.md` | 참조 |
| 프론트엔드 SPEC | `.moai/specs/SPEC-FRONTEND-001/` | 의존 |
| 사이드바 SPEC | `.moai/specs/SPEC-SIDEBAR-001/` | 참조 |
| 프로젝트 로드맵 | `.moai/project/product.md` | 상위 |

### 5.2 검증 이미지

- `images/backtest_basic.png`: Pro1/Pro2/Pro3 개별 성과 그래프
- 검증 기간: 2025-01-02 ~ 2025-12-19

---

## 6. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-01-16 | manager-spec | 초기 SPEC 작성 |
