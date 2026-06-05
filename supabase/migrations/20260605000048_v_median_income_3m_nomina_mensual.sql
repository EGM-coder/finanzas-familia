-- ============================================================
-- Migración 48 — v_median_income_3m: filtrar solo type='nomina_mensual'
-- 05 jun 2026
--
-- Antes: sumaba TODOS los tipos (nomina_mensual, bonus, paga_extra, …).
-- Ahora: solo 'nomina_mensual' para que el bonus/extra no infle la
-- mediana usada como base de anticipación en Budget y Planner.
--
-- La lógica de la vista es idéntica a mig-29; solo añade el filtro de tipo.
-- security_invoker=true se mantiene — cada usuario solo ve sus propios datos.
--
-- Nota: esta migración deja obsoleta la idea futura de "calcular mediana
-- desde transactions" (que no distingue nómina vs bonus). La tabla incomes
-- es la fuente canónica para anticipación de ingresos recurrentes.
-- ============================================================

CREATE OR REPLACE VIEW public.v_median_income_3m
WITH (security_invoker = TRUE) AS
WITH monthly_income AS (
  SELECT
    user_id,
    SUM(net_amount) AS monthly_net
  FROM public.incomes
  WHERE type = 'nomina_mensual'
    AND date >= (date_trunc('month', CURRENT_DATE::timestamp)
                   - INTERVAL '3 months')::date
    AND date <   date_trunc('month', CURRENT_DATE::timestamp)::date
  GROUP BY
    user_id,
    EXTRACT(YEAR  FROM date)::int,
    EXTRACT(MONTH FROM date)::int
)
SELECT
  user_id,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY monthly_net) AS median_monthly_income,
  COUNT(*) AS months_with_data
FROM monthly_income
GROUP BY user_id;
