# 프로젝트 구조

## 디렉토리 트리

```
buy-dip-sell-peak-system/
├── scripts/                          # 유틸리티 스크립트
│   ├── generate-favicon.mjs          # 파비콘 생성 스크립트
│   ├── migrate-to-cloud.sh           # Local Supabase → Cloud Supabase 데이터 이관
│   ├── multi-year-baseline.ts        # 다년 베이스라인 계산
│   ├── multi-year-finetune.ts        # 다년 파인튜닝 최적화
│   ├── multi-year-optimize.ts        # 다년 파라미터 최적화
│   ├── precompute-recommendations.ts # 추천 캐시 사전 계산
│   └── test-recommend-backtest.ts    # 추천 백테스트 테스트
├── src/                              # 소스 코드 디렉토리
│   ├── index.ts                      # CLI 진입점 및 명령어 라우터
│   ├── app/                          # Next.js App Router 페이지
│   │   ├── layout.tsx                # 루트 레이아웃
│   │   ├── page.tsx                  # 홈페이지 (/ → /info 리다이렉트)
│   │   ├── api/                      # API 라우트
│   │   │   ├── auth/[...nextauth]/   # NextAuth.js 인증 핸들러
│   │   │   ├── backtest/             # 백테스트 API
│   │   │   ├── backtest-recommend/   # 추천 백테스트 API
│   │   │   ├── cron/                 # Cron 자동화 API
│   │   │   │   └── update-prices/    # 일일 가격/지표 자동 업데이트
│   │   │   │       ├── route.ts      # Cron 엔드포인트 핸들러
│   │   │   │       └── __tests__/    # Cron 엔드포인트 테스트
│   │   │   │           └── route.test.ts
│   │   │   ├── recommend/            # 전략 추천 API
│   │   │   ├── trading/              # 트레이딩 계좌 API
│   │   │   └── user/                 # 사용자 관리 API
│   │   ├── backtest/                 # 백테스트 페이지
│   │   ├── backtest-recommend/       # 추천 백테스트 페이지
│   │   ├── info/                     # 정보 페이지
│   │   ├── mypage/                   # 마이페이지
│   │   ├── recommend/                # 전략 추천 페이지
│   │   └── trading/                  # 트레이딩 페이지
│   ├── backtest/                     # 백테스트 엔진 모듈
│   │   ├── types.ts                  # 백테스트 타입 정의
│   │   ├── engine.ts                 # 백테스트 엔진
│   │   ├── strategy.ts               # Pro1/Pro2/Pro3 전략 정의
│   │   ├── cycle.ts                  # 사이클 관리자
│   │   ├── metrics.ts                # 기술적 지표 계산
│   │   ├── divergence.ts             # RSI 다이버전스 탐지
│   │   ├── downgrade.ts              # 전략 하향 규칙
│   │   ├── trading-utils.ts          # 거래 유틸리티
│   │   └── index.ts                  # 모듈 엔트리포인트
│   ├── backtest-recommend/           # 추천 백테스트 엔진
│   │   ├── engine.ts                 # 추천 백테스트 엔진
│   │   ├── recommend-helper.ts       # 빠른 추천 조회 헬퍼
│   │   └── types.ts                  # 추천 백테스트 타입
│   ├── recommend/                    # 전략 추천 엔진
│   │   ├── similarity.ts             # 유사도 계산 (지수 감쇠)
│   │   ├── score.ts                  # 전략 점수 계산
│   │   └── types.ts                  # 추천 타입 정의
│   ├── optimize/                     # 최적화 엔진 (유전 알고리즘)
│   ├── components/                   # React 공통 컴포넌트
│   │   ├── auth/                     # 인증 컴포넌트
│   │   ├── backtest/                 # 백테스트 컴포넌트
│   │   ├── backtest-recommend/       # 추천 백테스트 컴포넌트
│   │   ├── mypage/                   # 마이페이지 컴포넌트
│   │   ├── recommend/                # 전략 추천 컴포넌트
│   │   └── trading/                  # 트레이딩 컴포넌트
│   ├── database/                     # 데이터베이스 모듈
│   │   ├── schema/                   # Drizzle ORM 스키마
│   │   │   ├── index.ts              # 스키마 통합 export
│   │   │   ├── auth.ts               # 인증 테이블 (users, accounts, sessions)
│   │   │   ├── cache.ts              # 추천 캐시 테이블
│   │   │   ├── prices.ts             # 가격 데이터 테이블
│   │   │   └── trading.ts            # 트레이딩 테이블
│   │   ├── trading/                  # 트레이딩 모듈 (모듈화)
│   │   │   ├── index.ts              # 모듈 통합 export
│   │   │   ├── accounts.ts           # 계좌 CRUD
│   │   │   ├── execution.ts          # 주문 실행 로직
│   │   │   ├── mappers.ts            # Drizzle 타입 매퍼
│   │   │   ├── orders.ts             # 주문 CRUD
│   │   │   ├── profits.ts            # 수익 기록 CRUD
│   │   │   └── tier-holdings.ts      # 티어 보유현황 CRUD
│   │   ├── db-drizzle.ts             # Drizzle 클라이언트 (PostgreSQL 연결)
│   │   ├── prices.ts                 # 가격 데이터 CRUD
│   │   ├── metrics.ts                # 기술적 지표 CRUD
│   │   ├── recommend-cache.ts        # 추천 캐시 CRUD
│   │   ├── users.ts                  # 사용자 데이터 접근
│   │   └── trading.ts                # 트레이딩 통합 (레거시 호환)
│   ├── services/                     # 외부 서비스 연동
│   │   ├── dataFetcher.ts            # Yahoo Finance API
│   │   └── metricsCalculator.ts      # 기술적 지표 계산
│   ├── lib/                          # 유틸리티 및 공통 모듈
│   │   ├── auth/                     # 인증 관련 모듈
│   │   │   └── api-auth.ts           # API 인증 유틸리티
│   │   ├── validations/              # Zod 스키마
│   │   │   └── trading.ts            # 트레이딩 입력값 검증 스키마
│   │   ├── api-utils.ts              # API 라우트 공통 유틸리티
│   │   └── date.ts                   # 날짜 유틸리티
│   ├── types/                        # TypeScript 타입 정의
│   │   ├── index.ts                  # 기본 타입
│   │   ├── auth.ts                   # Auth.js 인증 타입
│   │   └── trading.ts                # 트레이딩 타입
│   ├── utils/                        # 유틸리티 함수
│   │   ├── index.ts                  # 유틸리티 모듈 인덱스
│   │   └── trading-core.ts           # 트레이딩 코어 로직
│   └── styles/
│       └── globals.css               # 글로벌 스타일
├── data/                             # 로컬 데이터 저장 디렉토리 (레거시)
│   └── prices.db                     # SQLite 데이터베이스 (deprecated, Supabase로 마이그레이션됨)
├── dist/                             # 컴파일된 JavaScript 출력
├── node_modules/                     # npm 패키지 의존성
├── .moai/                            # MoAI 프로젝트 설정
│   ├── config/                       # 프로젝트 구성 파일
│   └── project/                      # 프로젝트 문서
├── vercel.json                       # Vercel 배포 설정 (Cron 스케줄, API 헤더)
├── drizzle.config.ts                 # Drizzle Kit 설정
├── auth.ts                           # Auth.js v5 설정
├── package.json                      # npm 프로젝트 설정
├── tsconfig.json                     # TypeScript 컴파일러 설정
├── vitest.config.ts                  # Vitest 테스트 설정
├── eslint.config.js                  # ESLint 린터 설정
├── .prettierrc                       # Prettier 포매터 설정
└── README.md                         # 프로젝트 설명서
```

