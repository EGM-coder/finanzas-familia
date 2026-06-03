-- mig-41 · T-026a: backfill first_charge_date = order_date para financiados
--
-- Problema: el parser fijaba first_charge_date = run_date (datetime.now()),
--   no la fecha real de la transacción. Los 4 pedidos financiados existentes
--   tenían first_charge_date = 2026-06-01 (fecha del primer run del parser).
--
-- Fix: first_charge_date debe ser order_date (fecha del email / transacción).
--   Para TRADEINN (order 2026-05-31) la proyección correcta es
--   ~31-may, ~30-jun, ~31-jul en v_purchase_commitments.
--
-- Idempotente: solo actualiza filas donde los valores difieren.

UPDATE public.purchase_orders
SET    first_charge_date = order_date
WHERE  is_financed = true
  AND  first_charge_date IS NOT NULL
  AND  first_charge_date <> order_date;
