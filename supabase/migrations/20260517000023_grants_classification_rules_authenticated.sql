-- ============================================================
-- Migración 23: GRANTs faltantes a authenticated sobre classification_rules
-- ============================================================
-- Diagnóstico (17-may-2026, Fase 3 Paso 8):
--   information_schema.table_privileges muestra que `authenticated`
--   solo tenía SELECT sobre public.classification_rules. Las policies
--   RLS existían correctas pero a nivel SQL faltaban los GRANTs.
--   createRule (server action) fallaba con "permission denied".
--
-- Se otorgan INSERT, UPDATE, DELETE:
--   - INSERT: createRule desde el sub-form del drawer.
--   - UPDATE: futura pantalla /ajustes/reglas-categorizacion (Fase 5).
--   - DELETE: deleteRule (rollback de Deshacer del toast en Paso 8).
--
-- Idempotente: GRANT es no-op si ya existe.
-- ============================================================

grant insert, update, delete on table public.classification_rules to authenticated;