---

## 디렉토리별 설명

### `scripts/` - 유틸리티 스크립트

독립 실행 가능한 유틸리티 스크립트 모음입니다.

| 스크립트 | 설명 |
|----------|------|
| `generate-favicon.mjs` | sharp 및 png-to-ico를 사용한 파비콘 생성 |
| `migrate-to-cloud.sh` | pg_dump/pg_restore를 사용한 Local → Cloud Supabase 데이터 이관 |
| `multi-year-baseline.ts` | 유사도 파라미터의 다년 베이스라인 성과 계산 |
| `multi-year-finetune.ts` | 다년 데이터 기반 파라미터 파인튜닝 |
| `multi-year-optimize.ts` | 유사도 가중치/허용오차 최적화 |
| `precompute-recommendations.ts` | 모든 날짜의 추천 전략 사전 계산 |
| `test-recommend-backtest.ts` | 추천 백테스트 엔진 검증 테스트 |

### `src/` - 소스 코드

애플리케이션의 모든 TypeScript 소스 코드가 위치하는 디렉토리입니다.

### `src/app/` - Next.js App Router

Next.js 15 App Router 기반의 페이지 및 API 라우트입니다.

### `src/database/` - 데이터베이스 레이어

Drizzle ORM을 사용한 데이터베이스 스키마 정의 및 CRUD 작업을 담당합니다.

