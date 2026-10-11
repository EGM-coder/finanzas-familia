-- mig-77 · 11-oct-2026 · Backfill Trade Republic Efectivo Eric jul–oct 2026 (20 movimientos)
-- D-029: Trade Republic = cuenta manual permanente; fuente de verdad: extracto PDF.
--   Extracto 01-jul → 10-oct-2026. Los movimientos del 01 y 02-jul ya estaban (mig-73,
--   último tr_bf_20260702_1) → aquí solo 08-jul → 01-oct.
--   Cuadre: 13.459,46 + 293,12 − 747,71 = 13.004,87 (10-oct-2026).
-- Sin compraventas en el periodo → holdings intactos.
-- P-026: sin DELETE/TRUNCATE/DROP. Solo INSERT idempotente.

-- ── 1. Insertar 20 movimientos (08-jul → 01-oct-2026) ─────────────────────────
-- source='backfill_extracto': computa en saldo, excluido de vistas de gasto (D-027).
-- external_id 'tr_bf_YYYYMMDD_N' (N correlativo dentro del día) para idempotencia.
-- Interés / Cash Dividend → nature='inversion'. Resto (PayPal, DAZN, Selecta) → NULL,
-- pendiente de decisión de Eric y de casado con pedidos.

INSERT INTO public.transactions (
  account_id, date, amount, description, currency,
  source, titular, external_id,
  nature, project_id, category_id
) VALUES
-- ─── Julio ────────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-07-08',0.89,
 'Rentabilidad Cash Dividend for ISIN ES0173516115','EUR','backfill_extracto','eric','tr_bf_20260708_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-07-17',-121.67,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260717_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-07-26',-11.47,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260726_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-07-31',-51.46,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260731_1',
 NULL,NULL,NULL),
-- ─── Agosto ───────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-08-01',20.74,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260801_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-08-02',-10.00,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260802_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-08-04',-229.99,
 'Transacción con tarjeta PAYPAL *DAZN DE','EUR','backfill_extracto','eric','tr_bf_20260804_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-08-13',229.99,
 'Transacción con tarjeta PAYPAL *DAZN DE','EUR','backfill_extracto','eric','tr_bf_20260813_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-08-17',-121.67,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260817_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-08-26',-11.46,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260826_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-08-26',-5.00,
 'Transacción con tarjeta AB SERVICIOS SELECTA E','EUR','backfill_extracto','eric','tr_bf_20260826_2',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-08-27',-26.67,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260827_1',
 NULL,NULL,NULL),
-- ─── Septiembre ───────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-09-01',20.36,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20260901_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-09-02',-9.99,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260902_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-09-17',-121.66,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260917_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-09-26',-26.67,
 'Transacción con tarjeta PAYPAL *PAGO 3 PLAZOS','EUR','backfill_extracto','eric','tr_bf_20260926_1',
 NULL,NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-09-30',0.30,
 'Rentabilidad Cash Dividend for ISIN IE00B8GKDB10','EUR','backfill_extracto','eric','tr_bf_20260930_1',
 'inversion',NULL,NULL),
-- ─── Octubre ──────────────────────────────────────────────────────────────────
('7794e395-72bb-4118-a108-50062a78e084','2026-10-01',20.65,
 'Interés Interest payment','EUR','backfill_extracto','eric','tr_bf_20261001_1',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-10-01',0.03,
 'Rentabilidad Cash Dividend for ISIN US6541061031','EUR','backfill_extracto','eric','tr_bf_20261001_2',
 'inversion',NULL,NULL),
('7794e395-72bb-4118-a108-50062a78e084','2026-10-01',0.16,
 'Rentabilidad Cash Dividend for ISIN US67066G1040','EUR','backfill_extracto','eric','tr_bf_20261001_3',
 'inversion',NULL,NULL)
ON CONFLICT (account_id, external_id) WHERE (external_id IS NOT NULL) DO NOTHING;

-- ── 2. Ancla de saldo real en balance_checks ──────────────────────────────────
-- DO NOTHING: si ya existe un ancla para esa fecha, no se sobrescribe.
INSERT INTO public.balance_checks (account_id, check_date, real_balance, source)
VALUES ('7794e395-72bb-4118-a108-50062a78e084', '2026-10-10', 13004.87, 'extracto_tr')
ON CONFLICT (account_id, check_date) DO NOTHING;
