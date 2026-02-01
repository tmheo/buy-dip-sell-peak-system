# SPEC-DEPLOY-003 구현 계획

## 개요

Vercel에 프로덕션 배포하고 자동 데이터 업데이트를 설정합니다.

**선행 조건**: SPEC-DEPLOY-001, SPEC-DEPLOY-002 완료

---

## 구현 단계

### Phase 1: Vercel 프로젝트 설정

#### 1.1 Vercel 계정 및 프로젝트 생성

1. https://vercel.com 접속
2. GitHub 계정으로 로그인
3. "New Project" 클릭
4. `buy-dip-sell-peak-system` 레포지토리 선택
5. Framework Preset: **Next.js** 확인

#### 1.2 빌드 설정 확인

```
Build Command: npm run web:build (자동 감지)
Output Directory: .next (자동 감지)
Install Command: npm install (자동 감지)
```

---

### Phase 2: 환경변수 설정

#### 2.1 Vercel Dashboard 설정

**Settings > Environment Variables**에서 추가:

```
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true

SUPABASE_DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-ap-northeast-2.supabase.com:5432/postgres

AUTH_SECRET=[openssl rand -base64 32 결과]

AUTH_GOOGLE_ID=[Google Cloud Console에서 복사]

AUTH_GOOGLE_SECRET=[Google Cloud Console에서 복사]

NEXTAUTH_URL=https://[your-project].vercel.app

CRON_SECRET=[openssl rand -hex 32 결과]
```

#### 2.2 환경변수 범위 설정

| 변수 | Production | Preview | Development |
|------|------------|---------|-------------|
| DATABASE_URL | O | O | X |
| SUPABASE_DIRECT_URL | O | O | X |
| AUTH_SECRET | O | O | X |
| AUTH_GOOGLE_* | O | O | X |
| CRON_SECRET | O | O | X |

> **Note**: `CRON_SECRET`은 로컬/Preview 환경에서 수동 테스트 시에도 필요하므로 모든 환경에 설정합니다.

---

### Phase 3: Google OAuth 프로덕션 설정

#### 3.1 Google Cloud Console 설정

1. https://console.cloud.google.com 접속
2. 프로젝트 선택 또는 생성
3. "API 및 서비스" > "사용자 인증 정보"
4. OAuth 2.0 클라이언트 ID 선택 (또는 생성)

#### 3.2 승인된 리디렉션 URI 추가

```
https://[your-project].vercel.app/api/auth/callback/google
```

#### 3.3 OAuth 동의 화면

- 앱 이름: 떨사 Pro
- 사용자 유형: 외부 (필요시 내부)
- 범위: email, profile

---

### Phase 4: vercel.json 설정

**파일**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/update-prices",
      "schedule": "0 6 * * *"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store, max-age=0"
        }
      ]
    }
  ]
}
```

---

### Phase 5: Cron 엔드포인트 구현

#### 5.1 API 라우트 생성

**파일**: `src/app/api/cron/update-prices/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60; // 최대 60초 (Hobby는 10초)

