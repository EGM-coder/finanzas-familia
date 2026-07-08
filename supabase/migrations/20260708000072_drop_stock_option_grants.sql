-- mig-72 · 08-jul-2026 · DROP tabla fantasma stock_option_grants
-- Aprobado explícitamente por Eric en sesión 08-jul-2026.
-- La tabla fue creada en mig-05 y sustituida por stock_options (mig-16, P-010).
-- El DROP nunca se aplicó; tabla con 0 filas confirmado en reconciliación 8-jul.
-- P-026: operación destructiva con aprobación expresa. (A1 — ver §6.1 SCHEMA.md)

DROP TABLE IF EXISTS public.stock_option_grants;
