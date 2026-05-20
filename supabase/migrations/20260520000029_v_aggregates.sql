-- ============================================================
-- Migración 29 — Vistas SQL agregadas (Fase 4 · Control)
-- 20 may 2026
--
-- 5 vistas con security_invoker=true. Contrato de lectura de Fase 4.
--
-- Splits-first (§9.3 briefing Fase 4):
--   Branch A: txn CON splits  → usa transaction_splits.(category_id, amount)
--   Branch B: txn SIN splits  → usa transactions.(category_id, amount)
--   Implementado con UNION ALL + NOT EXISTS (no LEFT JOIN para evitar
--   duplicar la fila padre cuando hay splits).
--
-- Filtro nature: excluye 'transferencia' en ambas vistas de gasto.
--   Razón: transferencias internas tienen saldo neto 0 en patrimonio
--   y contaminarían semáforo ZBB y mediana 3m.
--   Permite nature IS NULL (txns pendientes de asignar nature).
--   Filtro en t.nature (transaction_splits no tiene columna nature).
--
-- v_category_budget_status y v_median_spend_3m_by_category
--   referencian v_spent_by_category_month → heredan el filtro.
-- ============================================================

-- ── 1. v_spent_by_category_month ─────────────────────────────
-- Gasto real por (year, month, category_id, visibility de cuenta).
-- spent = ABS(amount). Solo amounts < 0. Excluye transferencias.

CREATE OR REPLACE VIEW public.v_spent_by_category_month
WITH (security_invoker = TRUE) AS
WITH effective_rows AS (

  -- Branch A: transacciones CON splits → usar importe del split
  SELECT
    s.category_id,
    s.amount      AS amount,
    t.date,
    t.account_id
  FROM public.transactions t
  JOIN public.transaction_splits s ON s.transaction_id = t.id
  WHERE s.amount < 0
    AND t.nature IS DISTINCT FROM 'transferencia'

  UNION ALL

  -- Branch B: transacciones SIN splits → usar la txn directamente
  SELECT
    t.category_id,
    t.amount,
    t.date,
    t.account_id
  FROM public.transactions t
  WHERE t.amount < 0
    AND t.category_id IS NOT NULL
    AND t.nature IS DISTINCT FROM 'transferencia'
    AND NOT EXISTS (
      SELECT 1 FROM public.transaction_splits s
      WHERE s.transaction_id = t.id
    )

)
SELECT
  EXTRACT(YEAR  FROM r.date)::int  AS year,
  EXTRACT(MONTH FROM r.date)::int  AS month,
  r.category_id,
  a.visibility,
  SUM(ABS(r.amount))               AS spent,
  COUNT(*)                         AS txn_count
FROM effective_rows r
JOIN public.accounts a ON a.id = r.account_id
GROUP BY 1, 2, 3, 4;


-- ── 2. v_spent_by_category_week ──────────────────────────────
-- Gasto real por (week_start, category_id, visibility).
-- week_start = lunes ISO (date_trunc 'week').
-- Excluye transferencias (mismo filtro que v_spent_by_category_month).

CREATE OR REPLACE VIEW public.v_spent_by_category_week
WITH (security_invoker = TRUE) AS
WITH effective_rows AS (

  SELECT
    s.category_id,
    s.amount      AS amount,
    t.date,
    t.account_id
  FROM public.transactions t
  JOIN public.transaction_splits s ON s.transaction_id = t.id
  WHERE s.amount < 0
    AND t.nature IS DISTINCT FROM 'transferencia'

  UNION ALL

  SELECT
    t.category_id,
    t.amount,
    t.date,
    t.account_id
  FROM public.transactions t
  WHERE t.amount < 0
    AND t.category_id IS NOT NULL
    AND t.nature IS DISTINCT FROM 'transferencia'
    AND NOT EXISTS (
      SELECT 1 FROM public.transaction_splits s
      WHERE s.transaction_id = t.id
    )

)
SELECT
  date_trunc('week', r.date::timestamp)::date  AS week_start,
  r.category_id,
  a.visibility,
  SUM(ABS(r.amount))                           AS spent,
  COUNT(*)                                     AS txn_count
FROM effective_rows r
JOIN public.accounts a ON a.id = r.account_id
GROUP BY 1, 2, 3;


