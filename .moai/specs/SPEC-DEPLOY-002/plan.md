# SPEC-DEPLOY-002 구현 계획

## 개요

better-sqlite3 기반 코드를 Drizzle ORM으로 마이그레이션합니다.

**선행 조건**: SPEC-DEPLOY-001 완료 (Drizzle 스키마 정의)

---

## 구현 순서

### Phase 1: 패키지 설치

```bash
npm install @auth/drizzle-adapter
```

---

### Phase 2: 가격 데이터 레이어 (prices.ts)

#### 2.1 현재 구조 분석

```typescript
// src/database/prices.ts (현재)
import Database from "better-sqlite3";
import { db } from "./db";

export function insertDailyPrices(data: PriceData[]) { ... }
export function getLatestDate(ticker: string): string | null { ... }
export function getPriceRange(ticker: string, startDate: string, endDate: string) { ... }
```

#### 2.2 변환 코드

```typescript
// src/database/prices.ts (변환 후)
import { db } from "./db";
import { dailyPrices } from "./schema";
import { eq, and, between, desc } from "drizzle-orm";

export async function insertDailyPrices(data: typeof dailyPrices.$inferInsert[]) {
  if (data.length === 0) return;

  await db.insert(dailyPrices).values(data).onConflictDoNothing();
}

export async function getLatestDate(ticker: string): Promise<string | null> {
  const result = await db
    .select({ date: dailyPrices.date })
    .from(dailyPrices)
    .where(eq(dailyPrices.ticker, ticker))
    .orderBy(desc(dailyPrices.date))
    .limit(1);

  return result[0]?.date ?? null;
}

export async function getPriceRange(ticker: string, startDate: string, endDate: string) {
  return await db
    .select()
    .from(dailyPrices)
    .where(
      and(
        eq(dailyPrices.ticker, ticker),
        between(dailyPrices.date, startDate, endDate)
      )
    )
    .orderBy(dailyPrices.date);
}

export async function getPriceByDate(ticker: string, date: string) {
  const result = await db
    .select()
    .from(dailyPrices)
    .where(
      and(
        eq(dailyPrices.ticker, ticker),
        eq(dailyPrices.date, date)
      )
    )
    .limit(1);

  return result[0] ?? null;
}
```

---

### Phase 3: 기술지표 레이어 (metrics.ts)

```typescript
// src/database/metrics.ts (변환 후)
import { db } from "./db";
import { dailyMetrics } from "./schema";
import { eq, and, between } from "drizzle-orm";

export async function insertMetrics(data: typeof dailyMetrics.$inferInsert[]) {
  if (data.length === 0) return;

  await db.insert(dailyMetrics).values(data).onConflictDoNothing();
}

export async function getMetricsByDate(ticker: string, date: string) {
  const result = await db
    .select()
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.ticker, ticker),
        eq(dailyMetrics.date, date)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function getMetricsRange(ticker: string, startDate: string, endDate: string) {
  return await db
    .select()
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.ticker, ticker),
        between(dailyMetrics.date, startDate, endDate)
      )
    )
    .orderBy(dailyMetrics.date);
}
```

---

### Phase 4: 추천 캐시 레이어 (recommend-cache.ts)

```typescript
// src/database/recommend-cache.ts (변환 후)
import { db } from "./db";
import { recommendationCache } from "./schema";
import { eq, and } from "drizzle-orm";

export async function getCachedRecommendation(ticker: string, date: string) {
  const result = await db
    .select()
    .from(recommendationCache)
    .where(
      and(
        eq(recommendationCache.ticker, ticker),
        eq(recommendationCache.date, date)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function cacheRecommendation(data: typeof recommendationCache.$inferInsert) {
  await db
    .insert(recommendationCache)
    .values(data)
    .onConflictDoUpdate({
      target: [recommendationCache.ticker, recommendationCache.date],
      set: data,
    });
}
```

---

### Phase 5: 트레이딩 레이어 (trading.ts)

#### 5.1 계좌 관리

```typescript
export async function createTradingAccount(
  userId: string,
  data: Omit<typeof tradingAccounts.$inferInsert, "userId">
) {
  const result = await db
    .insert(tradingAccounts)
    .values({ ...data, userId })
    .returning();

  return result[0];
}

export async function getTradingAccounts(userId: string) {
  return await db
    .select()
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, userId));
}

export async function getTradingAccountById(id: number, userId: string) {
  const result = await db
    .select()
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.id, id),
        eq(tradingAccounts.userId, userId)
      )
    )
    .limit(1);

  return result[0] ?? null;
}
```

#### 5.2 티어 보유

```typescript
export async function getTierHoldings(accountId: number) {
  return await db
    .select()
    .from(tierHoldings)
    .where(eq(tierHoldings.accountId, accountId))
    .orderBy(tierHoldings.tier);
}

export async function createTierHolding(data: typeof tierHoldings.$inferInsert) {
  await db.insert(tierHoldings).values(data);
}

export async function deleteTierHolding(accountId: number, tier: number) {
  await db
    .delete(tierHoldings)
    .where(
      and(
        eq(tierHoldings.accountId, accountId),
        eq(tierHoldings.tier, tier)
      )
    );
}
```

#### 5.3 주문 및 체결

```typescript
export async function generateDailyOrders(accountId: number, date: string) {
  // 트랜잭션으로 원자적 처리
  return await db.transaction(async (tx) => {
    // 기존 주문 삭제
    await tx
      .delete(dailyOrders)
      .where(
        and(
          eq(dailyOrders.accountId, accountId),
          eq(dailyOrders.date, date)
        )
      );

    // 새 주문 생성 로직
    // ...
  });
}

export async function processOrderExecution(accountId: number, date: string, closePrice: number) {
  return await db.transaction(async (tx) => {
    // 미체결 주문 조회
    const orders = await tx
      .select()
      .from(dailyOrders)
      .where(
        and(
          eq(dailyOrders.accountId, accountId),
          eq(dailyOrders.date, date),
          eq(dailyOrders.executed, false)
        )
      );

    // 체결 처리 로직
    // ...
  });
}
```

---

### Phase 6: Auth.js 어댑터 교체

#### 6.1 auth.ts 수정

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/database/db";
import * as schema from "@/database/schema";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
```

#### 6.2 기존 auth-adapter.ts 삭제

```bash
rm src/lib/auth-adapter.ts
```

---

### Phase 7: API 라우트 비동기화

모든 API 라우트에서 DB 함수 호출을 await으로 변경:

```typescript
// Before
export async function GET(request: Request) {
  const data = getPriceRange(ticker, start, end);  // 동기
  return Response.json(data);
}

// After
export async function GET(request: Request) {
  const data = await getPriceRange(ticker, start, end);  // 비동기
  return Response.json(data);
}
```

---

## 검증 체크리스트

### 기능 테스트

- [ ] `npm run test` 전체 통과
- [ ] 가격 데이터 조회 정상
- [ ] 기술지표 조회 정상
- [ ] 추천 결과 정상
- [ ] 트레이딩 계좌 CRUD 정상
- [ ] 주문 생성/체결 정상
- [ ] Google 로그인 정상
- [ ] 세션 유지 정상

### 성능 테스트

- [ ] API 응답 시간 기존 대비 유사
- [ ] 대량 데이터 삽입 성능 유지

### 보안 테스트

- [ ] SQL 인젝션 방지 (Drizzle 파라미터화)
- [ ] 사용자 데이터 격리 확인
