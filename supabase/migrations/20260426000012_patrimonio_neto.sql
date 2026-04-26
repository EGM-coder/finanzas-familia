-- ============================================================
-- MIGRACIÓN 12 — Vista patrimonio_neto + asset Maristas
-- Razón: el patrimonio neto actual mezcla hipoteca proyectada
-- como deuda real y omite la vivienda en construcción como activo
-- ============================================================

-- 1. Vivienda como activo (en construcción)
INSERT INTO public.assets (
  name, type, visibility, purchase_date, purchase_value,
  current_value, last_valuation_date, notes, is_active
) VALUES (
  'Apartamento Residencial Maristas',
  'inmueble',
  'compartida',
  '2026-05-15',
  509100.00,
  143370.00,
  '2026-04-25',
  'En construcción. current_value = pagos a cuenta entregados a COBLANSA. Actualizar tras escritura.',
  TRUE
);

-- 2. Vista patrimonio_neto con breakdown
CREATE OR REPLACE VIEW public.patrimonio_neto
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