### `src/database/trading/` - 트레이딩 모듈 (모듈화)

트레이딩 관련 CRUD 및 비즈니스 로직을 담당하는 모듈화된 디렉토리입니다.

| 파일 | 설명 |
|------|------|
| `index.ts` | 모듈 통합 export (하위 호환성 유지) |
| `accounts.ts` | 트레이딩 계좌 CRUD |
| `execution.ts` | 주문 실행 로직 (체결 처리, 사이클 완료) |
| `mappers.ts` | Drizzle 결과를 도메인 타입으로 변환 |
| `orders.ts` | 일일 주문 CRUD 및 주문 생성 로직 |
| `profits.ts` | 수익 기록 CRUD 및 월별 집계 |
| `tier-holdings.ts` | 티어별 보유현황 CRUD |

### `src/backtest/` - 백테스트 엔진

Pro1/Pro2/Pro3 전략 기반의 백테스트 시뮬레이션 로직입니다.

### `src/backtest-recommend/` - 추천 백테스트 엔진

사이클별로 추천 전략을 동적으로 적용하는 백테스트 엔진입니다.

### `src/recommend/` - 전략 추천 엔진

기술적 지표 기반 유사 구간 분석 및 전략 점수 계산 모듈입니다.

### `data/` - 로컬 데이터 저장소 (레거시)

SQLite 데이터베이스 파일(`prices.db`)이 저장되는 디렉토리입니다. 현재는 Supabase PostgreSQL로 완전 마이그레이션되어 더 이상 사용되지 않습니다. 로컬 개발 환경에서도 Supabase Local(Docker)을 사용합니다.

### `dist/` - 빌드 출력

`npm run build` 명령어 실행 후 컴파일된 JavaScript 파일이 생성되는 디렉토리입니다.

---

## 주요 파일 설명

### `src/index.ts` - CLI 진입점

애플리케이션의 메인 진입점으로 CLI 명령어를 처리합니다.

**주요 기능:**
- 명령행 인자 파싱 (`--ticker`, `--start`, `--end`)
- 6개 명령어 라우팅 (`init`, `init-all`, `update`, `update-all`, `query`, `help`)
- 결과 출력 포매팅 (처음/마지막 N개 데이터 표시)
- 에러 핸들링 및 프로세스 종료

**핸들러 함수:**
| 함수 | 명령어 | 설명 |
|------|--------|------|
| `handleInit()` | init | 단일 티커 전체 히스토리 초기화 |
| `handleInitAll()` | init-all | 모든 티커 초기화 |
| `handleUpdate()` | update | 단일 티커 증분 업데이트 |
| `handleUpdateAll()` | update-all | 모든 티커 업데이트 |
| `handleQuery()` | query | 날짜 범위 데이터 조회 |
| `showHelp()` | help | 도움말 출력 |

