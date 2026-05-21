-- Hallazgo #1: patrimonio_snapshot_with_delta era la única vista sin security_invoker.
-- Con GRANT SELECT a anon, exponía el histórico de patrimonio neto a no autenticados
-- (bypass de RLS de patrimonio_snapshots). Fix: fijar security_invoker.
-- No cambia columnas, lógica, RLS, funciones, grants ni otras vistas.
alter view public.patrimonio_snapshot_with_delta set (security_invoker = true);
