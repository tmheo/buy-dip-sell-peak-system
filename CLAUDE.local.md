# 로컬 Claude Code 설정

## Environment Setup

When running git commands or pre-commit hooks, always source ~/.zshrc first (or run `eval "$(fnm env)"`) to ensure node/npm/npx are available in the shell environment.

## PR 코드 리뷰 자동화

PR에 대해 CodeRabbit 리뷰를 확인하거나 처리해달라는 요청이 오면, 반드시 `review-coderabbit` 스킬을 사용해야 합니다.

### 트리거 키워드

다음 키워드가 포함된 요청 시 자동으로 `Skill("review-coderabbit")` 호출:

- "CodeRabbit 리뷰 확인"
- "코드래빗 리뷰"
- "PR 리뷰 코멘트 처리"
- "코드래빗 피드백"
- "리뷰 코멘트 수정"
- "coderabbit review"

### 사용 예시

```
사용자: PR 11에 대해 코드래빗이 리뷰해줬으니 확인해줘
Claude: Skill("review-coderabbit") 호출 → PR 11 리뷰 처리
```

### 주의사항

- `review-coderabbit` 스킬은 사용자 레벨 스킬 (`~/.claude/skills/review-coderabbit/SKILL.md`)
- 프로젝트 스킬 목록에 없더라도 반드시 Skill 도구로 호출 가능
- gh CLI 인증이 필요함

---

## 떨사 프로 투자 전략

이 프로젝트는 "떨어지면 사고, 오르면 파는" (떨사) 분할 매수/매도 전략을 구현합니다.

### 핵심 개념

- **티어 고정 방식**: 7개 티어(1~6 + 예비티어7)로 자금을 분할
- **순차적 매수**: 가장 낮은 빈 티어부터 순서대로 매수 (티어1 → 티어2 → ...)
- **사이클**: 매수 시작부터 보유 티어 전량 매도까지의 한 주기

### 주문 방식

**LOC (Limit On Close)** - 일반 매수/매도
- 장 마감 시 종가로 체결되는 지정가 주문
- 매수: 종가 ≤ 지정가 → 체결
- 매도: 종가 ≥ 지정가 → 체결

**MOC (Market On Close)** - 손절 매도
- 장 마감 시 종가로 무조건 체결되는 시장가 주문
- 손절일에 보유 물량 전량 매도 시 사용

### Pro 전략별 차이

| 전략 | 티어별 비율 (%) | 매수 임계값 | 매도 목표 | 손절일 |
|------|----------------|------------|----------|--------|
| Pro1 | 5, 10, 15, 20, 25, 25, 0 | -0.01% (전일 종가 대비) | +0.01% (매수가 대비) | 10일 |
| Pro2 | 10, 15, 20, 25, 20, 10, 0 | -0.01% | +1.5% | 10일 |
| Pro3 | 16.7 균등 분할 | -0.1% | +2.0% | 12일 |

### 손절 규칙

- **손절일**: 첫 매수일로부터 10~12일(전략별 상이) 연속 보유 시
- **손절 방법**: MOC 주문으로 보유 티어 전량 매도
- **목적**: 손실이 나더라도 확실하게 청산하여 자금 회전

### 주문 생성 로직

1. **매도 주문 (LOC)**: 보유 중인 티어에 대해 `매수가 × (1 + 매도목표)` 가격으로 생성
2. **매수 주문 (LOC)**: 다음 빈 티어에 대해 `전일종가 × (1 + 매수임계값)` 가격으로 생성
3. **주문 수량**: `시드캐피털 × 티어비율 ÷ 매수가격` (소수점 버림)
4. **손절 주문 (MOC)**: 손절일에 보유 티어 전량을 시장가로 매도

### 일일 매매 흐름

1. 장 마감 전에 전일 종가 대비 등락률 확인
2. 매수/매도 조건 충족 시 LOC 주문 설정
3. 손절일이면 MOC 주문으로 보유 티어 전량 매도
4. 장 마감 시 종가로 자동 체결

### 참고 파일

- `src/types/trading.ts`: 전략 상수 정의 (TIER_RATIOS, BUY_THRESHOLDS, SELL_THRESHOLDS)
- `src/utils/trading-core.ts`: 공통 트레이딩 유틸리티 (가격 계산, 체결 판정, 날짜 유틸리티)
- `src/database/trading.ts`: 주문 생성 및 체결 로직
- `src/backtest/order.ts`: trading-core 함수 re-export (하위 호환성용)
- `docs/떨사오팔_Pro_투자전략_가이드_초보자용.md`: 전체 투자 전략 상세 가이드

---

## 투자 알고리즘 개발 규칙

### Decimal 라이브러리 필수 사용

