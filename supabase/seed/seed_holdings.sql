-- ============================================================================
-- Seed holdings — 18 posiciones reales (24/04/2026)
-- ============================================================================

INSERT INTO public.holdings (account_id, asset_type, ticker, isin, name, quantity, avg_price_original, original_currency, avg_price_eur, notes)
SELECT a.id, v.asset_type, v.ticker, v.isin, v.name, v.quantity, v.avg_price_original, v.currency, v.avg_price_eur, v.notes
FROM (VALUES
  -- MyInvestor fondos Vanguard S&P 500 (mismo ISIN, distintos titulares)
  ('MyInvestor Eric',  'fondo_indexado', NULL,  'IE0032620787', 'Vanguard U.S. 500 Stock Index Fund Investor EUR Accumulation', 56.470, 40.99,  'EUR',  72.43, NULL),
  ('MyInvestor Leo',   'fondo_indexado', NULL,  'IE0032620787', 'Vanguard U.S. 500 Stock Index Fund Investor EUR Accumulation', 33.080, 59.47,  'EUR',  72.43, NULL),
  ('MyInvestor Biel',  'fondo_indexado', NULL,  'IE0032620787', 'Vanguard U.S. 500 Stock Index Fund Investor EUR Accumulation',  9.170, 68.42,  'EUR',  72.43, NULL),

  -- MyInvestor común — robo-advisor (valor agregado, sin desglose por ahora)
  ('MyInvestor común', 'fondo_indexado', NULL,  NULL,            'MyInvestor Robot Advisor (perfil agregado)',                      1.000, 13813.67, 'EUR', 13813.67, 'Robo-advisor MyInvestor; valor agregado a actualizar manualmente'),

  -- Trade Republic Cartera Eric (acciones europeas en EUR, americanas en USD)
  ('Trade Republic Cartera Eric', 'accion', 'MC',    NULL, 'LVMH Moët Hennessy Louis Vuitton SE',  2.03177,  471.00,  'EUR',  471.00,  NULL),
  ('Trade Republic Cartera Eric', 'accion', 'NVDA',  NULL, 'NVIDIA Corporation',                    1.051893, 171.40,  'USD',  171.40,  NULL),
  ('Trade Republic Cartera Eric', 'accion', 'RMS',   NULL, 'Hermès International',                  0.09593, 1646.90,  'EUR', 1646.90,  NULL),
  ('Trade Republic Cartera Eric', 'accion', 'BRK.B', NULL, 'Berkshire Hathaway Inc. Class B',       0.285191, 400.10,  'USD',  400.10,  NULL),
  ('Trade Republic Cartera Eric', 'accion', 'REP',   NULL, 'Repsol SA',                             2.00,      21.02,  'EUR',   21.02,  NULL),
  ('Trade Republic Cartera Eric', 'accion', 'RACE',  NULL, 'Ferrari N.V.',                          0.064968, 300.60,  'EUR',  300.60,  NULL),
  ('Trade Republic Cartera Eric', 'accion', 'NKE',   NULL, 'Nike Inc. Class B',                     0.1501,    38.30,  'USD',   38.30,  NULL),

  -- Trade Republic Cripto
  ('Trade Republic Cripto Eric', 'cripto', 'BTC', NULL, 'Bitcoin', 0.001262, 66664.00, 'USD', 66664.00, NULL),

  -- Trade Republic ETF
  ('Trade Republic ETF Eric', 'etf', 'VHYL', NULL, 'Vanguard FTSE All-World High Dividend Yield UCITS ETF', 0.809716, 74.86, 'EUR', 74.86, NULL),

  -- Degiro Eric (BEP en USD, precio EUR aproximado al cambio actual)
  ('Degiro Eric', 'accion', 'ADBE',  'US00724F1012', 'Adobe Inc',                       2,    335.34,    'USD',  NULL, 'BEP Degiro'),
  ('Degiro Eric', 'accion', 'BRK.B', 'US0846707026', 'Berkshire Hathaway Inc. Class B', 4,    192.00,    'USD',  NULL, 'BEP Degiro'),
  ('Degiro Eric', 'accion', 'CCL',   'PA1436583006', 'Carnival Corp',                   7,     14.00,    'USD',  NULL, 'BEP Degiro'),
  ('Degiro Eric', 'accion', 'DXCM',  'US2521311074', 'Dexcom Inc',                     12,    103.051666,'USD',  NULL, 'BEP Degiro'),
  ('Degiro Eric', 'accion', 'MSFT',  'US5949181045', 'Microsoft Corp',                  7,    164.12,    'USD',  NULL, 'BEP Degiro'),
  ('Degiro Eric', 'accion', 'NVDA',  'US67066G1040', 'NVIDIA Corp',                    80,     10.14225, 'USD',  NULL, 'BEP Degiro'),
  ('Degiro Eric', 'accion', 'RIVN',  'US76954A1034', 'Rivian Automotive Inc Class A',   3,    158.76,    'USD',  NULL, 'BEP Degiro')
) v(account_name, asset_type, ticker, isin, name, quantity, avg_price_original, currency, avg_price_eur, notes)
JOIN public.accounts a ON a.name = v.account_name;
