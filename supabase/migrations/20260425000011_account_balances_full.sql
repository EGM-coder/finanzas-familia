-- ============================================================================
-- MIGRACIÓN 11 — account_balances_full v1
-- Reconstruida 30-abr-2026 a partir del contexto de mig 12 y mig 14.
--
-- Razón de existencia: mig 12 (patrimonio_neto) necesita account_balances_full.
-- Esta v1 NO tiene el fix de signo de tarjetas (introducido en mig 14).
-- En v1 los gastos de tarjeta sumaban al saldo en lugar de restarlo — error
-- visible en UI hasta que mig 14 lo corrigió.
--
-- Evolución posterior:
--   mig 14 → card sign fix (WHEN type='card' THEN -1 *)
--   mig 17 → añade is_active, sort_order
--   mig 20 → añade manual_holdings
-- ============================================================================

CREATE OR REPLACE VIEW public.account_balances_full
WITH (security_invoker = TRUE) AS
SELECT
  a.id,
  a.name,
  a.institution,
  a.type,
  a.visibility,
  a.linked_account_id,
  a.initial_balance,
  COALESCE((
    SELECT SUM(t.amount)
    FROM public.transactions t
    WHERE t.account_id = a.id
  ), 0) AS transactions_sum,
  COALESCE((
    SELECT SUM(hv.current_value_eur)
    FROM public.holdings_valued hv
    WHERE hv.account_id = a.id
  ), 0) AS holdings_value_eur,
  CASE
    WHEN a.type IN ('broker', 'investment') THEN
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((SELECT SUM(hv.current_value_eur) FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0)
    ELSE
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
  END AS current_balance
FROM public.accounts a;
