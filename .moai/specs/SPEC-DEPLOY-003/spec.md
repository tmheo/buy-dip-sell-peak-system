# SPEC-DEPLOY-003: Vercel 배포 및 자동화

## 메타데이터

| 항목 | 내용 |
|------|------|
| **SPEC ID** | SPEC-DEPLOY-003 |
| **제목** | Vercel 프로덕션 배포 및 자동 데이터 업데이트 |
| **상태** | Completed |
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
| `src/app/api/cron/update-prices/__tests__/route.test.ts` | **신규** 단위 테스트 | 신규 생성 |
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
- SOXL, TQQQ 가격 데이터 증분 업데이트 (`getLatestDate`로 마지막 날짜 이후만 fetch)
- 기술지표 증분 계산 (`getLatestMetricDate`로 마지막 지표 날짜 이후만 계산)
- 실패 시 재시도 (3회, 지수 백오프)

#### REQ-004: Cron 엔드포인트 보안

**[State-Driven]** **IF** 요청에 유효한 `CRON_SECRET` 헤더가 없으면 **THEN** 시스템은 401 Unauthorized를 반환해야 한다.

**인수 조건**:
- Vercel Cron 요청만 허용
- 외부 요청 차단
- `timingSafeEqual` (Node.js crypto)을 사용한 타이밍 공격 방지
- 내부 에러 메시지 비노출 (클라이언트에 "Internal server error"만 반환)
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

### 4.2 Cron 엔드포인트

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
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  context: string
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`[${context}] 재시도 로직 오류`);
}

// 단일 티커에 대한 가격 및 지표 증분 업데이트
async function updateTicker(ticker: SupportedTicker): Promise<{ newPrices: number; newMetrics: number }> {
  // 1. 마지막 저장 날짜 조회
  const latestDate = await getLatestDate(ticker);
  if (!latestDate) return { newPrices: 0, newMetrics: 0 };

  // 2. Yahoo Finance에서 신규 가격 데이터 가져오기
  const newPrices = await withRetry(() => fetchSince(latestDate, ticker), DEFAULT_MAX_ATTEMPTS, `${ticker} fetchSince`);
  if (newPrices.length === 0) return { newPrices: 0, newMetrics: 0 };

  // 3. DB에 가격 데이터 삽입
  await withRetry(() => insertDailyPrices(newPrices.map((p) => ({ ticker, ...p }))), DEFAULT_MAX_ATTEMPTS, `${ticker} insertDailyPrices`);

  // 4. 전체 가격 데이터 로드 (지표 계산용)
  const allPrices = await withRetry(() => getAllPricesByTicker(ticker), DEFAULT_MAX_ATTEMPTS, `${ticker} getAllPricesByTicker`);

  // 5. 지표 시작 인덱스 결정 (증분 계산: 마지막 지표 날짜 이후만)
  const latestMetricDate = await getLatestMetricDate(ticker);
  const dates = allPrices.map((p) => p.date);
  let startIdx = latestMetricDate ? (dates.indexOf(latestMetricDate) + 1 || 59) : 59;

  // 6. 기술적 지표 배치 계산 및 DB 저장
  const adjCloses = allPrices.map((p) => p.adjClose);
  const newMetrics = calculateMetricsBatch(adjCloses, dates, ticker, startIdx, adjCloses.length - 1);
  if (newMetrics.length > 0) {
    await withRetry(() => insertMetrics(newMetrics), DEFAULT_MAX_ATTEMPTS, `${ticker} insertMetrics`);
  }

  return { newPrices: newPrices.length, newMetrics: newMetrics.length };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 인증 (timingSafeEqual로 타이밍 공격 방지)
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  if (
    !authHeader ||
    authHeader.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedToken))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = [];
    for (const ticker of TICKERS) {
      const result = await updateTicker(ticker);
      results.push({ ticker, ...result });
    }

    return NextResponse.json({ success: true, updatedAt: new Date().toISOString(), results }, { status: 200 });
  } catch (error) {
    // 내부 에러 메시지 비노출
    return NextResponse.json({ error: "Update failed", message: "Internal server error" }, { status: 500 });
  }
}
```

### 4.3 데이터 이관 스크립트 (Local Supabase -> Cloud Supabase)

**파일**: `scripts/migrate-to-cloud.sh`

```bash
#!/usr/bin/env bash
# Local Supabase -> Cloud Supabase 데이터 이관 스크립트
# 사용법: CLOUD_DB_URL="postgresql://..." ./scripts/migrate-to-cloud.sh
set -euo pipefail

# ============================================================
# 설정
# ============================================================
LOCAL_DB_URL="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DUMP_FILE="./data/local-supabase-dump.sql"
TABLES=("daily_prices" "daily_metrics" "recommendation_cache")

# Cloud DB URL 필수 확인
if [[ -z "${CLOUD_DB_URL:-}" ]]; then
  echo "오류: CLOUD_DB_URL 환경변수가 설정되지 않았습니다."
  echo "사용법: CLOUD_DB_URL=\"postgresql://user:pass@host:port/db\" $0"
  exit 1
fi

# ============================================================
# 1단계: data/ 디렉토리 생성
# ============================================================
echo "============================================================"
echo "1단계: data/ 디렉토리 확인 및 생성"
echo "============================================================"
mkdir -p ./data
echo "  -> data/ 디렉토리 준비 완료"

# ============================================================
# 2단계: 로컬 DB에서 pg_dump (데이터만)
# ============================================================
echo ""
echo "============================================================"
echo "2단계: 로컬 Supabase에서 데이터 덤프"
echo "============================================================"

