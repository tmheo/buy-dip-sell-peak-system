-- Add last_processed_date to trading_accounts
--
-- 마감 처리 스케줄러(/api/cron/process-daily-orders)가 마지막으로 처리 완료한
-- 거래일을 기록한다. 이전에는 매 실행마다 cycle_start_date부터 전체 거래일을
-- 다시 스캔하여 Vercel 함수의 60초 제한을 초과(FUNCTION_INVOCATION_TIMEOUT)했다.
-- 이 컬럼을 기준으로 증분 처리하여 매 실행이 새 거래일만 처리하도록 한다.
--
-- NULL이면 아직 한 번도 처리되지 않은 계좌로, cycle_start_date부터 처리한다.

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS last_processed_date date;
