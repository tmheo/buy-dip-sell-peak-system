# SPEC-DEPLOY-003: Vercel 배포 및 자동화

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-DEPLOY-003 |
| **제목** | Vercel 프로덕션 배포 및 자동 데이터 업데이트 |
| **상태** | Draft |
| **우선순위** | High |
| **생성일** | 2026-02-02 |
| **라이프사이클** | spec-anchored |
| **선행 SPEC** | SPEC-DEPLOY-001, SPEC-DEPLOY-002 |

---

## 1. 환경 (Environment)

### 1.1 배포 플랫폼

| 항목 | 선택 |
|------|------|
| **호스팅** | Vercel |
| **데이터베이스** | Supabase Cloud |
| **인증** | Google OAuth |
| **Cron** | Vercel Cron Jobs |

### 1.2 영향받는 파일

| 파일 | 역할 | 변경 범위 |
|------|------|----------|
| `vercel.json` | **신규** Vercel 설정 | 신규 생성 |
| `src/app/api/cron/update-prices/route.ts` | **신규** Cron 엔드포인트 | 신규 생성 |
| `.env.production` | **신규** 프로덕션 환경변수 | 신규 생성 |
| `next.config.ts` | Next.js 설정 | 수정 |

### 1.3 아키텍처 다이어그램

```text
┌─────────────────────────────────────────────────────────────┐
│                        Production                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                       Vercel                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │   Next.js   │  │  Cron Job   │  │   Edge       │  │  │
│  │  │   App       │  │  (Daily)    │  │   Functions  │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────────┘  │  │
│  │         │                │                            │  │
│  └─────────┼────────────────┼────────────────────────────┘  │
│            │                │                               │
│            ▼                ▼                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Supabase                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │    │
│  │  │PostgreSQL│  │   Auth   │  │  Connection Pool │  │    │
│  │  │   (DB)   │  │ (Google) │  │   (pgbouncer)    │  │    │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Yahoo Finance API                  │    │
│  │              (Daily Price Updates)                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 가정 (Assumptions)

### 2.1 비즈니스 가정

| ID | 가정 | 신뢰도 | 근거 | 오류 시 영향 |
|----|------|--------|------|-------------|
| A1 | Vercel 무료 티어로 충분하다 | High | 개인 사용 | 유료 플랜 필요 |
| A2 | 미국 장 마감 후 데이터 업데이트가 적절하다 | High | 장 시간 고려 | 데이터 지연 |
| A3 | 일 1회 업데이트로 충분하다 | High | 일봉 데이터 | 빈도 조정 |

### 2.2 기술 가정

| ID | 가정 | 신뢰도 | 근거 | 검증 방법 |
|----|------|--------|------|----------|
| T1 | Vercel Cron이 안정적으로 동작한다 | High | Vercel 문서 | 모니터링 |
| T2 | Supabase 연결이 서버리스 환경에서 작동한다 | High | Supabase 문서 | 테스트 |
| T3 | Yahoo Finance API가 지속적으로 사용 가능하다 | Medium | 과거 이력 | 대안 준비 |

---

## 3. 요구사항 (Requirements)

### 3.1 기능적 요구사항

#### REQ-001: Vercel 배포 구성

**[Ubiquitous]** 시스템은 Vercel에 배포되어 프로덕션 환경에서 실행되어야 한다.

**설정 항목**:
| 항목 | 값 |
|------|-----|
| Framework | Next.js |
| Build Command | `npm run web:build` |
| Output Directory | `.next` |
| Node.js Version | 20.x |

**인수 조건**:
- GitHub 연동 자동 배포 설정
- 프리뷰 배포 (PR마다)
- 프로덕션 배포 (main 브랜치)

#### REQ-002: 프로덕션 환경변수 설정

**[Ubiquitous]** 시스템은 Vercel 환경변수로 프로덕션 설정을 관리해야 한다.

**필수 환경변수**:
| 변수명 | 용도 |
|--------|------|
| `DATABASE_URL` | Supabase Connection Pooler URL |
| `SUPABASE_DIRECT_URL` | Supabase Direct URL (마이그레이션용) |
| `AUTH_SECRET` | Auth.js 암호화 키 |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Secret |
| `NEXTAUTH_URL` | 프로덕션 URL |
| `CRON_SECRET` | Cron 인증 토큰 |

#### REQ-003: 데이터 자동 업데이트 Cron

**[Event-Driven]** **WHEN** 매일 지정된 시간이 되면 **THEN** 시스템은 가격 데이터를 자동으로 업데이트해야 한다.

**Cron 스케줄**:
- 시간: 매일 06:00 UTC (미국 장 마감 후, 한국 15:00)
- 엔드포인트: `GET /api/cron/update-prices`
- 인증: `CRON_SECRET` 헤더 검증

**인수 조건**:
- SOXL, TQQQ 가격 데이터 업데이트
- 기술지표 재계산
- 추천 캐시 무효화 (선택)
- 실패 시 재시도 (3회)

#### REQ-004: Cron 엔드포인트 보안

**[State-Driven]** **IF** 요청에 유효한 `CRON_SECRET` 헤더가 없으면 **THEN** 시스템은 401 Unauthorized를 반환해야 한다.

**인수 조건**:
- Vercel Cron 요청만 허용
- 외부 요청 차단
- 로깅 및 모니터링

#### REQ-005: 로컬 Supabase 데이터를 프로덕션 Supabase Cloud로 이관

**[Ubiquitous]** 시스템은 로컬 Supabase(PostgreSQL) 데이터를 프로덕션 Supabase Cloud(PostgreSQL)로 이관할 수 있어야 한다.

**이관 방법**: `pg_dump` / `pg_restore` 또는 Supabase CLI (`supabase db dump`)

**이관 대상**:
| 테이블 | 레코드 수 (예상) |
|--------|----------------|
| daily_prices | ~5,000 |
| daily_metrics | ~5,000 |
| recommendation_cache | ~1,000 |

**인수 조건**:
- `pg_dump`으로 로컬 Supabase에서 데이터 export
- `pg_restore` 또는 `psql`로 프로덕션 Supabase Cloud에 import
- 데이터 검증 (row count, 샘플 검증)
- 롤백 가능 (프로덕션 백업 후 진행)

#### REQ-006: Google OAuth 프로덕션 설정

**[Ubiquitous]** 시스템은 프로덕션 URL에서 Google OAuth가 작동해야 한다.

**설정 항목**:
- Google Cloud Console에서 프로덕션 리디렉션 URI 추가
- 앱 검증 (필요시)
- 동의 화면 설정

---

## 4. 기술 설계

### 4.1 Vercel 설정

**파일**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/update-prices",
      "schedule": "0 6 * * *"
    }
  ],
  "env": {
    "NEXT_PUBLIC_APP_ENV": "production"
  }
}
```

