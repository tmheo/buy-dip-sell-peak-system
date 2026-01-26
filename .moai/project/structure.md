# 프로젝트 구조

## 디렉토리 트리

```
buy-dip-sell-peak-system/
├── src/                          # 소스 코드 디렉토리
│   ├── index.ts                  # CLI 진입점 및 명령어 라우터
│   ├── types/
│   │   └── index.ts              # TypeScript 인터페이스 정의
│   ├── database/
│   │   ├── index.ts              # SQLite 데이터베이스 연결 및 CRUD 작업
│   │   └── schema.ts             # SQL 스키마 및 쿼리 정의
│   └── services/
│       └── dataFetcher.ts        # Yahoo Finance API 연동 서비스
├── data/                         # 데이터 저장 디렉토리 (자동 생성)
│   └── prices.db                 # SQLite 데이터베이스 파일
├── dist/                         # 컴파일된 JavaScript 출력 (빌드 후 생성)
├── node_modules/                 # npm 패키지 의존성
├── .moai/                        # MoAI 프로젝트 설정
│   ├── config/                   # 프로젝트 구성 파일
│   └── project/                  # 프로젝트 문서
├── package.json                  # npm 프로젝트 설정
├── tsconfig.json                 # TypeScript 컴파일러 설정
├── eslint.config.js              # ESLint 린터 설정
├── .prettierrc                   # Prettier 포매터 설정
└── README.md                     # 프로젝트 설명서
```

---

## 디렉토리별 설명

### `src/` - 소스 코드

애플리케이션의 모든 TypeScript 소스 코드가 위치하는 디렉토리입니다.

### `data/` - 데이터 저장소

SQLite 데이터베이스 파일(`prices.db`)이 저장되는 디렉토리입니다. 애플리케이션 최초 실행 시 자동으로 생성됩니다.

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

### `src/database/index.ts` - 데이터베이스 모듈

SQLite 데이터베이스 연결 관리 및 CRUD 작업을 담당합니다.

**설계 패턴:** 싱글톤 패턴으로 데이터베이스 연결 관리

**주요 함수:**

| 함수 | 설명 |
|------|------|
| `getConnection()` | 데이터베이스 연결 획득 (내부용, WAL 모드 활성화) |
| `close()` | 데이터베이스 연결 종료 |
| `initTables()` | 테이블 및 인덱스 초기화 |
| `insertPrice()` | 단일 가격 데이터 삽입 |
| `insertPrices()` | 다중 가격 데이터 일괄 삽입 (트랜잭션) |
| `getAllPrices()` | 전체 가격 데이터 조회 |
| `getAllPricesByTicker()` | 특정 티커 전체 데이터 조회 |
| `getPricesByDateRange()` | 날짜 범위 조회 |
| `getLatestDate()` | 최신 저장 날짜 조회 |
| `getCount()` | 특정 티커 데이터 수 조회 |
| `getTotalCount()` | 전체 데이터 수 조회 |

**데이터베이스 경로:** `data/prices.db`

---

### `src/database/schema.ts` - SQL 스키마

데이터베이스 테이블 스키마 및 SQL 쿼리를 정의합니다.

**테이블 구조: `daily_prices`**

| 컬럼 | 타입 | 제약 조건 | 설명 |
|------|------|----------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 자동 증가 ID |
| ticker | TEXT | NOT NULL DEFAULT 'SOXL' | 티커 심볼 |
| date | TEXT | NOT NULL | 날짜 (YYYY-MM-DD) |
| open | REAL | NOT NULL | 시가 |
| high | REAL | NOT NULL | 고가 |
| low | REAL | NOT NULL | 저가 |
| close | REAL | NOT NULL | 종가 |
| volume | INTEGER | NOT NULL | 거래량 |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | 생성 시간 |

**인덱스:** `idx_ticker_date ON daily_prices(ticker, date)` - 조회 성능 최적화

**유니크 제약:** `UNIQUE(ticker, date)` - 동일 티커/날짜 중복 방지

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

## 모듈 구성 및 데이터 흐름

