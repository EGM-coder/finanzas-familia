-- ============================================================================
-- FASE 5 — Reseed accounts + remapeo determinista de holdings huérfanos
-- PLATAFORMA: SUPABASE SQL EDITOR
-- Ejecutar DESPUÉS de fase3_recrear_schema.sql
--
-- Qué hace:
--   5.1 Inserta las 25 cuentas desde seed_accounts.sql (UUIDs frescos)
--   5.2 Remap 19 holdings huérfanos → nuevo account_id por nombre (7 UPDATEs)
--   5.3 Remap 1 manual_holdings huérfano → MyInvestor común nuevo UUID
--   5.4 Verificación post-remap
--
-- Los UPDATEs de holdings usan los UUIDs VIEJOS (de antes del incidente)
-- que Eric documentó. El JOIN final es por nombre de cuenta, así que los
-- UUIDs nuevos (auto-generados en 5.1) se resuelven en tiempo de ejecución.
-- ============================================================================

-- ── 5.1 SEED ACCOUNTS (25 cuentas) ───────────────────────────────────────
-- Contenido de supabase/seed/seed_accounts.sql inline para atomicidad

-- 21 cuentas no-tarjeta
INSERT INTO public.accounts (name, institution, type, visibility, initial_balance, sort_order, is_active)
VALUES
  -- PRIVADAS ERIC
  ('Kutxabank',                    'Kutxabank',      'bank',          'privada_eric',  1521.73,  1, TRUE),
  ('Trade Republic Efectivo Eric', 'Trade Republic', 'tesoreria_tae', 'privada_eric',  7580.70,  3, TRUE),
  ('Trade Republic Cartera Eric',  'Trade Republic', 'broker',        'privada_eric',     0.00,  4, TRUE),
  ('Trade Republic Cripto Eric',   'Trade Republic', 'broker',        'privada_eric',     0.00,  5, TRUE),
  ('Trade Republic ETF Eric',      'Trade Republic', 'broker',        'privada_eric',     0.00,  6, TRUE),
  ('Degiro Eric',                  'Degiro',         'broker',        'privada_eric',     0.00,  7, TRUE),
  ('MyInvestor Eric',              'MyInvestor',     'investment',    'privada_eric',     0.00,  8, TRUE),
  -- PRIVADAS ANA
  ('BBVA',                         'BBVA',           'bank',          'privada_ana',      0.00, 10, TRUE),
  ('BBVA Valores Ana',             'BBVA',           'broker',        'privada_ana',      0.00, 12, TRUE),
  ('Trade Republic Efectivo Ana',  'Trade Republic', 'tesoreria_tae', 'privada_ana',      0.00, 13, TRUE),
  ('Degiro Ana',                   'Degiro',         'broker',        'privada_ana',      0.00, 14, TRUE),
  ('MyInvestor Ana',               'MyInvestor',     'investment',    'privada_ana',      0.00, 15, TRUE),
  -- COMPARTIDAS
  ('Santander común',              'Santander',      'bank',          'compartida',     845.71, 20, TRUE),
  ('MyInvestor común',             'MyInvestor',     'investment',    'compartida',       0.00, 23, TRUE),
  ('MyInvestor común TAE',         'MyInvestor',     'tesoreria_tae', 'compartida',       9.43, 24, TRUE),
  ('Trade Republic Efectivo Leo',  'Trade Republic', 'tesoreria_tae', 'compartida',    1000.00, 25, TRUE),
  ('Trade Republic Efectivo Biel', 'Trade Republic', 'tesoreria_tae', 'compartida',       0.00, 26, TRUE),
  ('MyInvestor Leo',               'MyInvestor',     'investment',    'compartida',       0.00, 30, TRUE),
  ('MyInvestor Leo TAE',           'MyInvestor',     'tesoreria_tae', 'compartida',    4185.80, 31, TRUE),
  ('MyInvestor Biel',              'MyInvestor',     'investment',    'compartida',       0.00, 32, TRUE),
  ('MyInvestor Biel TAE',          'MyInvestor',     'tesoreria_tae', 'compartida',    1633.17, 33, TRUE);

-- 4 tarjetas (con linked_account_id resuelto por nombre de cuenta padre)
INSERT INTO public.accounts (name, institution, type, visibility, linked_account_id, initial_balance, sort_order, is_active)
SELECT v.name, v.institution, 'card', v.visibility, p.id, v.initial_balance, v.sort_order, TRUE
FROM (VALUES
  ('Tarjeta Kutxabank Eric', 'Kutxabank', 'privada_eric', 'Kutxabank',         854.38,  2),
  ('Tarjeta BBVA Ana',       'BBVA',      'privada_ana',  'BBVA',                0.00, 11),
  ('Tarjeta Santander Eric', 'Santander', 'compartida',   'Santander común',     0.00, 21),
  ('Tarjeta Santander Ana',  'Santander', 'compartida',   'Santander común',     0.00, 22)
) v(name, institution, visibility, parent_name, initial_balance, sort_order)
JOIN public.accounts p ON p.name = v.parent_name;

