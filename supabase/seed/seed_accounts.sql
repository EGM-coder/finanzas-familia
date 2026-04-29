-- ============================================================================
-- Seed accounts — carga inicial 26 cuentas (24/04/2026)
-- ============================================================================
-- Saldos a 24/04/2026

-- 22 cuentas no-tarjeta
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

-- 4 tarjetas (con linked_account_id)
INSERT INTO public.accounts (name, institution, type, visibility, linked_account_id, initial_balance, sort_order, is_active)
SELECT v.name, v.institution, 'card', v.visibility, p.id, v.initial_balance, v.sort_order, TRUE
FROM (VALUES
  ('Tarjeta Kutxabank Eric', 'Kutxabank', 'privada_eric', 'Kutxabank',         854.38,  2),
  ('Tarjeta BBVA Ana',       'BBVA',      'privada_ana',  'BBVA',                0.00, 11),
  ('Tarjeta Santander Eric', 'Santander', 'compartida',   'Santander común',     0.00, 21),
  ('Tarjeta Santander Ana',  'Santander', 'compartida',   'Santander común',     0.00, 22)
) v(name, institution, visibility, parent_name, initial_balance, sort_order)
JOIN public.accounts p ON p.name = v.parent_name;
