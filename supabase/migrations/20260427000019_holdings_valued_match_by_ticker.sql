-- Migración 19 — holdings_valued: prioriza match por ticker sobre ISIN
-- Razón: update_prices.py guarda 1 fila por ticker (deduplicado).
-- Holdings con mismo ticker pero distinto ISIN deben encontrar el mismo precio.

DROP VIEW IF EXISTS public.patrimonio_neto;
DROP VIEW IF EXISTS public.account_balances_full;
DROP VIEW IF EXISTS public.holdings_valued;

CREATE VIEW public.holdings_valued
WITH (security_invoker = TRUE) AS
SELECT
  h.*,
  hp.close_original AS current_price_original,
  hp.close_eur      AS current_price_eur,
  hp.date           AS price_date,
  CASE
    WHEN hp.close_eur IS NOT NULL THEN h.quantity * hp.close_eur
    WHEN hp.close_original IS NOT NULL AND h.original_currency = 'EUR' THEN h.quantity * hp.close_original
    WHEN h.avg_price_eur IS NOT NULL THEN h.quantity * h.avg_price_eur
    ELSE NULL
  END AS current_value_eur
FROM public.holdings h
LEFT JOIN LATERAL (
  SELECT close_original, close_eur, date
  FROM public.holding_prices
  WHERE
    -- Prioridad: match por ticker si holding tiene ticker
    (h.ticker IS NOT NULL AND ticker = h.ticker)
    OR
    -- Si holding no tiene ticker, match por ISIN
    (h.ticker IS NULL AND isin IS NOT DISTINCT FROM h.isin)
  ORDER BY date DESC
  LIMIT 1
) hp ON TRUE;

-- Recrear account_balances_full (igual que migración 17)
CREATE VIEW public.account_balances_full
WITH (security_invoker = TRUE) AS
SELECT
  a.id, a.name, a.institution, a.type, a.visibility,
  a.linked_account_id, a.initial_balance, a.is_active, a.sort_order,
  COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0) AS transactions_sum,
  COALESCE((SELECT SUM(hv.current_value_eur) FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0) AS holdings_value_eur,
  CASE
    WHEN a.type IN ('broker','investment') THEN
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((SELECT SUM(hv.current_value_eur) FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0)
    WHEN a.type = 'card' THEN
      -1 * (a.initial_balance + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0))
    ELSE
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
  END AS current_balance
FROM public.accounts a;

-- Recrear patrimonio_neto (igual que migración 16)
CREATE VIEW public.patrimonio_neto
WITH (security_invoker = TRUE) AS
WITH
  liq AS (
    SELECT COALESCE(SUM(abf.current_balance), 0) AS v
    FROM public.account_balances_full abf
    JOIN public.accounts a ON a.id = abf.id
    WHERE a.is_active = TRUE
  ),
  inm AS (SELECT COALESCE(SUM(current_value), 0) AS v FROM public.assets WHERE is_active = TRUE),
  d_act AS (SELECT COALESCE(SUM(current_balance), 0) AS v FROM public.liabilities WHERE is_active = TRUE AND status = 'activa'),
  d_pry AS (SELECT COALESCE(SUM(current_balance), 0) AS v FROM public.liabilities WHERE is_active = TRUE AND status = 'proyectada'),
  so AS (SELECT COALESCE(SUM(intrinsic_total), 0) AS v FROM public.stock_options_valued)
SELECT
  liq.v AS liquidos_y_holdings,
  inm.v AS inmuebles,
  liq.v + inm.v AS activos_total,
  d_act.v AS deudas_activas,
  d_pry.v AS deudas_proyectadas,
  liq.v + inm.v - d_act.v AS patrimonio_neto_actual,
  liq.v + inm.v - d_act.v - d_pry.v AS patrimonio_neto_si_firmara_hoy,
  so.v AS stock_options_intrinsic
FROM liq, inm, d_act, d_pry, so;

-- Limpiar duplicados por ticker+date (segundo INSERT machacó el primero)
DELETE FROM public.holding_prices a
USING public.holding_prices b
WHERE a.created_at < b.created_at
  AND a.ticker = b.ticker
  AND a.date = b.date;