---

### `src/types/index.ts` - 타입 정의

애플리케이션 전역에서 사용되는 TypeScript 인터페이스를 정의합니다.

**정의된 타입:**

```typescript
// 일별 가격 데이터
interface DailyPrice {
  id?: number;           // 데이터베이스 자동 생성 ID
  ticker?: string;       // 티커 심볼 (SOXL, TQQQ)
  date: string;          // 날짜 (YYYY-MM-DD 형식)
  open: number;          // 시가
  high: number;          // 고가
  low: number;           // 저가
  close: number;         // 종가
  volume: number;        // 거래량
  createdAt?: string;    // 레코드 생성 시간
}

// Yahoo Finance 원시 데이터
interface YahooQuote {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;     // 수정 종가 (선택)
}

// 데이터 조회 옵션
interface QueryOptions {
  startDate?: string;    // 조회 시작일
  endDate?: string;      // 조회 종료일
  limit?: number;        // 결과 제한 수
}

// CLI 명령어 타입
type Command = "init" | "init-all" | "update" | "update-all" | "query" | "help";
```

---

### `src/database/schema/` - Drizzle ORM 스키마

PostgreSQL 데이터베이스 테이블 스키마를 Drizzle ORM으로 정의합니다.

**스키마 파일:**

| 파일 | 설명 |
|------|------|
| `auth.ts` | 인증 테이블 (users, accounts, sessions, verification_tokens) |
| `prices.ts` | 가격 데이터 테이블 (daily_prices, daily_metrics) |
| `trading.ts` | 트레이딩 테이블 (trading_accounts, tier_holdings, daily_orders, profit_records) |
| `cache.ts` | 추천 캐시 테이블 (recommendation_cache) |

**주요 테이블:**

| 테이블 | 설명 |
|--------|------|
| `daily_prices` | OHLCV 일봉 데이터 |
| `daily_metrics` | 기술적 지표 (MA20, MA60, RSI14, ROC12, Volatility20) |
| `users` | 사용자 정보 |
| `accounts` | OAuth 계정 연동 정보 |
| `sessions` | 세션 관리 |
| `trading_accounts` | 트레이딩 계좌 |
| `tier_holdings` | 티어별 보유 현황 |
| `daily_orders` | 일일 주문 내역 |
| `profit_records` | 수익 기록 |
| `recommendation_cache` | 전략 추천 캐시 |

---

### `src/database/db-drizzle.ts` - Drizzle 클라이언트

Supabase PostgreSQL 연결을 관리하는 Drizzle ORM 클라이언트입니다.

**주요 기능:**
- Supabase PostgreSQL 연결 관리 (개발: localhost:54322, 프로덕션: Supabase Cloud)
- Connection Pooler 지원 (프로덕션 환경)
- 트랜잭션 지원
- 타입 안전한 쿼리 빌더

---

### `src/database/prices.ts` - 가격 데이터 모듈

가격 데이터 CRUD 작업을 담당합니다. Drizzle ORM을 사용한 타입 안전한 쿼리 구현.

**주요 함수:**

| 함수 | 설명 |
|------|------|
| `insertPrice()` | 단일 가격 데이터 삽입 |
| `insertPrices()` | 다중 가격 데이터 일괄 삽입 |
| `getAllPricesByTicker()` | 특정 티커 전체 데이터 조회 |
| `getPricesByDateRange()` | 날짜 범위 조회 |
| `getLatestDate()` | 최신 저장 날짜 조회 |
| `getCount()` | 특정 티커 데이터 수 조회 |

---

### `src/database/metrics.ts` - 기술적 지표 모듈

사전 계산된 기술적 지표 CRUD 작업을 담당합니다.

**주요 함수:**