-- ── 3. v_category_budget_status ──────────────────────────────
-- Join FULL OUTER: budgets ↔ v_spent_by_category_month.
-- Aparecen categorías con budget, con gasto, o ambos.
-- Con budgets vacíos (estado actual): sólo filas de gasto
-- con semaforo='sin_budget'.
-- Hereda exclusión de transferencias vía v_spent_by_category_month.
--
-- semaforo:
--   verde     → spent <= amount_planned × 0.90
--   ambar     → spent <= amount_planned (90%–100%)
--   rojo      → spent > amount_planned
--   sin_budget → amount_planned IS NULL o = 0

CREATE OR REPLACE VIEW public.v_category_budget_status
WITH (security_invoker = TRUE) AS
SELECT
  COALESCE(b.year,        s.year)        AS year,
  COALESCE(b.month,       s.month)       AS month,
  COALESCE(b.category_id, s.category_id) AS category_id,
  COALESCE(b.visibility,  s.visibility)  AS visibility,
  COALESCE(b.amount_planned, 0)          AS amount_planned,
  COALESCE(s.spent, 0)                   AS spent,
  COALESCE(b.amount_planned, 0)
    - COALESCE(s.spent, 0)               AS remaining,
  CASE
    WHEN b.amount_planned IS NULL
      OR b.amount_planned = 0            THEN NULL
    ELSE ROUND(
      (COALESCE(s.spent, 0) / b.amount_planned * 100)::numeric, 1
    )
  END                                    AS pct_used,
  CASE
    WHEN b.amount_planned IS NULL
      OR b.amount_planned = 0            THEN 'sin_budget'
    WHEN COALESCE(s.spent, 0)
           <= b.amount_planned * 0.9     THEN 'verde'
    WHEN COALESCE(s.spent, 0)
           <= b.amount_planned           THEN 'ambar'
    ELSE                                      'rojo'
  END                                    AS semaforo,
  COALESCE(s.txn_count, 0)              AS txn_count
FROM public.budgets b
FULL OUTER JOIN public.v_spent_by_category_month s
  ON  b.year        = s.year
  AND b.month       = s.month
  AND b.category_id = s.category_id
  AND b.visibility  = s.visibility;


-- ── 4. v_median_spend_3m_by_category ─────────────────────────
-- Mediana de gasto mensual por (category_id, visibility)
-- sobre los 3 meses completos anteriores al mes actual.
-- Hereda exclusión de transferencias vía v_spent_by_category_month.
--
-- months_with_data: cuántos meses tuvieron gasto en esa categoría.
-- Si months_with_data < 3 → frontend usa fallback 0 con copy editorial.
-- No zero-fill deliberado: si una categoría no tuvo gasto un mes,
-- no se genera fila de 0; eso hace que months_with_data < 3 dispare
-- el fallback conservadoramente.

CREATE OR REPLACE VIEW public.v_median_spend_3m_by_category
WITH (security_invoker = TRUE) AS
WITH monthly_spend AS (
  SELECT
    category_id,
    visibility,
    spent
  FROM public.v_spent_by_category_month
  WHERE make_date(year, month, 1)
          >= (date_trunc('month', CURRENT_DATE::timestamp)
                - INTERVAL '3 months')::date
    AND make_date(year, month, 1)
          <   date_trunc('month', CURRENT_DATE::timestamp)::date
)
SELECT
  category_id,
  visibility,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY spent)  AS median_spent,
  COUNT(*)                                             AS months_with_data
FROM monthly_spend
GROUP BY category_id, visibility;


-- ── 5. v_median_income_3m ─────────────────────────────────────
-- Mediana de ingreso neto mensual por user_id,
-- últimos 3 meses completos anteriores al mes actual.
-- RLS de incomes (user_id = auth.uid()) aplica vía security_invoker:
-- cada usuario solo ve sus propios ingresos.
--
-- months_with_data < 3 → frontend usa fallback 0.
-- Uso: ingreso esperado para planner ZBB scope personal.
-- Scope compartido → valor manual en localStorage (Configuración Fase 5).

CREATE OR REPLACE VIEW public.v_median_income_3m
WITH (security_invoker = TRUE) AS
WITH monthly_income AS (
  SELECT
    user_id,
    SUM(net_amount)  AS monthly_net
  FROM public.incomes
  WHERE date >= (date_trunc('month', CURRENT_DATE::timestamp)
                   - INTERVAL '3 months')::date
    AND date <   date_trunc('month', CURRENT_DATE::timestamp)::date
  GROUP BY
    user_id,
    EXTRACT(YEAR  FROM date)::int,
    EXTRACT(MONTH FROM date)::int
)
SELECT
  user_id,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY monthly_net)  AS median_monthly_income,
  COUNT(*)                                                   AS months_with_data
FROM monthly_income
GROUP BY user_id;
