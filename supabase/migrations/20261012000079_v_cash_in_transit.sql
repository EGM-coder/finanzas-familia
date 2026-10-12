-- mig-79 · 12-oct-2026 · Efectivo en tránsito hacia Trade Republic (D-031)
--
-- Problema: TR es cuenta manual (D-029). Una transferencia Kutxabank/Santander → TR sale
-- al instante por PSD2, pero la entrada en TR no existe hasta el siguiente extracto.
-- Mientras tanto el Efectivo sale más bajo de lo real (caso: Kutxabank 11-oct −4.500).
--
-- D-031: no se crean movimientos provisionales en TR. El tránsito se CALCULA:
--   salida PSD2 hacia TR sin entrada emparejada en TR. Suma al segmento Efectivo de eric
--   como línea propia ("En tránsito → Trade Republic"). Se resuelve solo al cargar el
--   extracto. > 21 días sin emparejar → rojo (check_alarms → egmfin-alarmas).
--
-- Cambios:
--   1. NUEVA  v_cash_in_transit          (una fila por salida no emparejada)
--   2. REPLACE v_cuentas_composicion     (mismas columnas; + tránsito en Efectivo/eric)
--   3. REPLACE v_cuentas_detalle         (mismas columnas; + fila sintética account_id NULL)
-- Las definiciones 2 y 3 son las vigentes (pg_get_viewdef, 12-oct) + un UNION ALL.

-- ── 1. v_cash_in_transit ──────────────────────────────────────────────────────
-- Salidas candidatas: amount < 0, vigentes, contraparte Eric, código de entidad TR (1586),
--   en cuentas con link PSD2 activo.
-- Entradas TR: cuenta TR Efectivo Eric, amount > 0, nature='transferencia', vigentes.
-- Emparejamiento 1:1 determinista: row_number por importe absoluto, ordenado por fecha
--   en ambos lados; la n-ésima salida de un importe empareja con la n-ésima entrada del
--   mismo importe SI la fecha TR cae en [salida − 2, salida + 7] días.
-- Guarda de privacidad: solo devuelve filas si el invocador ve la cuenta TR (RLS vía
--   security_invoker). Quien no ve TR no puede saber si hay entrada → no ve tránsito.

CREATE OR REPLACE VIEW public.v_cash_in_transit
WITH (security_invoker = true) AS
WITH tr AS (
    SELECT a.id
    FROM public.accounts a
    WHERE a.id = '7794e395-72bb-4118-a108-50062a78e084'
),
salidas AS (
    SELECT t.id,
           t.account_id,
           t.date,
           -t.amount AS amount,
           row_number() OVER (PARTITION BY -t.amount ORDER BY t.date, t.id) AS rn
    FROM public.transactions t
    WHERE t.amount < 0
      AND t.superseded_by IS NULL
      AND t.counterparty ILIKE '%ERIC GAHIMBARE%'
      AND t.description  ILIKE '%1586%'
      AND EXISTS (
          SELECT 1 FROM public.bank_account_links l
          WHERE l.account_id = t.account_id
            AND l.is_active = true
      )
),
entradas AS (
    SELECT t.id,
           t.date,
           t.amount,
           row_number() OVER (PARTITION BY t.amount ORDER BY t.date, t.id) AS rn
    FROM public.transactions t
    JOIN tr ON tr.id = t.account_id
    WHERE t.amount > 0
      AND t.nature = 'transferencia'
      AND t.superseded_by IS NULL
)
SELECT
    s.id                              AS transaction_id,
    a.name                            AS source_account,
    s.date,
    s.amount,
    (current_date - s.date)::int      AS days_in_transit,
    CASE
        WHEN (current_date - s.date) > 21 THEN 'rojo'
        ELSE 'ok'
    END                               AS status
FROM salidas s
JOIN public.accounts a ON a.id = s.account_id
CROSS JOIN tr
WHERE NOT EXISTS (
    SELECT 1 FROM entradas e
    WHERE e.amount = s.amount
      AND e.rn     = s.rn
      AND e.date BETWEEN s.date - 2 AND s.date + 7
);

GRANT SELECT ON public.v_cash_in_transit TO authenticated;

COMMENT ON VIEW public.v_cash_in_transit IS
    'Efectivo en tránsito hacia Trade Republic (D-031): salida PSD2 (contraparte Eric, '
    'entidad 1586) sin entrada emparejada en TR (1:1 por importe, ventana −2/+7 días). '
    'ok <=21 días / rojo >21. security_invoker; vacía si el invocador no ve la cuenta TR.';

-- ── 2. v_cuentas_composicion — + tránsito en Efectivo de eric ─────────────────
-- HAVING sum > 0: sin tránsito no se añade nada (ni una fila NULL).