### 4.2 Cron 엔드포인트

**파일**: `src/app/api/cron/update-prices/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { fetchSince } from "@/services/dataFetcher";
import { calculateMetricsBatch } from "@/services/metricsCalculator";

// 재시도 로직 (REQ-003 요구사항)
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  context: string = "operation"
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`Attempt ${attempt}/${maxAttempts} failed for ${context}:`, error);
      if (attempt === maxAttempts) throw error;
      // 지수 백오프: 1초, 2초, 4초
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error(`All ${maxAttempts} attempts failed for ${context}`);
}

// 단일 티커 업데이트 함수
async function updateTicker(ticker: string): Promise<number> {
  const newPrices = await fetchSince(ticker);
  return newPrices.length;
}

export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. 가격 데이터 업데이트 (각 티커별 3회 재시도)
    const tickers = ["SOXL", "TQQQ"];
    const results = [];
    for (const ticker of tickers) {
      const count = await withRetry(
        () => updateTicker(ticker),
        3,
        `updateTicker(${ticker})`
      );
      results.push({ ticker, updatedCount: count });
    }

    // 2. 기술지표 재계산 (3회 재시도)
    await withRetry(
      () => calculateMetricsBatch(tickers),
      3,
      "calculateMetricsBatch"
    );

    return NextResponse.json({
      success: true,
      updatedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Cron update failed after all retries:", error);
    return NextResponse.json(
      { error: "Update failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

### 4.3 데이터 이관 스크립트 (Local Supabase -> Cloud Supabase)

**파일**: `scripts/migrate-to-cloud.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Local Supabase -> Cloud Supabase 데이터 이관 스크립트
# (REQ-005 요구사항)
#
# 사전 조건:
#   - Local Supabase가 실행 중 (supabase start)
#   - 프로덕션 Supabase Cloud 프로젝트 생성 완료
#   - psql, pg_dump, pg_restore CLI 설치
# ============================================================

# --- 설정 ---
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CLOUD_DB_URL="${CLOUD_DB_URL:?CLOUD_DB_URL 환경변수가 필요합니다 (Supabase Cloud Direct URL)}"
DUMP_FILE="./data/local-supabase-dump.sql"
TABLES=("daily_prices" "daily_metrics" "recommendation_cache")

echo "=== Local Supabase -> Cloud Supabase 데이터 이관 ==="
echo ""

# --- Step 1: 로컬 데이터 export (pg_dump) ---
echo "[1/4] 로컬 Supabase에서 데이터 export..."
pg_dump "$LOCAL_DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --table=daily_prices \
  --table=daily_metrics \
  --table=recommendation_cache \
  > "$DUMP_FILE"

echo "  -> dump 파일 생성: $DUMP_FILE ($(wc -c < "$DUMP_FILE") bytes)"

# --- Step 2: 프로덕션에 import (psql) ---
echo "[2/4] Cloud Supabase에 데이터 import..."
psql "$CLOUD_DB_URL" < "$DUMP_FILE"
echo "  -> import 완료"

