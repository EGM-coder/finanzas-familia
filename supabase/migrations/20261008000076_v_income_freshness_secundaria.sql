-- mig-76 · 08-oct-2026 · v_income_freshness — umbrales de la señal SECUNDARIA (T-042)
--
-- Problema: incomes.date = día 1 del mes. La nómina del mes M no existe hasta que se
-- sube (~fin de M), así que con ambar > 40 / rojo > 55 días la vista daba rojo cada mes
-- (~día 27) con todo en orden. Con check_alarms (P-031) = un correo falso al mes.
--
-- Cambio: SOLO la señal secundaria (días desde last_income_date):
--   ok    → ≤ 62
--   ambar → 63–75
--   rojo  → > 75   (dos nóminas perdidas)
--
-- Señal PRIMARIA intacta (regla de Eric): abono Nordex sin income_charge
--   ok ≤ 10 · ambar 11–15 · rojo > 15 días.
--
-- Misma firma de columnas; security_invoker = true se mantiene.

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
                WHEN li.days_since_last_income > 75     THEN 'rojo'
                WHEN li.days_since_last_income > 62     THEN 'ambar'
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
                WHEN li.days_since_last_income > 75     THEN 'rojo'
                WHEN li.days_since_last_income > 62     THEN 'ambar'
                ELSE 'ok'
            END
        ) THEN 'ambar'
        ELSE 'ok'
    END AS status
FROM last_income li
LEFT JOIN unmatched_deposits ud ON true;

COMMENT ON VIEW public.v_income_freshness IS
    'Alerta de nómina no contabilizada. Una fila. '
    'Señal primaria: abono Nordex sin income_charge (ok ≤10 / ambar 11–15 / rojo >15 días). '
    'Señal secundaria: días desde último registro en incomes (ambar >62 / rojo >75, mig-76). '
    'status = peor de ambas. security_invoker: hereda RLS de tablas subyacentes.';
