-- mig-42 · T-031: GRANT DELETE en purchase_order_charges para authenticated
--
-- Necesario para la acción de desenlazar (unlinkCharge):
-- authenticated puede borrar filas propias (visibilidad gestionada por RLS).
-- INV-6: RLS solo + sin GRANT = 42501 silencioso.

GRANT DELETE ON TABLE public.purchase_order_charges TO authenticated;
