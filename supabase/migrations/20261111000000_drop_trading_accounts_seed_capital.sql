-- Drop trading_accounts.seed_capital (#120, ADR-0005) - 마이그레이션 B
--
-- 시드는 seed_capital_history가 소유한다(마이그레이션 A). 계좌의 seed_capital 칸은
-- 배포를 되돌릴 때를 대비해 남겨 두었을 뿐 코드가 읽지도 쓰지도 않는다.
-- 쓰이지 않는 칸을 오래 두면 "지금 시드"로 잘못 읽히므로 지운다.
--
-- 지우기 전에 시드 이력 줄이 없는 계좌가 없는지 한 번 더 확인한다. 그런 계좌가 있으면
-- 칸을 지우지 않고 실패시킨다 - 칸을 지우면 그 계좌의 시드를 되살릴 곳이 없다.
-- 사람이 이력을 채운 뒤 다시 적용한다.
--
-- 옛 코드는 계좌를 지울 때 이 칸까지 돌려받으므로, 칸을 지운 코드를 배포한 뒤에 적용한다
-- (scripts/drop-seed-capital-deploy.sh).
-- CI는 drizzle 스키마(칸이 없다)로 테이블을 먼저 만든 뒤 이 파일을 다시 적용하므로 멱등하게 쓴다.
-- 한 트랜잭션으로 적용한다(psql -1).

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
    ORDER BY a.id
    LIMIT 1;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'drop seed_capital migration failed: %', problem;
  END IF;
END
$$;

ALTER TABLE public.trading_accounts
  DROP COLUMN IF EXISTS seed_capital;
