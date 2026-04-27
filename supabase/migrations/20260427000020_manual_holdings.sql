-- Migración 20 — manual_holdings: activos sin cotización pública
-- Reemplaza el parche P-001 (roboadvisor cargado en holdings con avg_price_eur)
--
-- Cambios cascada:
--  - holdings_valued: elimina fallback a avg_price_eur (ya no necesario)
--  - account_balances_full: suma manual_holdings al holdings_value_eur
--
-- Histórico: trigger AFTER INSERT/UPDATE que graba snapshot en manual_holdings_history.

-- 1. Tabla nueva
CREATE TABLE IF NOT EXISTS public.manual_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'roboadvisor'
    CHECK (asset_type IN ('roboadvisor','fondo_privado','plan_pensiones','otro')),
  current_value_eur NUMERIC(20,8) NOT NULL,
  last_update_date DATE NOT NULL DEFAULT CURRENT_DATE,
  update_frequency TEXT NOT NULL DEFAULT 'mensual'
    CHECK (update_frequency IN ('mensual','trimestral','anual')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_holdings_account ON public.manual_holdings(account_id);

CREATE TRIGGER trg_manual_holdings_updated_at
  BEFORE UPDATE ON public.manual_holdings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.manual_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY manual_holdings_authenticated ON public.manual_holdings
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. Tabla histórico
CREATE TABLE IF NOT EXISTS public.manual_holdings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_holding_id UUID NOT NULL REFERENCES public.manual_holdings(id) ON DELETE CASCADE,
  value_eur NUMERIC(20,8) NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(manual_holding_id, snapshot_date)
);

CREATE INDEX idx_mh_history_holding ON public.manual_holdings_history(manual_holding_id, snapshot_date DESC);

ALTER TABLE public.manual_holdings_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY mh_history_authenticated ON public.manual_holdings_history
  FOR ALL USING (auth.role() = 'authenticated');

-- 3. Trigger histórico (graba snapshot en INSERT y en UPDATE de current_value_eur)
CREATE OR REPLACE FUNCTION public.fn_manual_holdings_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.current_value_eur IS DISTINCT FROM OLD.current_value_eur) THEN
    INSERT INTO public.manual_holdings_history (manual_holding_id, value_eur, snapshot_date)
    VALUES (NEW.id, NEW.current_value_eur, NEW.last_update_date)
    ON CONFLICT (manual_holding_id, snapshot_date)
    DO UPDATE SET value_eur = EXCLUDED.value_eur;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_manual_holdings_snapshot
  AFTER INSERT OR UPDATE ON public.manual_holdings
  FOR EACH ROW EXECUTE FUNCTION public.fn_manual_holdings_snapshot();

-- 4. Migrar el roboadvisor existente
INSERT INTO public.manual_holdings (
  account_id, name, asset_type, current_value_eur,
  last_update_date, update_frequency, notes
)
SELECT
  h.account_id,
  'Robot Advisor (perfil agregado)',
  'roboadvisor',
  h.avg_price_eur,
  CURRENT_DATE,
  'mensual',
  'Migrado desde holdings (P-001 eliminado). Actualizar mensual con valor extracto MyInvestor.'
FROM public.holdings h
JOIN public.accounts a ON a.id = h.account_id
WHERE a.name = 'MyInvestor común' AND h.name LIKE '%Robot Advisor%' AND h.is_active = TRUE;

-- 5. Borrar holding antiguo
DELETE FROM public.holdings
WHERE id IN (
  SELECT h.id FROM public.holdings h
  JOIN public.accounts a ON a.id = h.account_id
  WHERE a.name = 'MyInvestor común' AND h.name LIKE '%Robot Advisor%'
);

-- 6. Recrear vistas en cascada
DROP VIEW IF EXISTS public.patrimonio_neto;
DROP VIEW IF EXISTS public.account_balances_full;
DROP VIEW IF EXISTS public.holdings_valued;

-- holdings_valued: SIN fallback a avg_price_eur (ya no se usa)
CREATE VIEW public.holdings_valued
WITH (security_invoker = TRUE) AS
SELECT
  h.*,
  hp.close_original AS current_price_original,
  hp.close_eur      AS current_price_eur,
  hp.date           AS price_date,
  CASE
    WHEN hp.close_eur IS NOT NULL THEN h.quantity * hp.close_eur
    WHEN hp.close_original IS NOT NULL AND h.original_currency = 'EUR' THEN h.quantity * hp.close_original
    ELSE NULL
  END AS current_value_eur
FROM public.holdings h
LEFT JOIN LATERAL (
  SELECT close_original, close_eur, date
  FROM public.holding_prices
  WHERE
    (h.ticker IS NOT NULL AND ticker = h.ticker)
    OR
    (h.ticker IS NULL AND isin IS NOT DISTINCT FROM h.isin)
  ORDER BY date DESC
  LIMIT 1
) hp ON TRUE;

-- account_balances_full: ahora suma manual_holdings además de holdings_valued
CREATE VIEW public.account_balances_full
WITH (security_invoker = TRUE) AS
SELECT
  a.id, a.name, a.institution, a.type, a.visibility,
  a.linked_account_id, a.initial_balance, a.is_active, a.sort_order,
  COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0) AS transactions_sum,
  COALESCE((SELECT SUM(hv.current_value_eur) FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0)
  + COALESCE((SELECT SUM(mh.current_value_eur) FROM public.manual_holdings mh WHERE mh.account_id = a.id AND mh.is_active = TRUE), 0)
    AS holdings_value_eur,
  CASE
    WHEN a.type IN ('broker','investment') THEN
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((SELECT SUM(hv.current_value_eur) FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0)
      + COALESCE((SELECT SUM(mh.current_value_eur) FROM public.manual_holdings mh WHERE mh.account_id = a.id AND mh.is_active = TRUE), 0)
    WHEN a.type = 'card' THEN
      -1 * (a.initial_balance + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0))
    ELSE
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
  END AS current_balance
FROM public.accounts a;

CREATE VIEW public.patrimonio_neto
WITH (security_invoker = TRUE) AS
WITH
  liq AS (
    SELECT COALESCE(SUM(abf.current_balance), 0) AS v
    FROM public.account_balances_full abf
    JOIN public.accounts a ON a.id = abf.id
    WHERE a.is_active = TRUE
  ),
  inm AS (SELECT COALESCE(SUM(current_value), 0) AS v FROM public.assets WHERE is_active = TRUE),
  d_act AS (SELECT COALESCE(SUM(current_balance), 0) AS v FROM public.liabilities WHERE is_active = TRUE AND status = 'activa'),
  d_pry AS (SELECT COALESCE(SUM(current_balance), 0) AS v FROM public.liabilities WHERE is_active = TRUE AND status = 'proyectada'),
  so AS (SELECT COALESCE(SUM(intrinsic_total), 0) AS v FROM public.stock_options_valued)
SELECT
  liq.v AS liquidos_y_holdings,
  inm.v AS inmuebles,
  liq.v + inm.v AS activos_total,
  d_act.v AS deudas_activas,
  d_pry.v AS deudas_proyectadas,
  liq.v + inm.v - d_act.v AS patrimonio_neto_actual,
  liq.v + inm.v - d_act.v - d_pry.v AS patrimonio_neto_si_firmara_hoy,
  so.v AS stock_options_intrinsic
FROM liq, inm, d_act, d_pry, so;