**모든 투자 관련 수학 연산은 반드시 `decimal.js` 라이브러리를 사용해야 합니다.**

JavaScript/TypeScript의 기본 부동소수점 연산은 정밀도 오차가 발생합니다:
```typescript
// 잘못된 예시 (부동소수점 오차 발생)
const threshold = 0.01 / 100;  // 0.00009999999999999999
const price = 63.72 * 0.999;   // 63.65627999999999

// 올바른 예시 (Decimal 사용)
import Decimal from "decimal.js";
const threshold = new Decimal(0.01).div(100).toNumber();  // 0.0001
const price = new Decimal(63.72).mul(0.999);              // 63.65628
```

### 가격 계산 시 버림 처리

실제 증권사는 소수점 둘째자리까지만 주문 가능하므로, **소수점 셋째자리에서 버림(floor)** 처리해야 합니다:
```typescript
import Decimal from "decimal.js";

// 매수가: 전일종가 × (1 + 매수임계값), 버림
const buyPrice = new Decimal(closePrice)
  .mul(new Decimal(1).plus(buyThreshold))
  .toDecimalPlaces(2, Decimal.ROUND_DOWN)
  .toNumber();

// 매도가: 매수가 × (1 + 매도목표), 버림
const sellPrice = new Decimal(buyPrice)
  .mul(new Decimal(1).plus(sellThreshold))
  .toDecimalPlaces(2, Decimal.ROUND_DOWN)
  .toNumber();
```

### 참고 함수

`src/utils/trading-core.ts`에 정의된 공통 함수들:

**가격/수량 계산:**
- `calculateBuyLimitPrice(closePrice, threshold)`: 매수 지정가 계산
- `calculateSellLimitPrice(buyPrice, threshold)`: 매도 지정가 계산
- `calculateBuyQuantity(allocatedAmount, price)`: 매수 수량 계산 (버림)

**체결 판정:**
- `shouldExecuteBuy(closePrice, limitPrice)`: LOC 매수 체결 여부 (종가 ≤ 지정가)
- `shouldExecuteSell(closePrice, limitPrice)`: LOC 매도 체결 여부 (종가 ≥ 지정가)

**유틸리티:**
- `percentToThreshold(percentValue)`: 퍼센트 → 소수점 변환 (예: -0.01% → -0.0001)
- `getPreviousTradingDate(date)`: 이전 거래일 계산 (주말 제외)
- `calculateTradingDays(startDate, endDate)`: 두 날짜 사이 거래일 수

---

## 추천 전략 알고리즘

과거 유사 구간의 성과를 기반으로 최적 전략을 추천합니다.

### 기술적 지표 (유사도 계산의 핵심 입력)

**이동평균선:**
- `MA20`: 20일 단순이동평균
- `MA60`: 60일 단순이동평균
- `정배열 (isGoldenCross)`: MA20 > MA60 (boolean)
- `골든크로스 (goldenCross)`: (MA20 - MA60) / MA60 × 100 (수치)

**5개 핵심 지표:**
- `MA 기울기 (maSlope)`: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100
- `이격도 (disparity)`: (종가 - MA20) / MA20 × 100
- `RSI 14`: Wilder's EMA 방식 (14일)
- `ROC 12`: 12일 변화율 ((현재가 - 12일전) / 12일전 × 100)
- `변동성 20일 (volatility20)`: 20일 표본 표준편차 × √20

### 유사도 계산 (지수 감쇠 방식)

5개 기술적 지표를 벡터로 변환하여 유사도를 계산합니다:
```
유사도 = Σ(weight_i × 100 × exp(-diff_i / tolerance_i))
```

**지표별 가중치와 허용오차:**
| 지표 | 가중치 | 허용오차 |
|------|--------|----------|
| MA 기울기 (maSlope) | 0.35 | 36 |
| 이격도 (disparity) | 0.40 | 90 |
| RSI 14 | 0.05 | 4.5 |
| ROC 12 | 0.07 | 40 |
| 변동성 20일 | 0.13 | 28 |

**유사 구간 선택 조건:**
- 최소 40 거래일 이전의 데이터만 사용
- 유사 구간 간 최소 20일 간격 유지 (연속 선택 방지)
- 정배열/역배열 필터: 기준일과 동일한 배열 상태만 검색

### 전략 점수 계산

각 유사 구간에서 20 거래일 성과 확인 후 점수 산출:
```
점수 = 수익률(%) × e^(MDD(%) × 0.01)
```

- MDD는 음수이므로 `e^(mdd × 0.01)` < 1
- MDD가 클수록(큰 손실) 점수가 낮아짐
- 최종 점수는 유사도 가중 평균으로 계산

