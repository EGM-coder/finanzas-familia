-- 20260705000070_reconciliacion_backfill_deuda_tecnica.sql
-- Reconciliación contra extractos oficiales + decisiones de deuda técnica.
--
-- Secciones:
--   1. Extend transactions.source CHECK → añade 'backfill_extracto'
--   2. ADD COLUMN dup_reviewed_at, dup_review_note en transactions
--   3. Vistas de gasto: añade filtro source='psd2' (D-027, INTENCIONAL)
--   4. fn_pending_review_dups: excluye grupos totalmente revisados
--   5. fn_close_week: ídem en check inline de dups
--   6. Marcar grupos de dups históricos como revisados (decisiones Eric 05-06-jul-2026)
--   7. Backfill transacciones pre-PSD2 (14 Santander común + 8 Kutxabank)
--   8. Re-anclar initial_balance (Santander 803.77→1047.35, Kutxabank 2151.66→31703.54)
--   9. Liabilities: datos reales banca online Kutxabank 05-jul-2026
--  10. Holdings: normalizar ISIN BRK.B y NVDA
--  11. DELETE holding_prices huérfanas (BRK.B/NVDA isin IS NULL) — P-026 autorizado
--
-- Idempotencia: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING / UPDATE idempotente.

-- ── 1. Extend transactions.source CHECK ──────────────────────────────────────
-- 'backfill_extracto': transacciones de extractos oficiales pre-PSD2.
-- D-027: estas transacciones computan SOLO saldo; quedan fuera de spend analytics.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'transactions'
      AND c.conname = 'transactions_source_check'
      AND pg_get_constraintdef(c.oid) LIKE '%backfill_extracto%'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_source_check;
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
      CHECK (source = ANY (ARRAY[
        'manual'::text,
        'csv'::text,
        'psd2'::text,
        'gmail_parse'::text,
        'outlook_parse'::text,
        'backfill_extracto'::text
      ]));
  END IF;
END $$;

-- ── 2. Columnas de revisión de duplicados ────────────────────────────────────
-- dup_reviewed_at: marca que el grupo es un duplicado legítimo conocido.
-- dup_review_note: justificación humana fechada.
-- Sin tabla nueva: el estado vive en la fila (D-028).

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS dup_reviewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS dup_review_note  text;

-- ── 3. Vistas de gasto: source='psd2' filter (D-027) ─────────────────────────
-- INTENCIONAL: backfill_extracto, manual, csv quedan fuera del spend baseline.
-- Cero impacto en datos actuales (todos los registros vigentes son source='psd2').
-- Vista 3a: v_spent_by_category_week

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
  WHERE  s.amount        < 0
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id    IS NULL
    AND  t.source        = 'psd2'                        -- D-027
  UNION ALL
  -- Branch B: transacciones directas (sin splits)
  SELECT t.category_id,
         t.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  WHERE  t.amount        < 0
    AND  t.category_id   IS NOT NULL
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id    IS NULL
    AND  t.source        = 'psd2'                        -- D-027
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

GRANT SELECT ON public.v_spent_by_category_week TO authenticated;

-- Vista 3b: v_spent_by_category_month

