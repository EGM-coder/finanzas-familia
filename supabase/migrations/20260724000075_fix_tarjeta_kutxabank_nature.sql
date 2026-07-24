-- P-030 · 24-jul-2026
-- Liquidaciones tarjeta crédito Kutxabank: corregir causa raíz en classification_rules
-- y sanear histórico en transactions.
--
-- Causa raíz: tres reglas activas empatadas en priority=100 con set_nature contradictorio
--   7e871e90: set_nature='fijo_recurrente'  → desactivar
--   cc75b0ff: set_nature=NULL               → fijar 'transferencia'
--   5fa79379: set_nature='transferencia'    → intacta (correcta)
--
-- Histórico afectado: 3 liquidaciones (feb, may, jul-2026) · 4.111,21 EUR
-- computando como gasto en v_spent_by_category_week por nature≠'transferencia'.


-- ── 1. Desactivar la regla que fijaba nature='fijo_recurrente' ─────────────────
UPDATE public.classification_rules
SET    is_active = false
WHERE  id = '7e871e90-b6e8-4007-99af-b3d3ba09ecfa';

-- ── 2. Completar la regla con set_nature=NULL → 'transferencia' ────────────────
UPDATE public.classification_rules
SET    set_nature = 'transferencia'
WHERE  id = 'cc75b0ff-f56f-4da0-a2d8-ec83edb5a32c';

-- ── 3. Sanear histórico: las 3 liquidaciones mal clasificadas ──────────────────
UPDATE public.transactions
SET
    category_id = '8327b29c-8037-4cbd-b530-206101d55e51',  -- Pago de tarjeta
    nature      = 'transferencia'
WHERE
    description  LIKE 'TARJ.CRDTO%'
    AND account_id   = '8d8ae9ef-f8ce-45f4-891c-f964af9f881a'  -- IBAN Kutxabank
    AND superseded_by IS NULL
    AND (
        category_id IS DISTINCT FROM '8327b29c-8037-4cbd-b530-206101d55e51'
        OR nature   IS DISTINCT FROM 'transferencia'
    );

-- ── Verificación ───────────────────────────────────────────────────────────────
SELECT json_build_object(
    'liquidaciones', (
        SELECT json_agg(row_to_json(t) ORDER BY t.date)
        FROM (
            SELECT date, amount, category_id, nature
            FROM   public.transactions
            WHERE  description  LIKE 'TARJ.CRDTO%'
            AND    account_id   = '8d8ae9ef-f8ce-45f4-891c-f964af9f881a'
            AND    superseded_by IS NULL
        ) t
    ),
    'reglas', (
        SELECT json_agg(row_to_json(r) ORDER BY r.priority, r.id)
        FROM (
            SELECT id, priority, set_nature, is_active
            FROM   public.classification_rules
            WHERE  id IN (
                '7e871e90-b6e8-4007-99af-b3d3ba09ecfa',
                'cc75b0ff-f56f-4da0-a2d8-ec83edb5a32c',
                '5fa79379-a232-415b-a01e-3a2c2e9d2b71',
                'd03dbac0-5f67-4a11-9dce-87cd4bd6ef3e'
            )
        ) r
    )
) AS verificacion;
