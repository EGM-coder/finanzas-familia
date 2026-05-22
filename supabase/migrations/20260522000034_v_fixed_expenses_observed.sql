-- ============================================================
-- Migración 34 — v_fixed_expenses_observed (Fase 4 · Control)
-- 22 may 2026
--
-- Vista-espejo de gastos fijos observados: agrega txns con
-- nature='fijo_recurrente' (decisión humana ya tomada) por
-- counterparty + year + month + visibility.
--
-- Solo SUM/COUNT/AVG/MIN/MAX. Sin inferencia de periodicidad,
-- sin detección de suscripciones, sin flags de optimización.
--
-- security_invoker=true: hereda RLS de transactions vía
-- can_see_account (mig 32). Ana no ve cuentas privada_eric.
-- Sin GRANT especial: authenticated hereda de transactions.
-- ============================================================

CREATE OR REPLACE VIEW public.v_fixed_expenses_observed
WITH (security_invoker = true)
AS
SELECT
  t.counterparty,
  EXTRACT(YEAR  FROM t.date)::int  AS year,
  EXTRACT(MONTH FROM t.date)::int  AS month,
  a.visibility,
  ABS(SUM(t.amount))               AS total_spent,
  COUNT(*)                         AS txn_count,
  ABS(AVG(t.amount))               AS avg_amount,
  MIN(t.date)                      AS first_seen,
  MAX(t.date)                      AS last_seen
FROM public.transactions t
JOIN public.accounts a ON a.id = t.account_id
WHERE
  t.nature = 'fijo_recurrente'
  AND t.amount < 0
GROUP BY
  t.counterparty,
  EXTRACT(YEAR  FROM t.date),
  EXTRACT(MONTH FROM t.date),
  a.visibility;
