-- Migración 14 — Tarjetas de crédito: invertir signo en saldo
-- Convención: amount positivo en transactions = ingreso, negativo = gasto.
-- En tarjetas, los gastos llegan como positivos (consumo) y los pagos como negativos.
-- Por tanto el saldo neto debe interpretarse como deuda y restar de liquidez.
--
-- DROP CASCADE necesario porque patrimonio_neto depende de account_balances_full.
-- Se recrea patrimonio_neto a continuación con la misma definición.

DROP VIEW IF EXISTS public.patrimonio_neto;
DROP VIEW IF EXISTS public.account_balances_full;

CREATE VIEW public.account_balances_full
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
    SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id
  ), 0) AS transactions_sum,
  COALESCE((
    SELECT SUM(hv.current_value_eur)
    FROM public.holdings_valued hv
    WHERE hv.account_id = a.id
  ), 0) AS holdings_value_eur,
  CASE
    WHEN a.type IN ('broker','investment') THEN
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((SELECT SUM(hv.current_value_eur) FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0)
    WHEN a.type = 'card' THEN
      -1 * (
        a.initial_balance
        + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
      )
    ELSE
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
  END AS current_balance
FROM public.accounts a;

-- Recrear patrimonio_neto (misma definición que migración 12)
CREATE VIEW public.patrimonio_neto
WITH (security_invoker = TRUE) AS
WITH
  liq AS (
    SELECT COALESCE(SUM(abf.current_balance), 0) AS v
    FROM public.account_balances_full abf
    JOIN public.accounts a ON a.id = abf.id
    WHERE a.is_active = TRUE
  ),
  inm AS (
    SELECT COALESCE(SUM(current_value), 0) AS v
    FROM public.assets WHERE is_active = TRUE
  ),
  d_act AS (
    SELECT COALESCE(SUM(current_balance), 0) AS v
    FROM public.liabilities
    WHERE is_active = TRUE AND status = 'activa'
  ),
  d_pry AS (
    SELECT COALESCE(SUM(current_balance), 0) AS v
    FROM public.liabilities
    WHERE is_active = TRUE AND status = 'proyectada'
  )
SELECT
  liq.v                              AS liquidos_y_holdings,
  inm.v                              AS inmuebles,
  liq.v + inm.v                      AS activos_total,
  d_act.v                            AS deudas_activas,
  d_pry.v                            AS deudas_proyectadas,
  liq.v + inm.v - d_act.v            AS patrimonio_neto_actual,
  liq.v + inm.v - d_act.v - d_pry.v  AS patrimonio_neto_si_firmara_hoy
FROM liq, inm, d_act, d_pry;