| 함수 | 설명 |
|------|------|
| `getMetricsByDateRange()` | 날짜 범위 지표 조회 |
| `upsertMetrics()` | 지표 삽입/업데이트 |
| `calculateAndSaveMetrics()` | 지표 계산 및 저장 |

---

### `src/database/recommend-cache.ts` - 추천 캐시 모듈

전략 추천 결과 캐시 관리를 담당합니다.

**주요 함수:**

| 함수 | 설명 |
|------|------|
| `getRecommendationFromCache()` | 캐시에서 추천 조회 |
| `saveRecommendationToCache()` | 추천 결과 캐시 저장 |
| `clearExpiredCache()` | 만료된 캐시 삭제 |

---

### `src/services/dataFetcher.ts` - 데이터 수집 서비스

Yahoo Finance API와 연동하여 가격 데이터를 수집합니다.

**티커 설정:**

```typescript
const TICKER_CONFIG = {
  SOXL: { startDate: "2010-03-11" },  // 반도체 3배 레버리지
  TQQQ: { startDate: "2010-02-09" },  // 나스닥 3배 레버리지
};
```

**주요 함수:**

| 함수 | 설명 |
|------|------|
| `fetchAllHistory()` | 티커의 전체 히스토리 다운로드 |
| `fetchSince()` | 특정 날짜 이후 데이터만 다운로드 (증분) |
| `fetchCurrentQuote()` | 현재 시세 조회 |
| `getSupportedTickers()` | 지원 티커 목록 반환 |
| `fetchChartWithRetry()` | 재시도 로직이 포함된 차트 데이터 조회 |
| `convertQuotesToPrices()` | Yahoo Finance 데이터를 DailyPrice로 변환 |

**재시도 설정:**
- 최대 재시도 횟수: 3회
- 재시도 간격: 지수 백오프 (2초 * 시도 횟수)
- 대상 에러: Rate Limit (429 Too Many Requests)

---

### `src/services/metricsCalculator.ts` - 기술적 지표 계산 서비스

가격 데이터로부터 기술적 지표를 계산합니다.

**계산하는 지표:**

