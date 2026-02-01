# SPEC-DEPLOY-002: DB 레이어 마이그레이션

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-DEPLOY-002 |
| **제목** | better-sqlite3에서 Drizzle ORM으로 DB 레이어 마이그레이션 |
| **상태** | Draft |
| **우선순위** | High |
| **생성일** | 2026-02-02 |
| **라이프사이클** | spec-anchored |
| **선행 SPEC** | SPEC-DEPLOY-001 |
| **후행 SPEC** | SPEC-DEPLOY-003 |

---

## 1. 환경 (Environment)

### 1.1 마이그레이션 대상

| 현재 | 변경 후 |
|------|---------|
| better-sqlite3 (동기) | Drizzle ORM (비동기) |
| Raw SQL 쿼리 | Drizzle Query Builder |
| 커스텀 Auth 어댑터 | @auth/drizzle-adapter |

### 1.2 영향받는 파일

| 파일 | 역할 | 변경 범위 |
|------|------|----------|
| `src/database/prices.ts` | 가격 데이터 CRUD | 전체 재작성 |
| `src/database/metrics.ts` | 기술지표 CRUD | 전체 재작성 |
| `src/database/recommend-cache.ts` | 추천 캐시 CRUD | 전체 재작성 |
| `src/database/trading.ts` | 트레이딩 CRUD | 전체 재작성 |
| `src/lib/auth-adapter.ts` | Auth.js 어댑터 | Drizzle 어댑터로 교체 |
| `src/app/api/**/*.ts` | API 라우트 | async/await 추가 |

### 1.3 코드 변환 예시

**현재 (better-sqlite3)**:
```typescript
const stmt = db.prepare("SELECT * FROM daily_prices WHERE ticker = ?");
const rows = stmt.all(ticker);
```

**변경 후 (Drizzle)**:
```typescript
const rows = await db
  .select()
  .from(dailyPrices)
  .where(eq(dailyPrices.ticker, ticker));
```

---

## 2. 가정 (Assumptions)

### 2.1 기술 가정

| ID | 가정 | 신뢰도 | 근거 | 검증 방법 |
|----|------|--------|------|----------|
| T1 | Drizzle 쿼리 성능이 raw SQL과 유사하다 | High | Drizzle 벤치마크 | 성능 테스트 |
| T2 | 모든 SQLite 쿼리가 PostgreSQL로 변환 가능하다 | High | 표준 SQL 사용 | 쿼리 테스트 |
| T3 | async/await 변환이 기존 로직에 영향 없다 | Medium | 단방향 데이터 흐름 | 통합 테스트 |

### 2.2 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 | 오류 시 영향 |
|----|------|--------|------|-------------|
| B1 | 데이터 타입 변환이 정확하다 | High | 매핑 테이블 | 데이터 오류 |
| B2 | decimal.js 연산은 DB 레이어에 영향 없다 | High | 앱 레이어 처리 | 없음 |

---

## 3. 요구사항 (Requirements)

### 3.1 기능적 요구사항

#### REQ-001: 가격 데이터 레이어 마이그레이션

**[Ubiquitous]** 시스템은 `src/database/prices.ts`의 모든 함수를 Drizzle ORM으로 마이그레이션해야 한다.

**대상 함수**:
| 함수 | 용도 |
|------|------|
| `insertDailyPrices` | 일봉 데이터 삽입 |
| `getLatestDate` | 최신 날짜 조회 |
| `getPriceRange` | 기간별 가격 조회 |
| `getPriceByDate` | 특정 일자 가격 |

**인수 조건**:
- 모든 함수가 async로 변환
- 반환 타입이 Drizzle 타입 추론 사용
- 기존 테스트 통과

#### REQ-002: 기술지표 레이어 마이그레이션

**[Ubiquitous]** 시스템은 `src/database/metrics.ts`의 모든 함수를 Drizzle ORM으로 마이그레이션해야 한다.

**대상 함수**:
| 함수 | 용도 |
|------|------|
| `insertMetrics` | 지표 저장 |
| `getMetricsByDate` | 특정 일자 지표 |
| `getMetricsRange` | 기간별 지표 |

#### REQ-003: 추천 캐시 레이어 마이그레이션

**[Ubiquitous]** 시스템은 `src/database/recommend-cache.ts`의 모든 함수를 Drizzle ORM으로 마이그레이션해야 한다.

**대상 함수**:
| 함수 | 용도 |
|------|------|
| `getCachedRecommendation` | 캐시 조회 |
| `cacheRecommendation` | 캐시 저장 |

#### REQ-004: 트레이딩 레이어 마이그레이션

**[Ubiquitous]** 시스템은 `src/database/trading.ts`의 모든 함수를 Drizzle ORM으로 마이그레이션해야 한다.

