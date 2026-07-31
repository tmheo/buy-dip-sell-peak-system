/**
 * src/metrics 공개 타입
 * SPEC-METRICS-001
 */

/**
 * 날짜(인덱스) 하나의 기술적 지표 묶음.
 * 계산 불가능한 지표는 null로 보존한다.
 * 결측 정책(행 스킵, 0 치환, 정배열 NaN)은 소비자 어댑터가 결정한다.
 */
export interface IndicatorRow {
  /** 20일 단순이동평균 */
  ma20: number | null;
  /** 60일 단순이동평균 */
  ma60: number | null;
  /** 골든크로스: (MA20 - MA60) / MA60 × 100 */
  goldenCross: number | null;
  /** 정배열 여부: MA20 > MA60 */
  isGoldenCross: boolean | null;
  /** MA 기울기: (MA20[t] - MA20[t-10]) / MA20[t-10] × 100 */
  maSlope: number | null;
  /** 이격도: (adjClose - MA20) / MA20 × 100 */
  disparity: number | null;
  /** RSI14 (Wilder's EMA 방식) */
  rsi14: number | null;
  /** ROC12: 12일 변화율 (%) */
  roc12: number | null;
  /** 20일 변동성: 일별 수익률 표본 표준편차 × √20 */
  volatility20: number | null;
}
