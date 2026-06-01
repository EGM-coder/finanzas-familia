-- mig-36 · purchase_order_lines + can_see_order()

CREATE OR REPLACE FUNCTION public.can_see_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.purchase_orders
    WHERE id = p_order_id
      AND (
        visibility = 'privada_' || public.user_role()
        OR visibility = 'compartida'
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_see_order(uuid) TO authenticated;

CREATE TABLE public.purchase_order_lines (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  uuid NOT NULL
                              REFERENCES public.purchase_orders(id)
                              ON DELETE CASCADE,
  description               text NOT NULL,
  quantity                  int NOT NULL DEFAULT 1,
  unit_amount               numeric(12,2) NOT NULL,
  total_amount              numeric(12,2) NOT NULL,
  category_id               uuid
                              REFERENCES public.categories(id)
                              ON DELETE SET NULL,
  project_id                uuid
                              REFERENCES public.projects(id)
                              ON DELETE SET NULL,
  ai_suggested_category_id  uuid
                              REFERENCES public.categories(id)
                              ON DELETE SET NULL,
  category_confirmed        bool NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchase_order_lines_order_idx
  ON public.purchase_order_lines (order_id);
CREATE INDEX purchase_order_lines_category_idx
  ON public.purchase_order_lines (category_id);

CREATE TRIGGER set_updated_at_purchase_order_lines
  BEFORE UPDATE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pol_lines_select" ON public.purchase_order_lines
  FOR SELECT USING (public.can_see_order(order_id));

CREATE POLICY "pol_lines_insert" ON public.purchase_order_lines
  FOR INSERT WITH CHECK (public.can_see_order(order_id));

CREATE POLICY "pol_lines_update" ON public.purchase_order_lines
  FOR UPDATE USING (public.can_see_order(order_id));

GRANT SELECT, INSERT, UPDATE ON public.purchase_order_lines TO authenticated;
