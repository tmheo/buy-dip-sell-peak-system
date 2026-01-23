# 로컬 Claude Code 설정

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