CREATE OR REPLACE VIEW public.v_spent_by_category_month
WITH (security_invoker = true)
AS
WITH effective_rows AS (
  SELECT s.category_id,
         s.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  JOIN   public.transaction_splits s ON s.transaction_id = t.id
  WHERE  s.amount        < 0
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id    IS NULL
    AND  t.source        = 'psd2'                        -- D-027
  UNION ALL
  SELECT t.category_id,
         t.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  WHERE  t.amount        < 0
    AND  t.category_id   IS NOT NULL
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id    IS NULL
    AND  t.source        = 'psd2'                        -- D-027
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

GRANT SELECT ON public.v_spent_by_category_month TO authenticated;

-- Vista 3c: v_discretionary_spend_by_category_week

CREATE OR REPLACE VIEW public.v_discretionary_spend_by_category_week
WITH (security_invoker = true)
AS
WITH effective_rows AS (
  SELECT s.category_id,
         s.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  JOIN   public.transaction_splits s ON s.transaction_id = t.id
  WHERE  s.amount        < 0
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id    IS NULL
    AND  t.nature        IS DISTINCT FROM 'fijo_recurrente'
    AND  t.source        = 'psd2'                        -- D-027
  UNION ALL
  SELECT t.category_id,
         t.amount,
         t.date,
         t.account_id
  FROM   public.transactions t
  WHERE  t.amount        < 0
    AND  t.category_id   IS NOT NULL
    AND  (t.nature IS NULL OR t.nature <> ALL (ARRAY['transferencia'::text, 'inversion'::text]))
    AND  t.superseded_by IS NULL
    AND  t.project_id    IS NULL
    AND  t.nature        IS DISTINCT FROM 'fijo_recurrente'
    AND  t.source        = 'psd2'                        -- D-027
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

COMMENT ON VIEW public.v_discretionary_spend_by_category_week IS
  'Gasto discrecional por categoría y semana ISO. '
  'Excluye: nature IN (transferencia, inversion), superseded_by IS NOT NULL, '
  'project_id IS NOT NULL (D-023), nature = fijo_recurrente (D-024), '
  'source != psd2 (D-027: backfill y manual no contaminan baseline). '
  'security_invoker.';

GRANT SELECT ON public.v_discretionary_spend_by_category_week TO authenticated;

-- ── 4. fn_pending_review_dups: excluir grupos totalmente revisados ────────────
-- Un grupo desaparece cuando TODAS sus filas tienen dup_reviewed_at IS NOT NULL.

CREATE OR REPLACE FUNCTION public.fn_pending_review_dups()
RETURNS TABLE(account_name text, txn_date date, amount numeric, description text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT a.name, t.date, t.amount, t.description, count(*)
  FROM   public.transactions t
  JOIN   public.accounts     a ON a.id = t.account_id
  WHERE  t.source          = 'psd2'
    AND  t.superseded_by  IS NULL
  GROUP BY a.name, t.date, t.amount, t.description
  HAVING count(*) > 1
     AND count(*) FILTER (WHERE t.dup_reviewed_at IS NULL) > 0
  ORDER BY t.date DESC;
$$;

COMMENT ON FUNCTION public.fn_pending_review_dups() IS
  'Grupos de duplicados PSD2 ambiguos pendientes de revisión humana. '
  'Excluye grupos donde TODAS las filas tienen dup_reviewed_at IS NOT NULL (D-028). '
  'INVOKER: respeta RLS B2.';

-- ── 5. fn_close_week: dup inline check con dup_reviewed_at filter ─────────────
-- Mismo criterio que fn_pending_review_dups. Solo afecta cierres retroactivos
-- de semanas con dups ya revisados (e.g. sem. de mar/abr-2026).

CREATE OR REPLACE FUNCTION public.fn_close_week(p_week_start date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_week_end              date;
  v_scope                 text;
  v_scopes                text[] := ARRAY['privada_eric', 'privada_ana', 'compartida'];

  v_total_spent           numeric(12,2);
  v_disc_spent_for_ratio  numeric(12,2);
  v_total_habitual        numeric(12,2);
  v_baseline_weeks        integer;
  v_semaforo              text;
  v_top_deviations        jsonb;
  v_pct                   numeric;

  v_pendientes            integer;
  v_has_psd2              boolean;
  v_max_txn_date          date;
  v_psd2_fresco           boolean;
  v_dups                  integer;
  v_txns_this_week        integer;
  v_avg_hist              numeric;
  v_cero_sospechoso       boolean;
  v_data_health           text;
  v_health_parts          text[];
  v_health_reason         text;
BEGIN
  v_week_end := p_week_start + 6;

  FOREACH v_scope IN ARRAY v_scopes LOOP

    -- total_spent (TODO el gasto — sin filtro de nature)
    SELECT COALESCE(SUM(spent), 0)
    INTO   v_total_spent
    FROM   public.v_spent_by_category_week
    WHERE  week_start = p_week_start
      AND  visibility = v_scope;

    -- baseline discrecional: semanas distintas en las 8 previas
    SELECT COUNT(DISTINCT week_start)
    INTO   v_baseline_weeks
    FROM   public.v_discretionary_spend_by_category_week
    WHERE  visibility  = v_scope
      AND  week_start >= (p_week_start - 56)
      AND  week_start <   p_week_start;

    -- disc_spent_for_ratio + total_habitual (INNER JOIN — solo cats CON histórico)
    SELECT
      COALESCE(SUM(tw.spent_week), 0),
      COALESCE(SUM(pw.habitual),   0)
    INTO
      v_disc_spent_for_ratio,
      v_total_habitual
    FROM (
      SELECT category_id, SUM(spent) AS spent_week
      FROM   public.v_discretionary_spend_by_category_week
      WHERE  visibility = v_scope
        AND  week_start = p_week_start
      GROUP BY category_id
    ) tw
    INNER JOIN (
      SELECT category_id,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY spent) AS habitual
      FROM   public.v_discretionary_spend_by_category_week
      WHERE  visibility  = v_scope
        AND  week_start >= (p_week_start - 56)
        AND  week_start <   p_week_start
      GROUP BY category_id
    ) pw ON pw.category_id = tw.category_id;

    -- semaforo
    IF v_baseline_weeks < 4 THEN
      v_semaforo := NULL;
    ELSIF v_disc_spent_for_ratio = 0 THEN
      v_semaforo := 'verde';
    ELSIF v_total_habitual = 0 THEN
      v_semaforo := 'ambar';
    ELSE
      v_pct      := v_disc_spent_for_ratio / v_total_habitual;
      v_semaforo := CASE
        WHEN v_pct <= 1.00 THEN 'verde'
        WHEN v_pct <= 1.25 THEN 'ambar'
        ELSE                    'rojo'
      END;
    END IF;

    -- top_deviations
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'category_id',   top3.cat_id,
        'category_name', top3.cat_name,
        'spent',         top3.spent,
        'habitual',      top3.habitual,
        'delta',         top3.delta
      ) ORDER BY top3.delta DESC
    ), '[]'::jsonb)
    INTO v_top_deviations
    FROM (
      SELECT
        tw.category_id                                    AS cat_id,
        c.name                                            AS cat_name,
        ROUND(tw.spent_week::numeric, 2)                  AS spent,
        ROUND(pw.habitual::numeric,   2)                  AS habitual,
        ROUND((tw.spent_week - pw.habitual)::numeric, 2)  AS delta
      FROM (
        SELECT category_id, SUM(spent) AS spent_week
        FROM   public.v_discretionary_spend_by_category_week
        WHERE  visibility = v_scope
          AND  week_start = p_week_start
        GROUP BY category_id
      ) tw
      INNER JOIN (
        SELECT category_id,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY spent) AS habitual
        FROM   public.v_discretionary_spend_by_category_week
        WHERE  visibility  = v_scope
          AND  week_start >= (p_week_start - 56)
          AND  week_start <   p_week_start
        GROUP BY category_id
      ) pw ON pw.category_id = tw.category_id
      JOIN public.categories c ON c.id = tw.category_id
      WHERE (tw.spent_week - pw.habitual) > 0
      ORDER BY delta DESC
      LIMIT 3
    ) top3;

    -- ── GATE DE SALUD ─────────────────────────────────────────────────────────

    -- 1. pendientes
    SELECT COUNT(*)
    INTO   v_pendientes
    FROM   public.transactions t
    JOIN   public.accounts     a ON a.id = t.account_id
    WHERE  a.visibility        = v_scope
      AND  t.amount            < 0
      AND  t.category_id      IS NULL
      AND  t.superseded_by    IS NULL
      AND  t.date BETWEEN p_week_start AND v_week_end;

    -- 2. psd2_fresco
    SELECT EXISTS(
      SELECT 1
      FROM   public.bank_account_links bal
      JOIN   public.accounts           a ON a.id = bal.account_id
      WHERE  a.visibility = v_scope
        AND  bal.is_active = true
    ) INTO v_has_psd2;

    IF v_has_psd2 THEN
      SELECT COALESCE(MAX(t.date), '1970-01-01'::date)
      INTO   v_max_txn_date
      FROM   public.transactions t
      JOIN   public.accounts     a ON a.id = t.account_id
      WHERE  a.visibility      = v_scope
        AND  t.source          = 'psd2'
        AND  t.superseded_by  IS NULL;

      v_psd2_fresco := (v_max_txn_date >= v_week_end)
        AND EXISTS (
          SELECT 1
          FROM   public.bank_account_links bal
          JOIN   public.bank_connections   bc ON bc.id = bal.bank_connection_id
          JOIN   public.accounts           a  ON a.id  = bal.account_id
          WHERE  a.visibility  = v_scope
            AND  bc.status     = 'active'
            AND  bal.is_active = true
        );
    ELSE
      v_psd2_fresco  := true;
      v_max_txn_date := v_week_end;
    END IF;

    -- 3. dups (inline — no llamar fn_pending_review_dups: es INVOKER)
    -- D-028: excluye grupos totalmente revisados (todas las filas con dup_reviewed_at IS NOT NULL)
    SELECT COUNT(*)
    INTO   v_dups
    FROM (
      SELECT 1
      FROM   public.transactions t
      JOIN   public.accounts     a ON a.id = t.account_id
      WHERE  t.source          = 'psd2'
        AND  t.superseded_by  IS NULL
        AND  a.visibility      = v_scope
        AND  t.date BETWEEN p_week_start AND v_week_end
      GROUP BY a.name, t.date, t.amount, t.description
      HAVING count(*) > 1
         AND count(*) FILTER (WHERE t.dup_reviewed_at IS NULL) > 0
    ) sub;

    -- 4. actividad_cero_sospechosa
    SELECT COUNT(*)
    INTO   v_txns_this_week
    FROM   public.transactions t
    JOIN   public.accounts     a ON a.id = t.account_id
    WHERE  a.visibility       = v_scope
      AND  t.amount           < 0
      AND  t.superseded_by   IS NULL
      AND  t.date BETWEEN p_week_start AND v_week_end;

    SELECT COALESCE(AVG(wk.cnt), 0)
    INTO   v_avg_hist
    FROM (
      SELECT COUNT(*) AS cnt
      FROM   public.transactions t2
      JOIN   public.accounts     a2 ON a2.id = t2.account_id
      WHERE  a2.visibility       = v_scope
        AND  t2.amount           < 0
        AND  t2.superseded_by   IS NULL
        AND  t2.date BETWEEN (p_week_start - 56) AND (p_week_start - 1)
      GROUP BY DATE_TRUNC('week', t2.date)
    ) wk;

    v_cero_sospechoso := (v_txns_this_week = 0 AND v_avg_hist > 0);

    -- verdict de salud
    v_health_parts := ARRAY[]::text[];
    v_data_health  := 'ok';

    IF NOT v_psd2_fresco THEN
      v_data_health := 'roto';
      IF v_max_txn_date = '1970-01-01'::date THEN
        v_health_parts := array_append(v_health_parts,
          'Sincronización bancaria sin movimientos registrados');
      ELSE
        v_health_parts := array_append(v_health_parts,
          'Sincronización bancaria sin actualizar desde ' || v_max_txn_date::text);
      END IF;
    END IF;

    IF v_pendientes > 0 THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := array_append(v_health_parts,
        v_pendientes::text || ' movimientos sin categorizar');
    END IF;

    IF v_dups > 0 THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := array_append(v_health_parts,
        v_dups::text || ' grupos de transacciones duplicadas');
    END IF;

    IF v_cero_sospechoso THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := array_append(v_health_parts,
        'Sin movimientos esta semana (inferior al histórico)');
    END IF;

    v_health_reason := CASE
      WHEN ARRAY_LENGTH(v_health_parts, 1) > 0
        THEN ARRAY_TO_STRING(v_health_parts, ' · ')
      ELSE NULL
    END;

    -- UPSERT
    INSERT INTO public.weekly_closures (
      week_start, week_end, scope,
      total_spent, total_budget, semaforo,
      top_deviations, insights,
      data_health, health_reason, closed_at
    ) VALUES (
      p_week_start, v_week_end, v_scope,
      v_total_spent, NULL, v_semaforo,
      v_top_deviations, '[]'::jsonb,
      v_data_health, v_health_reason, NOW()
    )
    ON CONFLICT (week_start, scope) DO UPDATE SET
      week_end       = EXCLUDED.week_end,
      total_spent    = EXCLUDED.total_spent,
      total_budget   = NULL,
      semaforo       = EXCLUDED.semaforo,
      top_deviations = EXCLUDED.top_deviations,
      data_health    = EXCLUDED.data_health,
      health_reason  = EXCLUDED.health_reason,
      closed_at      = EXCLUDED.closed_at,
      updated_at     = NOW();

  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.fn_close_week(date) IS
  'Calcula UPSERT del cierre semanal (3 scopes) para la semana que empieza en p_week_start. '
  'total_spent = todo el gasto real (v_spent_by_category_week, source=psd2). '
  'Semáforo = gasto discrecional vs habitual (v_discretionary_spend_by_category_week, D-024). '
  'Gate de salud: pendientes / psd2_fresco / dups no revisados (D-028) / actividad_cero. '
  'GRANT EXECUTE solo a service_role. D-020, D-022, D-023, D-024, D-027, D-028.';