**대상 함수**:
| 함수 | 용도 |
|------|------|
| `createTradingAccount` | 계좌 생성 |
| `getTradingAccounts` | 계좌 목록 |
| `getTierHoldings` | 보유 현황 |
| `generateDailyOrders` | 주문 생성 |
| `processOrderExecution` | 주문 체결 |
| `saveProfitRecord` | 수익 기록 |

#### REQ-005: Auth.js 어댑터 교체

**[Ubiquitous]** 시스템은 커스텀 SQLite Auth 어댑터를 `@auth/drizzle-adapter`로 교체해야 한다.

**변경 사항**:
| 현재 | 변경 후 |
|------|---------|
| `src/lib/auth-adapter.ts` (커스텀) | `@auth/drizzle-adapter` (공식) |
| SQLite 스키마 | Drizzle 스키마 참조 |

**인수 조건**:
- Google OAuth 로그인 정상 동작
- 세션 관리 정상 동작
- 사용자 데이터 마이그레이션 완료

#### REQ-006: API 라우트 비동기화

**[Ubiquitous]** 시스템은 모든 API 라우트에서 DB 접근을 async/await으로 변환해야 한다.

**대상 라우트**:
```
src/app/api/
├── backtest/route.ts
├── backtest-recommend/route.ts
├── recommend/route.ts
├── trading/accounts/route.ts
├── trading/accounts/[id]/route.ts
├── trading/accounts/[id]/orders/route.ts
├── trading/accounts/[id]/holdings/route.ts
└── trading/accounts/[id]/profits/route.ts
```

---

## 4. 기술 설계

### 4.1 마이그레이션 패턴

#### 패턴 1: SELECT 쿼리

```typescript
// Before
const rows = db.prepare("SELECT * FROM daily_prices WHERE ticker = ?").all(ticker);

// After
const rows = await db
  .select()
  .from(dailyPrices)
  .where(eq(dailyPrices.ticker, ticker));
```

#### 패턴 2: INSERT 쿼리

```typescript
// Before
db.prepare("INSERT INTO daily_prices (ticker, date, close) VALUES (?, ?, ?)").run(ticker, date, close);

// After
await db.insert(dailyPrices).values({ ticker, date, close });
```

#### 패턴 3: UPDATE 쿼리

```typescript
// Before
db.prepare("UPDATE tier_holdings SET shares = ? WHERE id = ?").run(shares, id);

// After
await db.update(tierHoldings).set({ shares }).where(eq(tierHoldings.id, id));
```

#### 패턴 4: DELETE 쿼리

```typescript
// Before
db.prepare("DELETE FROM tier_holdings WHERE account_id = ?").run(accountId);

// After
await db.delete(tierHoldings).where(eq(tierHoldings.accountId, accountId));
```

#### 패턴 5: 트랜잭션

```typescript
// Before
const transaction = db.transaction(() => {
  // multiple operations
});
transaction();

// After
await db.transaction(async (tx) => {
  // multiple operations with tx
});
```

### 4.2 Auth.js 설정 변경

**파일**: `src/lib/auth.ts`

```typescript
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/database/db";
import * as schema from "@/database/schema";

export const authOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // ... 기존 설정 유지
};
```

---

## 5. 테스트 전략

### 5.1 단위 테스트

| 테스트 | 검증 항목 |
|--------|----------|
| prices.test.ts | 가격 데이터 CRUD |
| metrics.test.ts | 지표 데이터 CRUD |
| trading.test.ts | 트레이딩 CRUD |
| auth.test.ts | 인증 흐름 |

### 5.2 통합 테스트

| 테스트 | 검증 항목 |
|--------|----------|
| API 라우트 테스트 | 전체 API 정상 동작 |
| E2E 테스트 | 사용자 시나리오 |

### 5.3 회귀 테스트

기존 테스트 슈트 전체 실행으로 동작 보존 확인.

---

## 6. 위험 요소 및 대응

| 위험 | 확률 | 영향 | 대응 방안 |
|------|------|------|----------|
| 쿼리 성능 저하 | Low | Medium | 인덱스 최적화, 쿼리 분석 |
| 트랜잭션 동작 차이 | Low | High | 트랜잭션 테스트 강화 |
| Auth 세션 손실 | Medium | High | 단계적 마이그레이션, 백업 |

---

## 7. 마일스톤

| 단계 | 작업 | 산출물 |
|------|------|--------|
| M1 | prices.ts 마이그레이션 | Drizzle 쿼리 변환 |
| M2 | metrics.ts 마이그레이션 | Drizzle 쿼리 변환 |
| M3 | recommend-cache.ts 마이그레이션 | Drizzle 쿼리 변환 |
| M4 | trading.ts 마이그레이션 | Drizzle 쿼리 변환 |
| M5 | Auth 어댑터 교체 | Google 로그인 테스트 |
| M6 | API 라우트 비동기화 | 전체 API 테스트 |
| M7 | 테스트 업데이트 | 테스트 통과 |