-- ── 5.2 REMAP HOLDINGS — 7 grupos (19 filas totales) ─────────────────────
-- Los UUIDs de la izquierda son los account_ids VIEJOS (pre-incidente).
-- Fuente: mapeo documentado por Eric el 29-abr-2026.

-- Trade Republic Cartera Eric (7: LVMH, NVDA, RMS, BRK.B, REP, RACE, NKE)
UPDATE public.holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'Trade Republic Cartera Eric')
WHERE account_id = '2c896ae9-a7dd-4fa9-bfa1-d6c43bb2e29e';

-- Trade Republic Cripto Eric (1: BTC)
UPDATE public.holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'Trade Republic Cripto Eric')
WHERE account_id = 'd0241f97-801a-438d-b379-5e237950a6e6';

-- Trade Republic ETF Eric (1: VHYL)
UPDATE public.holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'Trade Republic ETF Eric')
WHERE account_id = '2f2c7264-7384-4d84-b434-c6060f1b1705';

-- Degiro Eric (7: ADBE, BRK.B, CCL, DXCM, MSFT, NVDA, RIVN — notes='BEP Degiro')
UPDATE public.holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'Degiro Eric')
WHERE account_id = '7828ec8f-bfc7-4e79-84c3-9a3cf99e6475';

-- MyInvestor Eric (1: Vanguard 56.47 participaciones)
UPDATE public.holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'MyInvestor Eric')
WHERE account_id = '20d0de34-33d3-4a95-a26f-6d8f67b35af7';

-- MyInvestor Leo (1: Vanguard 33.08 participaciones)
UPDATE public.holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'MyInvestor Leo')
WHERE account_id = '31435751-4ff5-4d9b-8d38-83510ce31e3e';

-- MyInvestor Biel (1: Vanguard 9.17 participaciones)
UPDATE public.holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'MyInvestor Biel')
WHERE account_id = '71b8b811-bf34-4e88-b5c2-303181fac25f';


-- ── 5.3 REMAP MANUAL_HOLDINGS ─────────────────────────────────────────────
-- 1 fila: Robot Advisor MyInvestor común (migrado desde holdings en mig 20).
-- Su account_id apunta al UUID viejo de 'MyInvestor común'.

UPDATE public.manual_holdings
SET account_id = (SELECT id FROM public.accounts WHERE name = 'MyInvestor común')
WHERE account_id NOT IN (SELECT id FROM public.accounts);


-- ── 5.4 RESEED MARISTAS e INGRESOS (si aplica) ───────────────────────────
-- Estas tablas son estructuralmente correctas (schema intacto). Si Eric
-- tenía filas antes del incidente, restaurar desde backup CSV o desde memoria.
-- Si no había datos, omitir.
-- PLACEHOLDER: Eric inserta filas de maristas_items / incomes aquí si procede.


-- ── 5.5 VERIFICACIÓN INMEDIATA ───────────────────────────────────────────
-- Ejecutar y verificar resultados esperados:

-- Holdings: 0 huérfanos. Si > 0 → STOP, revisar mapeo.
SELECT COUNT(*) AS holdings_huerfanos
FROM public.holdings
WHERE account_id NOT IN (SELECT id FROM public.accounts);
-- → ESPERADO: 0

-- manual_holdings: 0 huérfanos
SELECT COUNT(*) AS mh_huerfanos
FROM public.manual_holdings
WHERE account_id NOT IN (SELECT id FROM public.accounts);
-- → ESPERADO: 0

-- Cuentas totales (21 no-tarjeta + 4 tarjetas = 25)
SELECT COUNT(*) AS total_accounts FROM public.accounts;
-- → ESPERADO: 25

-- Cuentas is_active=TRUE (todas deberían serlo)
SELECT COUNT(*) AS active_accounts FROM public.accounts WHERE is_active = TRUE;
-- → ESPERADO: 25

-- Holdings por cuenta (para confirmar distribución)
SELECT a.name, COUNT(h.id) AS n_holdings
FROM public.holdings h
JOIN public.accounts a ON a.id = h.account_id
GROUP BY a.name
ORDER BY a.name;
-- → ESPERADO:
--   Degiro Eric: 7
--   MyInvestor Biel: 1
--   MyInvestor Eric: 1
--   MyInvestor Leo: 1
--   Trade Republic Cartera Eric: 7
--   Trade Republic Cripto Eric: 1
--   Trade Republic ETF Eric: 1
--   TOTAL: 19

-- manual_holdings vinculados
SELECT a.name AS cuenta, mh.name, mh.current_value_eur
FROM public.manual_holdings mh
JOIN public.accounts a ON a.id = mh.account_id;
-- → ESPERADO: 1 fila — MyInvestor común / Robot Advisor / ~13813.67
