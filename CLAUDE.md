# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"떨사오팔 Pro" (Buy Dip Sell Peak Pro) - 3배 레버리지 ETF(SOXL, TQQQ) 트레이딩 전략을 위한 CLI 기반 백테스팅 및 데이터 관리 시스템. Yahoo Finance에서 일별 가격 데이터를 다운로드하여 SQLite에 저장하고 조회/분석한다.

## Build and Run Commands

```bash
# 개발 모드 실행 (tsx 사용)
npm run dev

# 전체 히스토리 초기화
npm run dev init -- --ticker SOXL

# 데이터 증분 업데이트
npm run dev update -- --ticker SOXL

# 데이터 조회
npm run dev query -- --ticker SOXL --start 2025-01-01 --end 2025-12-31

# TypeScript 빌드
npm run build

# 빌드된 파일 실행
npm start init -- --ticker SOXL
```

## Architecture

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

**데이터 흐름:** Yahoo Finance API → dataFetcher (재시도/파싱) → database (트랜잭션) → SQLite (prices.db)

## Key Technical Details

- **모듈 시스템:** ESM (`"type": "module"`)
- **데이터베이스:** SQLite with WAL, better-sqlite3 사용
- **API 호출:** yahoo-finance2, 429 에러 시 지수 백오프 재시도 (최대 3회)
- **지원 티커:** SOXL (2010-03-11~), TQQQ (2010-02-09~)
- **날짜 형식:** YYYY-MM-DD

## Code Conventions

- 한국어 주석 및 CLI 도움말
- camelCase 함수/변수, PascalCase 타입/인터페이스
- SQL prepared statements 사용 (문자열 결합 금지)
- async/await 패턴
- strict TypeScript 모드
