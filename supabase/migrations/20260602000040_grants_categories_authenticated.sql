-- Migración 40 (02-jun-2026): GRANTs faltantes a authenticated sobre categories
--
-- Causa: tabla creada en mig 01 (maestros.sql) con RLS correcto pero sin GRANT
--   de escritura para authenticated. SELECT funcionaba (grant via plataforma
--   Supabase), INSERT fallaba con SQLSTATE 42501 al intentar crear categorías
--   personalizadas desde /configuracion.
--
-- Mismo patrón que mig 22 (transactions), mig 23 (classification_rules),
--   mig 30 (budgets).
--
-- Idempotente: GRANT es no-op si ya existe.

GRANT INSERT, UPDATE ON TABLE public.categories TO authenticated;
