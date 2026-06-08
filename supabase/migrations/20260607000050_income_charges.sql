-- ============================================================
-- Migración 50 — income_charges + v_income_reconciliation
-- 07 jun 2026
--
-- Capa de datos del módulo «Casado Nóminas» (FASE 1 de 3).
-- Espeja purchase_order_charges pero con UNIQUE (income_id, transaction_id)
-- en lugar de UNIQUE (transaction_id): un mismo depósito puede vincularse
-- a varios incomes del mismo mes (ej. mayo: 1 depósito ↔ nomina_mensual + bonus).
--
-- INV-6 aplicado: GRANT + policy por separado para las 4 operaciones.
-- Sin este par, RLS deny-by-default bloquea silenciosamente (lección mig 37/42/44).
-- ============================================================

-- ── 1. Tabla de enlace income_charges ───────────────────────

CREATE TABLE public.income_charges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id      uuid        NOT NULL
                               REFERENCES public.incomes(id)
                               ON DELETE RESTRICT,
  transaction_id uuid        NOT NULL
                               REFERENCES public.transactions(id)
                               ON DELETE RESTRICT,
  match_method   text        NOT NULL
                               CHECK (match_method IN ('auto','manual','confirmed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (income_id, transaction_id)   -- M:N por par; NO UNIQUE solo transaction_id
);

-- Trigger updated_at (reutiliza set_updated_at() de mig 01)
CREATE TRIGGER income_charges_set_updated_at
  BEFORE UPDATE ON public.income_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX income_charges_income_idx
  ON public.income_charges (income_id);

CREATE INDEX income_charges_transaction_idx
  ON public.income_charges (transaction_id);

-- ── 2. RLS — GRANT + policies (las 4 operaciones) ───────────

ALTER TABLE public.income_charges ENABLE ROW LEVEL SECURITY;

-- Predicado:
--   can_see_transaction(transaction_id) → cuenta con visibilidad correcta para el usuario
--   EXISTS(incomes WHERE id=income_id AND user_id=auth.uid()) → el income pertenece al usuario

CREATE POLICY "pol_income_charges_select" ON public.income_charges
  FOR SELECT USING (
    public.can_see_transaction(transaction_id)
    AND EXISTS (
      SELECT 1 FROM public.incomes i
      WHERE i.id = income_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "pol_income_charges_insert" ON public.income_charges
  FOR INSERT WITH CHECK (
    public.can_see_transaction(transaction_id)
    AND EXISTS (
      SELECT 1 FROM public.incomes i
      WHERE i.id = income_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "pol_income_charges_update" ON public.income_charges
  FOR UPDATE
  USING (
    public.can_see_transaction(transaction_id)
    AND EXISTS (
      SELECT 1 FROM public.incomes i
      WHERE i.id = income_id AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.can_see_transaction(transaction_id)
    AND EXISTS (
      SELECT 1 FROM public.incomes i
      WHERE i.id = income_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "pol_income_charges_delete" ON public.income_charges
  FOR DELETE USING (
    public.can_see_transaction(transaction_id)
    AND EXISTS (
      SELECT 1 FROM public.incomes i
      WHERE i.id = income_id AND i.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_charges TO authenticated;

-- ── 3. Vista de reconciliación a nivel mes ───────────────────

CREATE OR REPLACE VIEW public.v_income_reconciliation
WITH (security_invoker = TRUE) AS
WITH
-- Todas las filas de nómina Nordex del usuario, agrupadas por mes
income_months AS (
  SELECT
    user_id,
    to_char(date, 'YYYY-MM') AS mes,
    SUM(net_amount)          AS incomes_net,
    COUNT(*)                 AS n_incomes
  FROM public.incomes
  WHERE source = 'nordex_payslip'
  GROUP BY user_id, to_char(date, 'YYYY-MM')
),
-- Corte PSD2: fecha mínima de depósito Nordex en transactions (NULL si aún no hay datos)
psd2_cutoff AS (
  SELECT MIN(date) AS cutoff_date
  FROM public.transactions
  WHERE counterparty ILIKE '%NORDEX%'
    AND amount > 0
),
-- Depósitos Nordex candidatos en transactions, agrupados por mes de transacción
nordex_deposits AS (
  SELECT
    to_char(date, 'YYYY-MM') AS mes,
    SUM(amount)              AS candidate_dep
  FROM public.transactions
  WHERE counterparty ILIKE '%NORDEX%'
    AND amount > 0
  GROUP BY to_char(date, 'YYYY-MM')
),
-- Depósitos enlazados vía income_charges, agrupados por el mes del income (no el de la txn)
-- SUM(DISTINCT t.amount): evita doble-conteo cuando 1 depósito ↔ 2 incomes (ej. mayo)
linked AS (
  SELECT
    to_char(i.date, 'YYYY-MM')        AS mes,
    SUM(DISTINCT t.amount)             AS linked_dep,
    COUNT(DISTINCT ic.transaction_id)  AS n_linked
  FROM public.income_charges ic
  JOIN public.transactions t ON t.id = ic.transaction_id
  JOIN public.incomes       i ON i.id = ic.income_id
  WHERE i.source = 'nordex_payslip'
  GROUP BY to_char(i.date, 'YYYY-MM')
)
SELECT
  im.user_id,
  im.mes,
  im.incomes_net,
  COALESCE(nd.candidate_dep, 0) AS candidate_dep,
  COALESCE(l.linked_dep,    0)  AS linked_dep,
  im.n_incomes,
  COALESCE(l.n_linked,      0)  AS n_linked,
  pc.cutoff_date                 AS psd2_cutoff,
  CASE
    WHEN pc.cutoff_date IS NULL
      OR im.mes < to_char(pc.cutoff_date, 'YYYY-MM')
      THEN 'sin_contraparte'
    WHEN ABS(COALESCE(l.linked_dep, 0) - im.incomes_net) <= 0.01
      THEN 'cuadrado'
    WHEN COALESCE(l.n_linked, 0) > 0
      THEN 'parcial'
    ELSE 'pendiente'
  END                            AS status
FROM income_months im
CROSS JOIN psd2_cutoff pc
LEFT JOIN nordex_deposits nd ON nd.mes = im.mes
LEFT JOIN linked          l  ON l.mes  = im.mes;
