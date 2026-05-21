# EGMFin · Estado · 20 may 2026 · v10 · Fase 4 · Bloques 1 y 2

> **Sesión:** 20 may 2026 · Claude Code (CLI)
> **Cubre:** Bloques 1 y 2 de Fase 4 · Control · capa de estructura.
> **Estado anterior:** `EGMFin_Estado_20may2026_v10_fase4_paso1.md`
> **Commits:** `bac7f88` (mig 29) · `a93676c` (migs 30–32 + SCHEMA.md)

---

## A · Resumen ejecutivo

Sesión de implementación pura. Se completaron los Bloques 1 y 2 del briefing técnico Fase 4 §6, incluyendo un incidente de seguridad detectado durante los tests de Bloque 2 y resuelto en la misma sesión (mig 32). Todo código va a producción vía `npx supabase db push` con verificación post-push. Bloque 0 (componentes base) no iniciado — es el próximo paso.

---

## B · Bloque 1 — Mig 29 · Vistas SQL agregadas

**Commit:** `bac7f88` — `feat(schema): mig 29 · vistas SQL agregadas Fase 4 · splits-first + filtro transferencias`

**5 vistas creadas con `security_invoker = TRUE`:**

| Vista | Propósito |
|---|---|
| `v_spent_by_category_month` | Gasto real por (year, month, category_id, visibility). Splits-first. |
| `v_spent_by_category_week` | Gasto real por (week_start lunes ISO, category_id, visibility). |
| `v_category_budget_status` | FULL OUTER JOIN budgets × v_spent_by_category_month. Semáforo verde/ambar/rojo/sin_budget. |
| `v_median_spend_3m_by_category` | Mediana `percentile_cont(0.5)` últimos 3 meses completos. `months_with_data` para fallback ZBB. |
| `v_median_income_3m` | Mediana ingreso neto mensual por `user_id`. RLS de `incomes` aplica vía security_invoker. |

**Decisiones técnicas:**
- **Splits-first (§9.3):** `UNION ALL + NOT EXISTS`. Branch A: txns CON splits → usa `transaction_splits.(category_id, amount)`. Branch B: txns SIN splits → usa `transactions.(category_id, amount)`. Evita doble conteo. Future-proof cuando lleguen splits reales en Fase 5.
- **Filtro transferencias:** `t.nature IS DISTINCT FROM 'transferencia'` (NULL-safe). Permite `nature IS NULL` (txns pendientes); excluye solo `'transferencia'`. Filtro en `t.nature` porque `transaction_splits` no tiene columna `nature`.
- **`security_invoker=TRUE` chain:** PostgreSQL 15+ (Supabase Frankfurt) propaga el contexto RLS del usuario original a través de vistas encadenadas correctamente.

**Tests manuales post-push:** 4 tests ejecutados (SELECT, conteo, months_with_data) — todos correctos.

---

## C · Bloque 2 — Migs 30 y 31 · Cierres + Mig 32 · Fix seguridad

### C1 · Mig 30 — `weekly_closures`

Cierre semanal persistido. Idempotente vía UPSERT ON CONFLICT en el frontend.

**Schema:** `id, week_start (date lunes ISO), week_end, scope, total_spent, total_budget, semaforo, top_deviations jsonb, insights jsonb, closed_at, created_at, updated_at`.

**Constraints:** `UNIQUE(week_start, scope)` · `CHECK(week_end = week_start + 6)` · `CHECK scope IN(...)` · `CHECK semaforo IN(...)`.

**RLS:** SELECT/INSERT/UPDATE si `auth.uid() IS NOT NULL AND scope IN('privada_'||user_role(), 'compartida')`. Sin DELETE (integridad histórica).

**Tests:** A1–A7 — CHECK scope inválido ✅ · CHECK semaforo inválido ✅ · CHECK week_end ✅ · INSERT válido ✅ · UNIQUE duplicado ✅ · trigger updated_at ✅ · ausencia de DELETE policy ✅.

### C2 · Mig 31 — `monthly_closures`

Cierre mensual persistido. Campo `comparison_with_prev_month jsonb NULL` — null en primer mes, contiene `{prev_spent, prev_budget, delta_spent}` en meses sucesivos.

**Schema:** `id, year, month CHECK(1..12), scope, total_spent, total_budget, semaforo, top_deviations jsonb, category_breakdown jsonb, comparison_with_prev_month jsonb NULL, insights jsonb, closed_at, created_at, updated_at`.

