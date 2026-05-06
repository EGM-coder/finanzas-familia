-- ============================================================================
-- Migración 23 — GRANTs para tablas PSD2 (escritura desde frontend autenticado)
-- 06-may-2026
--
-- Contexto: hasta ahora EGMFin escribía solo vía service_role (scripts batch).
-- PSD2 es el primer flujo donde el frontend autenticado debe INSERT/UPDATE.
-- La RLS sigue protegiendo: user_id = auth.uid() en bank_connections,
-- can_see_account(account_id) en bank_account_links.
-- ============================================================================

GRANT INSERT, UPDATE ON public.bank_connections   TO authenticated;
GRANT INSERT, UPDATE ON public.bank_account_links TO authenticated;

-- Verificación
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('bank_connections','bank_account_links')
  AND grantee = 'authenticated'
ORDER BY table_name, privilege_type;
-- → 6 filas: SELECT (ya existía) + INSERT + UPDATE para cada tabla
