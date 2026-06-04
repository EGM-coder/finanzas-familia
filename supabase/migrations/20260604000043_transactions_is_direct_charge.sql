-- mig-43 · T-033: transactions.is_direct_charge
--
-- Flag booleano para cargos de raíl (PayPal/Amazon) que son gastos directos
-- sin pedido asociado: p.ej. cambio de asiento, fee puntual.
-- Decisión humana explícita — el sistema nunca lo infiere.
-- NOT NULL DEFAULT false: sin migración de datos; todos los existentes arrancan en false.

ALTER TABLE public.transactions
  ADD COLUMN is_direct_charge boolean NOT NULL DEFAULT false;
