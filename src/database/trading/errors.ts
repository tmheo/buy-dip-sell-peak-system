/**
 * 실계좌 저장 계층이 던지는 업무 오류
 * 호출 경로(API 라우트)가 이 오류를 사용자에게 보일 400 응답으로 바꾼다.
 */

/**
 * 보유 티어가 있는 동안(사이클 진행 중) 계좌 설정을 수정하려 할 때 던진다.
 * 시드는 사이클 중에도 시드 변경 API로 바꿀 수 있으므로(ADR-0004) 문구는 막히는 것만 적는다.
 * 종목은 사이클과 상관없이 계좌를 만든 뒤 바꿀 수 없어 검증 단계에서 따로 거절한다.
 */
export class CycleInProgressError extends Error {
  constructor() {
    super("사이클 중에는 계좌 이름·투자 전략·운용 시작일을 바꿀 수 없습니다");
    this.name = "CycleInProgressError";
  }
}

/**
 * 첫 일일 마감 뒤에 운용 시작일을 다른 날짜로 바꾸려 할 때 던진다 (#112).
 * 일일 마감은 lastProcessedDate가 없을 때만 운용 시작일부터 처리하므로, 그 뒤에 바꾸면
 * 처리할 거래일은 그대로이고 화면 표시만 달라진다.
 */
export class TradingStartDateLockedError extends Error {
  constructor() {
    super("첫 일일 마감 뒤에는 운용 시작일을 바꿀 수 없습니다");
    this.name = "TradingStartDateLockedError";
  }
}
