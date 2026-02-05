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
      "schedule": "30 0 * * *"
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
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchSince } from "@/services/dataFetcher";
import type { SupportedTicker } from "@/services/dataFetcher";
import { getLatestDate, insertDailyPrices, getAllPricesByTicker } from "@/database/prices";
import { getLatestMetricDate, insertMetrics } from "@/database/metrics";
import { calculateMetricsBatch } from "@/services/metricsCalculator";

export const runtime = "nodejs";
export const maxDuration = 60;

const TICKERS: SupportedTicker[] = ["SOXL", "TQQQ"];
const DEFAULT_MAX_ATTEMPTS = 3;

// 재시도 래퍼 함수 (지수 백오프: 1초, 2초, 4초)
async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number, context: string): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error(`[${context}] 재시도 로직 오류`);
}

// 단일 티커 증분 업데이트: 가격 fetch -> DB 저장 -> 지표 증분 계산
async function updateTicker(ticker: SupportedTicker): Promise<{ newPrices: number; newMetrics: number }> {
  const latestDate = await getLatestDate(ticker);
  if (!latestDate) return { newPrices: 0, newMetrics: 0 };

  const newPrices = await withRetry(() => fetchSince(latestDate, ticker), DEFAULT_MAX_ATTEMPTS, `${ticker} fetchSince`);
  if (newPrices.length === 0) return { newPrices: 0, newMetrics: 0 };

  await withRetry(() => insertDailyPrices(newPrices.map((p) => ({ ticker, ...p }))), DEFAULT_MAX_ATTEMPTS, `${ticker} insertDailyPrices`);

  const allPrices = await withRetry(() => getAllPricesByTicker(ticker), DEFAULT_MAX_ATTEMPTS, `${ticker} getAllPricesByTicker`);
  const latestMetricDate = await getLatestMetricDate(ticker);
  const dates = allPrices.map((p) => p.date);
  const startIdx = latestMetricDate ? (dates.indexOf(latestMetricDate) + 1 || 59) : 59;

  const adjCloses = allPrices.map((p) => p.adjClose);
  const newMetrics = calculateMetricsBatch(adjCloses, dates, ticker, startIdx, adjCloses.length - 1);
  if (newMetrics.length > 0) {
    await withRetry(() => insertMetrics(newMetrics), DEFAULT_MAX_ATTEMPTS, `${ticker} insertMetrics`);
  }
  return { newPrices: newPrices.length, newMetrics: newMetrics.length };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // timingSafeEqual로 타이밍 공격 방지
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader.length !== expectedToken.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = [];
    for (const ticker of TICKERS) {
      results.push({ ticker, ...(await updateTicker(ticker)) });
    }
    return NextResponse.json({ success: true, updatedAt: new Date().toISOString(), results }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Update failed", message: "Internal server error" }, { status: 500 });
  }
}
```

#### 5.2 단위 테스트 작성

**파일**: `src/app/api/cron/update-prices/__tests__/route.test.ts` (493줄)

테스트 커버리지:

- **인증 테스트**: 토큰 없음 시 401, 잘못된 토큰 시 401, 유효한 토큰 시 통과
- **성공 시나리오**: 가격/지표 데이터 업데이트 후 200 반환, 결과 구조 검증
- **에러 시나리오**: DB 오류/외부 API 오류 시 500 반환, 내부 에러 메시지 비노출 확인
- **엣지 케이스**: 새 가격 데이터 없음, 저장된 가격 데이터 없음, 지표 데이터 없음 등

---

### Phase 6: 프로덕션 데이터 이관 (Local → Cloud Supabase)

> **참고**: SPEC-DEPLOY-002에서 DB 레이어가 Drizzle ORM + PostgreSQL로 완전 마이그레이션 되었습니다.
> 데이터는 이미 Local Supabase(PostgreSQL)에 존재하므로, Cloud Supabase로 직접 이관합니다.

#### 6.1 Local Supabase에서 데이터 덤프

```bash
# Local Supabase 컨테이너의 PostgreSQL에서 데이터 덤프
# (supabase status 명령으로 DB URL 확인 가능)
pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --data-only \
  --no-owner \
  --no-privileges \
  -t daily_prices \
  -t daily_metrics \
  -t recommendation_cache \
  -f local_data_dump.sql

# 또는 Supabase CLI 사용
# supabase db dump --data-only --local -f local_data_dump.sql
```

#### 6.2 Cloud Supabase에 데이터 복원

```bash
# Cloud Supabase Direct URL로 복원
# (Supabase Dashboard > Settings > Database > Connection string 에서 Direct URL 확인)
psql "$SUPABASE_DIRECT_URL" -f local_data_dump.sql

# 또는 개별 테이블 단위로 복원
psql "$SUPABASE_DIRECT_URL" -c "\copy daily_prices FROM 'daily_prices.csv' CSV HEADER"
```

#### 6.3 데이터 검증

```bash
# Local Supabase row count 확인
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  SELECT 'daily_prices' AS table_name, COUNT(*) FROM daily_prices
  UNION ALL
  SELECT 'daily_metrics', COUNT(*) FROM daily_metrics
  UNION ALL
  SELECT 'recommendation_cache', COUNT(*) FROM recommendation_cache;
"

# Cloud Supabase row count 확인 (위와 동일 쿼리)
psql "$SUPABASE_DIRECT_URL" -c "
  SELECT 'daily_prices' AS table_name, COUNT(*) FROM daily_prices
  UNION ALL
  SELECT 'daily_metrics', COUNT(*) FROM daily_metrics
  UNION ALL
  SELECT 'recommendation_cache', COUNT(*) FROM recommendation_cache;
"

# 샘플 데이터 비교 (최근 5건)
psql "$SUPABASE_DIRECT_URL" -c "
  SELECT ticker, date, close FROM daily_prices ORDER BY date DESC LIMIT 5;
"
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
    "cron:test": "curl -H 'Authorization: Bearer $CRON_SECRET' http://localhost:3000/api/cron/update-prices"
  }
}
```

---

## 검증 체크리스트

### 배포

- [x] Vercel 프로젝트 생성
- [x] GitHub 연동 확인
- [x] 환경변수 설정 완료
- [x] 첫 배포 성공
- [x] 프로덕션 URL 접근 가능

### 인증

- [ ] Google OAuth 리디렉션 URI 추가
- [ ] 프로덕션 로그인 테스트
- [ ] 세션 유지 확인

### 데이터

- [ ] Local Supabase -> Cloud Supabase 데이터 이관 완료
- [ ] Cloud Supabase 데이터 검증 (row count 및 샘플 비교)
- [ ] API 데이터 조회 정상

### Cron

- [x] Cron 엔드포인트 구현 (timingSafeEqual, 증분 업데이트)
- [x] 단위 테스트 작성 (route.test.ts, 493줄)
- [ ] 수동 실행 테스트
- [ ] 인증 검증 (401 테스트)
- [ ] 스케줄 활성화

### 산출물

- [x] `vercel.json` 생성 (Cron 스케줄 + API Cache-Control 헤더)
- [x] `src/app/api/cron/update-prices/route.ts` 생성
- [x] `src/app/api/cron/update-prices/__tests__/route.test.ts` 생성
- [x] `scripts/migrate-to-cloud.sh` 생성

### 모니터링

- [ ] Vercel 로그 확인
- [ ] 에러 알림 설정 (선택)