**Constraints:** `UNIQUE(year, month, scope)` · `CHECK month BETWEEN 1 AND 12` · `CHECK scope IN(...)` · `CHECK semaforo IN(...)`.

**RLS:** igual patrón que `weekly_closures`. Sin DELETE.

**Tests:** B1–B5 — todos correctos incluyendo `comparison_with_prev_month = null` verificado.

### C3 · Incidente de seguridad → Mig 32 — `rls_auth_guard`

**Commit:** `a93676c`

#### Causa detectada

Durante los tests post-push de mig 30/31, se verificó que la `anon key` (pública en el bundle del frontend, visible para cualquier visitante) podía leer filas con `visibility/scope = 'compartida'` sin JWT válido, realizando peticiones HTTP directas a la API REST sin pasar por el frontend.

**Diagnóstico empírico:** anon key → 11 cuentas compartidas + 105 transacciones de cuentas compartidas. Datos privados (privada_eric, privada_ana): 0 filas — la RLS filtraba correctamente los privados. Solo los compartidos eran accesibles.

**Causa raíz:** las policies de las tablas afectadas usaban `user_role()` sin verificar existencia de JWT. Cuando `auth.uid()` es NULL (anon): `user_role()` devuelve NULL → `'privada_' || NULL = NULL` → `scope IN(NULL, 'compartida')` → solo pasa `compartida`. El comportamiento three-valued logic de SQL era correcto para datos privados pero dejaba pasar los compartidos.

**Alcance del problema:** pre-existente desde Fase 1, no introducido por Fase 4. Descubierto al establecer primer test sistemático de acceso anon.

#### Diagnóstico del schema completo

Se ejecutaron queries de catálogo (`pg_class`, `pg_policies`, `information_schema.role_table_grants`) para clasificar las 27 tablas del schema:

| Grupo | Tablas | Estado | Acción |
|---|---|---|---|
| C — vulnerable | accounts, assets, budgets, categories, liabilities, savings_goals, weekly_closures, monthly_closures | `user_role()` sin guard JWT | DROP + RECREATE policies con `auth.uid() IS NOT NULL AND` |
| D — vulnerable vía función | transactions, bank_account_links, holdings, transaction_splits | `can_see_account()` / `can_see_transaction()` sin guard JWT | `CREATE OR REPLACE FUNCTION` con guard |
| A — ya seguros | bank_connections, incomes, profiles, stock_option_grants, work_abroad_days, classification_rules, maristas_items, patrimonio_snapshots, projects, stock_prices, manual_holdings, manual_holdings_history, stock_options | `user_id = auth.uid()` · `auth.uid() IS NOT NULL` · `auth.role() = 'authenticated'` | Sin cambios |
| B — intencionalmente públicos | currency_rates, holding_prices | `USING(true)` — cache de mercado sin datos personales | Sin cambios |

**`relrowsecurity = true` confirmado en las 27 tablas** — no había policies decorativas (tablas con RLS off).

#### Fix aplicado

```sql
-- Grupo D: funciones (cubre 4 tablas sin tocar sus policies)
CREATE OR REPLACE FUNCTION public.can_see_account(p_account_id uuid) ...
  SELECT auth.uid() IS NOT NULL AND EXISTS (...)

CREATE OR REPLACE FUNCTION public.can_see_transaction(p_transaction_id uuid) ...
  SELECT auth.uid() IS NOT NULL AND EXISTS (...)

-- Grupo C: 8 tablas × 3 policies = 24 DROP IF EXISTS + 24 CREATE
-- Patrón: auth.uid() IS NOT NULL AND (visibility = 'privada_' || user_role() OR visibility = 'compartida')
```

Migración atómica con `BEGIN;` / `COMMIT;` explícito — fallo en cualquier punto revierte todo.

**Verificación post-push:**
- anon key → 0 filas en las 9 tablas verificadas (antes: 11 cuentas + 105 txns) ✅
- service_role → 25 cuentas + 170 txns sin cambio ✅
- `pg_proc`: 2 funciones, 0 sobrecargas — `CREATE OR REPLACE` reemplazó correctamente ✅

---

## D · Deudas registradas

### T-RLS-ANA

