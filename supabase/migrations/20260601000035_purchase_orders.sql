-- mig-35 · purchase_orders
-- Pedido en origen (Amazon/PayPal). Un registro por pedido.

CREATE TABLE public.purchase_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL
                        CHECK (source IN (
                          'amazon_email','amazon_csv',
                          'paypal_email','paypal_csv','manual'
                        )),
  source_order_id     text,
  merchant            text,
  order_date          date NOT NULL,
  total_amount        numeric(12,2) NOT NULL,
  currency            text NOT NULL DEFAULT 'EUR',
  titular             text NOT NULL
                        CHECK (titular IN ('eric','ana','compartido')),
  visibility          text NOT NULL
                        CHECK (visibility IN (
                          'privada_eric','privada_ana','compartida'
                        )),
  is_financed         bool NOT NULL DEFAULT false,
  installment_count   int,
  installment_amount  numeric(12,2),
  first_charge_date   date,
  match_status        text NOT NULL DEFAULT 'sin_linkar'
                        CHECK (match_status IN (
                          'sin_linkar','parcial','completo'
                        )),
  ai_suggested        bool NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX purchase_orders_source_id_unique
  ON public.purchase_orders (source, source_order_id)
  WHERE source_order_id IS NOT NULL;

CREATE INDEX purchase_orders_order_date_idx
  ON public.purchase_orders (order_date DESC);
CREATE INDEX purchase_orders_match_status_idx
  ON public.purchase_orders (match_status)
  WHERE match_status != 'completo';
CREATE INDEX purchase_orders_titular_idx
  ON public.purchase_orders (titular);

CREATE TRIGGER set_updated_at_purchase_orders
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_select" ON public.purchase_orders
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      visibility = 'privada_' || public.user_role()
      OR visibility = 'compartida'
    )
  );

CREATE POLICY "purchase_orders_insert" ON public.purchase_orders
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      visibility = 'privada_' || public.user_role()
      OR visibility = 'compartida'
    )
  );

CREATE POLICY "purchase_orders_update" ON public.purchase_orders
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
      visibility = 'privada_' || public.user_role()
      OR visibility = 'compartida'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.purchase_orders TO authenticated;
