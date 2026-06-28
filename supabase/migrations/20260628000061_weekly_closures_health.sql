-- 20260628000061_weekly_closures_health.sql
-- Cierre semanal automático + gate de salud.
-- (1) Columnas data_health + health_reason en weekly_closures (D-020).
-- (2) fn_close_week(date) SECURITY DEFINER: deterministas + health gate + UPSERT.
--     Deja insights='[]' — los escribe close_week.py (Pieza 2, fraseo LLM).
-- (3) Vista v_last_closure_health (INVOKER): último cierre por scope visible al usuario.
-- D-020: LLM solo frasea hechos calculados. Gate de salud antes de frasear. Sin green-false.

-- ── (1) ALTER weekly_closures ─────────────────────────────────────────────────────────

ALTER TABLE public.weekly_closures
  ADD COLUMN data_health  text NOT NULL DEFAULT 'ok'
    CHECK (data_health IN ('ok', 'parcial', 'roto')),
  ADD COLUMN health_reason text;

COMMENT ON COLUMN public.weekly_closures.data_health IS
  'ok=todos los checks superados; parcial=datos incompletos (pendientes/dups/sin presupuesto); roto=fuente del dato comprometida (PSD2 caído). D-020: consumidor gatea por salud antes de leer semaforo.';
COMMENT ON COLUMN public.weekly_closures.health_reason IS
  'Texto concatenado de causas activas, ej. "12 sin categorizar · PSD2 sin sincronizar desde 2026-06-14".';

