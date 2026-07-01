# EGMFin — Estado 01-jul-2026 · Primer loop real: cierre semanal

## Hito de la sesión
Construido, backfilleado, asegurado y probado el PRIMER loop real de EGMFin: el cierre
semanal automático. Cron vivo; fraseo IA pausado a propósito hasta limpiar datos.

## Qué se construyó / decidió
- **weekly_closures**: primer escritor `fn_close_week` (SECURITY DEFINER, service_role only).
  Gate de salud → `data_health` (ok|parcial|roto) + `health_reason`. UPSERT idempotente por
  (week_start, scope). `insights` lo escribe el job, no la función.
- **Semáforo = vs-habitual** (mediana 8 semanas por categoría), NO vs-budget (D-022).
  Presupuesto diferido a su capa (módulo VIII, FY siguiente). `semaforo` NULL = sin histórico
  suficiente (<4 semanas base). `total_budget` NULL hasta entonces.
- **Semáforo discrecional** (D-024): el JUICIO excluye `fijo_recurrente`, traspasos, gasto de
  proyecto y categorías sin histórico. `total_spent` sigue reflejando TODO el gasto real.
  Vista `v_discretionary_spend_by_category_week`.
- **Exclusión de proyectos del basis** (D-023): `projects.kind` añadido;
  `v_spent_by_category_week` y `_month` excluyen `project_id IS NOT NULL` en ambas ramas.
- **Seguridad** (P-022): REVOKE EXECUTE FROM PUBLIC en funciones DEFINER writer
  (fn_close_week, capture_patrimonio_snapshot, fn_supersede_pending_booked). anon NO ejecuta.
- **/control = superficie única de decisión** (D-021): deep-link a sin_clasificar (predicado
  canónico `category_id IS NULL AND amount<0 AND superseded_by IS NULL`), cola cross-mes
  ("N en meses anteriores"), alta de categoría inline, toggle "pago directo".
- **Cron**: vivo; parte determinista verificada de punta a punta (frases canónicas templadas).
  Fraseo IA pausado por defecto vía repo variable `FRASEO_IA_ACTIVO` (default false).

## Migraciones de la sesión
- mig-61 `20260628000061_weekly_closures_health.sql` — weekly_closures data_health/health_reason + fn_close_week inicial
- mig-62 `20260628000062_revoke_public_security_definer.sql` — REVOKE EXECUTE FROM PUBLIC (fn_close_week, capture_patrimonio_snapshot, fn_supersede_pending_booked)
- mig-63 `20260629000063_fn_close_week_vs_habitual.sql` — fn_close_week vs-habitual; DROP NOT NULL en semaforo/total_budget; fix array_append (22P02)
- mig-64 `20260629000064_project_kind_view_exclusion.sql` — projects.kind ('general'|'viaje'); exclusión project_id IS NOT NULL en v_spent_by_category_week y _month
- mig-65 `20260701000065_fn_close_week_discrecional.sql` — v_discretionary_spend_by_category_week; fn_close_week semáforo vs discrecional; INNER JOIN excluye cats sin histórico

## Identificadores
D-021 (/control decisión), D-022 (vs-habitual), D-023 (proyectos fuera del basis),
D-024 (semáforo discrecional). P-022 (REVOKE PUBLIC en DEFINER). T-037 (prorrateo, DORMIDA
hasta módulo VIII). T-039 (endurecer anon en helpers RLS, backlog).

## Estado DB (al cierre de sesión)
- weekly_closures: 57 filas, 19 semanas (16-feb-2026 → 22-jun-2026). insights='[]' (backfill determinista).
- Distribución semáforo: 28 NULL, 16 verde, 2 ámbar, 11 rojo (todos discrecionales reales).
- Proyectos kind='viaje': "Val d'Aran · junio 2026" (11 txns, 410,52 €),
  "Mallorca · julio 2026" (4 txns, 443,00 €).

## Flecos abiertos (fichados, sin prisa)
- Categorizar backlog (73 sin clasificar); recomputar cierres al limpiar.
- Encender fraseo IA (FRASEO_IA_ACTIVO=true) cuando datos limpios.
- Gobierno de `nature` (default en categoría + herencia) — backlog.
- GitHub Action de auditoría de seguridad (diseñada, sin entregar).
- VIAJES completo (trip_details, multidivisa, auto-match PSD2, dashboard, UI etiquetado masa).
- "Panel de control del cierre en la app" (toggle fraseo + leer comentario + lanzar a mano):
  traer de GitHub a la UI de EGMFin.
- Revisar "Rutina familiar" (proyecto-cajón; soltar cosas a sus sitios reales).
