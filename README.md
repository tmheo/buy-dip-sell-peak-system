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

## 라이선스

MIT
