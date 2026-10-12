-- mig-81 · 12-oct-2026 · P-034 — fn_supersede_pending_booked: 2.º criterio sin descripción
--
-- Problema (P-034): un PENDING (h_) con descripción genérica ("EMISION") no casa con su
--   BOOKED (er_) porque el criterio 1 exige que una descripción contenga a la otra.
--   Resultado: el h_ queda activo y el gasto se cuenta dos veces (Santander, 01-sep, −875,66).
--
-- Criterio 2 (nuevo, solo tras el criterio 1 y solo para pares cuyas descripciones NO se
--   contienen mutuamente):
--   - misma cuenta, importe exacto,
--   - fecha del BOOKED entre fecha PENDING y PENDING + 2 días,
--   - el BOOKED no es ya destino de otro h_ sustituido,
--   - emparejamiento ÚNICO en ambos lados: el h_ tiene un solo er_ candidato y el er_ un
--     solo h_ candidato. Si hay ambigüedad (p.ej. dos transferencias de −100 el mismo día),
--     no se casa: queda para fn_pending_review_dups / revisión humana.
-- Criterio 1 y el volcado de categoría/proyecto/nature: sin cambios.
-- Dry-run 12-oct sobre toda la BBDD: el criterio 2 solo casaría el caso 01-sep −775,66;
--   ninguno de los h_ activos de Kutxabank se ve afectado.

CREATE OR REPLACE FUNCTION public.fn_supersede_pending_booked()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count  integer;
  v_count2 integer;
BEGIN

  -- ── Criterio 1: importe + fecha idéntica + descripción contenida ─────────────
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
      ROW_NUMBER() OVER (PARTITION BY h.id ORDER BY e.id) AS rn_from_h,
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
    AND t.superseded_by  IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ── Criterio 2 (P-034): descripción distinta → importe + ventana 0..+2 días, único ──
  WITH norm_txns AS (
    SELECT
      id, account_id, date, amount, external_id,
      trim(regexp_replace(
        lower(replace(coalesce(description, ''), ':', '')),
        '\s+', ' ', 'g'
      )) AS norm_desc
    FROM public.transactions
    WHERE source        = 'psd2'
      AND superseded_by IS NULL
  ),
  used_booked AS (
    SELECT DISTINCT superseded_by AS id
    FROM public.transactions
    WHERE superseded_by IS NOT NULL
  ),
  candidates AS (
    SELECT
      h.id AS h_id,
      e.id AS e_id,
      NOT (
            e.norm_desc = h.norm_desc
         OR position(h.norm_desc IN e.norm_desc) > 0
         OR position(e.norm_desc IN h.norm_desc) > 0
      ) AS desc_distinta
    FROM norm_txns h
    JOIN norm_txns e
      ON  e.account_id  = h.account_id
      AND e.amount      = h.amount
      AND e.date BETWEEN h.date AND h.date + 2
      AND h.external_id LIKE 'h\_%'
      AND e.external_id LIKE 'er\_%'
    WHERE e.id NOT IN (SELECT id FROM used_booked)
  ),
  counted AS (
    SELECT
      h_id, e_id, desc_distinta,
      COUNT(*) OVER (PARTITION BY h_id) AS n_from_h,
      COUNT(*) OVER (PARTITION BY e_id) AS n_from_e
    FROM candidates
  ),
  pairs AS (
    SELECT h_id, e_id
    FROM   counted
    WHERE  desc_distinta
      AND  n_from_h = 1
      AND  n_from_e = 1
  )
  UPDATE public.transactions t
  SET superseded_by = p.e_id,
      updated_at    = NOW()
  FROM pairs p
  WHERE t.id              = p.h_id
    AND t.superseded_by  IS NULL;

  GET DIAGNOSTICS v_count2 = ROW_COUNT;

  -- ── Volcado de clasificación h_ → er_ (sin cambios) ─────────────────────────
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

  RETURN v_count + v_count2;
END;
$function$;
