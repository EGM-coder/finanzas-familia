-- ============================================================
-- Migración 22: GRANTs faltantes a authenticated sobre transactions
-- ============================================================
-- Diagnóstico (17-may-2026, Fase 3 Paso 7):
--   information_schema.table_privileges muestra que `authenticated`
--   solo tenía SELECT sobre public.transactions. Las policies RLS de
--   INSERT/UPDATE existían correctas pero a nivel SQL faltaban los GRANTs.
--   Por eso `sync_psd2.py` (service_role) podía escribir, pero
--   `updateTransaction` desde el frontend (rol authenticated) fallaba
--   con "permission denied for table transactions".
--
-- Doctrina: NO se otorga DELETE — la tabla preserva histórico (sin DELETE).
-- Idempotente: GRANT es no-op si ya existe.
-- ============================================================

grant insert, update on table public.transactions to authenticated;