-- ── (2) fn_close_week ────────────────────────────────────────────────────────────────

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
  v_total_budget      numeric(12,2);
  v_semaforo          text;
  v_top_deviations    jsonb;
  v_pct               numeric;

  -- health gate
  v_pendientes        integer;
  v_has_psd2          boolean;
  v_max_txn_date      date;
  v_psd2_fresco       boolean;
  v_dups              integer;
  v_budget_cob        boolean;
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
    -- fn es DEFINER → la vista INVOKER se evalúa como el owner (postgres/supabase_admin)
    -- que tiene acceso total. La función aplica el filtro de scope explícitamente.
    SELECT COALESCE(SUM(spent), 0)
    INTO   v_total_spent
    FROM   public.v_spent_by_category_week
    WHERE  week_start  = p_week_start
      AND  visibility  = v_scope;

    -- ── total_budget (prorrateo: semana ISO puede cruzar un mes) ──────────────────
    -- generate_series produce un día por fila; agrupamos por (year,month) y contamos días.
    SELECT COALESCE(
      SUM(b.amount_planned * s.days_in_seg::numeric / s.days_in_mo::numeric),
      0
    )
    INTO   v_total_budget
    FROM   public.budgets b
    JOIN (
      SELECT
        EXTRACT(year  FROM g.d)::int AS y,
        EXTRACT(month FROM g.d)::int AS m,
        COUNT(*)::int                AS days_in_seg,
        EXTRACT(day FROM (
          DATE_TRUNC('month', g.d) + INTERVAL '1 month' - INTERVAL '1 day'
        ))::int                      AS days_in_mo
      FROM generate_series(p_week_start, v_week_end, INTERVAL '1 day') g(d)
      GROUP BY
        EXTRACT(year  FROM g.d),
        EXTRACT(month FROM g.d),
        DATE_TRUNC('month', g.d)
    ) s ON b.year = s.y AND b.month = s.m
    WHERE b.visibility = v_scope;

    -- ── GATE DE SALUD ──────────────────────────────────────────────────────────────

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

    -- 2. psd2_fresco: solo relevante si el scope tiene cuentas con PSD2
    SELECT EXISTS(
      SELECT 1
      FROM   public.bank_account_links bal
      JOIN   public.accounts           a  ON a.id = bal.account_id
      WHERE  a.visibility = v_scope
        AND  bal.is_active = true
    ) INTO v_has_psd2;

    IF v_has_psd2 THEN
      SELECT COALESCE(MAX(t.date), '1970-01-01'::date)
      INTO   v_max_txn_date
      FROM   public.transactions t
      JOIN   public.accounts     a ON a.id = t.account_id
      WHERE  a.visibility       = v_scope
        AND  t.source           = 'psd2'
        AND  t.superseded_by   IS NULL;

      v_psd2_fresco := (v_max_txn_date >= v_week_end)
        AND EXISTS (
          SELECT 1
          FROM   public.bank_account_links bal
          JOIN   public.bank_connections   bc ON bc.id = bal.bank_connection_id
          JOIN   public.accounts           a  ON a.id  = bal.account_id
          WHERE  a.visibility   = v_scope
            AND  bc.status      = 'active'
            AND  bal.is_active  = true
        );
    ELSE
      v_psd2_fresco  := true;
      v_max_txn_date := v_week_end; -- PSD2 no aplica a este scope
    END IF;

    -- 3. dups: replico el filtro de fn_pending_review_dups inline
    --    (esa fn es SECURITY INVOKER; no llamarla desde DEFINER — ejecutaría como owner)
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

    -- 4. budget_cobertura
    v_budget_cob := (v_total_budget > 0);

    -- 5. actividad_cero_sospechosa: 0 salidas esta semana pero media histórica > 0
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
    v_health_parts := ARRAY[]::text[];
    v_data_health  := 'ok';

    IF NOT v_psd2_fresco THEN
      v_data_health  := 'roto';
      IF v_max_txn_date = '1970-01-01'::date THEN
        v_health_parts := v_health_parts || 'sin datos PSD2';
      ELSE
        v_health_parts := v_health_parts
          || ('PSD2 sin sincronizar desde ' || v_max_txn_date::text);
      END IF;
    END IF;

    IF v_pendientes > 0 THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := v_health_parts
        || (v_pendientes::text || ' movimientos sin categorizar');
    END IF;

    IF NOT v_budget_cob THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := v_health_parts || 'sin presupuesto configurado';
    END IF;

    IF v_dups > 0 THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := v_health_parts
        || (v_dups::text || ' grupos de duplicados PSD2');
    END IF;

    IF v_cero_sospechoso THEN
      IF v_data_health = 'ok' THEN v_data_health := 'parcial'; END IF;
      v_health_parts := v_health_parts || 'actividad cero (sospechoso)';
    END IF;

    v_health_reason := CASE
      WHEN ARRAY_LENGTH(v_health_parts, 1) > 0
        THEN ARRAY_TO_STRING(v_health_parts, ' · ')
      ELSE NULL
    END;

    -- ── semaforo ───────────────────────────────────────────────────────────────────
    -- D-020: semaforo SOLO es fiable cuando data_health='ok'.
    -- Si total_budget=0 → 'ambar' (neutro, sin presupuesto).
    IF v_total_budget = 0 THEN
      v_semaforo := 'ambar';
    ELSE
      v_pct      := v_total_spent / v_total_budget;
      v_semaforo := CASE
        WHEN v_pct <= 0.9 THEN 'verde'
        WHEN v_pct <= 1.0 THEN 'ambar'
        ELSE                    'rojo'
      END;
    END IF;

    -- ── top_deviations: top 3 categorías por abs(spent_semana − budget_prorrateado) ──
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'category_id',   cat_id,
        'category_name', cat_name,
        'spent',         spent,
        'budget',        budget,
        'delta',         delta
      ) ORDER BY delta DESC
    ), '[]'::jsonb)
    INTO v_top_deviations
    FROM (
      SELECT
        COALESCE(cs.category_id, cb.category_id)                              AS cat_id,
        c.name                                                                  AS cat_name,
        ROUND(COALESCE(cs.spent_week, 0)::numeric, 2)                          AS spent,
        ROUND(COALESCE(cb.prorrateado, 0)::numeric, 2)                         AS budget,
        ROUND(ABS(COALESCE(cs.spent_week,0) - COALESCE(cb.prorrateado,0))::numeric, 2) AS delta
      FROM (
        -- presupuesto prorrateado por categoría (misma lógica que total_budget)
        SELECT b.category_id,
               SUM(b.amount_planned * s.days_in_seg::numeric / s.days_in_mo::numeric) AS prorrateado
        FROM   public.budgets b
        JOIN (
          SELECT
            EXTRACT(year  FROM g.d)::int AS y,
            EXTRACT(month FROM g.d)::int AS m,
            COUNT(*)::int                AS days_in_seg,
            EXTRACT(day FROM (
              DATE_TRUNC('month', g.d) + INTERVAL '1 month' - INTERVAL '1 day'
            ))::int                      AS days_in_mo
          FROM generate_series(p_week_start, v_week_end, INTERVAL '1 day') g(d)
          GROUP BY
            EXTRACT(year  FROM g.d),
            EXTRACT(month FROM g.d),
            DATE_TRUNC('month', g.d)
        ) s ON b.year = s.y AND b.month = s.m
        WHERE  b.visibility = v_scope
        GROUP BY b.category_id
      ) cb
      FULL OUTER JOIN (
        SELECT category_id, SUM(spent) AS spent_week
        FROM   public.v_spent_by_category_week
        WHERE  week_start = p_week_start AND visibility = v_scope
        GROUP BY category_id
      ) cs ON cs.category_id = cb.category_id
      JOIN public.categories c ON c.id = COALESCE(cs.category_id, cb.category_id)
      ORDER BY delta DESC
      LIMIT 3
    ) top3;

    -- ── UPSERT ─────────────────────────────────────────────────────────────────────
    -- insights intencionalmente excluido del UPDATE: lo escribe close_week.py (Pieza 2).
    INSERT INTO public.weekly_closures (
      week_start, week_end, scope,
      total_spent, total_budget, semaforo,
      top_deviations, insights,
      data_health, health_reason, closed_at
    ) VALUES (
      p_week_start, v_week_end, v_scope,
      v_total_spent, ROUND(v_total_budget::numeric, 2), v_semaforo,
      v_top_deviations, '[]'::jsonb,
      v_data_health, v_health_reason, NOW()
    )
    ON CONFLICT (week_start, scope) DO UPDATE SET
      week_end       = EXCLUDED.week_end,
      total_spent    = EXCLUDED.total_spent,
      total_budget   = EXCLUDED.total_budget,
      semaforo       = EXCLUDED.semaforo,
      top_deviations = EXCLUDED.top_deviations,
      data_health    = EXCLUDED.data_health,
      health_reason  = EXCLUDED.health_reason,
      closed_at      = EXCLUDED.closed_at,
      updated_at     = NOW();
    -- insights no incluido en DO UPDATE → preservado si ya existía (Pieza 2 lo escribe)

  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.fn_close_week(date) IS
  'Calcula UPSERT del cierre semanal (3 scopes) para la semana que empieza en p_week_start. '
  'Escribe deterministas + data_health + health_reason. No toca insights (lo escribe close_week.py). '
  'GRANT solo a service_role. D-020.';

