-- mig-46 · Excluir transacciones superseded de todas las vistas de agregación (T-036)
--
-- Añade AND t.superseded_by IS NULL a cada rama que toca transactions.
-- v_category_budget_status y v_median_spend_3m_by_category heredan el filtro
-- a través de v_spent_by_category_month (no se tocan directamente).
-- v_purchase_commitments: no agrega importes de transactions, sin cambio.
-- v_median_income_3m: lee incomes, no transactions, sin cambio.
-- account_balances_full: excluida por diseño (balance = saldo bancario directo).


-- ── 1. v_spent_by_category_month ──────────────────────────────
-- Definición vigente desde mig-29 + T-019 (mig-530_29).
-- Añade superseded_by IS NULL a ambas ramas.

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
    AND (t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))
    AND t.superseded_by IS NULL

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
    AND (t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))
    AND t.superseded_by IS NULL
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


-- ── 2. v_spent_by_category_week ───────────────────────────────
-- Definición vigente desde mig-29.
-- Añade superseded_by IS NULL a ambas ramas.

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
    AND (t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))
    AND t.superseded_by IS NULL

  UNION ALL

  SELECT
    t.category_id,
    t.amount,
    t.date,
    t.account_id
  FROM public.transactions t
  WHERE t.amount < 0
    AND t.category_id IS NOT NULL
    AND (t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))
    AND t.superseded_by IS NULL
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


-- ── 3. v_fixed_expenses_observed ──────────────────────────────
-- Definición vigente desde mig-34.
-- Añade superseded_by IS NULL al WHERE.

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
  AND t.superseded_by IS NULL
GROUP BY
  t.counterparty,
  EXTRACT(YEAR  FROM t.date),
  EXTRACT(MONTH FROM t.date),
  a.visibility;
