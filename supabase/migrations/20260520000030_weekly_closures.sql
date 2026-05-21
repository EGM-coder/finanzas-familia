-- ============================================================
-- Migración 30 — weekly_closures (Fase 4 · Control)
-- 20 may 2026
--
-- Cierre semanal persistido.
-- UNIQUE(week_start, scope). CHECK(week_end = week_start + 6).
-- RLS: scope IN ('privada_'||user_role(), 'compartida').
-- Sin política DELETE (integridad histórica · §9 invariante).
--
-- Nota: CHECK(week_end = week_start + 6) garantiza 7 días pero no
-- que week_start sea lunes. La garantía viene del código de inserción
-- via date_trunc('week'). En V2 se puede blindar con EXTRACT(ISODOW).
-- ============================================================

CREATE TABLE public.weekly_closures (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start     date           NOT NULL,
  week_end       date           NOT NULL,
  scope          text           NOT NULL
                   CHECK (scope IN ('privada_eric', 'privada_ana', 'compartida')),
  total_spent    numeric(12,2)  NOT NULL,
  total_budget   numeric(12,2)  NOT NULL,
  semaforo       text           NOT NULL
                   CHECK (semaforo IN ('verde', 'ambar', 'rojo')),
  top_deviations jsonb          NOT NULL DEFAULT '[]'::jsonb,
  insights       jsonb          NOT NULL DEFAULT '[]'::jsonb,
  closed_at      timestamptz    NOT NULL DEFAULT now(),
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT weekly_closures_unique_week_scope
    UNIQUE (week_start, scope),
  CONSTRAINT weekly_closures_week_end_check
    CHECK (week_end = week_start + 6)
);

CREATE TRIGGER trg_weekly_closures_updated_at
  BEFORE UPDATE ON public.weekly_closures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.weekly_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY weekly_closures_select ON public.weekly_closures
  FOR SELECT
  USING (scope IN ('privada_' || public.user_role(), 'compartida'));

CREATE POLICY weekly_closures_insert ON public.weekly_closures
  FOR INSERT
  WITH CHECK (scope IN ('privada_' || public.user_role(), 'compartida'));

CREATE POLICY weekly_closures_update ON public.weekly_closures
  FOR UPDATE
  USING     (scope IN ('privada_' || public.user_role(), 'compartida'))
  WITH CHECK (scope IN ('privada_' || public.user_role(), 'compartida'));

GRANT SELECT, INSERT, UPDATE ON public.weekly_closures TO authenticated;

CREATE INDEX weekly_closures_week_start_idx
  ON public.weekly_closures (week_start DESC);

CREATE INDEX weekly_closures_scope_week_start_idx
  ON public.weekly_closures (scope, week_start DESC);
