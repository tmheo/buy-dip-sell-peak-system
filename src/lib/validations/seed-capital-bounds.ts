/**
 * 시드 금액의 범위 - 서버 검증(trading.ts의 SeedCapitalAmountSchema)과 화면의 입력 검사가
 * 같은 값을 쓴다. 화면이 가져다 쓰므로 zod를 들이지 않는다.
 */

/** 시드 금액의 최소값 ($) */
export const MIN_SEED_CAPITAL = 2000;
/** 시드 금액의 최대값 ($) */
export const MAX_SEED_CAPITAL = 1_000_000_000;

/** 최소 시드 금액보다 작을 때의 오류 문구 */
export const MIN_SEED_CAPITAL_MESSAGE = `시드 금액은 최소 $${MIN_SEED_CAPITAL.toLocaleString("en-US")} 이상이어야 합니다`;
