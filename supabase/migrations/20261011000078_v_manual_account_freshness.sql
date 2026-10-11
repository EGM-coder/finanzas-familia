-- mig-78 · 11-oct-2026 · Vista v_manual_account_freshness — alerta de cuenta manual sin anclar
--
-- Motivo: Trade Republic estuvo 3 meses sin anclar (07-jul → 10-oct-2026) sin que nada
-- avisara. Las cuentas sin PSD2 solo se corrigen con un extracto (D-029); si nadie lo
-- sube, su saldo deriva en silencio.
--
-- Perímetro (D-030, materialidad): una fila por cuenta que cumpla TODO:
--   - is_active = true
--   - type IN ('bank','cash','tesoreria_tae')
--   - titular IN ('eric','comun')            (perímetro v1)
--   - sin fila activa en bank_account_links  (no la cubre PSD2)
--   - account_balances_full.current_balance >= 100  (por debajo, inmaterial)
--
-- Umbral (días desde el último balance_check):
--   ok    → ≤ 21
--   ambar → 22–35
--   rojo  → > 35, o nunca anclada
-- TR es la mayor posición de efectivo y tiene gasto recurrente (tarjeta, PayPal a plazos):
-- más de 3 semanas sin extracto deja de ser fiable.
--
-- Consumidor: egmfin-jobs/check_alarms.py → Healthchecks egmfin-alarmas (P-031).
-- security_invoker = true → hereda RLS de accounts, bank_account_links, balance_checks.

CREATE OR REPLACE VIEW public.v_manual_account_freshness
WITH (security_invoker = true) AS
WITH last_checks AS (
    SELECT account_id,
           max(check_date) AS last_check_date
    FROM public.balance_checks
    GROUP BY account_id
)
SELECT
    a.id                                   AS account_id,
    a.name                                 AS account_name,
    a.institution,
    a.titular,
    abf.current_balance,
    lc.last_check_date,
    (current_date - lc.last_check_date)::int AS days_since_check,
    CASE
        WHEN lc.last_check_date IS NULL                    THEN 'rojo'
        WHEN (current_date - lc.last_check_date) > 35      THEN 'rojo'
        WHEN (current_date - lc.last_check_date) >= 22     THEN 'ambar'
        ELSE 'ok'
    END AS status
FROM public.accounts a
JOIN public.account_balances_full abf ON abf.id = a.id
LEFT JOIN last_checks lc ON lc.account_id = a.id
WHERE a.is_active = true
  AND a.type IN ('bank', 'cash', 'tesoreria_tae')
  AND a.titular IN ('eric', 'comun')
  AND NOT EXISTS (
      SELECT 1 FROM public.bank_account_links l
      WHERE l.account_id = a.id
        AND l.is_active = true
  )
  AND abf.current_balance >= 100;

GRANT SELECT ON public.v_manual_account_freshness TO authenticated;

COMMENT ON VIEW public.v_manual_account_freshness IS
    'Alerta de cuenta manual (sin PSD2) sin anclar. Una fila por cuenta del perímetro v1 '
    '(titular eric/comun, saldo >= 100, D-030). ok <=21 / ambar 22-35 / rojo >35 días o nunca. '
    'security_invoker: hereda RLS de tablas subyacentes.';