### 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Layer                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    src/index.ts                          │    │
│  │  - 명령어 파싱 및 라우팅                                  │    │
│  │  - 사용자 입/출력 처리                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               src/services/dataFetcher.ts                │    │
│  │  - Yahoo Finance API 연동                                │    │
│  │  - 재시도 로직 (지수 백오프)                             │    │
│  │  - 데이터 변환 및 검증                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database Layer                               │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ src/database/index.ts│  │ src/database/schema.ts│            │
│  │  - 연결 관리 (싱글톤) │  │  - 테이블 스키마      │            │
│  │  - CRUD 작업         │  │  - SQL 쿼리 정의      │            │
│  │  - 트랜잭션 처리     │  │  - 인덱스 정의        │            │
│  └──────────────────────┘  └──────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Storage Layer                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   data/prices.db                         │    │
│  │  - SQLite 데이터베이스                                   │    │
│  │  - WAL 모드 활성화                                       │    │
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
│   insertPrices   │ ◄── 트랜잭션 처리
│  (better-sqlite3)│     (일괄 삽입)
└──────────────────┘
       │
       │ SQL INSERT
       ▼
┌──────────────────┐
│    prices.db     │ ◄── UNIQUE 제약 (중복 방지)
│    (SQLite)      │     INSERT OR REPLACE
└──────────────────┘
```

---

## 아키텍처 패턴

### 적용된 패턴

| 패턴 | 적용 위치 | 설명 |
|------|----------|------|
| **싱글톤** | database/index.ts | 데이터베이스 연결 인스턴스 관리 |
| **레이어드 아키텍처** | 전체 구조 | CLI, Service, Database 레이어 분리 |
| **설정 기반 설계** | dataFetcher.ts | TICKER_CONFIG으로 티커 확장 용이 |
| **트랜잭션 패턴** | database/index.ts | 대량 데이터 삽입 시 원자성 보장 |
| **재시도 패턴** | dataFetcher.ts | 지수 백오프를 통한 API 안정성 |

### Clean Architecture 원칙

1. **의존성 역전**: 상위 레이어(CLI)가 하위 레이어(Database)에 의존하지만, 인터페이스(types)를 통해 결합도 최소화
2. **단일 책임**: 각 모듈이 하나의 명확한 책임 담당
3. **개방-폐쇄**: 새 티커 추가 시 TICKER_CONFIG만 수정

---

---

## Frontend 디렉토리 구조

### `src/` - 프론트엔드 소스 코드

Next.js 15 App Router 기반의 프론트엔드 애플리케이션입니다.

```
src/
├── app/                          # Next.js App Router 페이지
│   ├── layout.tsx                # 루트 레이아웃 (CDN, 메타데이터)
│   ├── page.tsx                  # 홈페이지 (/ → /info 리다이렉트)
│   ├── api/
│   │   ├── backtest/
│   │   │   └── route.ts          # 백테스트 API 엔드포인트
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts      # NextAuth.js 인증 핸들러
│   │   └── user/
│   │       └── delete/
│   │           └── route.ts      # 회원 탈퇴 API (DELETE)
│   ├── info/
│   │   └── page.tsx              # Info 페이지 (전략 설명)
│   ├── backtest/
│   │   └── page.tsx              # Backtest 페이지 (백테스트 결과 시각화)
│   ├── backtest-recommend/
│   │   └── page.tsx              # 백테스트 추천 페이지
│   ├── trading/
│   │   ├── page.tsx              # 트레이딩 계좌 목록 페이지
│   │   ├── new/
│   │   │   └── page.tsx          # 새 계좌 생성 페이지
│   │   └── [accountId]/
│   │       └── page.tsx          # 계좌 상세 페이지 (티어 보유현황, 당일 주문표)
│   └── mypage/
│       ├── page.tsx              # 마이페이지 서버 컴포넌트 (인증 체크)
│       └── _client.tsx           # 마이페이지 클라이언트 컴포넌트
├── backtest/                     # 백테스트 엔진 모듈
│   ├── types.ts                  # 백테스트 타입 정의
│   ├── engine.ts                 # 백테스트 엔진 (시뮬레이션 로직)
│   ├── strategy.ts               # Pro1/Pro2/Pro3 전략 정의
│   ├── cycle.ts                  # 사이클 관리자
│   ├── order.ts                  # 주문 계산 로직
│   ├── metrics.ts                # 기술적 지표 계산 (SMA, RSI, ROC 등)
│   ├── divergence.ts             # RSI 다이버전스 탐지 (베어리시 다이버전스)
│   └── downgrade.ts              # SOXL 전략 하향 규칙 (Pro3→Pro2→Pro1)
├── components/                   # React 공통 컴포넌트
│   ├── TopControlBar.tsx         # 상단 컨트롤 바
│   ├── MainNavigation.tsx        # 메인 네비게이션
│   ├── Sidebar.tsx               # 우측 사이드바 (최근 주가 SOXL/TQQQ)
│   ├── StrategyCard.tsx          # 전략 카드 (Pro1/Pro2/Pro3)
│   ├── FlowChart.tsx             # 사용법 플로우차트
│   ├── PremiumModal.tsx          # 프리미엄 모달
│   ├── backtest/                 # 백테스트 결과 시각화 컴포넌트
│   │   ├── PriceChart.tsx        # 가격 차트 (종가 + MA20/MA60)
│   │   ├── MetricsCharts.tsx     # 6개 기술적 지표 차트
│   │   └── ProResultCard.tsx     # Pro 전략 결과 카드 (자산/MDD 차트)
│   ├── trading/                  # 트레이딩 컴포넌트
│   │   ├── AccountForm.tsx       # 계좌 생성/수정 폼
│   │   ├── AccountListTable.tsx  # 계좌 목록 테이블
│   │   ├── AccountSettingsCard.tsx # 계좌 설정 카드
│   │   ├── AssetSummary.tsx      # 자산 요약 카드
│   │   ├── DailyOrdersTable.tsx  # 당일 주문표 테이블
│   │   ├── TierHoldingsTable.tsx # 티어별 보유현황 테이블
│   │   ├── InvestmentRatioBar.tsx # 투자 비율 막대 그래프
│   │   └── DeleteAccountModal.tsx # 계좌 삭제 확인 모달
│   └── mypage/                   # 마이페이지 컴포넌트
│       ├── UserProfile.tsx       # 사용자 프로필 카드 (이미지, 이름, 이메일, 가입일)
│       └── DeleteAccountModal.tsx # 회원 탈퇴 확인 모달
├── lib/                          # 유틸리티 및 공통 모듈
│   ├── date.ts                   # 날짜 포맷팅 유틸리티
│   ├── validations/              # 입력값 검증 스키마
│   │   └── trading.ts            # 트레이딩 관련 Zod 스키마
│   └── auth/                     # 인증 관련 모듈
│       ├── adapter.ts            # NextAuth.js SQLite 어댑터
│       ├── api-auth.ts           # API 인증 유틸리티
│       └── queries.ts            # 사용자/계정 DB 쿼리 (deleteUser, getUserById)
└── styles/
    └── globals.css               # 글로벌 스타일 + 커스텀 CSS