-- P-022: re-verificar permisos
REVOKE EXECUTE ON FUNCTION public.fn_close_week(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_close_week(date) TO service_role;

-- ── 6. Marcar grupos de dups históricos como revisados ───────────────────────
-- Decisiones humanas de Eric, fechadas, registradas con nota permanente.
-- Idempotente: WHERE dup_reviewed_at IS NULL.

-- 6a. IBERIA −130.25 ×3 · 02-abr · Tarjeta Santander Ana
--     Tres billetes reales para tres personas (Eric, Ana, y un tercero).
UPDATE public.transactions
SET dup_reviewed_at = '2026-07-06T00:00:00Z',
    dup_review_note = 'Tres billetes reales para tres personas — confirmado Eric 06-jul-2026'
WHERE id IN (
  '95b3c4bd-43b7-4d00-8d74-50c6458d859b',
  'acf4d263-804f-40f1-9117-3079e5b3b722',
  '984bd2dc-3a41-4cf1-af3d-97408bc22ac2'
)
  AND dup_reviewed_at IS NULL;

-- 6b. Cuartteto 870 · 04-mar · Kutxabank
--     TRANSF −870 ×2 + ANUL +870 ×2: dos intentos de transferencia, ambos anulados, neto cero.
UPDATE public.transactions
SET dup_reviewed_at = '2026-07-05T00:00:00Z',
    dup_review_note = 'Dos intentos de transferencia, ambos anulados, neto cero — confirmado Eric 05-jul-2026'
WHERE id IN (
  'd8e44565-34c3-4eec-a100-94fcf5863376',
  '9917916b-cbe9-4a09-af5d-a907c73aab59',
  '2da5fd8f-2171-4282-b5d6-ec2264fb4615',
  'ca199b5f-8671-4b38-9a20-42f6a8e99a72'
)
  AND dup_reviewed_at IS NULL;

-- 6c. Fundación Maris −10 ×2 · 05-mar · Tarjeta Santander Ana
--     Dos cuotas reales, una por hijo (Leo y Biel).
UPDATE public.transactions
SET dup_reviewed_at = '2026-07-06T00:00:00Z',
    dup_review_note = 'Dos cuotas reales, una por hijo (Leo y Biel) — confirmado Eric 06-jul-2026, pendiente ratificar con Ana'
WHERE id IN (
  'b77914cf-ca14-401f-a23d-cdead0fe04d1',
  '30afb0f0-211a-4c7d-ab86-15435896f88d'
)
  AND dup_reviewed_at IS NULL;

-- ── 7. Backfill transacciones pre-PSD2 ───────────────────────────────────────
-- source='backfill_extracto': excluidas de spend analytics (D-027).
-- ON CONFLICT (account_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
--   → aprovecha el índice parcial transactions_external_id_unique.
-- nature=NULL, category_id=NULL: clasificar en /control.

-- 7a. Santander común (account_id: d379e699-79fa-4987-ae64-308fb21b518e, titular=compartido)
INSERT INTO public.transactions
  (account_id, date, amount, description, source, external_id, titular)
VALUES
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-02', -138.22, 'Recibo C P Avda Jorge Vigon 51',
   'backfill_extracto', 'bk_san_2026-02-02_1', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-02', -34.26, 'Compra Glovo 30jan, Barcelona',
   'backfill_extracto', 'bk_san_2026-02-02_2', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-03', 1480.00, 'Transferencia De Ana Ibanez Arrieta, Concepto Alquiler Febrero + Cun.',
   'backfill_extracto', 'bk_san_2026-02-03_1', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-04', -50.00, 'Transferencia A Favor De Disneyworld',
   'backfill_extracto', 'bk_san_2026-02-04_1', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-04', -753.00, 'Transferencia A Favor De Justa Camara Concepto: Alquiler',
   'backfill_extracto', 'bk_san_2026-02-04_2', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-04', -81.00, 'Recibo Just For Kids, S.l.',
   'backfill_extracto', 'bk_san_2026-02-04_3', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-06', -22.00, 'Recibo Waco Coffee Roasters S.l',
   'backfill_extracto', 'bk_san_2026-02-06_1', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-09', -35.30, 'Compra Internet En Terra Nostra, Logrono',
   'backfill_extracto', 'bk_san_2026-02-09_1', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-09', -106.68, 'Recibo Seral',
   'backfill_extracto', 'bk_san_2026-02-09_2', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-09', -127.80, 'Recibo C P Avda Jorge Vigon 51',
   'backfill_extracto', 'bk_san_2026-02-09_3', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-09', -96.12, 'Pago Movil En Alcampo Logrono',
   'backfill_extracto', 'bk_san_2026-02-09_4', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-09', -42.11, 'Compra Www.amazon, Luxembourg',
   'backfill_extracto', 'bk_san_2026-02-09_5', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-10', -122.41, 'Compra Www.amazon, Luxembourg',
   'backfill_extracto', 'bk_san_2026-02-10_1', 'compartido'),
  ('d379e699-79fa-4987-ae64-308fb21b518e', '2026-02-11', -114.68, 'Compra Internet En Cur Energia, Bilbao',
   'backfill_extracto', 'bk_san_2026-02-11_1', 'compartido')
ON CONFLICT (account_id, external_id) WHERE (external_id IS NOT NULL) DO NOTHING;

-- 7b. Kutxabank (account_id: 8d8ae9ef-f8ce-45f4-891c-f964af9f881a, titular=eric)
INSERT INTO public.transactions
  (account_id, date, amount, description, source, external_id, titular)
VALUES
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-01', -1498.71, 'TARJ.CRDTO 4921074003917310',
   'backfill_extracto', 'bk_kutxa_2026-02-01_1', 'eric'),
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-03', -2.99, 'RECIBO PayPal Europe S.a',
   'backfill_extracto', 'bk_kutxa_2026-02-03_1', 'eric'),
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-03', -27980.45, 'RECIBO VOLKSWAGEN BANK - liquidacion prestamo coche VW (refinanciado con prestamo Kutxabank ene-2026)',
   'backfill_extracto', 'bk_kutxa_2026-02-03_2', 'eric'),
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-04', -47.63, 'RECIBO WEWI MOBILE SL.',
   'backfill_extracto', 'bk_kutxa_2026-02-04_1', 'eric'),
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-04', -26.20, 'ENVIO BIZUM perretxico',
   'backfill_extracto', 'bk_kutxa_2026-02-04_2', 'eric'),
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-08', 81.50, 'ENVIO BIZUM Sin concepto',
   'backfill_extracto', 'bk_kutxa_2026-02-08_1', 'eric'),
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-10', -16.40, 'RECIBO PayPal Europe S.a',
   'backfill_extracto', 'bk_kutxa_2026-02-10_1', 'eric'),
  ('8d8ae9ef-f8ce-45f4-891c-f964af9f881a', '2026-02-11', -61.00, 'ENVIO BIZUM burgers goxas',
   'backfill_extracto', 'bk_kutxa_2026-02-11_1', 'eric')
