-- Add last_viewed_at to trading_accounts
--
-- 계좌 상세 화면을 마지막으로 조회한 시각을 기록한다.
-- 마감 처리 스케줄러(/api/cron/process-daily-orders)는 최근 조회된
-- 활성 계좌만 처리하여, 아무도 사용하지 않는 계좌의 불필요한 계산을
-- 건너뛴다 (기존 lazy 처리의 장점 복원).
--
-- NULL이면 아직 조회된 적 없는 계좌로, 스케줄러 처리 대상에서 제외된다.
-- 계좌 상세 화면을 한 번 열면 값이 채워져 다음 실행부터 처리 대상이 된다.

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamp;

-- 스케줄러의 활성 계좌 조회(last_viewed_at >= ...)가 전체 스캔으로
-- 떨어지지 않도록 인덱스를 생성한다.
CREATE INDEX IF NOT EXISTS idx_trading_accounts_last_viewed_at
  ON public.trading_accounts (last_viewed_at);
