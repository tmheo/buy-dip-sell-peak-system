-- Add seed_capital_history (#116, ADR-0005) - 마이그레이션 A
--
-- 시드 금액을 적용일이 붙은 이력으로 남긴다. 바꾼 시드는 바꾼 날(서버의 UTC 날짜)의
-- 다음 평일 주문표부터 쓰이고, 어느 날의 사이클 자본은 이 이력에서 그날의 시드를 읽는다.
-- 지금처럼 계좌의 seed_capital을 매번 읽으면, 증권사에 주문을 낸 뒤 시드를 바꿨을 때
-- 이미 낸 주문표가 새 시드로 다시 만들어지고 밀린 지난 날짜도 새 시드로 다시 계산된다.
--
-- 이 마이그레이션이 하는 일:
-- - 테이블을 만들고 행 단위 보안을 켠다. 정책은 두지 않는다 - 서버는 RLS를 우회하는
--   postgres 역할로 접속하고, PostgREST(anon/authenticated)로는 읽을 일이 없다.
-- - 계좌마다 첫 줄을 쓴다: 적용일 = created_at의 날짜(UTC), 시드 = 지금 seed_capital.
--   첫 줄은 첫 변경 전의 모든 날짜에 쓰이므로 사이클 시작일과 관계없이 지금과 같은 시드가 된다.
-- - seed_capital의 NOT NULL을 푼다. 새 코드는 이 칸을 읽지도 쓰지도 않는다.
--   칸 삭제는 되돌릴 일이 없다고 확인된 뒤 따로 한다(#120).
-- - 줄이 없는 계좌가 남으면 실패시킨다. 사람이 데이터를 고친 뒤 다시 적용한다.
--
-- 옛 코드와 함께 돌아도 문제가 없다 - 옛 코드는 이 테이블을 모르고 seed_capital을 계속 쓴다.
-- 이 마이그레이션 뒤 배포 전까지 옛 코드가 만든 계좌나 바꾼 시드는 배포 뒤 확인 쿼리
-- (scripts/seed-capital-history-deploy.sh verify)가 잡는다.
--
-- CI는 drizzle 스키마로 테이블을 먼저 만든 뒤 이 파일을 다시 적용하므로 멱등하게 쓴다.
-- 한 트랜잭션으로 적용한다(psql -1).

CREATE TABLE IF NOT EXISTS public.seed_capital_history (
  account_id text NOT NULL,
  effective_date date NOT NULL,
  seed_capital numeric(14, 2) NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT seed_capital_history_account_id_effective_date_pk
    PRIMARY KEY (account_id, effective_date),
  CONSTRAINT seed_capital_history_account_id_trading_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES public.trading_accounts (id) ON DELETE CASCADE
);

ALTER TABLE public.seed_capital_history ENABLE ROW LEVEL SECURITY;

-- 이미 이력이 있는 계좌는 건드리지 않는다 - 다시 적용해도 새 코드가 쓴 줄이 그대로 남는다
INSERT INTO public.seed_capital_history (account_id, effective_date, seed_capital)
SELECT a.id, coalesce(a.created_at::date, current_date), a.seed_capital
FROM public.trading_accounts a
WHERE a.seed_capital IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.seed_capital_history h WHERE h.account_id = a.id
  );

DO $$
DECLARE
  problem text;
BEGIN
  SELECT format('account %s has no seed_capital_history row', a.id)
    INTO problem
    FROM public.trading_accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.seed_capital_history h WHERE h.account_id = a.id
    )
    LIMIT 1;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'seed_capital_history migration failed: %', problem;
  END IF;
END
$$;

ALTER TABLE public.trading_accounts
  ALTER COLUMN seed_capital DROP NOT NULL;
