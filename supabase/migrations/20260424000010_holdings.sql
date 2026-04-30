-- ============================================================================
-- MIGRACIÓN 10 — tesoreria_tae + holdings + holding_prices
-- Reconstruida 29-abr-2026 a partir del state real de Supabase.
-- Idempotente (IF NOT EXISTS / DROP IF EXISTS) para que pueda re-aplicarse
-- sobre BD que ya tiene las tablas.
-- ============================================================================

-- 1. Ampliar CHECK de accounts.type para incluir 'tesoreria_tae'
--    (idempotente: drop si existe, recrear)
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('bank','investment','broker','cash','pension','card','tesoreria_tae'));

-- 2. Tabla holdings (posiciones individuales en brokers/fondos)
CREATE TABLE IF NOT EXISTS public.holdings (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID          NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  asset_type          TEXT          NOT NULL CHECK (asset_type IN ('accion','fondo_indexado','etf','cripto','bono')),
  ticker              TEXT,
  isin                TEXT,
  name                TEXT          NOT NULL,
  quantity            NUMERIC(20,8) NOT NULL DEFAULT 0,
  avg_price_original  NUMERIC(20,8),
  original_currency   TEXT          NOT NULL DEFAULT 'EUR',
  avg_price_eur       NUMERIC(20,8),
  notes               TEXT,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holdings_account ON public.holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker  ON public.holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_holdings_isin    ON public.holdings(isin);

DROP TRIGGER IF EXISTS trg_holdings_updated_at ON public.holdings;
CREATE TRIGGER trg_holdings_updated_at
  BEFORE UPDATE ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Tabla holding_prices (cache cotizaciones)
CREATE TABLE IF NOT EXISTS public.holding_prices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker          TEXT,
  isin            TEXT,
  date            DATE          NOT NULL,
  close_original  NUMERIC(20,8) NOT NULL,
  currency        TEXT          NOT NULL DEFAULT 'USD',
  close_eur       NUMERIC(20,8),
  source          TEXT          DEFAULT 'yahoo',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON public.holding_prices(ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_prices_isin_date   ON public.holding_prices(isin, date DESC);

-- Índice único por (ticker, isin, date) tolerando NULLs vía COALESCE
-- — recreado fielmente del state actual de la BD
CREATE UNIQUE INDEX IF NOT EXISTS holding_prices_unique_idx
  ON public.holding_prices (COALESCE(ticker, ''::text), COALESCE(isin, ''::text), date);

-- 4. RLS holdings (heredan visibilidad de la cuenta vía can_see_account)
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holdings_select ON public.holdings;
DROP POLICY IF EXISTS holdings_insert ON public.holdings;
DROP POLICY IF EXISTS holdings_update ON public.holdings;
DROP POLICY IF EXISTS holdings_delete ON public.holdings;

CREATE POLICY holdings_select ON public.holdings
  FOR SELECT USING (public.can_see_account(account_id));

CREATE POLICY holdings_insert ON public.holdings
  FOR INSERT WITH CHECK (public.can_see_account(account_id));

CREATE POLICY holdings_update ON public.holdings
  FOR UPDATE
  USING      (public.can_see_account(account_id))
  WITH CHECK (public.can_see_account(account_id));

CREATE POLICY holdings_delete ON public.holdings
  FOR DELETE USING (public.can_see_account(account_id));

-- 5. RLS holding_prices: lectura pública (precios de mercado, no datos personales)
ALTER TABLE public.holding_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holding_prices_select_all ON public.holding_prices;
CREATE POLICY holding_prices_select_all ON public.holding_prices
  FOR SELECT USING (TRUE);

-- 6. Vista de valoración actual de holdings
--    OJO: si tu vista holdings_valued definitiva está en una migración posterior
--    (15/17/19/20) que aún no he reconstruido, esta es la versión base de mig 10.
--    Si ya existe una versión más rica, NO la sobreescribir aquí.
CREATE OR REPLACE VIEW public.holdings_valued
WITH (security_invoker = TRUE)
AS
SELECT
  h.*,
  hp.close_original AS current_price_original,
  hp.close_eur      AS current_price_eur,
  CASE
    WHEN hp.close_eur IS NOT NULL THEN h.quantity * hp.close_eur
    ELSE NULL
  END AS current_value_eur
FROM public.holdings h
LEFT JOIN LATERAL (
  SELECT close_original, close_eur
  FROM public.holding_prices
  WHERE (h.ticker IS NOT NULL AND ticker = h.ticker)
     OR (h.isin   IS NOT NULL AND isin   = h.isin)
  ORDER BY date DESC
  LIMIT 1
) hp ON TRUE
WHERE h.is_active = TRUE;
