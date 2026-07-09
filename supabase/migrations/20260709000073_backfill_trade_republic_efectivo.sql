-- mig-73 · 09-jul-2026 · Backfill Trade Republic Efectivo Eric (50 movimientos)
-- D-029: Trade Republic = cuenta manual permanente (sin PSD2 para particulares).
--   Fuente de verdad: extracto PDF. Ancla 31-dic-2025 = 30.074,40 €.
--   Cuadre verificado: 30.074,40 − 16.614,94 = 13.459,46 (07-jul-2026).
--   Artefacto PDF excluido: 2026-01-15 +0.81 ES0173516115 (duplicado de paginación).
-- Kutxabank fix: TRANSF. 1586 -12.000 (10-jun) tenía project_id 'Rutina familiar' → NULL.
-- P-026: sin DELETE/TRUNCATE/DROP. Solo INSERT + UPDATE explícitos.

-- ── 1. Re-anclar initial_balance a 31-dic-2025 ───────────────────────────────
UPDATE public.accounts
SET initial_balance = 30074.40
WHERE id = '7794e395-72bb-4118-a108-50062a78e084';

-- ── 2. Insertar 50 movimientos (01-ene-2026 → 02-jul-2026) ───────────────────
-- source='backfill_extracto': computa en saldo, excluido de vistas de gasto (D-027).
-- external_id 'tr_bf_YYYYMMDD_N' para idempotencia.
-- nature=NULL donde Eric no decidió explícitamente = correcto (doctrina zero-based).

INSERT INTO public.transactions (
  account_id, date, amount, description, currency,
  source, titular, external_id,
  nature, project_id, category_id
) VALUES
-- ─── Enero ────────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-01-01',-39.75,
 'Transacción con tarjeta SUPERCOR ESTAMBRERA','EUR','backfill_extracto','eric','tr_bf_20260101_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-01',35.93,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260101_2',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-02',-1297.36,
 'Operar Buy trade FR0000121014 LVMH EO 0,3, quantity: 2','EUR','backfill_extracto','eric','tr_bf_20260102_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-02',0.03,
 'Rentabilidad Cash Dividend for ISIN US6541061031','EUR','backfill_extracto','eric','tr_bf_20260102_2',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-05',-6543.00,
 'Transferencia Outgoing transfer for Eric Gahimbare Moreno (ES2215447889756650156251)','EUR','backfill_extracto','eric','tr_bf_20260105_1',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-05',1000.00,
 'Transferencia Incoming transfer from ERIC GAHIMBARE MORENO (ES6315447889726650464896)','EUR','backfill_extracto','eric','tr_bf_20260105_2',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-05',-1000.00,
 'Transferencia Outgoing transfer for Leo Gahimbare Ibanez (ES6515860001423562989711)','EUR','backfill_extracto','eric','tr_bf_20260105_3',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-06',-93.33,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260106_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-06',-600.00,
 'Transferencia Outgoing transfer for ERIC GAHIMBARE MORENO (ES1720950546109107934940)','EUR','backfill_extracto','eric','tr_bf_20260106_2',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-14',0.81,
 'Rentabilidad Cash Dividend for ISIN ES0173516115','EUR','backfill_extracto','eric','tr_bf_20260114_1',
 'inversion',NULL,NULL),
-- 2026-01-15 +0.81 ES0173516115: excluido — artefacto de paginación PDF (confirmado Eric 09-jul)
('7794e395-72bb-4118-a108-50062a78e084','2026-01-18',-31.13,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260118_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-26',-2000.00,
 'Transferencia Outgoing transfer for ERIC GAHIMBARE MORENO (ES1720950546109107934940)','EUR','backfill_extracto','eric','tr_bf_20260126_1',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-27',-500.00,
 'Transferencia Outgoing transfer for ERIC GAHIMBARE MORENO (ES1720950546109107934940)','EUR','backfill_extracto','eric','tr_bf_20260127_1',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-27',-26.94,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260127_2',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-28',-36.33,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260128_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-01-30',-95.00,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260130_1',
 NULL,NULL,NULL),
-- ─── Febrero ──────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-02-01',30.32,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260201_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-02-18',0.34,
 'Rentabilidad Cash Dividend for ISIN FR0000052292','EUR','backfill_extracto','eric','tr_bf_20260218_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-02-27',-26.93,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260227_1',
 NULL,NULL,NULL),
-- ─── Marzo ────────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-03-01',23.46,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260301_1',
 'inversion',NULL,NULL),
