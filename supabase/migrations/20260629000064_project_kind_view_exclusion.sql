-- 20260629000064_project_kind_view_exclusion.sql
-- D-023: el gasto con project_id queda fuera del basis de gasto-por-categoría.
-- Es un sobre transversal (proyecto/viaje/reforma), NO gasto habitual de categoría.
-- Mismo mecanismo que nature excluye traspasos: filtro sustractivo, sin romper shape.
--
-- (1) projects.kind — clasificación informativa del proyecto ('general' | 'viaje').
--     La exclusión de v_spent aplica a TODO project_id, independientemente del kind.
-- (2) v_spent_by_category_week: añadir AND t.project_id IS NULL en ambas ramas.
-- (3) v_spent_by_category_month: ídem (coherencia semanal↔mensual).
--     v_median_spend_3m_by_category y v_category_budget_status heredan el cambio.
-- (4) fn_close_week, Control, Planner: cambio sustractivo — no asumen presencia del
--     gasto de proyecto; el efecto buscado es que deje de contar como gasto de categoría.

-- ── (1) projects.kind ──────────────────────────────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN kind text NOT NULL DEFAULT 'general'
  CHECK (kind IN ('general', 'viaje'));

COMMENT ON COLUMN public.projects.kind IS
  'Clasificación informativa del proyecto. ''general'' = reforma/equipamiento/etc; ''viaje'' = viaje puntual. '
  'La exclusión de v_spent_by_category_* aplica a TODO project_id sin distinción de kind. D-023.';

-- ── (2) v_spent_by_category_week — añade AND t.project_id IS NULL ─────────────────────

CREATE OR REPLACE VIEW public.v_spent_by_category_week
WITH (security_invoker = true)
AS
WITH effective_rows AS (
  -- Branch A: transacciones con splits
  SELECT s.category_id,
         s.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  JOIN   public.transaction_splits s ON s.transaction_id = t.id
  WHERE  s.amount < 0
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id IS NULL          -- D-023: gasto de proyecto fuera del basis
  UNION ALL
  -- Branch B: transacciones directas (sin splits)
  SELECT t.category_id,
         t.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  WHERE  t.amount < 0
    AND  t.category_id IS NOT NULL
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id IS NULL          -- D-023: gasto de proyecto fuera del basis
    AND  NOT EXISTS (
           SELECT 1
           FROM   public.transaction_splits s
           WHERE  s.transaction_id = t.id
         )
)
SELECT
  date_trunc('week', r.date::timestamp without time zone)::date AS week_start,
  r.category_id,
  a.visibility,
  sum(abs(r.amount))  AS spent,
  count(*)            AS txn_count
FROM   effective_rows r
JOIN   public.accounts a ON a.id = r.account_id
GROUP BY
  date_trunc('week', r.date::timestamp without time zone)::date,
  r.category_id,
  a.visibility;

COMMENT ON VIEW public.v_spent_by_category_week IS
  'Gasto por categoría y semana ISO (lunes). Excluye: nature IN (transferencia, inversion), '
  'superseded_by IS NOT NULL (T-036), project_id IS NOT NULL (D-023). '
  'Basis del semáforo vs-habitual en fn_close_week (D-022). security_invoker.';

-- ── (3) v_spent_by_category_month — añade AND t.project_id IS NULL ────────────────────

CREATE OR REPLACE VIEW public.v_spent_by_category_month
WITH (security_invoker = true)
AS
WITH effective_rows AS (
  -- Branch A: transacciones con splits
  SELECT s.category_id,
         s.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  JOIN   public.transaction_splits s ON s.transaction_id = t.id
  WHERE  s.amount < 0
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id IS NULL          -- D-023: gasto de proyecto fuera del basis
  UNION ALL
  -- Branch B: transacciones directas (sin splits)
  SELECT t.category_id,
         t.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  WHERE  t.amount < 0
    AND  t.category_id IS NOT NULL
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id IS NULL          -- D-023: gasto de proyecto fuera del basis
    AND  NOT EXISTS (
           SELECT 1
           FROM   public.transaction_splits s
           WHERE  s.transaction_id = t.id
         )
)
SELECT
  EXTRACT(year  FROM r.date)::integer AS year,
  EXTRACT(month FROM r.date)::integer AS month,
  r.category_id,
  a.visibility,
  sum(abs(r.amount))  AS spent,
  count(*)            AS txn_count
FROM   effective_rows r
JOIN   public.accounts a ON a.id = r.account_id
GROUP BY
  EXTRACT(year  FROM r.date)::integer,
  EXTRACT(month FROM r.date)::integer,
  r.category_id,
  a.visibility;

COMMENT ON VIEW public.v_spent_by_category_month IS
  'Gasto por categoría y mes. Excluye: nature IN (transferencia, inversion) (T-019), '
  'superseded_by IS NOT NULL (T-036), project_id IS NOT NULL (D-023). '
  'Base de v_category_budget_status y v_median_spend_3m_by_category. security_invoker.';