**Estado:** bloqueado hasta que Ana se registre (usuario real en `auth.users` + fila en `profiles` con `role='ana'`).

**Alcance:** test funcional completo de RLS tri-state Eric ↔ Ana en TODAS las tablas con scope/visibility: `accounts`, `transactions`, `budgets`, `weekly_closures`, `monthly_closures`. Es el **primer test real de aislamiento RLS del proyecto** — Ana nunca ha tenido sesión.

**Script de test:** ver `memory/project_rls_debt.md` en memoria de Claude Code.

### Observación mig 30 — `week_start` lunes no blindado a nivel BD

`CHECK(week_end = week_start + 6)` garantiza 7 días pero no que `week_start` sea lunes. La garantía viene del código de inserción vía `date_trunc('week')`. En V2 se puede blindar con `EXTRACT(ISODOW FROM week_start) = 1`. No bloquea V1.

---

## E · Aprendizajes doctrinales

### E1 · Catálogo crudo antes de auditoría de seguridad

Cuando se realiza una auditoría de seguridad RLS, el punto de partida correcto son los **outputs crudos de `pg_class`, `pg_policies`, `information_schema.role_table_grants`** — no la clasificación del implementador. La clasificación derivada del output crudo es verificable; la clasificación del implementador no lo es hasta ver los datos. Regla operativa: nunca aprobar scope de fix sin ver el mapa completo.

### E2 · `relrowsecurity` no es implícito por existencia de policies

PostgreSQL permite crear policies en tablas con RLS deshabilitado (`relrowsecurity = false`). En ese estado las policies son decorativas — no se aplican y la tabla es readable por cualquier rol con GRANT. **Verificar `relrowsecurity = true` es obligatorio antes de dar por segura cualquier tabla**, incluso si `pg_policies` muestra entries para ella.

### E3 · `auth.uid() IS NOT NULL` vs `user_id = auth.uid()`

Dos mecanismos de protección anon diferentes:
- `user_id = auth.uid()`: cuando `auth.uid()` es NULL, la comparación evalúa UNKNOWN (three-valued logic) → fila no pasa. Seguro, pero implícito.
- `auth.uid() IS NOT NULL`: evalúa FALSE explícito → fila no pasa. Más defensivo y auto-documentado.

Para nuevas policies en tablas tri-state, usar `auth.uid() IS NOT NULL AND (...)` como patrón estándar. Queda registrado como convención del proyecto.

### E4 · `BEGIN/COMMIT` explícito en migraciones de seguridad críticas

Aunque `supabase db push` envuelve cada migración en transacción implícita (golang-migrate), las migraciones que DROP + RECREATE policies deben incluir `BEGIN;` / `COMMIT;` explícito. Si el archivo se ejecuta por otro cliente (psql, SQL Editor), la atomicidad está garantizada sin depender del comportamiento del CLI. Coste: dos líneas. Beneficio: seguridad ante cualquier vector de ejecución.

---

## F · Pendientes operativos

1. **Bloque 0 — Extracción componentes base:** crear `/components/egm/` con 8 componentes base (Hairline, Label, Num, Roman, Card, Btn, Toggle, RadioChips) + ThemeSelector hook + reduce-motion hook. Es precondición de todos los Bloques visuales (3–7).

2. **Test 5c confirmación formal:** ejecutar en SQL Editor la query de `pg_proc` para `can_see_account` / `can_see_transaction`. Resultado esperado: 2 filas, 0 sobrecargas. **YA CONFIRMADO** por Eric en esta sesión — documentado aquí para trazabilidad.

3. **T-RLS-ANA:** cuando Ana se registre, ejecutar test completo de aislamiento RLS en todas las tablas tri-state.

---

## G · Estado del repo al cierre de sesión

- **Branch:** `main`
- **Último commit:** `a93676c` — migs 30–32 + SCHEMA.md cobertura 01–32
- **Migraciones aplicadas:** 01–32 (todas)
- **SCHEMA.md:** actualizado y sincronizado
- **Supabase:** producción intacta, RLS correcta, datos financieros privados no accesibles desde anon key
- **Frontend (Vercel):** sin cambios — Bloque 0 no iniciado
- **Bloque 0:** no iniciado

---

**Fin del estado 20-may-2026 · Bloques 1 y 2.**

Próximo estado esperado: tras completar Bloque 0 (componentes base).

— Claude Code · 20 may 2026.
