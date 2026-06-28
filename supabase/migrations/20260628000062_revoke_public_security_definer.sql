-- 20260628000062_revoke_public_security_definer.sql
-- Cierra agujero de seguridad: las funciones SECURITY DEFINER eran ejecutables por anon.
-- Postgres concede EXECUTE a PUBLIC por defecto; PostgREST expone toda función public a anon.
-- Regla P-022: siempre REVOKE FROM PUBLIC en cada función SECURITY DEFINER nueva;
--   re-GRANT solo al rol intencionado.
--
-- Solo se tocan los 3 writers (anon podría escribir weekly_closures, transactions, snapshots).
-- Los helpers can_*/user_role se dejan para T-039 (riesgo: romper RLS si se hace en caliente).

-- ── fn_close_week ─────────────────────────────────────────────────────────────────────────
-- service_role ya tiene GRANT explícito (mig-61). Solo cerrar el PUBLIC.
REVOKE EXECUTE ON FUNCTION public.fn_close_week(date) FROM PUBLIC;

-- ── capture_patrimonio_snapshot ────────────────────────────────────────────────────────────
-- authenticated conserva su GRANT (mig-21, el cron interno lo usaba así).
-- Añadimos service_role (job externo) y cerramos PUBLIC.
REVOKE EXECUTE ON FUNCTION public.capture_patrimonio_snapshot() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.capture_patrimonio_snapshot() TO service_role;

-- ── fn_supersede_pending_booked ────────────────────────────────────────────────────────────
-- Llamada solo por sync_psd2.py (service_role). Cerrar PUBLIC, grant explícito service_role.
REVOKE EXECUTE ON FUNCTION public.fn_supersede_pending_booked() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_supersede_pending_booked() TO service_role;

-- ── VERIFICACIÓN (ejecutar tras aplicar para confirmar P-021: aplicado ≠ verificado) ────────
-- SELECT p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--        has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_exec
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.prosecdef;
-- Esperado: fn_close_week + fn_supersede_pending_booked + capture_patrimonio_snapshot
--   → anon_exec=false, svc_exec=true.
--   capture_patrimonio_snapshot además: auth_exec=true.
--   Helpers can_*/user_role: sin cambios (siguen con PUBLIC hasta T-039).

-- FIN migración --
