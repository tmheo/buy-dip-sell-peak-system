# 떨사오팔 Pro (Buy Dip Sell Peak Pro)

3배 레버리지 ETF(SOXL, TQQQ) 트레이딩 전략을 위한 CLI 기반 백테스팅 및 데이터 관리 시스템

## 개요

Yahoo Finance에서 일별 가격 데이터를 다운로드하여 SQLite에 저장하고 조회/분석하는 도구입니다.

### 지원 티커

| 티커 | 설명 | 상장일 |
|------|------|--------|
| SOXL | Direxion Daily Semiconductor Bull 3X Shares | 2010-03-11 |
| TQQQ | ProShares UltraPro QQQ | 2010-02-09 |

## 설치

```bash
npm install
```

## 사용법

### 개발 모드 실행

```bash
# 도움말 표시
npm run dev

# 전체 히스토리 초기화 (단일 티커)
npm run dev init -- --ticker SOXL

# 모든 티커 초기화
npm run dev init-all

# 데이터 증분 업데이트 (단일 티커)
npm run dev update -- --ticker SOXL

# 모든 티커 업데이트
npm run dev update-all

# 데이터 조회
npm run dev query -- --ticker SOXL --start 2025-01-01 --end 2025-12-31
```

### 프로덕션 빌드 및 실행

```bash
# TypeScript 빌드
npm run build

# 빌드된 파일 실행
npm start init -- --ticker SOXL
npm start update -- --ticker TQQQ
npm start query -- --ticker SOXL --start 2024-01-01 --end 2024-12-31
```

## 명령어

| 명령어 | 설명 |
|--------|------|
| `init` | 데이터베이스 초기화 및 전체 히스토리 다운로드 |
| `init-all` | 모든 티커의 전체 히스토리 다운로드 |
| `update` | 최신 데이터로 업데이트 (증분) |
| `update-all` | 모든 티커 업데이트 |
| `query` | 데이터 조회 |
| `help` | 도움말 표시 |

### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--ticker` | 티커 심볼 (SOXL, TQQQ) | SOXL |
| `--start` | 조회 시작일 (YYYY-MM-DD) | - |
| `--end` | 조회 종료일 (YYYY-MM-DD) | - |

## 프로젝트 구조

```
src/
├── index.ts              # CLI 진입점 - 6개 명령어 핸들링
├── types/index.ts        # TypeScript 인터페이스 (DailyPrice, QueryOptions, Command)
├── database/
│   ├── index.ts          # SQLite 연결 관리 및 CRUD 작업 (싱글톤 패턴)
│   └── schema.ts         # daily_prices 테이블 스키마 정의
└── services/
    └── dataFetcher.ts    # Yahoo Finance API 연동 (재시도 로직 포함)
```

## 기술 스택

- **런타임**: Node.js (ESM)
- **언어**: TypeScript (strict 모드)
- **데이터베이스**: SQLite (WAL 모드, better-sqlite3)
- **데이터 소스**: Yahoo Finance API (yahoo-finance2)

## 데이터 흐름

```
Yahoo Finance API → dataFetcher (재시도/파싱) → database (트랜잭션) → SQLite (prices.db)
```

## 주요 기능

- **자동 재시도**: 429 에러 (Rate Limit) 발생 시 지수 백오프로 최대 3회 재시도
- **트랜잭션 처리**: 대량 데이터 삽입 시 트랜잭션으로 성능 최적화
- **증분 업데이트**: 마지막 저장 날짜 이후 데이터만 다운로드
- **멀티 티커 지원**: SOXL, TQQQ 동시 관리

---

## 프론트엔드

### 개발 서버 실행

```bash
# 프론트엔드 개발 서버 시작
npm run web:dev
```

개발 서버는 http://localhost:3000 에서 실행됩니다.

### 프론트엔드 프로젝트 구조

```
src/
├── app/                          # Next.js App Router 페이지
│   ├── layout.tsx                # 루트 레이아웃 (CDN, 메타데이터)
│   ├── page.tsx                  # 홈페이지 (/ → /info 리다이렉트)
│   ├── info/
│   │   └── page.tsx              # Info 페이지 (전략 설명)
│   └── backtest/
│       └── page.tsx              # Backtest 페이지 (백테스트 폼)
├── components/                   # React 공통 컴포넌트
│   ├── TopControlBar.tsx         # 상단 컨트롤 바
│   ├── MainNavigation.tsx        # 메인 네비게이션
│   ├── Sidebar.tsx               # 우측 사이드바 (최근 주가 - DB 연동)
│   ├── StrategyCard.tsx          # 전략 카드 (Pro1/Pro2/Pro3)
│   ├── FlowChart.tsx             # 사용법 플로우차트
│   └── PremiumModal.tsx          # 프리미엄 모달
└── styles/
    └── globals.css               # 글로벌 스타일 + 커스텀 CSS
```

### 프론트엔드 기술 스택

| 항목 | 버전 | 비고 |
|------|------|------|
| Next.js | 15 (App Router) | React 프레임워크 |
| React | 19 | UI 라이브러리 |
| Bootstrap | 5.3.3 | CSS 프레임워크 |
| Bootswatch Solar | 5.3.3 | 다크 테마 |
| Google Fonts | Noto Sans KR | 한글 폰트 |

### 사이드바 - 최근 주가 표시

Sidebar 컴포넌트는 SQLite 데이터베이스에서 실시간으로 SOXL 가격 데이터를 조회하여 표시합니다.

**주요 기능:**

- 최근 10일간의 SOXL 종가 데이터 표시
- 일별 변동률 자동 계산 및 색상 코딩
  - 상승: 빨간색 (`#ff5370`)
  - 하락: 청록색 (`#26c6da`)
- Server Component로 구현 (데이터베이스 직접 접근)
- 데이터 부족 시 유연한 처리

**데이터 흐름:**

```
SQLite (prices.db) → getLatestPrices() → Sidebar Component → UI 표시
```

---

## 라이선스

MIT
