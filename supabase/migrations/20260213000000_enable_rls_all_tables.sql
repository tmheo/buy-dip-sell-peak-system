-- Enable Row Level Security (RLS) on all public tables
-- Fixes 14 Supabase Security Advisor errors:
--   11x "RLS Disabled in Public"
--   3x "Sensitive Columns Exposed" (accounts, sessions, verification_tokens)
--
-- This project uses server-side Drizzle ORM with postgres-js (postgres role),
-- which bypasses RLS automatically. These policies block unauthorized access
-- via Supabase PostgREST API (anon/authenticated roles).

-- ============================================================
-- 1. Enable RLS on all tables
-- ============================================================

-- Auth tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tokens ENABLE ROW LEVEL SECURITY;

-- Trading tables
ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_records ENABLE ROW LEVEL SECURITY;

-- Market data tables
ALTER TABLE public.daily_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

-- Cache tables
ALTER TABLE public.recommendation_cache ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Policies for service_role (full access for server-side operations)
-- ============================================================
-- Note: postgres role (owner) bypasses RLS by default.
-- service_role also bypasses RLS in Supabase.
-- These policies are for authenticated users accessing via PostgREST.

-- ============================================================
-- 3. Read-only policies for authenticated users on public market data
-- ============================================================
-- daily_prices and daily_metrics contain public market data (OHLCV, technical indicators).
-- Allow authenticated users to read this data for potential future client-side features.

CREATE POLICY "Authenticated users can read daily_prices"
  ON public.daily_prices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read daily_metrics"
  ON public.daily_metrics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read recommendation_cache"
  ON public.recommendation_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 4. User-scoped policies for auth tables
-- ============================================================
-- Users can only read their own data.

CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid()::text);

CREATE POLICY "Users can read own accounts"
  ON public.accounts
  FOR SELECT
  TO authenticated
  USING ("user_id" = auth.uid()::text);

CREATE POLICY "Users can read own sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING ("user_id" = auth.uid()::text);

-- verification_tokens: no direct user access needed via PostgREST
-- Server handles all token operations

-- ============================================================
-- 5. User-scoped policies for trading tables
-- ============================================================
-- Users can only access their own trading data.

CREATE POLICY "Users can read own trading_accounts"
  ON public.trading_accounts
  FOR SELECT
  TO authenticated
  USING ("user_id" = auth.uid()::text);

CREATE POLICY "Users can read own tier_holdings"
  ON public.tier_holdings
  FOR SELECT
  TO authenticated
  USING (
    "account_id" IN (
      SELECT id FROM public.trading_accounts WHERE "user_id" = auth.uid()::text
    )
  );

CREATE POLICY "Users can read own daily_orders"
  ON public.daily_orders
  FOR SELECT
  TO authenticated
  USING (
    "account_id" IN (
      SELECT id FROM public.trading_accounts WHERE "user_id" = auth.uid()::text
    )
  );

CREATE POLICY "Users can read own profit_records"
  ON public.profit_records
  FOR SELECT
  TO authenticated
  USING (
    "account_id" IN (
      SELECT id FROM public.trading_accounts WHERE "user_id" = auth.uid()::text
    )
  );
