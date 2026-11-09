-- Add cycle_number to profit_records (#97, ADR-0003)
--
-- 예수금 계산이 이번 사이클의 실현손익을 입력으로 받는다. 그 합을 구하려면
-- 수익 기록이 어느 사이클의 것인지 알아야 한다. "사이클 시작일 이후 매도"로는
-- 구분할 수 없다 - completeCycleAndIncrement가 cycle_start_date를 바꾸지 않아
-- 두 번째 사이클부터 앞선 사이클의 손익이 섞인다.
-- 앞으로는 체결 시점(사이클 완료 처리 전)의 계좌 사이클 번호를 함께 저장한다.
--
-- 기존 기록의 번호는 날짜로 되살린다. 계좌별로 매수일 순으로 놓고, 앞선 기록들의
-- 가장 늦은 매도일보다 매수일이 뒤면 새 사이클로 묶어 1부터 번호를 매긴다.
-- 매수일이 앞 기록의 매도일과 같은 날이면 같은 사이클이다(그날 매도와 매수가
-- 함께 체결되면 사이클은 이어진다).
-- 지금 보유 중인 티어는 아직 매도일이 없는 기록으로 함께 묶는다. 진행 중인
-- 사이클에서 두 매도 기록 사이를 잇는 것이 보유 중인 티어뿐일 수 있고, 그 티어를
-- 빼면 한 사이클이 둘로 쪼개진다.
--
-- 다음 중 하나라도 해당하면 마이그레이션을 실패시킨다. 사람이 데이터를 고친 뒤
-- 다시 적용한다.
-- - 계좌의 묶음 수가 계좌 사이클 번호와 맞지 않는다(보유 중이면 같아야 하고,
--   보유가 없으면 1 작아야 한다).
-- - 같은 계좌·티어·매수일·매도일의 수익 기록이 둘 이상이다.
-- - 보유 중인 티어에 매수일이 없다(묶을 수 없다).
--
-- CI는 drizzle 스키마로 컬럼을 먼저 만든 뒤 이 파일을 다시 적용하므로 멱등하게 쓴다.

ALTER TABLE public.profit_records
  ADD COLUMN IF NOT EXISTS cycle_number integer;

-- 기록과 보유 티어를 계좌별로 매수일 순으로 놓고 사이클 묶음 번호를 매긴다.
-- prev_max_sell: 앞선 행들의 가장 늦은 매도일 (보유 중인 티어는 무한대)
-- 검증과 번호 저장이 같은 묶음을 쓰도록 세션 임시 테이블에 담는다.
CREATE TEMP TABLE profit_record_cycle_groups AS
WITH entries AS (
  SELECT
    account_id,
    id AS record_id,
    buy_date,
    sell_date::timestamp AS sell_at
  FROM public.profit_records
  UNION ALL
  SELECT
    account_id,
    NULL AS record_id,
    buy_date,
    'infinity'::timestamp AS sell_at
  FROM public.tier_holdings
  WHERE shares > 0
),
ordered AS (
  SELECT
    *,
    max(sell_at) OVER (
      PARTITION BY account_id
      ORDER BY buy_date, sell_at, record_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prev_max_sell
  FROM entries
)
SELECT
  account_id,
  record_id,
  buy_date,
  sum(CASE WHEN prev_max_sell IS NULL OR buy_date > prev_max_sell THEN 1 ELSE 0 END) OVER (
    PARTITION BY account_id
    ORDER BY buy_date, sell_at, record_id
    ROWS UNBOUNDED PRECEDING
  )::integer AS cycle_number
FROM ordered;

DO $$
DECLARE
  problem text;
BEGIN
  SELECT format('account %s tier %s has shares but no buy_date', account_id, tier)
    INTO problem
    FROM public.tier_holdings
    WHERE shares > 0 AND buy_date IS NULL
    LIMIT 1;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'profit_records.cycle_number migration failed: %', problem;
  END IF;

  SELECT format(
      'account %s has duplicate profit records (tier %s, buy %s, sell %s)',
      account_id, tier, buy_date, sell_date
    )
    INTO problem
    FROM public.profit_records
    GROUP BY account_id, tier, buy_date, sell_date
    HAVING count(*) > 1
    LIMIT 1;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'profit_records.cycle_number migration failed: %', problem;
  END IF;

  SELECT format(
      'account %s has %s cycle groups but cycle_number %s (%s)',
      a.id,
      coalesce(g.groups, 0),
      a.cycle_number,
      CASE WHEN h.held THEN 'holding' ELSE 'no holding' END
    )
    INTO problem
    FROM public.trading_accounts a
    LEFT JOIN (
      SELECT account_id, max(cycle_number) AS groups
      FROM profit_record_cycle_groups
      GROUP BY account_id
    ) g ON g.account_id = a.id
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM public.tier_holdings t WHERE t.account_id = a.id AND t.shares > 0
      ) AS held
    ) h
    WHERE coalesce(g.groups, 0) <> CASE WHEN h.held THEN a.cycle_number ELSE a.cycle_number - 1 END
    LIMIT 1;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'profit_records.cycle_number migration failed: %', problem;
  END IF;
END
$$;

UPDATE public.profit_records p
  SET cycle_number = g.cycle_number
  FROM profit_record_cycle_groups g
  WHERE g.record_id = p.id
    AND p.cycle_number IS NULL;

DROP TABLE pg_temp.profit_record_cycle_groups;

ALTER TABLE public.profit_records
  ALTER COLUMN cycle_number SET NOT NULL;

-- 이번 사이클 실현손익 합산(account_id, cycle_number)이 전체 스캔으로 떨어지지 않게 한다
CREATE INDEX IF NOT EXISTS idx_profit_records_account_cycle
  ON public.profit_records (account_id, cycle_number);
