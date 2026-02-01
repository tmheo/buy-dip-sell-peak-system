# SPEC-DEPLOY-001 구현 계획

## 개요

Supabase 인프라 및 Drizzle ORM 기반을 구축합니다.

---

## 구현 단계

### Phase 1: Supabase 환경 설정

#### 1.1 Supabase CLI 설치 및 초기화

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트에서 Supabase 초기화
supabase init
```

**산출물**: `supabase/` 디렉토리 생성

#### 1.2 Supabase Local 시작

```bash
# Docker 기반 로컬 환경 시작
supabase start
```

**포트 정보**:
- API: http://localhost:54321
- DB: postgresql://postgres:postgres@localhost:54322/postgres
- Studio: http://localhost:54323

#### 1.3 Supabase Cloud 프로젝트 생성

1. https://supabase.com 접속
2. New Project 생성
3. Connection String 복사 (Pooler 모드)
4. API 키 확보

---

### Phase 2: Drizzle ORM 설치

#### 2.1 패키지 설치

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit @types/pg
```

#### 2.2 Drizzle 설정 파일 생성

**파일**: `drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

// 환경변수 검증
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export default defineConfig({
  schema: "./src/database/schema/index.ts",
  out: "./src/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

---

### Phase 3: 스키마 정의

#### 3.1 가격 데이터 스키마

**파일**: `src/database/schema/prices.ts`

```typescript
import { pgTable, text, real, date, integer, boolean, index, unique } from "drizzle-orm/pg-core";

export const dailyPrices = pgTable("daily_prices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ticker: text("ticker").notNull(),
  date: date("date").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  adjClose: real("adj_close").notNull(),
  volume: integer("volume").notNull(),
}, (table) => ({
  tickerDateIdx: unique("daily_prices_ticker_date").on(table.ticker, table.date),
  dateIdx: index("daily_prices_date_idx").on(table.date),
}));

export const dailyMetrics = pgTable("daily_metrics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ticker: text("ticker").notNull(),
  date: date("date").notNull(),
  ma20: real("ma20"),
  ma60: real("ma60"),
  maSlope: real("ma_slope"),
  disparity: real("disparity"),
  rsi14: real("rsi14"),
  roc12: real("roc12"),
  volatility20: real("volatility20"),
  goldenCross: real("golden_cross"),
  isGoldenCross: boolean("is_golden_cross"),
}, (table) => ({
  tickerDateIdx: unique("daily_metrics_ticker_date").on(table.ticker, table.date),
}));
```

#### 3.2 인증 스키마

**파일**: `src/database/schema/auth.ts`

```typescript
import { pgTable, text, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}));
```

#### 3.3 트레이딩 스키마

**파일**: `src/database/schema/trading.ts`

```typescript
import { pgTable, text, real, integer, date, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const tradingAccounts = pgTable("trading_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  seedCapital: real("seed_capital").notNull(),
  strategy: text("strategy").notNull(),
  cycleStartDate: date("cycle_start_date"),
  cycleNumber: integer("cycle_number").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tierHoldings = pgTable("tier_holdings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  accountId: integer("account_id").notNull().references(() => tradingAccounts.id, { onDelete: "cascade" }),
  tier: integer("tier").notNull(),
  buyPrice: real("buy_price").notNull(),
  shares: integer("shares").notNull(),
  buyDate: date("buy_date").notNull(),
  sellTargetPrice: real("sell_target_price"),
});

export const dailyOrders = pgTable("daily_orders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  accountId: integer("account_id").notNull().references(() => tradingAccounts.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  tier: integer("tier").notNull(),
  type: text("type").notNull(), // BUY | SELL
  orderMethod: text("order_method").notNull(), // LOC | MOC
  limitPrice: real("limit_price"),
  shares: integer("shares").notNull(),
  executed: boolean("executed").default(false),
  executedPrice: real("executed_price"),
});

export const profitRecords = pgTable("profit_records", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  accountId: integer("account_id").notNull().references(() => tradingAccounts.id, { onDelete: "cascade" }),
  tier: integer("tier").notNull(),
  buyDate: date("buy_date").notNull(),
  buyPrice: real("buy_price").notNull(),
  buyQuantity: integer("buy_quantity").notNull(),
  sellDate: date("sell_date").notNull(),
  sellPrice: real("sell_price").notNull(),
  profit: real("profit").notNull(),
  profitRate: real("profit_rate").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

#### 3.4 통합 Export

**파일**: `src/database/schema/index.ts`

```typescript
export * from "./prices";
export * from "./auth";
export * from "./trading";
```

---

### Phase 4: DB 연결 설정

#### 4.1 Drizzle 클라이언트

**파일**: `src/database/db.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Connection pool 설정
const client = postgres(connectionString, {
  max: 10, // 최대 연결 수
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type Database = typeof db;
```

---

### Phase 5: 환경변수 설정

#### 5.1 개발 환경

**파일**: `.env.local`

```env
# Supabase Local (개발)
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# 기존 환경변수 유지
AUTH_SECRET=<existing>
AUTH_GOOGLE_ID=<existing>
AUTH_GOOGLE_SECRET=<existing>
NEXTAUTH_URL=http://localhost:3000
```

#### 5.2 환경변수 템플릿

**파일**: `.env.example`

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Auth.js
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

---

### Phase 6: 마이그레이션 실행

```bash
# 마이그레이션 파일 생성
npx drizzle-kit generate

# 마이그레이션 적용
npx drizzle-kit migrate

# 또는 push (개발용 - 마이그레이션 파일 없이 직접 적용)
npx drizzle-kit push
```

---

## npm 스크립트 추가

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:reset": "supabase db reset"
  }
}
```

---

## 검증 체크리스트

- [ ] `supabase start` 성공
- [ ] PostgreSQL Studio 접근 가능 (localhost:54323)
- [ ] Drizzle 스키마 정의 완료
- [ ] `npx drizzle-kit push` 성공
- [ ] Drizzle Studio에서 테이블 확인
- [ ] Supabase Cloud 프로젝트 생성
- [ ] 환경변수 문서화
