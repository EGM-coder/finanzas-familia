-- ============================================================
-- Migración 31 — monthly_closures (Fase 4 · Control)
-- 20 may 2026
--
-- Cierre mensual persistido.
-- UNIQUE(year, month, scope). CHECK(month BETWEEN 1 AND 12).
-- comparison_with_prev_month nullable: null en primer mes.
-- RLS: scope IN ('privada_'||user_role(), 'compartida').
-- Sin política DELETE (integridad histórica · §9 invariante).
-- ============================================================

CREATE TABLE public.monthly_closures (
  id                         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  year                       int            NOT NULL,
  month                      int            NOT NULL
                               CHECK (month BETWEEN 1 AND 12),
  scope                      text           NOT NULL
                               CHECK (scope IN ('privada_eric', 'privada_ana', 'compartida')),
  total_spent                numeric(12,2)  NOT NULL,
  total_budget               numeric(12,2)  NOT NULL,
  semaforo                   text           NOT NULL
                               CHECK (semaforo IN ('verde', 'ambar', 'rojo')),
  top_deviations             jsonb          NOT NULL DEFAULT '[]'::jsonb,
  category_breakdown         jsonb          NOT NULL DEFAULT '[]'::jsonb,
  comparison_with_prev_month jsonb          NULL,
  insights                   jsonb          NOT NULL DEFAULT '[]'::jsonb,
  closed_at                  timestamptz    NOT NULL DEFAULT now(),
  created_at                 timestamptz    NOT NULL DEFAULT now(),
  updated_at                 timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT monthly_closures_unique_year_month_scope
    UNIQUE (year, month, scope)
);

CREATE TRIGGER trg_monthly_closures_updated_at
  BEFORE UPDATE ON public.monthly_closures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY monthly_closures_select ON public.monthly_closures
  FOR SELECT
  USING (scope IN ('privada_' || public.user_role(), 'compartida'));

CREATE POLICY monthly_closures_insert ON public.monthly_closures
  FOR INSERT
  WITH CHECK (scope IN ('privada_' || public.user_role(), 'compartida'));

CREATE POLICY monthly_closures_update ON public.monthly_closures
  FOR UPDATE
  USING     (scope IN ('privada_' || public.user_role(), 'compartida'))
  WITH CHECK (scope IN ('privada_' || public.user_role(), 'compartida'));

GRANT SELECT, INSERT, UPDATE ON public.monthly_closures TO authenticated;

CREATE INDEX monthly_closures_year_month_idx
  ON public.monthly_closures (year DESC, month DESC);

CREATE INDEX monthly_closures_scope_year_month_idx
  ON public.monthly_closures (scope, year DESC, month DESC);