CREATE OR REPLACE VIEW public.v_cuentas_composicion
WITH (security_invoker = true) AS
WITH base AS (
    SELECT a.titular,
        'Efectivo'::text AS segmento,
        1 AS orden,
        abf.current_balance AS valor
    FROM (accounts a
        JOIN account_balances_full abf ON ((abf.id = a.id)))
    WHERE (a.is_active AND (a.type = ANY (ARRAY['bank'::text, 'cash'::text, 'tesoreria_tae'::text])))
    UNION ALL
    SELECT a.titular,
        CASE hv.asset_type
            WHEN 'accion'::text THEN 'Renta variable + ETF'::text
            WHEN 'etf'::text THEN 'Renta variable + ETF'::text
            WHEN 'fondo_indexado'::text THEN 'Fondos indexados'::text
            WHEN 'cripto'::text THEN 'Cripto'::text
            ELSE 'Otros'::text
        END AS segmento,
        CASE hv.asset_type
            WHEN 'accion'::text THEN 2
            WHEN 'etf'::text THEN 2
            WHEN 'fondo_indexado'::text THEN 3
            WHEN 'cripto'::text THEN 5
            ELSE 9
        END AS orden,
        hv.current_value_eur AS valor
    FROM (holdings_valued hv
        JOIN accounts a ON ((a.id = hv.account_id)))
    WHERE (hv.is_active AND a.is_active)
    UNION ALL
    SELECT a.titular,
        'Roboadvisor'::text AS text,
        4,
        mh.current_value_eur
    FROM (manual_holdings mh
        JOIN accounts a ON ((a.id = mh.account_id)))
    WHERE (mh.is_active AND a.is_active)
    UNION ALL
    -- D-031: efectivo en tránsito hacia TR
    SELECT 'eric'::text,
        'Efectivo'::text,
        1,
        sum(cit.amount)
    FROM v_cash_in_transit cit
    HAVING (sum(cit.amount) > (0)::numeric)
)
SELECT titular,
    segmento,
    min(orden) AS orden,
    sum(valor) AS valor
FROM base
GROUP BY titular, segmento;

-- ── 3. v_cuentas_detalle — + fila sintética "En tránsito → Trade Republic" ────
-- account_id NULL: no es una cuenta, no navegable. Solo si el total > 0.

CREATE OR REPLACE VIEW public.v_cuentas_detalle
WITH (security_invoker = true) AS
WITH base AS (
    SELECT a.id AS account_id,
        a.name,
        a.institution,
        a.visibility,
        a.titular,
        'Efectivo'::text AS segmento,
        1 AS orden,
        abf.current_balance AS valor
    FROM (accounts a
        JOIN account_balances_full abf ON ((abf.id = a.id)))
    WHERE (a.is_active AND (a.type = ANY (ARRAY['bank'::text, 'cash'::text, 'tesoreria_tae'::text])))
    UNION ALL
    SELECT a.id,
        a.name,
        a.institution,
        a.visibility,
        a.titular,
        CASE hv.asset_type
            WHEN 'accion'::text THEN 'Renta variable + ETF'::text
            WHEN 'etf'::text THEN 'Renta variable + ETF'::text
            WHEN 'fondo_indexado'::text THEN 'Fondos indexados'::text
            WHEN 'cripto'::text THEN 'Cripto'::text
            ELSE 'Otros'::text
        END AS "case",
        CASE hv.asset_type
            WHEN 'accion'::text THEN 2
            WHEN 'etf'::text THEN 2
            WHEN 'fondo_indexado'::text THEN 3
            WHEN 'cripto'::text THEN 5
            ELSE 9
        END AS "case",
        hv.current_value_eur
    FROM (holdings_valued hv
        JOIN accounts a ON ((a.id = hv.account_id)))
    WHERE (hv.is_active AND a.is_active)
    UNION ALL
    SELECT a.id,
        a.name,
        a.institution,
        a.visibility,
        a.titular,
        'Roboadvisor'::text AS text,
        4,
        mh.current_value_eur
    FROM (manual_holdings mh
        JOIN accounts a ON ((a.id = mh.account_id)))
    WHERE (mh.is_active AND a.is_active)
    UNION ALL
    -- D-031: efectivo en tránsito hacia TR (fila sintética)
    SELECT NULL::uuid,
        'En tránsito → Trade Republic'::text,
        'Trade Republic'::text,
        'privada_eric'::text,
        'eric'::text,
        'Efectivo'::text,
        1,
        sum(cit.amount)
    FROM v_cash_in_transit cit
    HAVING (sum(cit.amount) > (0)::numeric)
)
SELECT account_id,
    name,
    institution,
    visibility,
    titular,
    segmento,
    min(orden) AS orden,
    sum(valor) AS valor
FROM base
GROUP BY account_id, name, institution, visibility, titular, segmento;
