-- 20260701000065_fn_close_week_discrecional.sql
-- D-024: el semáforo del cierre juzga solo gasto discrecional vs habitual.
-- fijo_recurrente, traspasos, inversiones y gasto de proyecto quedan fuera del JUICIO.
-- total_spent sigue reflejando todo el gasto real.
-- Categorías sin histórico en la ventana de 8 semanas quedan fuera del ratio y de top_deviations.
--
-- (1) Nueva vista v_discretionary_spend_by_category_week:
--     igual que v_spent_by_category_week + AND t.nature IS DISTINCT FROM 'fijo_recurrente'.
--     NULL se incluye (IS DISTINCT FROM 'fijo_recurrente' = true para NULL).
--     extraordinario se incluye (desviación real si tiene histórico).
-- (2) fn_close_week:
--     - total_spent: sin cambios (v_spent_by_category_week).
--     - baseline_weeks, total_habitual, disc_spent_for_ratio, semaforo, top_deviations:
--       leen v_discretionary_spend_by_category_week.
--     - INNER JOIN en total_habitual y top_deviations: excluye automáticamente cats sin histórico.
--     - semaforo usa v_disc_spent_for_ratio / v_total_habitual (no v_total_spent).
-- (3) P-022: REVOKE FROM PUBLIC + GRANT service_role.

-- ── (1) v_discretionary_spend_by_category_week ───────────────────────────────────────

CREATE VIEW public.v_discretionary_spend_by_category_week
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
    AND  t.project_id   IS NULL                       -- D-023
    AND  t.nature       IS DISTINCT FROM 'fijo_recurrente'  -- D-024
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
    AND  t.project_id   IS NULL                       -- D-023
    AND  t.nature       IS DISTINCT FROM 'fijo_recurrente'  -- D-024
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
  'Excluye: nature IN (transferencia, inversion), superseded_by IS NOT NULL (T-036), '
  'project_id IS NOT NULL (D-023), nature = fijo_recurrente (D-024). '
  'NULL se incluye (pendiente de clasificar = discrecional por defecto). '
  'Basis del semáforo vs-habitual en fn_close_week. security_invoker.';

GRANT SELECT ON public.v_discretionary_spend_by_category_week TO authenticated;

-- ── (2) fn_close_week — reescritura parcial D-024 ────────────────────────────────────

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

  -- gasto total (todo, para total_spent en weekly_closures)
  v_total_spent           numeric(12,2);

  -- gasto discrecional vs habitual (para semáforo y top_deviations — D-024)
  v_disc_spent_for_ratio  numeric(12,2);  -- discrecional, solo cats CON histórico
  v_total_habitual        numeric(12,2);  -- suma medianas, mismo conjunto de cats
  v_baseline_weeks        integer;        -- semanas distintas discrecionales en las 8 previas
  v_semaforo              text;           -- NULL = sin histórico suficiente (< 4 semanas)
  v_top_deviations        jsonb;
  v_pct                   numeric;

  -- health gate
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

    -- ── total_spent (TODO el gasto — sin filtro de nature) ────────────────────────────
    -- total_spent refleja el gasto real de la semana; no se usa para el semáforo (D-024).
    SELECT COALESCE(SUM(spent), 0)
    INTO   v_total_spent
    FROM   public.v_spent_by_category_week
    WHERE  week_start = p_week_start
      AND  visibility = v_scope;

    -- ── baseline discrecional: semanas distintas en las 8 previas ────────────────────
    -- Usa v_discretionary_spend_by_category_week: si hay < 4 semanas de dato discrecional,
    -- no hay benchmark fiable → semaforo NULL.
    SELECT COUNT(DISTINCT week_start)
    INTO   v_baseline_weeks
    FROM   public.v_discretionary_spend_by_category_week
    WHERE  visibility  = v_scope
      AND  week_start >= (p_week_start - 56)
      AND  week_start <   p_week_start;

    -- ── disc_spent_for_ratio + total_habitual (INNER JOIN — solo cats CON histórico) ──
    -- D-024: categorías sin histórico discrecional en las 8 semanas previas quedan fuera
    -- del ratio y de top_deviations. El INNER JOIN las excluye automáticamente.
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

    -- ── semaforo ───────────────────────────────────────────────────────────────────────
    -- Ratio = gasto discrecional (cats con histórico) / habitual (mismas cats).
    -- Fijo_recurrente no contamina el ratio (D-024).
    -- Cats sin histórico quedan fuera; su gasto no provoca rojo.
    IF v_baseline_weeks < 4 THEN
      v_semaforo := NULL;                  -- histórico insuficiente: estado temprano legítimo
    ELSIF v_disc_spent_for_ratio = 0 THEN
      v_semaforo := 'verde';               -- sin gasto discrecional con benchmark → sin señal
    ELSIF v_total_habitual = 0 THEN
      v_semaforo := 'ambar';               -- safety net (no debería ocurrir con INNER JOIN)
    ELSE
      v_pct      := v_disc_spent_for_ratio / v_total_habitual;
      v_semaforo := CASE
        WHEN v_pct <= 1.00 THEN 'verde'
        WHEN v_pct <= 1.25 THEN 'ambar'
        ELSE                    'rojo'
      END;
    END IF;

    -- ── top_deviations: top 3 discrecionales con histórico, por delta DESC ────────────
    -- INNER JOIN: excluye automáticamente cats sin histórico discrecional (D-024).
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

    -- ── GATE DE SALUD ──────────────────────────────────────────────────────────────────

    -- 1. pendientes: salidas sin categorizar en la semana
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
      HAVING COUNT(*) > 1
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

    -- ── verdict de salud ───────────────────────────────────────────────────────────────
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

    -- ── UPSERT ─────────────────────────────────────────────────────────────────────────
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
  'total_spent = todo el gasto real (v_spent_by_category_week). '
  'Semáforo = gasto discrecional vs habitual (v_discretionary_spend_by_category_week, D-024): '
  'excluye fijo_recurrente, transferencias, inversiones, project_id y cats sin histórico. '
  'INNER JOIN en ratio y top_deviations → cats sin histórico quedan fuera del juicio. '
  'semaforo=NULL si baseline discrecional < 4 semanas. '
  'total_budget siempre NULL (presupuesto diferido, T-037 DORMIDA). '
  'Gate de salud: pendientes / sincronización bancaria / dups / actividad_cero. '
  'GRANT EXECUTE solo a service_role. D-020, D-022, D-023, D-024.';

-- ── (3) P-022: re-verificar permisos ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_close_week(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_close_week(date) TO service_role;

-- Verificación post-migración:
-- SELECT has_function_privilege('anon', 'public.fn_close_week(date)', 'EXECUTE'); → f