-- ─── Abril ────────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-04-01',25.98,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260401_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-01',0.01,
 'Rentabilidad Cash Dividend for ISIN US67066G1040','EUR','backfill_extracto','eric','tr_bf_20260401_2',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-01',0.03,
 'Rentabilidad Cash Dividend for ISIN US6541061031','EUR','backfill_extracto','eric','tr_bf_20260401_3',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-01',0.24,
 'Rentabilidad Cash Dividend for ISIN IE00B8GKDB10','EUR','backfill_extracto','eric','tr_bf_20260401_4',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-12',-3.00,
 'Transacción con tarjeta IBERIA AIR 075','EUR','backfill_extracto','eric','tr_bf_20260412_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-20',-11289.00,
 'Transferencia Outgoing transfer for Aljuca Cocinas S.L (ES0900810343970002477959)','EUR','backfill_extracto','eric','tr_bf_20260420_1',
 'extraordinario','51cfee11-972e-4561-8da4-154f5f0cf436',NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-23',-16.49,
 'Transacción con tarjeta Klarna*decathlon.es','EUR','backfill_extracto','eric','tr_bf_20260423_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-23',-13.30,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260423_2',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-23',0.88,
 'Rentabilidad Cash Dividend for ISIN FR0000052292','EUR','backfill_extracto','eric','tr_bf_20260423_3',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-04-30',10.76,
 'Rentabilidad Cash Dividend for ISIN FR0000121014','EUR','backfill_extracto','eric','tr_bf_20260430_1',
 'inversion',NULL,NULL),
-- ─── Mayo ─────────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-05-01',19.64,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260501_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-05-05',0.12,
 'Rentabilidad Cash Dividend for ISIN NL0011585146','EUR','backfill_extracto','eric','tr_bf_20260505_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-05-22',-16.49,
 'Transacción con tarjeta Klarna*decathlon.es','EUR','backfill_extracto','eric','tr_bf_20260522_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-05-23',-13.30,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260523_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-05-29',5000.00,
 'Transferencia Incoming transfer from ERIC GAHIMBARE MORENO (ES1720950546109107934940)','EUR','backfill_extracto','eric','tr_bf_20260529_1',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-05-31',-49.97,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260531_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-05-31',-1.50,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260531_2',
 NULL,NULL,NULL),
-- ─── Junio ────────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-06-01',11.12,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260601_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-06-12',12000.00,
 'Transferencia Incoming transfer from ERIC GAHIMBARE MORENO (ES1720950546109107934940)','EUR','backfill_extracto','eric','tr_bf_20260612_1',
 'transferencia',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-06-15',-10000.00,
 'Transferencia Outgoing transfer for Coblansa S.A. (ES2201280430810100158684)','EUR','backfill_extracto','eric','tr_bf_20260615_1',
 'extraordinario','d7eec667-6093-410a-a79b-7b927c45caca',NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-06-18',-1000.00,
 'Transferencia Outgoing transfer for Coblansa S.A. (ES2201280430810100158684)','EUR','backfill_extracto','eric','tr_bf_20260618_1',
 'extraordinario','d7eec667-6093-410a-a79b-7b927c45caca',NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-06-22',-16.49,
 'Transacción con tarjeta Klarna*decathlon.es','EUR','backfill_extracto','eric','tr_bf_20260622_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-06-23',-13.30,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260623_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-06-26',0.16,
 'Rentabilidad Cash Dividend for ISIN US67066G1040','EUR','backfill_extracto','eric','tr_bf_20260626_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-06-26',-11.46,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260626_2',
 NULL,NULL,NULL),
-- ─── Julio ────────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-07-01',20.19,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260701_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-07-01',0.53,
 'Rentabilidad Cash Dividend for ISIN IE00B8GKDB10','EUR','backfill_extracto','eric','tr_bf_20260701_2',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-07-01',-51.46,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260701_3',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-07-01',0.03,
 'Rentabilidad Cash Dividend for ISIN US6541061031','EUR','backfill_extracto','eric','tr_bf_20260701_4',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-07-02',-9.99,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260702_1',
 NULL,NULL,NULL)
ON CONFLICT (account_id, external_id) WHERE (external_id IS NOT NULL) DO NOTHING;

-- ── 3. Corregir project_id erróneo en Kutxabank (-12.000, 10-jun-2026) ────────
-- TRANSF. 1586 era traspaso propio a TR → project_id='Rutina familiar' es incorrecto.
-- Solo project_id → NULL; nature='transferencia' y category_id se mantienen.
UPDATE public.transactions
SET project_id = NULL
WHERE id = 'df76656f-e3a5-40fd-ab77-377993d7b6b5'
  AND project_id IS NOT NULL;

-- ── 4. Ancla de saldo real en balance_checks ──────────────────────────────────
INSERT INTO public.balance_checks (account_id, check_date, real_balance, source)
VALUES ('7794e395-72bb-4118-a108-50062a78e084', '2026-07-07', 13459.46, 'extracto_tr')
ON CONFLICT (account_id, check_date)
  DO UPDATE SET real_balance = EXCLUDED.real_balance, source = EXCLUDED.source;
