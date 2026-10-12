-- mig-82 · 12-oct-2026 · Vista v_balance_anchor — alarma de conciliación (P-034)
--
-- Motivo: Santander común estuvo descuadrada −875,66 desde el 01-sep (P-034) y nada avisó.
--   balance_checks guardaba el saldo real del banco cada día, pero nadie lo comparaba.
--
-- Una fila por cuenta activa con balance_checks (tipos sin holdings: excluye broker,
--   investment y card). Para cada check se reconstruye el saldo de EGMFin a esa fecha con
--   la misma regla que account_balances_full (rama ELSE): initial_balance + movimientos
--   vigentes de la cuenta + de sus tarjetas débito (D-025).
--
-- Status por PERSISTENCIA (no por días consecutivos): el saldo del banco y las fechas
--   PSD2 van desfasados 1+ días casi siempre (tarjetas, fines de semana); un descuadre de
--   un día o de una semana es ruido, un descuadre que nunca vuelve a 0 es un error.
--   ok    → el último check cuadra (|delta| <= 0,01)
--   ambar → el último descuadra, pero algún check de los últimos 10 días cuadró
--   rojo  → ningún check de los últimos 10 días (hasta el último check) cuadra
-- Medido sobre el histórico jul–oct ya corregido: Santander 6 días en rojo (25→31-jul),
--   Kutxabank 0. La regla "2 checks consecutivos" daba 32 días en rojo en Santander.
--   El error real de P-034 (01-sep) habría saltado el 11-sep.
--
-- Consumidor: egmfin-jobs/check_alarms.py (EXTRA_VIEWS) → Healthchecks egmfin-alarmas.

CREATE OR REPLACE VIEW public.v_balance_anchor
WITH (security_invoker = true) AS
WITH accs AS (
    SELECT a.id, a.name, a.initial_balance
    FROM public.accounts a
    WHERE a.is_active = true
      AND a.type NOT IN ('broker', 'investment', 'card')
      AND EXISTS (SELECT 1 FROM public.balance_checks b WHERE b.account_id = a.id)
),
daily AS (
    -- Movimientos vigentes de la cuenta y de sus tarjetas débito, por día
    SELECT f.id AS account_id, t.date, sum(t.amount) AS amount
    FROM accs f
    JOIN public.accounts c
      ON c.id = f.id
      OR (c.linked_account_id = f.id AND c.card_mode = 'debit')
    JOIN public.transactions t
      ON t.account_id = c.id
     AND t.superseded_by IS NULL
    GROUP BY f.id, t.date
),
checks AS (
    SELECT
        b.account_id,
        b.check_date,
        b.real_balance,
        f.initial_balance + COALESCE((
            SELECT sum(d.amount) FROM daily d
            WHERE d.account_id = b.account_id AND d.date <= b.check_date
        ), 0) AS calc_balance
    FROM public.balance_checks b
    JOIN accs f ON f.id = b.account_id
),
per_account AS (
    SELECT
        account_id,
        max(check_date)                                                 AS last_check_date,
        max(check_date) FILTER (WHERE abs(calc_balance - real_balance) <= 0.01) AS last_ok_date
    FROM checks
    GROUP BY account_id
)
SELECT
    f.id                                  AS account_id,
    f.name                                AS account_name,
    p.last_check_date,
    c.calc_balance,
    c.real_balance,
    c.calc_balance - c.real_balance       AS delta,
    p.last_ok_date,
    (SELECT min(c2.check_date) FROM checks c2
      WHERE c2.account_id = f.id
        AND c2.check_date > COALESCE(p.last_ok_date, '-infinity'::date)) AS mismatch_since,
    CASE
        WHEN abs(c.calc_balance - c.real_balance) <= 0.01            THEN 'ok'
        WHEN p.last_ok_date >= p.last_check_date - 9                 THEN 'ambar'
        ELSE 'rojo'
    END                                   AS status
FROM accs f
JOIN per_account p ON p.account_id = f.id
JOIN checks c      ON c.account_id = f.id AND c.check_date = p.last_check_date;

GRANT SELECT ON public.v_balance_anchor TO authenticated;

COMMENT ON VIEW public.v_balance_anchor IS
    'Conciliación EGMFin vs banco (balance_checks). Una fila por cuenta activa con checks. '
    'ok = último check cuadra; ambar = descuadra pero alguno de los últimos 10 días cuadró; '
    'rojo = ninguno de los últimos 10 días cuadra. security_invoker.';