# --- Step 3: 데이터 검증 (row count 비교) ---
echo "[3/4] 데이터 검증 (row count)..."
VERIFY_FAILED=0

for TABLE in "${TABLES[@]}"; do
  LOCAL_COUNT=$(psql "$LOCAL_DB_URL" -t -A -c "SELECT COUNT(*) FROM $TABLE;")
  CLOUD_COUNT=$(psql "$CLOUD_DB_URL" -t -A -c "SELECT COUNT(*) FROM $TABLE;")

  if [ "$LOCAL_COUNT" -eq "$CLOUD_COUNT" ]; then
    echo "  $TABLE: Local=$LOCAL_COUNT, Cloud=$CLOUD_COUNT [OK]"
  else
    echo "  $TABLE: Local=$LOCAL_COUNT, Cloud=$CLOUD_COUNT [MISMATCH]"
    VERIFY_FAILED=1
  fi
done

# --- Step 4: 샘플 데이터 검증 ---
echo "[4/4] 샘플 데이터 검증 (latest daily_prices)..."
echo "  Local:"
psql "$LOCAL_DB_URL" -c "SELECT ticker, date, close FROM daily_prices ORDER BY date DESC LIMIT 3;"
echo "  Cloud:"
psql "$CLOUD_DB_URL" -c "SELECT ticker, date, close FROM daily_prices ORDER BY date DESC LIMIT 3;"

# --- 결과 ---
echo ""
if [ "$VERIFY_FAILED" -eq 0 ]; then
  echo "=== 이관 완료: 모든 테이블 검증 통과 ==="
else
  echo "=== 경고: 일부 테이블에서 row count 불일치 발견 ==="
  exit 1
fi
```

**사용법**:

```bash
# Local Supabase가 실행 중인 상태에서
CLOUD_DB_URL="postgresql://postgres.[project-ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres" \
  bash scripts/migrate-to-cloud.sh
```

**대안: Supabase CLI 방식**:

```bash
# 로컬 DB dump (Supabase CLI)
supabase db dump --data-only --local > data/local-dump.sql

# Cloud에 restore
psql "$CLOUD_DB_URL" < data/local-dump.sql
```

### 4.4 환경변수 설정

**Vercel Dashboard > Settings > Environment Variables**:

| 변수명 | 환경 | 값 |
|--------|------|-----|
| `DATABASE_URL` | Production, Preview | `postgresql://...?pgbouncer=true` |
| `SUPABASE_DIRECT_URL` | Production, Preview | `postgresql://...` (direct, 마이그레이션용) |
| `AUTH_SECRET` | Production, Preview | (생성된 값) |
| `AUTH_GOOGLE_ID` | All | (Google Console) |
| `AUTH_GOOGLE_SECRET` | Production, Preview | (Google Console) |
| `NEXTAUTH_URL` | Production | `https://your-app.vercel.app` |
| `CRON_SECRET` | All | (생성된 값, 로컬 테스트 시에도 필요) |

---

## 5. 테스트 전략

### 5.1 배포 테스트

| 테스트 | 검증 항목 |
|--------|----------|
| 빌드 성공 | Vercel 빌드 로그 |
| 정적 페이지 | 홈페이지 로딩 |
| API 라우트 | `/api/recommend` 응답 |
| DB 연결 | 데이터 조회 성공 |

### 5.2 인증 테스트

| 테스트 | 검증 항목 |
|--------|----------|
| Google 로그인 | 리디렉션 동작 |
| 세션 유지 | 새로고침 후 유지 |
| 로그아웃 | 세션 종료 |

### 5.3 Cron 테스트

| 테스트 | 검증 항목 |
|--------|----------|
| 수동 실행 | curl로 엔드포인트 호출 |
| 인증 검증 | 잘못된 토큰 거부 |
| 업데이트 확인 | 데이터 갱신 |

---

## 6. 위험 요소 및 대응

| 위험 | 확률 | 영향 | 대응 방안 |
|------|------|------|----------|
| Vercel 빌드 실패 | Medium | High | 로컬 빌드 테스트 |
| Cron 실패 | Low | Medium | 재시도 로직, 알림 |
| 데이터 이관 오류 (Local -> Cloud Supabase) | Low | High | Supabase 백업, pg_dump 검증 |
| OAuth 설정 오류 | Medium | Medium | 단계별 테스트 |

---

## 7. 마일스톤

| 단계 | 작업 | 산출물 |
|------|------|--------|
| M1 | Vercel 프로젝트 생성 | GitHub 연동 |
| M2 | 환경변수 설정 | Vercel 설정 완료 |
| M3 | 첫 배포 테스트 | 프리뷰 URL |
| M4 | Google OAuth 설정 | 로그인 테스트 |
| M5 | Cron 엔드포인트 구현 | API 테스트 |
| M6 | 프로덕션 데이터 이관 (Local -> Cloud Supabase) | 프로덕션 데이터 |
| M7 | Cron 활성화 | 자동 업데이트 확인 |
| M8 | 모니터링 설정 | 알림 설정 |
