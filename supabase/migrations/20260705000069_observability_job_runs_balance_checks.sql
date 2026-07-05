-- 20260705000069_observability_job_runs_balance_checks.sql
-- D-026: todo saldo calculado debe tener ancla externa diaria;
--        toda automatización reporta su propio pulso.
--
-- Dos tablas:
--   job_runs       — pulso de cada job (sync_psd2, update_prices, …)
--   balance_checks — saldo real del banco por cuenta PSD2 (ancla diaria)
--
-- RLS: lectura authenticated (GRANT + policy — INV-6).
--      escritura: solo service_role (BYPASSRLS; no se añaden policies de escritura).

-- ── 1. job_runs ──────────────────────────────────────────────────────────────

CREATE TABLE public.job_runs (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name  text        NOT NULL,
  run_at    timestamptz NOT NULL DEFAULT now(),
  status    text        NOT NULL CHECK (status IN ('ok', 'error', 'partial')),
  detail    jsonb
);

CREATE INDEX job_runs_name_at_idx ON public.job_runs (job_name, run_at DESC);

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

-- INV-6: GRANT de tabla Y policy son ambos obligatorios
GRANT SELECT ON public.job_runs TO authenticated;

CREATE POLICY "job_runs_select" ON public.job_runs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── 2. balance_checks ────────────────────────────────────────────────────────

CREATE TABLE public.balance_checks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES public.accounts(id),
  check_date   date        NOT NULL,
  real_balance numeric     NOT NULL,
  source       text        NOT NULL DEFAULT 'enable_banking',
  UNIQUE (account_id, check_date)
);

ALTER TABLE public.balance_checks ENABLE ROW LEVEL SECURITY;

-- INV-6: GRANT + policy
GRANT SELECT ON public.balance_checks TO authenticated;

-- Filtro de visibilidad idéntico al de cuentas: privada_{user_role} o compartida.
-- Impide que Eric vea balance de BBVA (Ana) y viceversa con Kutxabank.
CREATE POLICY "balance_checks_select" ON public.balance_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_id
        AND (
          a.visibility = 'privada_' || public.user_role()
          OR a.visibility = 'compartida'
        )
    )
  );