```

### Frontend 컴포넌트 구조

| 컴포넌트 | 파일명 | 용도 |
|----------|--------|------|
| TopControlBar | `TopControlBar.tsx` | 상단 사용자 네비게이션 (제품군 드롭다운, 사용자명, 메뉴 버튼) |
| MainNavigation | `MainNavigation.tsx` | 메인 메뉴 (로고 + 7개 메뉴 링크) |
| Sidebar | `Sidebar.tsx` | 우측 최근 주가 패널 (SOXL/TQQQ 테이블, 고정 위치, 반응형 숨김) |
| StrategyCard | `StrategyCard.tsx` | Pro1/Pro2/Pro3 전략 카드 (분할 비율, 설정값) |
| FlowChart | `FlowChart.tsx` | 사용법 5단계 플로우차트 (가로 배치, 화살표) |
| PremiumModal | `PremiumModal.tsx` | 프리미엄 기능 안내 모달 (Bootstrap Modal) |
| UserProfile | `mypage/UserProfile.tsx` | 사용자 프로필 카드 (이미지, 이름, 이메일, 가입일) |
| DeleteAccountModal | `mypage/DeleteAccountModal.tsx` | 회원 탈퇴 확인 모달 (확인 후 계정 삭제) |
| AccountForm | `trading/AccountForm.tsx` | 계좌 생성/수정 폼 (전략, 시드캐피털, 손절일 설정) |
| AccountListTable | `trading/AccountListTable.tsx` | 계좌 목록 테이블 (상태, 자산, 수익률 표시) |
| AccountSettingsCard | `trading/AccountSettingsCard.tsx` | 계좌 설정 카드 (전략 정보, 티어 비율 표시) |
| AssetSummary | `trading/AssetSummary.tsx` | 자산 요약 카드 (총 자산, 현금, 보유 주식 가치) |
| DailyOrdersTable | `trading/DailyOrdersTable.tsx` | 당일 주문표 테이블 (LOC/MOC 주문 목록) |
| TierHoldingsTable | `trading/TierHoldingsTable.tsx` | 티어별 보유현황 테이블 (수량, 매수가, 보유일수) |
| InvestmentRatioBar | `trading/InvestmentRatioBar.tsx` | 투자 비율 막대 그래프 (티어별 투자 현황) |
| DeleteAccountModal | `trading/DeleteAccountModal.tsx` | 계좌 삭제 확인 모달 |

### Frontend 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    src/app/ (Pages)                      │    │
│  │  - layout.tsx: CDN, 메타데이터, 공통 레이아웃            │    │
│  │  - page.tsx: 홈 리다이렉트                               │    │
│  │  - info/page.tsx: 전략 설명 페이지                       │    │
│  │  - backtest/page.tsx: 백테스트 폼 페이지                 │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Component Layer                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               src/components/ (Shared)                   │    │
│  │  ┌──────────────────┐  ┌──────────────────┐             │    │
│  │  │ TopControlBar    │  │ MainNavigation   │             │    │
│  │  │ (상단 컨트롤 바) │  │ (메인 네비게이션)│             │    │
│  │  └──────────────────┘  └──────────────────┘             │    │
│  │  ┌──────────────────┐  ┌──────────────────┐             │    │
│  │  │ Sidebar          │  │ StrategyCard     │             │    │
│  │  │ (우측 사이드바)  │  │ (전략 카드)      │             │    │
│  │  └──────────────────┘  └──────────────────┘             │    │
│  │  ┌──────────────────┐  ┌──────────────────┐             │    │
│  │  │ FlowChart        │  │ PremiumModal     │             │    │
│  │  │ (플로우차트)     │  │ (프리미엄 모달)  │             │    │
│  │  └──────────────────┘  └──────────────────┘             │    │
│  │  ┌──────────────────┐  ┌──────────────────┐             │    │
│  │  │ Trading 컴포넌트 │  │ TierHoldings     │             │    │
│  │  │ (계좌/주문 관리) │  │ (티어 보유현황)  │             │    │
│  │  └──────────────────┘  └──────────────────┘             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Style Layer                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  src/styles/globals.css                  │    │
│  │  - Bootswatch Solar 테마 커스터마이징                    │    │
│  │  - 반응형 브레이크포인트 (768px, 1700px)                 │    │
│  │  - 가격 상승/하락 색상 (#ff5370, #26c6da)               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 트레이딩 모듈 구조

### 핵심 모듈

| 파일 | 설명 |
|------|------|
| `src/types/trading.ts` | 트레이딩 타입 정의 (TradingAccount, TierHolding, DailyOrder, 전략 상수) |
| `src/database/trading.ts` | 트레이딩 CRUD 및 주문 생성/체결 로직 |
| `src/utils/trading-core.ts` | 공통 트레이딩 유틸리티 (가격 계산, 체결 판정, 날짜 유틸리티) |
| `src/lib/validations/trading.ts` | 입력값 검증 스키마 (Zod) |

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/trading/accounts` | 계좌 생성 |
| GET | `/api/trading/accounts` | 계좌 목록 조회 |
| GET | `/api/trading/accounts/[id]` | 계좌 상세 조회 |
| PUT | `/api/trading/accounts/[id]` | 계좌 수정 |
| DELETE | `/api/trading/accounts/[id]` | 계좌 삭제 |
| GET | `/api/trading/accounts/[id]/holdings` | 티어 보유현황 조회 |
| PUT | `/api/trading/accounts/[id]/holdings` | 티어 보유현황 수정 |
| GET | `/api/trading/accounts/[id]/orders` | 당일 주문 조회 |
| POST | `/api/trading/accounts/[id]/orders` | 주문 생성 |

### 데이터베이스 테이블

| 테이블 | 설명 |
|--------|------|
| `trading_accounts` | 트레이딩 계좌 (userId, ticker, strategy, seedCapital, stopLossDays) |
| `tier_holdings` | 티어별 보유현황 (accountId, tierNumber, quantity, buyPrice, buyDate) |
| `daily_orders` | 당일 주문 (accountId, orderType, tierNumber, price, quantity, status) |

---

*마지막 업데이트: 2026년 1월*
