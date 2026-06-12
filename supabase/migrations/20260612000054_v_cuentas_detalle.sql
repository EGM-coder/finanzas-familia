-- mig-54: CREATE VIEW v_cuentas_detalle
-- Como v_cuentas_composicion pero a nivel de cuenta individual (account_id).
-- Fuentes: account_balances_full (Efectivo) + holdings_valued (cotizados) + manual_holdings (Roboadvisor).
-- security_invoker=true: hereda RLS del usuario que ejecuta → muro de privacidad respetado.

CREATE OR REPLACE VIEW v_cuentas_detalle
WITH (security_invoker = true) AS
WITH base AS (
  SELECT a.id AS account_id, a.name, a.institution, a.visibility, a.titular,
         'Efectivo'::text AS segmento, 1 AS orden, abf.current_balance AS valor
  FROM accounts a JOIN account_balances_full abf ON abf.id = a.id
  WHERE a.is_active AND a.type IN ('bank','cash','tesoreria_tae')
  UNION ALL
  SELECT a.id, a.name, a.institution, a.visibility, a.titular,
    CASE hv.asset_type
      WHEN 'accion'        THEN 'Renta variable + ETF'
      WHEN 'etf'           THEN 'Renta variable + ETF'
      WHEN 'fondo_indexado' THEN 'Fondos indexados'
      WHEN 'cripto'        THEN 'Cripto'
      ELSE 'Otros'
    END,
    CASE hv.asset_type
      WHEN 'accion'        THEN 2
      WHEN 'etf'           THEN 2
      WHEN 'fondo_indexado' THEN 3
      WHEN 'cripto'        THEN 5
      ELSE 9
    END,
    hv.current_value_eur
  FROM holdings_valued hv JOIN accounts a ON a.id = hv.account_id
  WHERE hv.is_active AND a.is_active
  UNION ALL
  SELECT a.id, a.name, a.institution, a.visibility, a.titular,
         'Roboadvisor'::text, 4, mh.current_value_eur
  FROM manual_holdings mh JOIN accounts a ON a.id = mh.account_id
  WHERE mh.is_active AND a.is_active
)
SELECT
  account_id,
  name,
  institution,
  visibility,
  titular,
  segmento,
  MIN(orden) AS orden,
  SUM(valor) AS valor
FROM base
GROUP BY account_id, name, institution, visibility, titular, segmento;

GRANT SELECT ON v_cuentas_detalle TO authenticated;
