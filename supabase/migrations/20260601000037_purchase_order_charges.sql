-- mig-37 · purchase_order_charges
-- Enlace cuota bancaria ↔ pedido. Un cargo solo pertenece a un pedido.

CREATE TABLE public.purchase_order_charges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL
                        REFERENCES public.purchase_orders(id)
                        ON DELETE RESTRICT,
  transaction_id      uuid NOT NULL
                        REFERENCES public.transactions(id)
                        ON DELETE RESTRICT,
  installment_number  int,
  match_method        text NOT NULL
                        CHECK (match_method IN (
                          'manual','ai_proposed','confirmed'
                        )),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX purchase_order_charges_txn_unique
  ON public.purchase_order_charges (transaction_id);

CREATE INDEX purchase_order_charges_order_idx
  ON public.purchase_order_charges (order_id);

ALTER TABLE public.purchase_order_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pol_charges_select" ON public.purchase_order_charges
  FOR SELECT USING (public.can_see_transaction(transaction_id));

CREATE POLICY "pol_charges_insert" ON public.purchase_order_charges
  FOR INSERT WITH CHECK (public.can_see_transaction(transaction_id));

CREATE POLICY "pol_charges_update" ON public.purchase_order_charges
  FOR UPDATE USING (public.can_see_transaction(transaction_id));

GRANT SELECT, INSERT, UPDATE ON public.purchase_order_charges TO authenticated;
