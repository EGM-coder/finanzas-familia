-- ============================================================================
-- MIGRACIÓN 13 — currency_rates
-- Reconstruida 30-abr-2026 a partir del state real de Supabase.
-- Idempotente (IF NOT EXISTS, DROP POLICY IF EXISTS).
--
-- Propósito: caché de tipos de cambio diarios (USD→EUR, etc.)
-- Escrita por update_prices.py vía upsert on_conflict=(date,from_currency,to_currency)
-- Leída por holdings_valued para convertir close_original → close_eur
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.currency_rates (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  date          DATE          NOT NULL,
  from_currency TEXT          NOT NULL,
  to_currency   TEXT          NOT NULL DEFAULT 'EUR',
  rate          NUMERIC(20,8) NOT NULL,
  source        TEXT                    DEFAULT 'yahoo',
  created_at    TIMESTAMPTZ   NOT NULL  DEFAULT now(),
  CONSTRAINT currency_rates_date_from_currency_to_currency_key
    UNIQUE (date, from_currency, to_currency)
);

ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rates_select_all ON public.currency_rates;
CREATE POLICY rates_select_all ON public.currency_rates
  FOR SELECT USING (TRUE);