ON CONFLICT (account_id, external_id) WHERE (external_id IS NOT NULL) DO NOTHING;

-- ── 8. Re-anclar initial_balance ──────────────────────────────────────────────
-- El saldo calculado (initial_balance + sum(txns activas)) no cambia:
--   Santander: +243.58 reancla compensa −243.58 de los nuevos movimientos.
--   Kutxabank: +29551.88 reancla compensa −29551.88 de los nuevos movimientos.
-- Verificado matemáticamente antes de la migración.

UPDATE public.accounts SET initial_balance = 1047.35 WHERE name = 'Santander común';
UPDATE public.accounts SET initial_balance = 31703.54 WHERE name = 'Kutxabank';

-- ── 9. Liabilities: datos reales banca online Kutxabank (05-jul-2026) ─────────

UPDATE public.liabilities
SET current_balance = 26549.29,
    monthly_payment = 388.93,
    notes = CASE
              WHEN notes NOT LIKE '%nº préstamo 8534400016%'
              THEN notes || ' nº préstamo 8534400016'
              ELSE notes
            END
WHERE id = 'f37347b0-5a65-4bfb-9e52-d1e1ecd6aa8e';

UPDATE public.liabilities
SET current_balance = 3010.55,
    monthly_payment = 237.72,
    notes = CASE
              WHEN notes NOT LIKE '%nº préstamo 8528944180%'
              THEN notes || ' nº préstamo 8528944180'
              ELSE notes
            END
WHERE id = '08a6a9bc-6f3f-4b36-a07f-558435bd848e';

-- ── 10. Holdings: normalizar ISIN BRK.B y NVDA (Trade Republic Eric) ─────────

UPDATE public.holdings
SET isin = 'US0846707026'
WHERE id = 'c6fabddf-29ec-4cb8-9026-50e2d9264dea';  -- BRK.B isin=NULL → US0846707026

UPDATE public.holdings
SET isin = 'US67066G1040'
WHERE id = 'a0d6692b-18f9-415f-ae69-6cc7ffe16ff7';  -- NVDA isin=NULL → US67066G1040

-- ── 11. DELETE holding_prices huérfanas ──────────────────────────────────────
-- P-026: autorizado explícitamente en el prompt de esta sesión.
-- Elimina la serie pre-ISIN (isin=NULL) de BRK.B y NVDA ahora que ambas
-- holdings apuntan a un ISIN real. La serie con ISIN correcto (105 filas cada una) permanece.

DELETE FROM public.holding_prices
WHERE ticker IN ('BRK.B', 'NVDA')
  AND isin IS NULL;

-- FIN migración 70 --