-- authenticated NO ejecuta esta función (cron = service_role).
GRANT EXECUTE ON FUNCTION public.fn_close_week(date) TO service_role;

-- ── (3) v_last_closure_health ─────────────────────────────────────────────────────────
-- INVOKER: el WHERE interior a weekly_closures hereda el RLS Grupo C por scope.
-- Eric ve privada_eric + compartida; Ana ve privada_ana + compartida.

CREATE OR REPLACE VIEW public.v_last_closure_health
WITH (security_invoker = true) AS
SELECT
  wc.scope,
  wc.week_start,
  wc.week_end,
  wc.semaforo,
  wc.data_health,
  wc.health_reason,
  wc.closed_at,
  (
    SELECT COUNT(*)
    FROM   public.weekly_closures bad
    WHERE  bad.scope       = wc.scope
      AND  bad.data_health IN ('parcial', 'roto')
      AND  bad.week_start  >= CURRENT_DATE - 84  -- últimas 12 semanas
  ) AS recent_bad_count
FROM public.weekly_closures wc
WHERE wc.week_start = (
  SELECT MAX(wc2.week_start)
  FROM   public.weekly_closures wc2
  WHERE  wc2.scope = wc.scope
);

GRANT SELECT ON public.v_last_closure_health TO authenticated;

COMMENT ON VIEW public.v_last_closure_health IS
  'Último cierre semanal por scope + recuento de cierres parcial/roto últimas 12 semanas. '
  'INVOKER: hereda RLS Grupo C de weekly_closures por scope.';