TABLE_ARGS=""
for table in "${TABLES[@]}"; do
  TABLE_ARGS="${TABLE_ARGS} --table=${table}"
done

pg_dump --data-only --no-owner --no-privileges \
  ${TABLE_ARGS} "${LOCAL_DB_URL}" > "${DUMP_FILE}"

echo "  -> 덤프 완료 ($(wc -c < "${DUMP_FILE}" | tr -d ' ') bytes)"

# ============================================================
# 3단계: Cloud DB로 데이터 임포트
# ============================================================
echo ""
echo "============================================================"
echo "3단계: Cloud Supabase로 데이터 임포트"
echo "============================================================"

psql "${CLOUD_DB_URL}" < "${DUMP_FILE}"
echo "  -> 임포트 완료"

# ============================================================
# 4단계: Row Count 검증
# ============================================================
echo ""
echo "============================================================"
echo "4단계: 테이블별 행 수 검증"
echo "============================================================"

VERIFICATION_FAILED=0
for table in "${TABLES[@]}"; do
  LOCAL_COUNT=$(psql "${LOCAL_DB_URL}" -t -A -c "SELECT COUNT(*) FROM ${table};")
  CLOUD_COUNT=$(psql "${CLOUD_DB_URL}" -t -A -c "SELECT COUNT(*) FROM ${table};")

  if [[ "${LOCAL_COUNT}" -eq "${CLOUD_COUNT}" ]]; then
    echo "  [OK] ${table}: 로컬=${LOCAL_COUNT}, 클라우드=${CLOUD_COUNT}"
  else
    echo "  [실패] ${table}: 로컬=${LOCAL_COUNT}, 클라우드=${CLOUD_COUNT} (불일치!)"
    VERIFICATION_FAILED=1
  fi
done

# ============================================================
# 5단계: 샘플 데이터 검증
# ============================================================
echo ""
echo "============================================================"
echo "5단계: daily_prices 최신 3건 샘플 비교"
echo "============================================================"

echo "  [로컬 DB]"
psql "${LOCAL_DB_URL}" -c "SELECT ticker, date, close FROM daily_prices ORDER BY date DESC LIMIT 3;"
echo "  [클라우드 DB]"
psql "${CLOUD_DB_URL}" -c "SELECT ticker, date, close FROM daily_prices ORDER BY date DESC LIMIT 3;"

# ============================================================
# 결과
# ============================================================
echo ""
echo "============================================================"
if [[ "${VERIFICATION_FAILED}" -eq 1 ]]; then
  echo "검증 실패: 로컬과 클라우드 데이터 행 수가 일치하지 않습니다."
  echo "덤프 파일(${DUMP_FILE})을 확인한 후 재시도해 주세요."
  echo "============================================================"
  exit 1
else
  echo "이관 완료: 모든 테이블 검증 통과!"
  echo "============================================================"
  exit 0
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

---

## 8. 구현 노트

SPEC 원본 대비 실제 구현에서 강화/추가된 사항을 기록합니다.

### 8.1 보안 강화: timingSafeEqual

SPEC 원본에서는 단순 문자열 비교(`authHeader !== Bearer ${CRON_SECRET}`)를 사용했으나, 실제 구현에서는 Node.js `crypto` 모듈의 `timingSafeEqual`을 사용하여 타이밍 공격(timing attack)을 방지했습니다. 또한 길이 비교를 먼저 수행하여 `timingSafeEqual`의 동일 길이 전제 조건을 충족합니다.

### 8.2 증분 지표 계산 (Incremental Metrics)

SPEC 원본에서는 단순히 `calculateMetricsBatch(tickers)` 호출로 전체 재계산을 설계했으나, 실제 구현에서는 `getLatestMetricDate(ticker)`로 마지막 지표 날짜를 조회하고 해당 날짜 이후 인덱스부터만 계산합니다. 이를 통해 불필요한 재계산을 방지하고 Cron 실행 시간을 단축했습니다.

### 8.3 에러 메시지 비노출

SPEC 원본에서는 500 에러 시 `error.message`를 클라이언트에 반환했으나, 실제 구현에서는 `"Internal server error"`만 반환하여 내부 구현 세부사항이 외부에 노출되지 않도록 보안을 강화했습니다.

### 8.4 API Cache-Control 헤더

SPEC 원본의 `vercel.json`에는 `env` 설정만 있었으나, 실제 구현에서는 `/api/(.*)` 경로에 `Cache-Control: no-store, max-age=0` 헤더를 추가하여 API 응답이 캐싱되지 않도록 설정했습니다.

### 8.5 종합 단위 테스트

SPEC 원본에는 단위 테스트 파일이 포함되지 않았으나, 실제 구현에서 `src/app/api/cron/update-prices/__tests__/route.test.ts` (493줄)를 추가하여 다음 영역을 커버합니다:

- 인증 테스트 (토큰 없음, 잘못된 토큰, 유효한 토큰)
- 성공 시나리오 (가격/지표 업데이트 정상 동작)
- 에러 시나리오 (DB 오류, 외부 API 오류)
- 엣지 케이스 (새 데이터 없음, 저장된 데이터 없음)

### 8.6 이관 스크립트 개선

실제 구현에서 `scripts/migrate-to-cloud.sh`에 다음 개선사항을 적용했습니다:

- `data/` 디렉토리 자동 생성 (`mkdir -p ./data`)
- `CLOUD_DB_URL` 누락 시 사용법 안내 메시지 출력
- 각 단계를 구분선으로 명확하게 구분하는 출력 포맷
- 실패/성공 결과 메시지 개선
