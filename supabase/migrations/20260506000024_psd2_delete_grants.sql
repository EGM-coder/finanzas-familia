-- ============================================================================
-- Migración 24 — GRANT DELETE para tablas PSD2 (eliminación desde UI)
-- 06-may-2026
--
-- Añade DELETE en bank_connections + bank_account_links para authenticated.
-- bank_account_links lo necesita para que el CASCADE funcione cuando se borra
-- una bank_connection (Postgres ejecuta CASCADE con privilegios del rol que
-- dispara el DELETE).
-- RLS sigue protegiendo: solo el owner puede borrar sus filas.
-- ============================================================================

GRANT DELETE ON public.bank_connections   TO authenticated;
GRANT DELETE ON public.bank_account_links TO authenticated;

-- Política DELETE en bank_connections (faltaba — solo había SELECT/INSERT/UPDATE)
CREATE POLICY bank_connections_delete ON public.bank_connections
  FOR DELETE USING (user_id = auth.uid());

-- Política DELETE en bank_account_links (CASCADE necesita evaluarla)
CREATE POLICY bank_account_links_delete ON public.bank_account_links
  FOR DELETE USING (public.can_see_account(account_id));

-- Verificación
SELECT polname, polcmd::text
FROM pg_policy
WHERE polrelid IN (
  'public.bank_connections'::regclass,
  'public.bank_account_links'::regclass
)
ORDER BY polname;
-- → 8 filas (SELECT/INSERT/UPDATE/DELETE × 2 tablas)
