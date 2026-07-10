-- mig-74 · 10-jul-2026 · Vista v_income_freshness — alerta nómina no contabilizada
--
-- Señal PRIMARIA: abono Nordex en transactions sin fila en income_charges.
--   ok    → 0 días (sin depósito descasado) o ≤ 10 días desde el abono
--   ambar → 11–15 días
--   rojo  → > 15 días
--   Los abonos anteriores a psd2_cutoff se ignoran (misma lógica que v_income_reconciliation).
--
-- Señal SECUNDARIA (guard si PSD2 cae y no hay abono que detectar):
--   ok    → days_since_last_income ≤ 40
--   ambar → 41–55
--   rojo  → > 55
--
-- La vista devuelve UNA fila; status = peor de ambas señales (rojo > ambar > ok).
-- security_invoker = true → hereda RLS de transactions, income_charges e incomes.

CREATE OR REPLACE VIEW public.v_income_freshness
WITH (security_invoker = true) AS
WITH psd2_cutoff AS (
    SELECT min(date) AS cutoff_date
    FROM public.transactions
    WHERE counterparty ILIKE '%NORDEX%'
      AND amount > 0
),
unmatched_deposits AS (
    -- Depósito Nordex más antiguo sin ninguna fila en income_charges.
    -- El más antiguo es el peor caso (más días transcurridos).
    SELECT t.date,
           t.amount,
           (current_date - t.date)::int AS days_since_deposit
    FROM public.transactions t
    CROSS JOIN psd2_cutoff pc
    WHERE t.counterparty ILIKE '%NORDEX%'
      AND t.amount > 0
      AND t.date >= pc.cutoff_date
      AND NOT EXISTS (
          SELECT 1 FROM public.income_charges ic WHERE ic.transaction_id = t.id
      )
    ORDER BY t.date ASC  -- oldest = worst case
    LIMIT 1
),
last_income AS (
    SELECT max(date)                       AS last_income_date,
           (current_date - max(date))::int AS days_since_last_income
    FROM public.incomes
    WHERE source = 'nordex_payslip'
)
SELECT
    li.last_income_date,
    li.days_since_last_income,
    ud.date   AS unmatched_deposit_date,
    ud.amount AS unmatched_deposit_amount,
    ud.days_since_deposit,
    CASE
        WHEN 'rojo' IN (
            CASE
                WHEN ud.days_since_deposit IS NULL      THEN 'ok'
                WHEN ud.days_since_deposit > 15         THEN 'rojo'
                WHEN ud.days_since_deposit >= 11        THEN 'ambar'
                ELSE 'ok'
            END,
            CASE
                WHEN li.days_since_last_income > 55     THEN 'rojo'
                WHEN li.days_since_last_income > 40     THEN 'ambar'
                ELSE 'ok'
            END
        ) THEN 'rojo'
        WHEN 'ambar' IN (
            CASE
                WHEN ud.days_since_deposit IS NULL      THEN 'ok'
                WHEN ud.days_since_deposit > 15         THEN 'rojo'
                WHEN ud.days_since_deposit >= 11        THEN 'ambar'
                ELSE 'ok'
            END,
            CASE
                WHEN li.days_since_last_income > 55     THEN 'rojo'
                WHEN li.days_since_last_income > 40     THEN 'ambar'
                ELSE 'ok'
            END
        ) THEN 'ambar'
        ELSE 'ok'
    END AS status
FROM last_income li
LEFT JOIN unmatched_deposits ud ON true;

GRANT SELECT ON public.v_income_freshness TO authenticated;

COMMENT ON VIEW public.v_income_freshness IS
    'Alerta de nómina no contabilizada. Una fila. '
    'Señal primaria: abono Nordex sin income_charge (ok/ambar/rojo por días). '
    'Señal secundaria: días desde último registro en incomes (guard anti-PSD2-caída). '
    'status = peor de ambas. security_invoker: hereda RLS de tablas subyacentes.';
