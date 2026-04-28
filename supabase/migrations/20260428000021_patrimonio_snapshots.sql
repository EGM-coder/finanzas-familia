-- ============================================================================
-- Migración 21 — patrimonio_snapshots
-- Columnas alineadas con vista patrimonio_neto (migración 20):
--   liquidos_y_holdings, inmuebles, activos_total, deudas_activas,
--   deudas_proyectadas, patrimonio_neto_actual, patrimonio_neto_si_firmara_hoy,
--   stock_options_intrinsic
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patrimonio_snapshots (
  snapshot_date                   DATE          PRIMARY KEY,
  liquidos_y_holdings             NUMERIC(14,2) NOT NULL,
  inmuebles                       NUMERIC(14,2) NOT NULL,
  activos_total                   NUMERIC(14,2) NOT NULL,
  deudas_activas                  NUMERIC(14,2) NOT NULL,
  deudas_proyectadas              NUMERIC(14,2) NOT NULL,
  patrimonio_neto_actual          NUMERIC(14,2) NOT NULL,
  patrimonio_neto_si_firmara_hoy  NUMERIC(14,2) NOT NULL,
  stock_options_intrinsic         NUMERIC(14,2) NOT NULL,
  created_at                      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.patrimonio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patrimonio_snapshots_select" ON public.patrimonio_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "patrimonio_snapshots_insert" ON public.patrimonio_snapshots
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "patrimonio_snapshots_update" ON public.patrimonio_snapshots
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.capture_patrimonio_snapshot()
RETURNS public.patrimonio_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.patrimonio_snapshots;
BEGIN
  INSERT INTO public.patrimonio_snapshots (
    snapshot_date,
    liquidos_y_holdings,
    inmuebles,
    activos_total,
    deudas_activas,
    deudas_proyectadas,
    patrimonio_neto_actual,
    patrimonio_neto_si_firmara_hoy,
    stock_options_intrinsic
  )
  SELECT
    CURRENT_DATE,
    p.liquidos_y_holdings,
    p.inmuebles,
    p.activos_total,
    p.deudas_activas,
    p.deudas_proyectadas,
    p.patrimonio_neto_actual,
    p.patrimonio_neto_si_firmara_hoy,
    p.stock_options_intrinsic
  FROM public.patrimonio_neto p
  ON CONFLICT (snapshot_date) DO UPDATE SET
    liquidos_y_holdings            = EXCLUDED.liquidos_y_holdings,
    inmuebles                      = EXCLUDED.inmuebles,
    activos_total                  = EXCLUDED.activos_total,
    deudas_activas                 = EXCLUDED.deudas_activas,
    deudas_proyectadas             = EXCLUDED.deudas_proyectadas,
    patrimonio_neto_actual         = EXCLUDED.patrimonio_neto_actual,
    patrimonio_neto_si_firmara_hoy = EXCLUDED.patrimonio_neto_si_firmara_hoy,
    stock_options_intrinsic        = EXCLUDED.stock_options_intrinsic,
    created_at                     = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.capture_patrimonio_snapshot() TO authenticated;

CREATE OR REPLACE VIEW public.patrimonio_snapshot_with_delta AS
WITH latest AS (
  SELECT * FROM public.patrimonio_snapshots
  ORDER BY snapshot_date DESC LIMIT 1
),
ref AS (
  SELECT * FROM public.patrimonio_snapshots
  WHERE snapshot_date <= CURRENT_DATE - INTERVAL '30 days'
  ORDER BY snapshot_date DESC LIMIT 1
)
SELECT
  l.snapshot_date,
  l.patrimonio_neto_actual,
  l.patrimonio_neto_si_firmara_hoy,
  l.liquidos_y_holdings,
  l.inmuebles,
  l.activos_total,
  l.deudas_activas,
  l.deudas_proyectadas,
  l.stock_options_intrinsic,
  r.snapshot_date                                                              AS ref_date,
  l.patrimonio_neto_actual         - r.patrimonio_neto_actual                  AS delta_neto_actual,
  l.patrimonio_neto_si_firmara_hoy - r.patrimonio_neto_si_firmara_hoy          AS delta_neto_si_firmara,
  l.liquidos_y_holdings            - r.liquidos_y_holdings                     AS delta_liquidos,
  l.stock_options_intrinsic        - r.stock_options_intrinsic                 AS delta_stock_options,
  CASE WHEN r.patrimonio_neto_actual IS NULL OR r.patrimonio_neto_actual = 0 THEN NULL
       ELSE ROUND(((l.patrimonio_neto_actual - r.patrimonio_neto_actual) / r.patrimonio_neto_actual * 100)::numeric, 2)
  END AS delta_neto_actual_pct,
  CASE WHEN r.stock_options_intrinsic IS NULL OR r.stock_options_intrinsic = 0 THEN NULL
       ELSE ROUND(((l.stock_options_intrinsic - r.stock_options_intrinsic) / r.stock_options_intrinsic * 100)::numeric, 2)
  END AS delta_stock_options_pct,
  EXTRACT(EPOCH FROM (now() - l.created_at)) / 60 AS minutes_since_capture
FROM latest l
LEFT JOIN ref r ON TRUE;

SELECT public.capture_patrimonio_snapshot();
