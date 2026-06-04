-- mig-44 · T-034: policy DELETE en purchase_order_charges
--
-- mig-37 creó la tabla con RLS habilitado y policies SELECT/INSERT/UPDATE.
-- mig-42 añadió GRANT DELETE para authenticated.
-- SIN esta policy, el GRANT es irrelevante: RLS deny-by-default bloquea
-- todos los DELETE → "Error al desenlazar el cargo" silencioso (INV-6).
--
-- Aplica la misma condición que SELECT: solo puede borrar quien puede
-- ver la transacción vinculada.

CREATE POLICY "pol_charges_delete" ON public.purchase_order_charges
  FOR DELETE USING (public.can_see_transaction(transaction_id));
