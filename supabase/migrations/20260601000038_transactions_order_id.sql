-- mig-38 · transactions.order_id + v_purchase_commitments

ALTER TABLE public.transactions
  ADD COLUMN order_id uuid
    REFERENCES public.purchase_orders(id)
    ON DELETE SET NULL;

CREATE INDEX transactions_order_id_idx
  ON public.transactions (order_id)
  WHERE order_id IS NOT NULL;

CREATE OR REPLACE VIEW public.v_purchase_commitments
WITH (security_invoker = true)
AS
WITH paid_counts AS (
  SELECT
    poc.order_id,
    COUNT(*) AS cuotas_pagadas
  FROM public.purchase_order_charges poc
  GROUP BY poc.order_id
),
active_financed AS (
  SELECT
    po.id,
    po.installment_count,
    po.installment_amount,
    po.first_charge_date,
    po.visibility,
    po.titular,
    COALESCE(pc.cuotas_pagadas, 0)                                    AS cuotas_pagadas,
    po.installment_count - COALESCE(pc.cuotas_pagadas, 0)             AS cuotas_restantes
  FROM public.purchase_orders po
  LEFT JOIN paid_counts pc ON pc.order_id = po.id
  WHERE po.is_financed = true
    AND po.match_status != 'completo'
    AND po.installment_count IS NOT NULL
    AND po.installment_amount IS NOT NULL
    AND po.first_charge_date IS NOT NULL
),
cuotas_pendientes AS (
  SELECT
    af.id AS order_id,
    af.installment_amount,
    af.visibility,
    af.titular,
    (af.first_charge_date
      + ((af.cuotas_pagadas + gs.n - 1) * INTERVAL '1 month')
    )::date AS charge_date_projected
  FROM active_financed af
  CROSS JOIN generate_series(1, af.cuotas_restantes) AS gs(n)
)
SELECT
  date_trunc('month', charge_date_projected)::date AS mes,
  visibility,
  SUM(installment_amount)                          AS comprometido_eur,
  COUNT(*)::int                                    AS cuotas_pendientes
FROM cuotas_pendientes
GROUP BY 1, 2
ORDER BY 1;
