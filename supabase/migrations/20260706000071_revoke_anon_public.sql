-- mig-71 · 06-jul-2026 · Hardening: revoke ALL privileges from anon in schema public
-- P-027: grants inertes son deuda de seguridad; el perímetro se construye en capas.
-- El frontend usa exclusivamente authenticated; anon no necesita leer nada.
-- REVOKE no borra datos, solo permisos (compatible con P-026).
--
-- Situación antes de esta migración:
--   · anon tenía SELECT sobre 52 tablas/vistas (concedido por defecto al crear el proyecto).
--   · pg_default_acl mostraba {anon=r/postgres,...} para tables → cada tabla nueva nacía abierta.
--   · 0 brechas activas (18 vistas con security_invoker=true, policies RLS correctas),
--     pero la defensa de una sola capa no es suficiente.
--
-- Situación después:
--   · anon: 0 grants en public (verificar: SELECT count(*) FROM information_schema.role_table_grants
--     WHERE grantee='anon' AND table_schema='public' → 0).
--   · Objetos futuros nacen cerrados para anon (default privileges limpiados).
--   · authenticated y service_role intactos; ninguna policy tocada.

-- ── 1. Revoke explicit grants on existing objects ─────────────────────────────
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- ── 2. Revoke default privileges so future objects are born closed ─────────────
-- postgres es el rol que ejecuta las migraciones (current_user='postgres' verificado)
-- y el único grantor de anon=r en pg_default_acl para tables.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
