-- Migración 16 — Stock options Nordex
-- Afecta a: P-001, P-002 (vistas dependientes — recreación cascada)
-- Nuevo parche introducido: P-006 (precio NDX1 en holding_prices sin holding asociado)

CREATE TABLE IF NOT EXISTS public.stock_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  num_options INTEGER NOT NULL CHECK (num_options > 0),
  strike_price NUMERIC(12,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  granted_date DATE,
  vesting_date DATE NOT NULL,
  exercise_window_start DATE NOT NULL,
  exercise_window_end DATE NOT NULL,
  condition_pct NUMERIC(5,2) DEFAULT 15.00,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_stock_options_updated_at
  BEFORE UPDATE ON public.stock_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_options_eric_only ON public.stock_options
  FOR ALL USING (auth.role() = 'authenticated');

-- Datos
INSERT INTO public.stock_options
  (package_name, ticker, num_options, strike_price, currency,
   vesting_date, exercise_window_start, exercise_window_end, condition_pct, notes)
VALUES
  ('Nordex Package 1', 'NDX1.DE', 1000, 11.60, 'EUR',
   '2028-01-01', '2029-01-01', '2030-12-31', 15.00,
   'Vesting 2028. Ejercitable 2029-2030 si precio >= strike+15% (13,34€).'),
  ('Nordex Package 2', 'NDX1.DE', 1000, 26.31, 'EUR',
   '2029-01-01', '2030-01-01', '2031-12-31', 15.00,
   'Vesting 2029. Ejercitable 2030-2031 si precio >= strike+15% (30,26€).');

-- Precio inicial NDX1 (P-006: entrada en holding_prices sin holding asociado)
INSERT INTO public.holding_prices (ticker, isin, date, close_original, currency, close_eur, source)
VALUES ('NDX1.DE', NULL, CURRENT_DATE, 45.28, 'EUR', 45.28, 'manual');

-- Vista valoración stock options
CREATE OR REPLACE VIEW public.stock_options_valued
WITH (security_invoker = TRUE) AS
SELECT
  so.*,
  hp.close_eur AS current_price_eur,
  hp.date AS price_date,
  GREATEST(0, hp.close_eur - so.strike_price) AS intrinsic_per_option,
  GREATEST(0, hp.close_eur - so.strike_price) * so.num_options AS intrinsic_total,
  so.strike_price * (1 + so.condition_pct/100) AS condition_min_price,
  (hp.close_eur >= so.strike_price * (1 + so.condition_pct/100)) AS condition_met,
  (so.vesting_date <= CURRENT_DATE) AS vested,
  (so.vesting_date <= CURRENT_DATE
   AND CURRENT_DATE BETWEEN so.exercise_window_start AND so.exercise_window_end
   AND hp.close_eur >= so.strike_price * (1 + so.condition_pct/100)) AS exercisable_now
FROM public.stock_options so
LEFT JOIN LATERAL (
  SELECT close_eur, date FROM public.holding_prices
  WHERE ticker = so.ticker
  ORDER BY date DESC LIMIT 1
) hp ON TRUE
WHERE so.is_active = TRUE;

-- Recrear patrimonio_neto añadiendo columna informativa
DROP VIEW IF EXISTS public.patrimonio_neto;

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
