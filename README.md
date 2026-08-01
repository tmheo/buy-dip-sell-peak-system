# 떨사오팔 Pro (Buy Dip Sell Peak Pro)

3배 레버리지 ETF(SOXL, TQQQ) 떨사오팔 전략의 백테스트·추천·실계좌 주문표 시스템.
웹 UI(Next.js)와 데이터 관리용 CLI로 이루어져 있습니다.

- **떨사오팔 전략**: 떨어지면 사고, 오르면 파는 분할 매수/매도 전략
- **백테스트 엔진**: Pro1/Pro2/Pro3 전략의 과거 성과 시뮬레이션
- **전략 추천 시스템**: 기술적 지표 기반 유사 구간 분석으로 최적 전략 추천
- **트레이딩 계좌 관리**: 티어 기반 LOC/MOC 주문 및 손절 처리

백테스트와 실계좌는 **같은 매매 규칙을 공유**합니다.
규칙은 `src/strategy` 한 곳에만 있고, 두 쪽은 규칙에 기준 금액(사이클 자본)만 다르게 공급합니다.

---

## 목차

- [빠른 시작](#빠른-시작)
- [핵심 개념](#핵심-개념)
- [사용 가이드](#사용-가이드)
- [시스템 아키텍처](#시스템-아키텍처)
- [상세 기능 문서](#상세-기능-문서)
- [개발 가이드](#개발-가이드)
- [테스트](#테스트)
- [라이선스](#라이선스)

문서 지도:

| 문서 | 역할 |
|------|------|
| [README.md](./README.md) | 설치, 실행, 시스템 전체 구조 |
| [CONTEXT.md](./CONTEXT.md) | 도메인 용어의 정본 |
| [docs/adr/](./docs/adr/) | 되돌리기 어려운 결정과 그 이유 |
| [docs/agents/](./docs/agents/) | 에이전트용 저장소 규약 (이슈 트래커, 트리아지 라벨) |
| [docs/](./docs/) | 기능별 PRD·SPEC 문서 |

---

## 빠른 시작

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 환경 변수를 설정합니다:

```bash
# 개발 환경 (Supabase Local)
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# NextAuth.js 설정
AUTH_SECRET=your-auth-secret-key  # openssl rand -base64 32로 생성
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
```

### 3. Supabase Local 시작

Docker가 설치되어 있어야 합니다.

```bash
npm run supabase:start
```

로컬 환경:
- **PostgreSQL**: localhost:54322
- **API**: localhost:54321
- **Studio**: localhost:54323

### 4. 데이터베이스 스키마 적용

```bash
npm run db:push
```

### 5. 데이터 초기화

```bash
npm run dev init-all
```

모든 티커(SOXL, TQQQ)의 전체 히스토리를 다운로드하고 기술적 지표를 계산합니다.

### 6. 웹 개발 서버 실행

```bash
npm run web:dev
```

http://localhost:3000 에서 웹 UI에 접속할 수 있습니다.

---

## 핵심 개념

> 도메인 용어의 정본은 [CONTEXT.md](./CONTEXT.md)입니다.
> 티어, 사이클, 사이클 자본, 시드 금액, 예수금, 주문표 같은 용어의 정확한 정의와 쓰지 말아야 할 표현이 거기 있습니다.
> 아래는 요약이며, 뜻이 갈리면 CONTEXT.md를 따릅니다.
> 되돌리기 어려운 판단은 [docs/adr/](./docs/adr/)에 결정 기록으로 남깁니다.

### 떨사오팔 전략

"떨어지면 사고, 오르면 파는" 분할 매수/매도 전략입니다.

- **티어 고정 방식**: 7개 티어(1~6 + 예비 티어 7)로 사이클 자본을 분할하며, 티어 번호는 매도해도 밀리지 않는다
- **순차적 매수**: 가장 낮은 빈 티어부터 순서대로 매수 (티어1 → 티어2 → ...)
- **사이클**: 첫 티어 매수부터 보유 티어 전량 매도까지의 한 회전
- **손절**: 손절일 도달 시 MOC 주문으로 보유 티어 전량 매도
- **사이클 자본**: 티어 비율을 곱하는 기준 금액. 사이클 시작 시점에 정해져 사이클 동안 고정된다.
  백테스트는 직전 사이클 종료 시점의 현금 전액(복리), 실계좌는 사용자가 설정한 시드 금액이다
- **수익 재투자 시점**: 사이클 중 실현된 매도 수익은 예수금에 포함하지 않는다.
  재투자는 사이클 경계에서만 일어난다 ([ADR-0001](./docs/adr/0001-사이클-중-실현-수익은-예수금에-포함하지-않는다.md))

### Pro 전략 비교

| 전략 | 티어 비율 | 매수 기준 | 매도 기준 | 손절일 |
|------|----------|----------|----------|--------|
| Pro1 | 5%, 10%, 15%, 20%, 25%, 25% | -0.01% | +0.01% | 10일 |
| Pro2 | 10%, 15%, 20%, 25%, 20%, 10% | -0.01% | +1.50% | 10일 |
| Pro3 | 16.7% × 6 | -0.10% | +2.00% | 12일 |

### 지원 티커

| 티커 | 설명 | 상장일 |
|------|------|--------|
| SOXL | Direxion Daily Semiconductor Bull 3X Shares | 2010-03-11 |
| TQQQ | ProShares UltraPro QQQ | 2010-02-09 |

---

## 사용 가이드

### CLI 명령어

#### 데이터 관리 명령어

| 명령어 | 설명 |
|--------|------|
| `init` | 단일 티커 전체 히스토리 동기화 (`update`와 동일, 지표 포함) |
| `init-all` | 모든 티커 동기화 (지표 포함) |
| `update` | 단일 티커를 원천 스냅샷 전체와 정합 (소급 조정 흡수, 지표 포함) |
| `update-all` | 모든 티커 동기화 (지표 포함) |
| `init-metrics` | 기존 가격 데이터로 기술적 지표 일괄 계산 |
| `query` | 데이터 조회 |
| `help` | 도움말 표시 |

`init`과 `update`는 같은 동작입니다.
[ADR-0002](./docs/adr/0002-가격-시계열은-매일-원천-스냅샷-전체를-미러링한다.md)에 따라 증분 적재를 버리고 매번 원천 히스토리 전체를 다시 받아 변경분만 upsert하기 때문에, 초기화와 갱신을 구분할 이유가 없어졌습니다.

#### 데이터베이스 명령어 (Drizzle ORM)

| 명령어 | 설명 |
|--------|------|
| `npm run db:generate` | 마이그레이션 파일 생성 |
| `npm run db:migrate` | 마이그레이션 실행 |
| `npm run db:push` | 스키마 직접 적용 (개발용) |
| `npm run db:studio` | Drizzle Studio 실행 |

#### Supabase 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run supabase:start` | Supabase Local 시작 |
| `npm run supabase:stop` | Supabase Local 종료 |

#### 명령어 예시

```bash
# 단일 티커 초기화
npm run dev init -- --ticker SOXL

# 모든 티커 업데이트
npm run dev update-all

# 데이터 조회
npm run dev query -- --ticker SOXL --start 2025-01-01 --end 2025-12-31

# 추천 전략 사전 계산
npm run precompute

# 유사도 파라미터 최적화 (SPEC-PERF-001)
npx tsx src/optimize/cli.ts --ticker SOXL --start 2025-01-01 --end 2025-12-31
```

#### 명령어 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--ticker` | 티커 심볼 (SOXL, TQQQ) | SOXL |
| `--start` | 조회 시작일 (YYYY-MM-DD) | - |
| `--end` | 조회 종료일 (YYYY-MM-DD) | - |
| `--force` | 분할 가드(close 5% 초과 변경 시 쓰기 중단) 우회. SPEC-SPLIT-001 절차 전용 | 꺼짐 |

`--force`는 액면분할처럼 시세가 정당하게 크게 변하는 상황에서만 씁니다.
`-all` 명령에 주면 모든 티커의 가드를 한 번에 우회하므로 주의가 필요합니다.

### 웹 UI 페이지

| 페이지 | 경로 | 설명 |
|--------|------|------|
| Home | `/` | 홈페이지 (/info 리다이렉트) |
| Info | `/info` | 서비스 소개 및 전략 설명 |
| Backtest | `/backtest` | 백테스트 결과 시각화 |
| Recommend | `/recommend` | 전략 추천 분석 |
| Backtest Recommend | `/backtest-recommend` | 추천 전략 백테스트 |
| Trading List | `/trading` | 트레이딩 계좌 목록 |
| Trading Detail | `/trading/[accountId]` | 계좌 상세 (보유현황, 주문, 수익) |
| Trading New | `/trading/new` | 새 계좌 생성 |
| MyPage | `/mypage` | 프로필 및 회원 탈퇴 |

### REST API 엔드포인트

| 메서드 | 엔드포인트 | 설명 | 인증 |
|--------|-----------|------|------|
| POST | `/api/backtest` | 백테스트 실행 | 필요 |
| POST | `/api/recommend` | 전략 추천 | 필요 |
| POST | `/api/backtest-recommend` | 추천 전략 백테스트 | 필요 |
| DELETE | `/api/user/delete` | 회원 탈퇴 | 필요 |
| GET/POST | `/api/trading/accounts` | 계좌 목록 조회/생성 | 필요 |
| GET/PUT/DELETE | `/api/trading/accounts/[id]` | 계좌 상세 조회/수정/삭제 | 필요 |
| GET | `/api/trading/accounts/[id]/holdings` | 티어 보유현황 | 필요 |
| GET/POST | `/api/trading/accounts/[id]/orders` | 당일 주문 | 필요 |
| GET | `/api/trading/accounts/[id]/profits` | 수익 현황 (월별) | 필요 |
| GET | `/api/cron/update-prices` | 일일 가격/지표 자동 업데이트 (GitHub Actions) | CRON_SECRET |
| GET | `/api/cron/process-daily-orders` | 활성 계좌 일일 마감 처리 (GitHub Actions, `update-prices` 직후) | CRON_SECRET |

`/api/cron/process-daily-orders`는 `accountId` 쿼리 파라미터를 받으면 활동 여부와 무관하게 해당 계좌만 처리합니다 (최초 밀린 처리 몰아서 돌릴 때 사용).

---

## 시스템 아키텍처

가장 중요한 구조적 성질은 **백테스트와 실계좌가 매매 규칙을 공유한다**는 것입니다.
규칙은 `src/strategy` 한 곳에만 구현돼 있고, 백테스트와 실계좌는 그 규칙에 기준 금액(사이클 자본)을 다르게 공급할 뿐입니다.

```
                   src/strategy  (매매 규칙 - 순수 함수, DB를 모른다)
                   planOrders / settle / startNextCycle
                          ▲                    ▲
       사이클 자본 = 직전 사이클 현금      사이클 자본 = 사용자 시드 금액
                          │                    │
                   src/backtest           src/trading
                   (과거 시세 재생)        (실계좌 조율)
```

![시스템 아키텍처](./docs/architecture/system-architecture.png)

> 위 다이어그램은 `src/strategy`·`src/metrics`·`src/trading` 분리 이전에 그려진 것이라 현재 모듈 경계와 어긋납니다.
> 아래의 모듈 경계 표가 정본입니다.

### 모듈 경계

각 모듈이 "무엇을 소유하는가"로 경계를 나눕니다.
어떤 정책이든 소유자는 한 곳뿐이고, 나머지는 그 소유자를 호출합니다.

| 모듈 | 소유하는 것 |
|------|------------|
| `src/strategy` | 떨사오팔 매매 규칙의 단일 소유자. 전략 파라미터 표, 주문표 생성(`planOrders`), 체결 판정과 상태 전이(`settle`), 사이클 경계(`startNextCycle`). 순수 함수이며 DB를 모른다 |
| `src/metrics` | 기술적 지표(MA, 정배열, 기울기, 이격도, RSI, ROC, 변동성) 계산. 순수 함수 |
| `src/backtest` | 과거 시세를 하루씩 `planOrders` + `settle`에 통과시키는 엔진, 성과 지표(MDD·승률·수익률), RSI 다이버전스와 전략 하향 규칙 |
| `src/recommend` | 추천 파이프라인. 순수 계산 코어(`core.ts`)에 DB 로드와 추천 캐시를 더한 `RecommendationService`가 단일 소유자 |
| `src/backtest-recommend` | 추천을 `BacktestEngine`의 전략 결정 경계에 꽂는 얇은 조립. 하루 루프와 사이클 경계는 전부 `BacktestEngine`이 소유 |
| `src/trading` | 실계좌 조율. 주문표 생성과 신선도 정책, 체결 처리, 일일 마감 스케줄러 정책(활성 계좌 판정·시간 예산·계좌별 실패 격리) |
| `src/services` | 외부 데이터 경계. Yahoo Finance 수집, 가격 시계열 동기화, `daily_metrics` 적재 정책 |
| `src/database` | Drizzle ORM 스키마와 영속성 접근. 테이블 11종 |
| `src/optimize` | 유사도 파라미터 최적화 (SPEC-PERF-001) |
| `src/app` | Next.js App Router 페이지 9개와 API 라우트 12개. 라우트는 인증·파싱·응답 매핑만 하고 정책은 위 모듈이 소유 |

### 프로젝트 구조

테스트는 각 모듈 옆의 `__tests__/`에 둡니다 (아래 트리에서는 생략).

```
CONTEXT.md                           # 도메인 용어집 (용어의 정본)
auth.ts                              # NextAuth.js 설정 (providers, adapter)

docs/
├── adr/                             # 결정 기록 (Architecture Decision Records)
├── agents/                          # 에이전트용 저장소 규약 (이슈 트래커, 라벨, 도메인)
└── architecture/                     # 아키텍처 다이어그램 (excalidraw + png)

.github/
└── workflows/
    ├── ci.yml                       # PR·main 푸시 시 타입 검사·린트·포맷·테스트
    └── cron-update-prices.yml       # 일일 가격 동기화 + 실계좌 마감 처리

supabase/
├── config.toml                      # Supabase Local 설정
└── migrations/                      # 증분 SQL 마이그레이션 (RLS 등)

scripts/
├── generate-favicon.mjs             # 파비콘 생성
├── measure-adjclose-drift.ts        # adjClose 시계열 불연속 규모 측정 (#42)
├── migrate-to-cloud.sh              # Local -> Cloud Supabase 데이터 이관
├── multi-year-baseline.ts           # 다년 베이스라인 계산
├── multi-year-finetune.ts           # 다년 파인튜닝
├── multi-year-optimize.ts           # 다년 최적화
├── precompute-recommendations.ts    # 추천 전략 사전 계산
└── test-recommend-backtest.ts       # 추천 백테스트 확인용

src/
├── index.ts                         # CLI 진입점 - 7개 명령어 핸들링
├── types/
│   ├── index.ts                     # 공통 타입 (DailyPrice, QueryOptions, Command)
│   ├── auth.ts                      # Auth.js 인증 타입 (AuthUser, AuthAccount, Session)
│   └── trading.ts                   # 트레이딩 타입 (계좌, 티어, 주문, 전략 이름)
├── strategy/                        # 매매 규칙의 단일 소유자 (순수 함수)
│   ├── params.ts                    # 전략 파라미터 표 (Pro1/Pro2/Pro3)
│   ├── plan-orders.ts               # 전일 종가 기준 주문표 생성
│   ├── settle.ts                    # 체결 판정과 상태 전이
│   ├── cycle.ts                     # 사이클 경계 (사이클 자본은 외부에서 공급)
│   ├── calculations.ts              # 매수가·매도가·수량·예수금 계산 원시 함수
│   ├── types.ts                     # 공개 타입 (CycleState, OrderIntent, StrategyParams)
│   └── index.ts                     # 모듈 엔트리포인트
├── metrics/                         # 기술적 지표 계산 (순수 함수, SPEC-METRICS-001)
│   ├── indicators.ts                # 슬라이딩 윈도우 배치 계산 코어
│   ├── types.ts                     # 공개 타입 (IndicatorRow)
│   └── index.ts                     # 모듈 엔트리포인트
├── trading/                         # 실계좌 조율 (규칙은 strategy, 저장은 database가 소유)
│   ├── orders.ts                    # 주문표 생성 조율 + 신선도 정책
│   ├── execution.ts                 # 체결·마감 처리 조율
│   ├── scheduler.ts                 # 일일 마감 스케줄러 정책 (활성 판정·시간 예산·실패 격리)
│   └── index.ts                     # 모듈 엔트리포인트
├── backtest/
│   ├── engine.ts                    # 백테스트 엔진 - 하루 루프는 planOrders + settle 합성
│   ├── snapshot.ts                  # CycleState → 일별 스냅샷·체결 내역 변환
│   ├── metrics.ts                   # 성과 지표 계산 (MDD, 승률, 수익률)
│   ├── divergence.ts                # RSI 다이버전스 탐지 (SPEC-RECOMMEND-002)
│   ├── downgrade.ts                 # SOXL 전략 하향 규칙 (Pro3→Pro2→Pro1)
│   ├── types.ts                     # 백테스트 전용 타입 + STRATEGY_COLORS 상수
│   └── index.ts                     # 모듈 엔트리포인트
├── recommend/
│   ├── core.ts                      # 순수 계산 코어 (DB 접근 없음, 실패·폐기 정책)
│   ├── service.ts                   # RecommendationService - 추천 파이프라인 단일 소유자
│   ├── similarity.ts                # 지수 감쇠 기반 유사도 계산
│   ├── score.ts                     # 전략 점수 계산
│   ├── types.ts                     # 추천 타입 정의
│   └── index.ts                     # 모듈 엔트리포인트
├── backtest-recommend/              # 추천을 BacktestEngine에 꽂는 얇은 조립
│   ├── provider.ts                  # 추천 서비스 → StrategyProvider 어댑터
│   ├── run.ts                       # 추천 전략 백테스트 facade
│   ├── types.ts                     # 결과 타입 (BacktestResult 상위집합)
│   └── index.ts                     # 모듈 엔트리포인트
├── optimize/                        # 유사도 파라미터 최적화 (SPEC-PERF-001)
│   ├── param-generator.ts           # 랜덤/변형 파라미터 생성
│   ├── backtest-runner.ts           # 커스텀 파라미터 백테스트 실행
│   ├── analyzer.ts                  # 결과 분석 및 순위 결정
│   ├── types.ts                     # 최적화 타입 정의
│   ├── cli.ts                       # CLI 진입점
│   └── index.ts                     # 모듈 엔트리포인트
├── services/                        # 외부 데이터 경계
│   ├── dataFetcher.ts               # Yahoo Finance 연동 (재시도 포함)
│   ├── priceSyncService.ts          # 가격 시계열 동기화 (ADR-0002 전체 미러링 + 분할 가드)
│   ├── priceDriftAnalyzer.ts        # 저장본과 재수집본의 불일치 규모 분석
│   └── metricsRows.ts               # daily_metrics 적재 정책 (필수 지표 결측 행 폐기)
├── database/
│   ├── db-drizzle.ts                # Drizzle ORM PostgreSQL 클라이언트 (Supabase 연결)
│   ├── schema/                      # Drizzle ORM 스키마 정의
│   │   ├── index.ts                 # 스키마 통합 export
│   │   ├── auth.ts                  # 인증 테이블 (users, accounts, sessions, verification_tokens)
│   │   ├── prices.ts                # 가격 테이블 (daily_prices, daily_metrics)
│   │   ├── trading.ts               # 트레이딩 테이블 (accounts, tier_holdings, daily_orders, profit_records)
│   │   └── cache.ts                 # 캐시 테이블 (recommendation_cache)
│   ├── trading/                     # 트레이딩 영속성
│   │   ├── accounts.ts              # 계좌 CRUD
│   │   ├── orders.ts                # 주문 CRUD
│   │   ├── profits.ts               # 수익 기록 CRUD
│   │   ├── tier-holdings.ts         # 티어 보유현황 CRUD
│   │   ├── transaction.ts           # 트랜잭션 헬퍼
│   │   ├── mappers.ts               # Drizzle 행 → 도메인 타입 매퍼
│   │   └── index.ts                 # 모듈 통합 export
│   ├── migrations/                  # drizzle-kit 생성 산출물
│   ├── prices.ts                    # 가격 데이터 CRUD
│   ├── metrics.ts                   # 기술적 지표 CRUD
│   ├── recommend-cache.ts           # 추천 캐시 CRUD
│   └── users.ts                     # 사용자 데이터 접근
├── utils/
│   ├── decimal.ts                   # decimal.js 기반 소수점 처리 (부동소수점 오차 제거)
│   └── date-index.ts                # 날짜 시계열 인덱스 유틸리티
├── lib/
│   ├── date.ts                      # 날짜 유틸리티 함수
│   ├── api-utils.ts                 # API 라우트 공통 유틸리티 (세션·크론 인증, 에러 응답)
│   ├── strategy-format.ts           # 전략 파라미터 → UI 표시 문자열 변환
│   └── validations/
│       └── trading.ts               # 트레이딩 입력값 검증 스키마 (Zod)
├── test-utils/
│   └── db.ts                        # DB 연동 테스트 헬퍼
├── components/
│   ├── TopControlBar.tsx            # 상단 컨트롤 바
│   ├── MainNavigation.tsx           # 메인 네비게이션
│   ├── Sidebar.tsx                  # 우측 사이드바 (최근 주가 SOXL/TQQQ - DB 연동)
│   ├── StrategyCard.tsx             # 전략 카드 (Pro1/Pro2/Pro3)
│   ├── FlowChart.tsx                # 사용법 플로우차트
│   ├── PremiumModal.tsx             # 프리미엄 모달
│   ├── auth/                        # 로그인·로그아웃 버튼
│   ├── backtest/                    # 백테스트 시각화 컴포넌트
│   ├── recommend/                   # 전략 추천 시각화 컴포넌트
│   ├── backtest-recommend/          # 추천 백테스트 시각화 컴포넌트
│   ├── trading/                     # 트레이딩 컴포넌트
│   └── mypage/                      # 마이페이지 컴포넌트
├── styles/
│   └── globals.css                  # 글로벌 스타일 + 커스텀 CSS
└── app/                             # Next.js App Router 페이지
    ├── layout.tsx                   # 루트 레이아웃 (CDN, 메타데이터)
    ├── page.tsx                     # 홈페이지 (/ → /info 리다이렉트)
    ├── info/page.tsx                # Info 페이지 (전략 설명)
    ├── backtest/                    # Backtest 페이지
    ├── recommend/                   # Recommend 페이지
    ├── backtest-recommend/          # 추천 전략 백테스트 페이지
    ├── trading/                     # 트레이딩 페이지 (목록, 상세, 신규)
    ├── mypage/                      # 마이페이지
    └── api/                         # API 라우트
        ├── auth/[...nextauth]/      # NextAuth.js API 라우트
        ├── cron/
        │   ├── update-prices/       # 일일 가격·지표 동기화
        │   └── process-daily-orders/ # 활성 계좌 일일 마감 처리
        ├── backtest/                # 백테스트 API
        ├── recommend/               # 추천 API
        ├── backtest-recommend/      # 추천 백테스트 API
        ├── trading/                 # 트레이딩 API
        └── user/                    # 사용자 API
```

### 기술 스택

| 항목 | 기술 | 비고 |
|------|------|------|
| 런타임 | Node.js (ESM) | - |
| 언어 | TypeScript (strict 모드) | - |
| 프레임워크 | Next.js 15 (App Router) | React 19 |
| 데이터베이스 (개발) | Supabase Local (Docker PostgreSQL) | PostgreSQL 17 |
| 데이터베이스 (프로덕션) | Supabase Cloud PostgreSQL | Connection Pooler 지원 |
| ORM | Drizzle ORM | 타입 안전 쿼리 빌더 |
| 데이터 소스 | Yahoo Finance API | yahoo-finance2 |
| CSS | Bootstrap 5.3.3 | Bootswatch Solar 테마 |
| 차트 | Recharts 3.6 | - |
| 인증 | NextAuth.js 5 (beta) | Google OAuth |
| 금융 계산 | decimal.js | 부동소수점 오차 제거 |
| 입력 검증 | Zod 4 | - |
| 테스트 | Vitest 4 | DB 통합 테스트 포함 |
| 배포 | Vercel + GitHub Actions | 함수는 Node.js 런타임, Cron은 GitHub Actions |
| 폰트 | Noto Sans KR | Google Fonts |

### 데이터 흐름

가격 동기화는 [ADR-0002](./docs/adr/0002-가격-시계열은-매일-원천-스냅샷-전체를-미러링한다.md)에 따라 증분 적재가 아니라 **매일 원천 히스토리 전체를 다시 받아 변경분만 반영**합니다.
배당락일마다 과거 `adjClose`가 소급 조정되는데, 증분 적재로는 그 조정이 반영되지 않아 시계열에 불연속이 쌓이기 때문입니다.

```
Yahoo Finance (전체 히스토리 재페치)
  → 분할 가드 (close 5% 초과 변경 시 쓰기 중단, --force로 우회)
  → 신규·변경 행만 가격 upsert
  → 기술적 지표 전체 재계산 (src/metrics)
  → 필수 지표 결측 행 폐기 (services/metricsRows)
  → PostgreSQL (daily_prices, daily_metrics)
```

개발 환경:
```
Next.js App → Drizzle ORM → Supabase Local (localhost:54322)
```

프로덕션 환경:
```
Vercel → Drizzle ORM → Supabase Cloud (Connection Pooler)

GitHub Actions (00:30 UTC / KST 09:30)
  → /api/cron/update-prices          가격·지표 동기화
  → /api/cron/process-daily-orders   활성 계좌 일일 마감 처리 (가격이 선행돼야 하므로 그 다음)
```

---

## 상세 기능 문서

### 백테스트 엔진

<details>
<summary>상세 보기</summary>

떨사오팔 Pro 전략의 과거 성과를 시뮬레이션하는 백테스트 엔진입니다.

매매 규칙 자체는 엔진이 아니라 `src/strategy`가 소유합니다.
엔진이 하는 일은 과거 시세를 하루씩 `planOrders` → `settle`에 통과시키고, 사이클 경계에서 다음 사이클 자본을 공급하고, 결과를 모으는 것입니다.
덕분에 실계좌와 완전히 같은 규칙으로 검증됩니다.

![백테스트 엔진 워크플로우](./docs/architecture/backtest-engine.png)

#### 핵심 기능

- **LOC 주문**: 전일 수정종가(adjClose) 기준 매수/매도 지정가 계산
- **티어 관리**: 6개 기본 티어 + 1개 예비 티어
- **복리**: 사이클 종료 시점의 현금 전액이 다음 사이클 자본이 된다.
  사이클 중 실현된 수익은 예수금에 넣지 않으므로 재투자는 사이클 경계에서만 일어난다 (ADR-0001)
- **손절 처리**: 손절일 도달 시 MOC 주문으로 전량 청산
- **성과 지표**: 최종 자산, 수익률, MDD, 승률 계산
- **기술적 지표**: 6개 핵심 지표 자동 계산 (MA20/60, RSI, ROC, 변동성 등)

#### 기술적 지표 (SPEC-METRICS-001)

지표 계산은 `src/metrics`가 단일 소유자입니다.
성과 지표(MDD, 승률, 수익률)는 백테스트 결과의 소유물이라 `src/backtest`에 따로 있습니다.

| 지표 | 필드명 | 설명 |
|------|--------|------|
| 이동평균 | `ma20`, `ma60` | 20일/60일 단순이동평균 (DailySnapshot에 포함) |
| 정배열 | `goldenCross` | (MA20 - MA60) / MA60 × 100 (%) |
| MA 기울기 | `maSlope` | 10일간 MA20 변화율 (%) |
| 이격도 | `disparity` | (종가 - MA20) / MA20 × 100 (%) |
| RSI(14) | `rsi14` | Wilder's EMA 방식 (0-100) |
| ROC(12) | `roc12` | 12일 변화율 (%) |
| 변동성 | `volatility20` | 20일 표준편차 × √20 |

#### API 사용법

```typescript
import { runBacktest, STRATEGIES } from './backtest';

const result = await runBacktest({
  ticker: 'SOXL',
  strategy: 'Pro2',
  startDate: '2025-01-02',
  endDate: '2025-12-19',
  initialCapital: 10000,
});

console.log(`최종 자산: $${result.finalAsset.toFixed(2)}`);
console.log(`수익률: ${(result.returnRate * 100).toFixed(2)}%`);
console.log(`MDD: ${(result.mdd * 100).toFixed(2)}%`);

// 종료일 기준 기술적 지표
if (result.technicalMetrics) {
  console.log(`RSI(14): ${result.technicalMetrics.rsi14}`);
  console.log(`정배열: ${result.technicalMetrics.goldenCross}%`);
}

// 일별 이동평균
result.dailyHistory.forEach(day => {
  console.log(`${day.date}: MA20=${day.ma20}, MA60=${day.ma60}`);
});
```

#### REST API

**POST /api/backtest**

```json
{
  "ticker": "SOXL",
  "strategy": "Pro2",
  "startDate": "2025-01-02",
  "endDate": "2025-12-19",
  "initialCapital": 10000
}
```

#### 차트 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| `PriceChart` | 종가 + MA20/MA60 라인 차트 (로그 스케일) |
| `MetricsCharts` | 6개 기술적 지표 미니 차트 (정배열, 기울기, 이격도, RSI, ROC, 변동성) |
| `ProResultCard` | 전략별 결과 카드 - 수익률, MDD, 자산 변동 차트 포함 |

</details>

### 전략 추천 시스템

<details>
<summary>상세 보기</summary>

과거 유사 구간을 분석하여 최적의 트레이딩 전략을 추천하는 시스템입니다. (SPEC-RECOMMEND-001)

![전략 추천 시스템 워크플로우](./docs/architecture/recommend-system.png)

#### 핵심 기능

- **기술적 지표 벡터**: 5개 지표(기울기, 이격도, RSI, ROC, 변동성)로 시장 상태 표현.
  정배열(goldenCross)은 유사도 계산에서 빠지고 Pro1 제외 판단에만 쓰인다
- **지수 감쇠 유사도**: `유사도 = Σ(가중치ᵢ × 100 × e^(-차이ᵢ / 허용오차ᵢ))`.
  지표별 가중치와 허용오차는 SPEC-PERF-001의 5개년(2021-2025, SOXL) 미세 조정 결과다
- **전략 점수 계산**: `점수 = 수익률(%) × e^(MDD(%) × 가중치)` 공식으로 위험 조정 수익률 산출.
  MDD가 음수이므로 손실이 클수록 점수가 낮아진다
- **자동 추천**: Top 3 유사 구간의 백테스트 결과를 유사도로 가중 평균해 최고 점수 전략을 고른다
- **실패 정책**: 데이터가 부족하면 지표를 재계산해 메우지 않고 `InsufficientData` 사유를 반환한다.
  추천 백테스트에서는 이때 기본 전략(Pro2)으로 진행하며 사유를 함께 기록한다

#### 전략 제외 규칙

- **Pro1**: 정배열(MA20 > MA60) 상태에서는 점수 비교에서 제외

#### 사용법

1. `/recommend` 페이지 접속
2. 기준일 선택 (오늘 기준 / 특정일)
3. 종목 선택 (SOXL / TQQQ)
4. "분석" 버튼 클릭

#### 분석 결과

| 항목 | 설명 |
|------|------|
| 기준일 차트 | 20일 분석 구간 + 미래 20일 영역 (회색) |
| 유사 구간 Top 3 | 유사도 순 정렬, 각 구간의 20일 + 성과 20일 차트 |
| 전략 점수 테이블 | Pro1/Pro2/Pro3 평균 점수 비교 |
| 추천 전략 | 최고 점수 전략 + 티어별 투자 비율 |

#### REST API

**POST /api/recommend**

```json
{
  "ticker": "SOXL",
  "referenceDate": "2026-01-20",
  "isToday": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "referenceDate": "2026-01-20",
    "ticker": "SOXL",
    "referenceMetrics": { ... },
    "similarPeriods": [...],
    "strategyScores": { ... },
    "recommendation": {
      "strategy": "Pro2",
      "tierRatios": [0.15, 0.15, 0.15, 0.15, 0.15, 0.25],
      "reason": "평균 점수 12.34로 가장 높음"
    }
  }
}
```

</details>

### 추천 전략 백테스트

<details>
<summary>상세 보기</summary>

사이클 경계에서 전략을 동적으로 전환하는 백테스트 시스템입니다. (SPEC-BACKTEST-RECOMMEND)

![추천 전략 백테스트 워크플로우](./docs/architecture/backtest-recommend.png)

#### 핵심 기능

- **동적 전략 전환**: 각 사이클 시작 시 추천 시스템을 통해 최적 전략 선택
- **전략 사용 통계**: Pro1/Pro2/Pro3 각 전략의 사용 빈도 및 일수 추적
- **사이클별 상세 정보**: 각 사이클의 전략, RSI, 정배열 여부, 수익률 등 기록
- **추천 캐시 시스템**: 사전 계산된 추천 결과를 DB에 저장하여 백테스트 성능 최적화

#### 추천 캐시 사전 계산

백테스트 성능 향상을 위해 모든 날짜의 추천 결과를 사전 계산할 수 있습니다:

```bash
npm run precompute
```

- SOXL, TQQQ 모든 날짜에 대해 추천 전략 계산
- 배치 저장으로 DB I/O 최적화 (100개 단위)
- 진행률 표시 및 결과 요약 출력

#### 사용법

1. `/backtest-recommend` 페이지 접속
2. 시작일/종료일, 종목, 초기자본 입력
3. "실행" 버튼 클릭

#### REST API

**POST /api/backtest-recommend**

```json
{
  "ticker": "SOXL",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "initialCapital": 10000
}
```

</details>

### 트레이딩 계좌 관리 시스템

<details>
<summary>상세 보기</summary>

떨사오팔 Pro 전략을 실제 매매에 적용하기 위한 트레이딩 계좌 관리 시스템입니다. (PRD-TRADING-001)

#### 핵심 기능

- **계좌 관리**: 트레이딩 계좌 생성, 조회, 수정, 삭제 (CRUD)
- **티어 고정 방식**: 7개 티어(1~6 + 예비티어7) 자동 생성 및 관리
- **당일 주문 자동 생성**: LOC(지정가) 매수/매도, MOC(시장가) 손절 주문
- **주문 체결 처리**: 종가 기준 체결 여부 판정 및 티어 업데이트
- **손절 처리**: 보유일 >= 손절일 시 MOC 주문으로 전량 청산
- **사이클 보호**: 사이클 진행 중 계좌 설정 변경 방지 (시드 금액·전략 변경은 사이클 경계에서만 허용)
- **수익 현황**: 매도 체결 시 자동 수익 기록 생성 및 월별 조회
- **주문표 신선도**: 주문표는 화면 진입 시 지연 생성되므로, 만들어진 뒤 계좌 설정이 바뀌거나 더 최신 종가가 적재되면 낡은 것으로 판정해 지우고 다시 만든다.
  단 체결된 주문이 하나라도 있으면 다시 만들지 않는다 - 체결 결과가 이미 티어 보유와 수익 기록에 반영됐기 때문
- **일일 마감 자동화**: `/api/cron/process-daily-orders`가 활성 계좌를 돌며 체결 판정과 티어·수익 반영을 수행.
  어느 계좌를 얼마나 처리할지(활성 판정, 시간 예산, 계좌별 실패 격리, 시간 초과 시 이월)는 `src/trading`의 스케줄러가 소유

#### 주문 유형

| 유형 | 설명 | 체결 조건 |
|------|------|----------|
| LOC 매수 | 지정가 매수 주문 | 종가 <= 지정가 |
| LOC 매도 | 지정가 매도 주문 | 종가 >= 지정가 |
| MOC 손절 | 시장가 전량 매도 | 무조건 체결 |

#### 가격 계산

- **매수가**: 전일 수정종가 × (1 + 매수임계값), 소수점 둘째 자리까지 내림
- **매도가**: 매수가 × (1 + 매도목표), 소수점 둘째 자리까지 내림
- **수량**: 티어 배분금액 ÷ 매수가, 정수로 내림

모든 금융 계산은 `decimal.js`로 처리해 부동소수점 오차를 없앱니다.
계산 규칙은 `src/strategy/calculations.ts`가 소유하며, 백테스트와 실계좌가 같은 함수를 씁니다.

#### 사용법

1. `/trading` 페이지 접속
2. "새 계좌" 버튼 클릭
3. 전략(Pro1/Pro2/Pro3), 종목(SOXL/TQQQ), 시드캐피털, 손절일 입력
4. 계좌 상세 페이지에서 티어 보유현황 및 당일 주문표 확인
5. 주문 생성 및 체결 처리

</details>

### 인증 시스템

<details>
<summary>상세 보기</summary>

NextAuth.js v5 (Auth.js)를 사용한 Google OAuth 인증 시스템입니다.

#### 접근 권한

| 경로 | 인증 필요 | 설명 |
|------|----------|------|
| `/info` | X | 서비스 소개 페이지 (공개) |
| `/backtest` | O | 백테스트 실행 페이지 |
| `/recommend` | O | 전략 추천 페이지 |
| `/backtest-recommend` | O | 추천 전략 백테스트 페이지 |
| `/mypage` | O | 마이페이지 (프로필, 회원 탈퇴) |
| `/trading` | O | 트레이딩 계좌 목록 페이지 |

#### 인증 흐름

1. 미인증 사용자가 보호된 페이지 접근 시 `/info`로 리다이렉트
2. `/info` 페이지에서 Google 로그인 버튼 클릭
3. Google OAuth 인증 완료 후 원래 페이지로 리다이렉트
4. 세션은 PostgreSQL 데이터베이스에 저장 (Drizzle ORM)

</details>

---

## 개발 가이드

### 환경 변수 설정

`.env.local` 파일에 다음 환경 변수를 설정합니다:

```bash
# 데이터베이스 (개발: Supabase Local)
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# 데이터베이스 (프로덕션: Supabase Cloud - Vercel 환경변수)
# DATABASE_URL=postgresql://[user]:[password]@[host]:6543/postgres?pgbouncer=true
# DIRECT_URL=postgresql://[user]:[password]@[host]:5432/postgres

# NextAuth.js 설정
AUTH_SECRET=your-auth-secret-key  # openssl rand -base64 32로 생성

# Google OAuth
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
```

### 프로덕션 배포 (Vercel)

Vercel에 자동 배포됩니다.

- **프로덕션 배포**: `main` 브랜치 푸시 시 자동
- **프리뷰 배포**: PR 생성 시 자동
- **Cron**: GitHub Actions (`30 0 * * *` UTC = KST 09:30).
  `update-prices`로 가격·지표를 동기화한 뒤 `process-daily-orders`로 활성 계좌를 마감 처리한다 (순서가 중요하다)
- **CRON_SECRET**: GitHub Actions Cron 인증용 Bearer 토큰.
  Vercel 환경 변수와 GitHub Actions 시크릿 양쪽에 같은 값을 설정한다

#### 데이터 이관 (Local -> Cloud)

```bash
CLOUD_DB_URL="postgresql://..." ./scripts/migrate-to-cloud.sh
```

로컬 Supabase의 가격/지표 데이터를 Cloud Supabase로 이관합니다.

### 프로덕션 빌드 및 실행

```bash
# TypeScript 빌드
npm run build

# 빌드된 파일 실행
npm start init -- --ticker SOXL
npm start update -- --ticker TQQQ
npm start query -- --ticker SOXL --start 2025-01-01 --end 2025-12-31
```

### 코드 품질 검사

```bash
npx tsc --noEmit      # 타입 검사
npm run lint          # ESLint
npm run format:check  # Prettier 검사 (npm run format으로 자동 수정)
```

---

## 테스트

Vitest를 사용하며, 테스트는 각 모듈 옆의 `__tests__/`에 둡니다.

```bash
npm test              # 전체 실행
npm run test:watch    # 변경 감시
npm run test:coverage # 커버리지
```

### DB 연동 테스트

일부 테스트는 실제 PostgreSQL이 필요합니다.
**Vitest는 `.env.local`을 자동으로 읽지 않으므로 `DATABASE_URL`을 직접 넘겨야 합니다.**

```bash
npm run supabase:start

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" npm test
```

`DATABASE_URL` 없이 실행하면 DB가 필요한 테스트는 건너뜁니다.
백테스트 골든 값 검증처럼 실제 SOXL 시세가 있어야 하는 테스트는 DB에 가격 데이터가 적재돼 있어야 돌아갑니다 (`npm run dev init-all`).

### CI

`.github/workflows/ci.yml`이 PR과 `main` 푸시마다 실행합니다.

1. 타입 검사 → 린트 → 포맷 검사
2. PostgreSQL 17 서비스 컨테이너에 `drizzle-kit push`로 스키마 생성
3. `supabase/migrations/`의 증분 SQL 적용 (Supabase 전용 `auth.uid()`를 쓰는 RLS 마이그레이션은 제외)
4. DB 통합 테스트 포함 전체 테스트 실행

알려진 한계: CI DB에는 가격 데이터가 없어 백테스트 골든 값 검증은 건너뜁니다.

---

## 라이선스

MIT
