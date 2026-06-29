-- 20260629000063_fn_close_week_vs_habitual.sql
-- D-022: semáforo del cierre semanal = gasto vs habitual (mediana 8 semanas por categoría).
-- Presupuesto diferido a su capa (módulo VIII, FY siguiente).
-- total_budget queda NULL en weekly_closures hasta entonces.
-- semaforo=NULL = histórico insuficiente (< 4 semanas con dato) — estado temprano legítimo, no error.
--
-- (1) Hacer semaforo y total_budget nullables.
-- (2) Reescribir fn_close_week: vs-habitual, sin budget_cobertura en gate.
-- (3) Re-verificar REVOKE FROM PUBLIC + GRANT service_role (P-022).

-- ── (1) Columnas nullables ────────────────────────────────────────────────────────────

ALTER TABLE public.weekly_closures ALTER COLUMN semaforo     DROP NOT NULL;
ALTER TABLE public.weekly_closures ALTER COLUMN total_budget DROP NOT NULL;

COMMENT ON COLUMN public.weekly_closures.semaforo IS
  'verde/ambar/rojo vs habitual (mediana 8 semanas por categoría, nivel agregado). '
  'NULL = histórico insuficiente (< 4 semanas con dato) — estado temprano legítimo, no error. '
  'Fiable SOLO si data_health=''ok''. D-020, D-022.';

COMMENT ON COLUMN public.weekly_closures.total_budget IS
  'NULL hasta que el módulo de Presupuesto se active (FY siguiente). '
  'D-022: presupuesto diferido; no es la base del cierre semanal. T-037 DORMIDA.';

