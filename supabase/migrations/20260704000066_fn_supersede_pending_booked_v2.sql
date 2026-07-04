-- 20260704000066_fn_supersede_pending_booked_v2.sql
-- P-023: fn_supersede_pending_booked v2 — descripción normalizada.
--
-- Problema v1: exigía description exacta (IS NOT DISTINCT FROM) → fallaba con mutaciones bancarias:
--   · Santander añade ":" al concepto  (CONCEPTO Alquiler → CONCEPTO: Alquiler)
--   · Kutxabank duplica el concepto    (OP.NET COMUN → OP.NET COMUN  OP.NET COMUN)
--   · 5 pares sin casar = −2.025,66 € de gasto duplicado visible (verificado 04-jul-2026).
--
-- Solución:
--   norm(x) = trim(regexp_replace(lower(replace(x, ':', '')), '\s+', ' ', 'g'))
--   Empareja si: norm(e)=norm(h)  OR  norm(h) ⊂ norm(e)  OR  norm(e) ⊂ norm(h).
--
-- Emparejamiento 1:1 estricto: ROW_NUMBER por ambos lados.
--   Un er_ no puede superseder a más de un h_, y viceversa.
--   Crítico: con dos h_ y dos er_ de −100 € misma fecha (Leo y Biel), la afinidad de
--   descripción mantiene cada par en su sitio; el test de verificación es la query de
--   pares cruzados (esperado: 0 filas).
--
-- Herencia de decisión: copia category_id, project_id, nature, is_reimbursable del h_
--   al er_ si el campo de er_ es NULL. Nunca sobrescribe campos no-NULL en er_.
--
-- Limitación conocida → T-040: exige misma date. Si el banco mueve la fecha valor entre
--   PENDING y BOOKED, el par no casará. Deuda registrada, no implementada.

CREATE OR REPLACE FUNCTION public.fn_supersede_pending_booked()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN

  -- ── Paso 1: supersede h_ → er_ ──────────────────────────────────────────────────────
  WITH norm_txns AS (
    SELECT
      id, account_id, date, amount, source, external_id, superseded_by,
      trim(regexp_replace(
        lower(replace(coalesce(description, ''), ':', '')),
        '\s+', ' ', 'g'
      )) AS norm_desc
    FROM public.transactions
    WHERE source        = 'psd2'
      AND superseded_by IS NULL
  ),
  candidates AS (
    SELECT
      h.id AS h_id,
      e.id AS e_id,
      -- 1:1 desde perspectiva h_: mejor er_ para cada h_ (orden determinista por e.id)
      ROW_NUMBER() OVER (PARTITION BY h.id ORDER BY e.id) AS rn_from_h,
      -- 1:1 desde perspectiva er_: mejor h_ para cada er_
      ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY h.id) AS rn_from_e
    FROM norm_txns h
    JOIN norm_txns e
      ON  e.account_id  = h.account_id
      AND e.date        = h.date
      AND e.amount      = h.amount
      AND h.external_id LIKE 'h\_%'
      AND e.external_id LIKE 'er\_%'
      AND (
            e.norm_desc = h.norm_desc
         OR position(h.norm_desc IN e.norm_desc) > 0
         OR position(e.norm_desc IN h.norm_desc) > 0
      )
  ),
  pairs AS (
    SELECT h_id, e_id
    FROM   candidates
    WHERE  rn_from_h = 1
      AND  rn_from_e = 1
  )
  UPDATE public.transactions t
  SET superseded_by = p.e_id,
      updated_at    = NOW()
  FROM pairs p
  WHERE t.id              = p.h_id
    AND t.superseded_by  IS NULL;   -- idempotencia: no reescribir si ya procesado

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ── Paso 2: herencia de decisión h_ → er_ ───────────────────────────────────────────
  -- Usa el vínculo superseded_by ya establecido en el paso 1 (o en runs anteriores).
  -- COALESCE garantiza que nunca sobrescribe campos no-NULL en er_.
  UPDATE public.transactions e
  SET
    category_id     = COALESCE(e.category_id,     h.category_id),
    project_id      = COALESCE(e.project_id,      h.project_id),
    nature          = COALESCE(e.nature,           h.nature),
    is_reimbursable = COALESCE(e.is_reimbursable,  h.is_reimbursable),
    updated_at      = NOW()
  FROM public.transactions h
  WHERE h.superseded_by  = e.id
    AND h.source         = 'psd2'
    AND h.external_id    LIKE 'h\_%'
    AND e.source         = 'psd2'
    AND e.external_id    LIKE 'er\_%'
    AND (
          (e.category_id     IS NULL AND h.category_id     IS NOT NULL)
       OR (e.project_id      IS NULL AND h.project_id      IS NOT NULL)
       OR (e.nature          IS NULL AND h.nature          IS NOT NULL)
       OR (e.is_reimbursable IS NULL AND h.is_reimbursable IS NOT NULL)
    );

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.fn_supersede_pending_booked() IS
  'v2 (P-023, mig-66): Neutraliza duplicados PSD2 PENDING(h_)→BOOKED(er_) con descripción '
  'normalizada. norm(x)=trim(regexp_replace(lower(replace(x,'':'','''')),''\\s+'','''' '',''g'')). '
  'Empareja por igualdad o contención de subcadena: cubre ":" de Santander y duplicación '
  'de Kutxabank. 1:1 estricto vía ROW_NUMBER por ambos lados. '
  'Hereda category_id/project_id/nature/is_reimbursable de h_ a er_ si NULL. '
  'Limitación T-040: exige misma date. Devuelve nº h_ neutralizadas. '
  'GRANT EXECUTE solo a service_role.';

-- ── P-022: re-verificar permisos ─────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_supersede_pending_booked() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_supersede_pending_booked() TO service_role;