| 지표 | 설명 |
|------|------|
| MA20 | 20일 단순이동평균 |
| MA60 | 60일 단순이동평균 |
| RSI14 | 14일 RSI (Wilder's EMA) |
| ROC12 | 12일 변화율 |
| Volatility20 | 20일 변동성 |
| MA Slope | MA20 기울기 |
| Disparity | 이격도 |
| Golden Cross | 정배열 여부 |

---

## 모듈 구성 및 데이터 흐름

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    src/app/ (Pages)                      │    │
│  │  - info/: 전략 설명 페이지                               │    │
│  │  - recommend/: 전략 추천 페이지                          │    │
│  │  - backtest/: 백테스트 페이지                            │    │
│  │  - backtest-recommend/: 추천 백테스트 페이지             │    │
│  │  - trading/: 트레이딩 계좌 페이지                        │    │
│  │  - mypage/: 마이페이지                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  src/app/api/ (Routes)                   │    │
│  │  - /api/backtest: 백테스트 실행                          │    │
│  │  - /api/recommend: 전략 추천                             │    │
│  │  - /api/backtest-recommend: 추천 백테스트                │    │
│  │  - /api/trading/accounts: 계좌 CRUD                      │    │
│  │  - /api/auth/[...nextauth]: 인증                         │    │
│  │  - /api/cron/update-prices: 일일 자동 업데이트            │    │
│  │  - /api/user/delete: 회원 탈퇴                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                        │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ src/backtest/    │  │ src/recommend/   │                     │
│  │  - engine.ts     │  │  - similarity.ts │                     │
│  │  - strategy.ts   │  │  - score.ts      │                     │
│  │  - cycle.ts      │  │  - types.ts      │                     │
│  └──────────────────┘  └──────────────────┘                     │
│  ┌──────────────────────────────────────────┐                   │
│  │ src/backtest-recommend/                   │                   │
│  │  - engine.ts (추천 백테스트 엔진)         │                   │
│  │  - recommend-helper.ts (빠른 추천 조회)   │                   │
│  └──────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               src/services/                              │    │
│  │  - dataFetcher.ts: Yahoo Finance API 연동               │    │
│  │  - metricsCalculator.ts: 기술적 지표 계산               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database Layer                               │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ src/database/        │  │ src/database/schema/ │            │
│  │  - db-drizzle.ts     │  │  - auth.ts           │            │
│  │  - prices.ts         │  │  - prices.ts         │            │
│  │  - metrics.ts        │  │  - trading.ts        │            │
│  │  - trading.ts        │  │  - cache.ts          │            │
│  │  - recommend-cache.ts│  │                      │            │
│  └──────────────────────┘  └──────────────────────┘            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ src/database/trading/ (모듈화)                            │  │
│  │  - accounts.ts, execution.ts, orders.ts                  │  │
│  │  - profits.ts, tier-holdings.ts, mappers.ts              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Storage Layer                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          Supabase PostgreSQL (Production)                │    │
│  │  - daily_prices: OHLCV 일봉 데이터                       │    │
│  │  - daily_metrics: 기술적 지표                            │    │
│  │  - trading_accounts: 트레이딩 계좌                       │    │
│  │  - recommendation_cache: 추천 캐시                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          Supabase Local (Development - Docker)           │    │
│  │  - PostgreSQL: localhost:54322                           │    │
│  │  - Studio: localhost:54323                               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 데이터 흐름

```
Yahoo Finance API
       │
       │ HTTP Request
       ▼
┌──────────────────┐
│   dataFetcher    │ ◄── 재시도 로직 (429 에러 처리)
│ (yahoo-finance2) │
└──────────────────┘
       │
       │ ChartQuote[]
       ▼
┌──────────────────┐
│ convertQuotes    │ ◄── 데이터 변환 및 필터링
│ ToPrices()       │     (null 값 제거, 날짜 포맷)
└──────────────────┘
       │
       │ DailyPrice[]
       ▼
┌──────────────────┐
│ metricsCalculator│ ◄── 기술적 지표 계산
│                  │     (MA, RSI, ROC, Volatility)
└──────────────────┘
       │
       │ DailyMetrics[]
       ▼
┌──────────────────┐
│   Drizzle ORM    │ ◄── 타입 안전한 삽입
│   (PostgreSQL)   │     (트랜잭션 처리)
└──────────────────┘
       │
       │ SQL INSERT/UPSERT
       ▼
┌──────────────────┐
│    Supabase      │ ◄── UNIQUE 제약 (중복 방지)
│   PostgreSQL     │     onConflictDoUpdate
└──────────────────┘
```

---

## 아키텍처 패턴

### 적용된 패턴

| 패턴 | 적용 위치 | 설명 |
|------|----------|------|
| **레이어드 아키텍처** | 전체 구조 | Presentation, API, Business, Service, Database, Storage 레이어 분리 |
| **설정 기반 설계** | dataFetcher.ts | TICKER_CONFIG으로 티커 확장 용이 |
| **트랜잭션 패턴** | database/*.ts | Drizzle ORM 트랜잭션으로 원자성 보장 |
| **재시도 패턴** | dataFetcher.ts | 지수 백오프를 통한 API 안정성 |
| **캐시 패턴** | recommend-cache.ts | 추천 결과 캐싱으로 성능 최적화 |
| **Repository 패턴** | database/*.ts | 데이터 접근 로직 추상화 |

### Clean Architecture 원칙

1. **의존성 역전**: 상위 레이어가 하위 레이어에 의존하지만, 인터페이스(types)를 통해 결합도 최소화
2. **단일 책임**: 각 모듈이 하나의 명확한 책임 담당
3. **개방-폐쇄**: 새 티커/전략 추가 시 설정만 수정

---

## Frontend 컴포넌트 구조

### 컴포넌트 디렉토리

```
src/components/
├── auth/                             # 인증 컴포넌트 (2개)
│   ├── LoginButton.tsx               # 로그인 버튼
│   └── LogoutButton.tsx              # 로그아웃 버튼
├── backtest/                         # 백테스트 결과 시각화 (3개)
│   ├── PriceChart.tsx                # 가격 차트 (종가 + MA20/MA60)
│   ├── MetricsCharts.tsx             # 6개 기술적 지표 차트
│   └── ProResultCard.tsx             # Pro 전략 결과 카드
├── backtest-recommend/               # 추천 백테스트 컴포넌트 (5개)
│   ├── AssetMddChart.tsx             # 자산/MDD 차트
│   ├── CycleStrategyTable.tsx        # 사이클별 전략 테이블
│   ├── DailyHistoryTable.tsx         # 일별 히스토리 테이블
│   ├── RecommendResultCard.tsx       # 추천 백테스트 결과 카드
│   └── StrategySummaryCards.tsx      # 전략 요약 카드
├── mypage/                           # 마이페이지 컴포넌트 (2개)
│   ├── UserProfile.tsx               # 사용자 프로필 카드
│   └── DeleteAccountModal.tsx        # 회원 탈퇴 확인 모달
├── recommend/                        # 전략 추천 컴포넌트 (4개)
│   ├── RecommendationCard.tsx        # 추천 결과 카드
│   ├── ReferenceChart.tsx            # 기준일 차트
│   ├── SimilarPeriodCard.tsx         # 유사 구간 카드
│   └── StrategyScoreTable.tsx        # 전략 점수 테이블
├── trading/                          # 트레이딩 컴포넌트 (9개)
│   ├── AccountForm.tsx               # 계좌 생성/수정 폼
│   ├── AccountListTable.tsx          # 계좌 목록 테이블
│   ├── AccountSettingsCard.tsx       # 계좌 설정 카드
│   ├── AssetSummary.tsx              # 자산 요약 카드
│   ├── DailyOrdersTable.tsx          # 당일 주문표 테이블
│   ├── DeleteAccountModal.tsx        # 계좌 삭제 확인 모달
│   ├── InvestmentRatioBar.tsx        # 투자 비율 막대 그래프
│   ├── ProfitStatusTable.tsx         # 수익 현황 테이블
│   └── TierHoldingsTable.tsx         # 티어별 보유현황 테이블
├── FlowChart.tsx                     # 사용법 플로우차트
├── MainNavigation.tsx                # 메인 네비게이션
├── PremiumModal.tsx                  # 프리미엄 모달
├── Sidebar.tsx                       # 우측 사이드바
├── StrategyCard.tsx                  # 전략 카드
└── TopControlBar.tsx                 # 상단 컨트롤 바
```

총 31개 컴포넌트 파일.

### 컴포넌트 설명

| 컴포넌트 | 파일명 | 용도 |
|----------|--------|------|
| TopControlBar | `TopControlBar.tsx` | 상단 사용자 네비게이션 |
| MainNavigation | `MainNavigation.tsx` | 메인 메뉴 (로고 + 메뉴 링크) |
| Sidebar | `Sidebar.tsx` | 우측 최근 주가 패널 (SOXL/TQQQ DB 연동) |
| StrategyCard | `StrategyCard.tsx` | Pro1/Pro2/Pro3 전략 카드 |
| FlowChart | `FlowChart.tsx` | 사용법 5단계 플로우차트 |
| PremiumModal | `PremiumModal.tsx` | 프리미엄 기능 안내 모달 |
| LoginButton | `auth/LoginButton.tsx` | Google OAuth 로그인 버튼 |
| LogoutButton | `auth/LogoutButton.tsx` | 로그아웃 버튼 |
| UserProfile | `mypage/UserProfile.tsx` | 사용자 프로필 카드 |
| DeleteAccountModal | `mypage/DeleteAccountModal.tsx` | 회원 탈퇴 확인 모달 |
| RecommendationCard | `recommend/RecommendationCard.tsx` | 추천 결과 카드 |
| ReferenceChart | `recommend/ReferenceChart.tsx` | 기준일 차트 |
| SimilarPeriodCard | `recommend/SimilarPeriodCard.tsx` | 유사 구간 카드 |
| StrategyScoreTable | `recommend/StrategyScoreTable.tsx` | 전략 점수 테이블 |
| AccountForm | `trading/AccountForm.tsx` | 계좌 생성/수정 폼 |
| TierHoldingsTable | `trading/TierHoldingsTable.tsx` | 티어별 보유현황 테이블 |
| DailyOrdersTable | `trading/DailyOrdersTable.tsx` | 당일 주문표 테이블 |
| ProfitStatusTable | `trading/ProfitStatusTable.tsx` | 수익 현황 테이블 |

---

## API 엔드포인트

### 인증 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| - | `/api/auth/[...nextauth]` | NextAuth.js 인증 핸들러 (Google OAuth) |

### 백테스트 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/backtest` | 백테스트 실행 |

### 전략 추천 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/recommend` | 기준일 기반 전략 추천 |

### 추천 백테스트 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/backtest-recommend` | 사이클별 추천 전략 적용 백테스트 |

### 트레이딩 계좌 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/trading/accounts` | 계좌 생성 |
| GET | `/api/trading/accounts` | 계좌 목록 조회 |
| GET | `/api/trading/accounts/[id]` | 계좌 상세 조회 (holdings 포함) |
| PUT | `/api/trading/accounts/[id]` | 계좌 설정 수정 (사이클 미진행 시만) |
| DELETE | `/api/trading/accounts/[id]` | 계좌 삭제 |
| GET | `/api/trading/accounts/[id]/holdings` | 티어 보유현황 조회 |
| GET | `/api/trading/accounts/[id]/orders` | 당일 주문 조회 |
| POST | `/api/trading/accounts/[id]/orders` | 주문 생성 |
| GET | `/api/trading/accounts/[id]/profits` | 수익 현황 조회 (월별 그룹화) |

### Cron API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/cron/update-prices` | 일일 가격/지표 자동 업데이트 (Vercel Cron) |

### 사용자 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| DELETE | `/api/user/delete` | 회원 탈퇴 (CASCADE 삭제) |

---

## 데이터베이스 스키마

### 가격 데이터 테이블

| 테이블 | 설명 |
|--------|------|
| `daily_prices` | OHLCV 일봉 데이터 (ticker, date, open, high, low, close, volume) |
| `daily_metrics` | 기술적 지표 (ticker, date, ma20, ma60, rsi14, roc12, volatility20, maSlope, disparity, isGoldenCross) |

### 인증 테이블

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 정보 (id, name, email, image, emailVerified) |
| `accounts` | OAuth 계정 연동 (userId, provider, providerAccountId, tokens) |
| `sessions` | 세션 관리 (sessionToken, userId, expires) |
| `verification_tokens` | 이메일 인증 토큰 |

### 트레이딩 테이블

| 테이블 | 설명 |
|--------|------|
| `trading_accounts` | 트레이딩 계좌 (userId, ticker, strategy, seedCapital, stopLossDays) |
| `tier_holdings` | 티어별 보유현황 (accountId, tierNumber, quantity, buyPrice, buyDate) |
| `daily_orders` | 당일 주문 (accountId, orderType, tierNumber, price, quantity, status) |
| `profit_records` | 수익 기록 (accountId, tierNumber, sellDate, profit, profitRate) |

### 캐시 테이블

| 테이블 | 설명 |
|--------|------|
| `recommendation_cache` | 추천 결과 캐시 (ticker, date, strategy, score, expiresAt) |

---

*마지막 업데이트: 2026년 2월*
