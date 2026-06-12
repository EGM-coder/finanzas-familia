CREATE OR REPLACE VIEW v_cuentas_composicion
WITH (security_invoker = true) AS
WITH base AS (
  -- Efectivo: cuentas cash (bank/cash/tesoreria_tae)
  SELECT a.titular, 'Efectivo'::text AS segmento, 1 AS orden, abf.current_balance AS valor
  FROM accounts a JOIN account_balances_full abf ON abf.id = a.id
  WHERE a.is_active AND a.type IN ('bank','cash','tesoreria_tae')
  UNION ALL
  -- Holdings cotizados por asset_type
  SELECT a.titular,
    CASE hv.asset_type
      WHEN 'accion' THEN 'Renta variable + ETF'
      WHEN 'etf' THEN 'Renta variable + ETF'
      WHEN 'fondo_indexado' THEN 'Fondos indexados'
      WHEN 'cripto' THEN 'Cripto'
      ELSE 'Otros' END AS segmento,
    CASE hv.asset_type WHEN 'accion' THEN 2 WHEN 'etf' THEN 2
      WHEN 'fondo_indexado' THEN 3 WHEN 'cripto' THEN 5 ELSE 9 END AS orden,
    hv.current_value_eur AS valor
  FROM holdings_valued hv JOIN accounts a ON a.id = hv.account_id
  WHERE hv.is_active AND a.is_active
  UNION ALL
  -- Roboadvisor (manual_holdings)
  SELECT a.titular, 'Roboadvisor'::text, 4, mh.current_value_eur
  FROM manual_holdings mh JOIN accounts a ON a.id = mh.account_id
  WHERE mh.is_active AND a.is_active
)
SELECT titular, segmento, MIN(orden) AS orden, SUM(valor) AS valor
FROM base
GROUP BY titular, segmento;

GRANT SELECT ON v_cuentas_composicion TO authenticated;