-- ── (2) fn_close_week — reescritura vs-habitual ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_close_week(p_week_start date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_week_end          date;
  v_scope             text;
  v_scopes            text[] := ARRAY['privada_eric', 'privada_ana', 'compartida'];

  v_total_spent       numeric(12,2);
  v_total_habitual    numeric(12,2);
  v_baseline_weeks    integer;
  v_semaforo          text;        -- NULL = sin histórico suficiente (< 4 semanas)
  v_top_deviations    jsonb;
  v_pct               numeric;

  -- health gate
  v_pendientes        integer;
  v_has_psd2          boolean;
  v_max_txn_date      date;
  v_psd2_fresco       boolean;
  v_dups              integer;
  v_txns_this_week    integer;
  v_avg_hist          numeric;
  v_cero_sospechoso   boolean;
  v_data_health       text;
  v_health_parts      text[];
  v_health_reason     text;
BEGIN
  v_week_end := p_week_start + 6;

  FOREACH v_scope IN ARRAY v_scopes LOOP

    -- ── total_spent ────────────────────────────────────────────────────────────────
    SELECT COALESCE(SUM(spent), 0)
    INTO   v_total_spent
    FROM   public.v_spent_by_category_week
    WHERE  week_start = p_week_start
      AND  visibility = v_scope;

    -- ── baseline: semanas distintas con dato en las 8 anteriores ──────────────────
    SELECT COUNT(DISTINCT week_start)
    INTO   v_baseline_weeks
    FROM   public.v_spent_by_category_week
    WHERE  visibility  = v_scope
      AND  week_start >= (p_week_start - 56)
      AND  week_start <   p_week_start;

    -- ── total_habitual: suma de medianas de las categorías presentes esta semana ───
    -- percentile_cont(0.5) de las 8 semanas previas, solo para cats con gasto hoy.
    SELECT COALESCE(SUM(pw.habitual), 0)
    INTO   v_total_habitual
    FROM (
      SELECT category_id
      FROM   public.v_spent_by_category_week
      WHERE  visibility = v_scope
        AND  week_start = p_week_start
      GROUP BY category_id
    ) tw
    JOIN (
      SELECT category_id,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY spent) AS habitual
      FROM   public.v_spent_by_category_week
      WHERE  visibility  = v_scope
        AND  week_start >= (p_week_start - 56)
        AND  week_start <   p_week_start
      GROUP BY category_id
    ) pw ON pw.category_id = tw.category_id;

    -- ── semaforo ───────────────────────────────────────────────────────────────────
    -- NULL si histórico < 4 semanas (estado temprano legítimo, NO data_health=parcial).
    IF v_baseline_weeks < 4 THEN
      v_semaforo := NULL;
    ELSIF v_total_spent = 0 THEN
      v_semaforo := 'verde';
    ELSIF v_total_habitual = 0 THEN
      v_semaforo := 'ambar';   -- gasto presente pero sin habitual (categorías nuevas)
    ELSE
      v_pct      := v_total_spent / v_total_habitual;
      v_semaforo := CASE
        WHEN v_pct <= 1.00 THEN 'verde'
        WHEN v_pct <= 1.25 THEN 'ambar'
        ELSE                    'rojo'
      END;
    END IF;

    -- ── top_deviations: top 3 categorías por (spent − habitual) DESC con delta > 0 ─
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
        tw.category_id                                                        AS cat_id,
        c.name                                                                AS cat_name,
        ROUND(tw.spent_week::numeric, 2)                                      AS spent,
        ROUND(COALESCE(pw.habitual, 0)::numeric, 2)                           AS habitual,
        ROUND((tw.spent_week - COALESCE(pw.habitual, 0))::numeric, 2)         AS delta
      FROM (
        SELECT category_id, SUM(spent) AS spent_week
        FROM   public.v_spent_by_category_week
        WHERE  visibility = v_scope
          AND  week_start = p_week_start
        GROUP BY category_id
      ) tw
      LEFT JOIN (
        SELECT category_id,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY spent) AS habitual
        FROM   public.v_spent_by_category_week
        WHERE  visibility  = v_scope
          AND  week_start >= (p_week_start - 56)
          AND  week_start <   p_week_start
        GROUP BY category_id
      ) pw ON pw.category_id = tw.category_id
      JOIN public.categories c ON c.id = tw.category_id
      WHERE (tw.spent_week - COALESCE(pw.habitual, 0)) > 0
      ORDER BY delta DESC
      LIMIT 3
    ) top3;

    -- ── GATE DE SALUD ──────────────────────────────────────────────────────────────
    -- Eliminado: budget_cobertura (presupuesto no es la base del cierre — D-022).
    -- Mantenidos: pendientes / psd2_fresco / dups / actividad_cero_sospechosa.

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

    -- ── verdict ────────────────────────────────────────────────────────────────────
    -- health_reason: ninguna palabra prohibida (§4.5 Design System).
    v_health_parts := ARRAY[]::text[];
    v_data_health  := 'ok';

    IF NOT v_psd2_fresco THEN
      v_data_health := 'roto';
      IF v_max_txn_date = '1970-01-01'::date THEN
        v_health_parts := v_health_parts
          || 'Sincronización bancaria sin movimientos registrados';
      ELSE
        v_health_parts := v_health_parts
          || ('Sincronización bancaria sin actualizar desde ' || v_max_txn_date::text);
      END IF;
    END IF;

    IF v_pendientes > 0 THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := v_health_parts
        || (v_pendientes::text || ' movimientos sin categorizar');
    END IF;

    IF v_dups > 0 THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := v_health_parts
        || (v_dups::text || ' grupos de transacciones duplicadas');
    END IF;

    IF v_cero_sospechoso THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := v_health_parts
        || 'Sin movimientos esta semana (inferior al histórico)';
    END IF;

    v_health_reason := CASE
      WHEN ARRAY_LENGTH(v_health_parts, 1) > 0
        THEN ARRAY_TO_STRING(v_health_parts, ' · ')
      ELSE NULL
    END;

    -- ── UPSERT ─────────────────────────────────────────────────────────────────────
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
    -- insights excluido del DO UPDATE → preservado si ya existía (close_week.py lo escribe)

  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.fn_close_week(date) IS
  'Calcula UPSERT del cierre semanal (3 scopes) para la semana que empieza en p_week_start. '
  'Semáforo = gasto vs habitual (mediana 8 semanas por categoría, nivel agregado). D-022. '
  'semaforo=NULL si baseline < 4 semanas (estado temprano legítimo, no error de datos). '
  'total_budget siempre NULL (presupuesto diferido a módulo VIII, FY siguiente). '
  'Gate de salud: pendientes / sincronización bancaria / dups / actividad_cero (sin budget_cobertura). '
  'health_reason sin palabras prohibidas §4.5. Deja insights=[] — lo escribe close_week.py. '
  'GRANT EXECUTE solo a service_role. D-020, D-022.';

-- ── (3) Re-verificar permisos (P-022) ────────────────────────────────────────────────
-- CREATE OR REPLACE preserva GRANTs existentes, pero P-022 exige re-aplicar REVOKE explícito.
REVOKE EXECUTE ON FUNCTION public.fn_close_week(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_close_week(date) TO service_role;

-- Verificación post-migración (ejecutar manualmente):
-- SELECT has_function_privilege('anon', 'public.fn_close_week(date)', 'EXECUTE');
-- → debe devolver f