export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log("Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("Starting price update cron job...");

  try {
    const tickers = ["SOXL", "TQQQ"];
    const results = [];

    for (const ticker of tickers) {
      console.log(`Updating ${ticker}...`);

      // 1. 가격 데이터 업데이트
      const priceResult = await updatePrices(ticker);
      results.push({ ticker, prices: priceResult });

      // 2. 기술지표 재계산
      await calculateMetrics(ticker);
    }

    console.log("Price update cron job completed successfully");

    return NextResponse.json({
      success: true,
      updatedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Cron update failed:", error);
    return NextResponse.json(
      {
        error: "Update failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function updatePrices(ticker: string) {
  // 기존 update 로직 호출
  // src/services/yahoo-finance.ts 함수 사용
}

async function calculateMetrics(ticker: string) {
  // 기존 metrics 계산 로직 호출
  // src/services/calculations.ts 함수 사용
}
```

---

### Phase 6: 데이터 이관

#### 6.1 이관 스크립트 생성

**파일**: `scripts/migrate-to-supabase.ts`

```typescript
import Database from "better-sqlite3";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/database/schema";

const BATCH_SIZE = 500;

async function migrate() {
  const directUrl = process.env.SUPABASE_DIRECT_URL;
  if (!directUrl) {
    throw new Error("SUPABASE_DIRECT_URL is required");
  }

  console.log("Connecting to databases...");

  const sqlite = new Database("./data/prices.db", { readonly: true });
  const pg = postgres(directUrl);
  const db = drizzle(pg, { schema });

  try {
    // 1. daily_prices 이관
    await migrateTable(sqlite, db, "daily_prices", schema.dailyPrices);

    // 2. daily_metrics 이관
    await migrateTable(sqlite, db, "daily_metrics", schema.dailyMetrics);

    // 3. recommendation_cache 이관
    await migrateTable(sqlite, db, "recommendation_cache", schema.recommendationCache);

    console.log("\n=== Migration Summary ===");
    await verifyCounts(sqlite, db);

  } finally {
    sqlite.close();
    await pg.end();
  }
}

async function migrateTable(
  sqlite: Database.Database,
  db: ReturnType<typeof drizzle>,
  tableName: string,
  drizzleTable: any
) {
  console.log(`\nMigrating ${tableName}...`);

  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
  console.log(`  Found ${rows.length} records`);

  let migrated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(drizzleTable).values(batch).onConflictDoNothing();
    migrated += batch.length;
    process.stdout.write(`\r  Migrated: ${migrated}/${rows.length}`);
  }
  console.log(`\n  Completed ${tableName}`);
}

async function verifyCounts(
  sqlite: Database.Database,
  db: ReturnType<typeof drizzle>
) {
  // 검증 로직
}

migrate().catch(console.error);
```

#### 6.2 이관 실행

```bash
# 환경변수 설정
export SUPABASE_DIRECT_URL="postgresql://..."

# 이관 실행
npx tsx scripts/migrate-to-supabase.ts
```

---

### Phase 7: 배포 및 테스트

#### 7.1 첫 배포

```bash
# 로컬 빌드 테스트
npm run web:build

# Git 커밋 & 푸시 (자동 배포)
git add .
git commit -m "feat: add Vercel deployment configuration"
git push origin main
```

#### 7.2 배포 확인

1. Vercel Dashboard에서 배포 상태 확인
2. 프로덕션 URL 접속 테스트
3. API 라우트 테스트

```bash
# 홈페이지
curl https://[your-project].vercel.app

# API 테스트
curl https://[your-project].vercel.app/api/recommend?ticker=SOXL&date=2026-02-01
```

#### 7.3 OAuth 테스트

1. 프로덕션 URL에서 로그인 버튼 클릭
2. Google 인증 완료
3. 세션 유지 확인

#### 7.4 Cron 테스트

```bash
# 수동 Cron 실행 테스트
curl -H "Authorization: Bearer [CRON_SECRET]" \
  https://[your-project].vercel.app/api/cron/update-prices
```

---

### Phase 8: 모니터링 설정 (선택)

#### 8.1 Vercel Analytics

Vercel Dashboard > Analytics 활성화

#### 8.2 에러 알림

- Vercel Integrations에서 Slack/Discord 연동
- 또는 Sentry 설정

---

## npm 스크립트 추가

```json
{
  "scripts": {
    "migrate:supabase": "tsx scripts/migrate-to-supabase.ts",
    "cron:test": "curl -H 'Authorization: Bearer $CRON_SECRET' http://localhost:3000/api/cron/update-prices"
  }
}
```

---

## 검증 체크리스트

### 배포

- [ ] Vercel 프로젝트 생성
- [ ] GitHub 연동 확인
- [ ] 환경변수 설정 완료
- [ ] 첫 배포 성공
- [ ] 프로덕션 URL 접근 가능

### 인증

- [ ] Google OAuth 리디렉션 URI 추가
- [ ] 프로덕션 로그인 테스트
- [ ] 세션 유지 확인

### 데이터

- [ ] 데이터 이관 완료
- [ ] 데이터 검증 (row count)
- [ ] API 데이터 조회 정상

### Cron

- [ ] Cron 엔드포인트 배포
- [ ] 수동 실행 테스트
- [ ] 인증 검증 (401 테스트)
- [ ] 스케줄 활성화

### 모니터링

- [ ] Vercel 로그 확인
- [ ] 에러 알림 설정 (선택)
