-- T-019 · v_spent_by_category_month: excluir nature='inversion'
-- Antes solo excluía 'transferencia' con IS DISTINCT FROM (preservaba NULL).
-- Ahora excluye también 'inversion', manteniendo el mismo comportamiento para NULL:
--   (t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))
-- Columnas, joins, agregaciones y nombres de salida: sin cambios.

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