### 전략 선택 규칙

1. **정배열 시 Pro1 제외**: MA20 > MA60일 때 Pro1은 후보에서 제외
   - 단, SOXL에서 다이버전스 조건(조건 2) 발동 시 이 규칙 무시
2. **SOXL 전용 하향 규칙** (2가지 조건, 중복 시 1회만 하향):
   - 조건 1: RSI >= 60 AND 역배열
   - 조건 2: RSI 다이버전스 AND 이격도<120 AND 기준일RSI>=60
   - 적용: Pro3 → Pro2, Pro2 → Pro1, Pro1은 유지

### RSI 다이버전스 정의

**베어리시 다이버전스** (하락 신호):
- 전제 조건: 기준일 RSI >= 60
- 분석 윈도우: 20 거래일
- RSI 필터: RSI >= 60인 고점만 비교 대상
- 가격 조건: 최근 고점 >= 이전 고점 (허용 오차 -1%, 상승/횡보)
- RSI 조건: 최근 RSI < 이전 RSI (조금이라도 하락)

**이격도<120**:
- 조건: disparity < 20% (이격도 지수 120 미만)

### 참고 파일

- `src/recommend/similarity.ts`: 유사도 계산 (지수 감쇠)
- `src/recommend/score.ts`: 전략 점수 계산
- `src/recommend/types.ts`: 타입 정의
- `src/backtest/divergence.ts`: RSI 다이버전스 탐지

---

## 백테스트 기본 알고리즘

`BacktestEngine`이 가격 데이터와 전략을 기반으로 시뮬레이션을 수행합니다.

### 일일 처리 순서 (매우 중요)

모든 주문은 장 마감 전 "동시에" 제출되므로 순서가 중요합니다:

1. **매수 주문 생성**: 손절/매도 전 상태 기준으로 티어 결정
2. **손절 조건 확인**: 각 티어 매수일 기준 보유일 ≥ 손절일
3. **매도 주문 생성**: 손절 티어 제외, LOC 매도 주문
4. **손절 처리**: 손절 조건 충족 티어 MOC 매도
5. **매수 처리**: 매수 주문 체결 및 티어 활성화
6. **사이클 완료 체크**: 모든 티어 비워지면 다음 날 새 사이클

### 성과 지표

- **MDD**: 고점 대비 최대 낙폭 `(peak - current) / peak`
- **승률**: 수익 > 0인 사이클 비율
- **CAGR**: 연평균 복리 수익률 `(최종/초기)^(1/연수) - 1`

### 참고 파일

- `src/backtest/engine.ts`: 백테스트 엔진 메인 클래스
- `src/backtest/metrics.ts`: 성과 지표 및 기술적 지표 계산
- `src/backtest/cycle.ts`: 사이클 관리 (CycleManager)
- `src/backtest/trading-utils.ts`: 거래 유틸리티 함수
- `src/backtest/types.ts`: 타입 정의

---

## 백테스트 추천 전략 알고리즘

`RecommendBacktestEngine`이 사이클 경계에서 전략을 동적으로 전환합니다.

### 전략 결정 시점

1. **백테스트 시작**: 시작일 전날 종가 기준으로 추천
2. **첫 매수 전**: 매일 전략 재평가 (아직 포지션이 없으므로 유연하게 변경 가능)
3. **사이클 완료 시**: 새 사이클 시작 전 새로운 추천 받기

### 전략 전환 흐름

```
사이클 시작 → 첫 매수까지 매일 재평가 → 첫 매수 발생 → 전략 고정
    ↑                                              ↓
새 추천 받기 ← 사이클 완료 (모든 티어 청산) ← 손절/매도 반복
```

### 사이클별 추적 정보

각 사이클마다 다음 정보를 기록:
- 사용된 전략 (Pro1/Pro2/Pro3)
- 사이클 시작/종료일
- 시작 시점 RSI, 정배열 여부
- 추천 이유 (점수 또는 하향 적용)
- 사이클별 MDD 및 수익률

### 전략별 통계

백테스트 완료 후 전략별 사용 통계 제공:
- `cycles`: 해당 전략으로 실행한 사이클 수
- `totalDays`: 해당 전략 적용 총 일수

### 캐싱 최적화

- **인메모리 캐시**: `ticker:date` 키로 추천 결과 메모이제이션
- **DB 캐시**: `recommendation_cache` 테이블에 영구 저장
- 동일 날짜 반복 조회 시 계산 생략

### 참고 파일

- `src/backtest-recommend/engine.ts`: 추천 백테스트 엔진
- `src/backtest-recommend/recommend-helper.ts`: 빠른 추천 조회 헬퍼
- `src/backtest-recommend/types.ts`: 타입 정의
