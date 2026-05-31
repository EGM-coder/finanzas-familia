# EGMFin · Estado 30 may 2026 · v10 · Housekeeping backend + ZBB v1 operativo

> **Sesión:** Housekeeping backend (T-019 + T-011) cerrado · Bloque 5 · ZBB v1 (Pasos 1-2) operativo · Nueva invariante INV-6 al checklist (grants de escritura) · Memoria del proyecto actualizada con la trampa recurrente de grants Supabase.
> **Stack:** Next.js 15 App Router · React 19 · Tailwind v4 · Supabase SSR · SVG propio (sin librería de charting).
> **Doctrina:** ZBB = *decidimos* pleno. Asignar `amount_planned` por categoría hoja, cuadrar a cero. Sin semáforo (decisión futura). Sin autoseed.

---

## 0 · Ancla doctrinal mínima

**Leer antes de cualquier otra cosa si el Dossier V3 no se ha leído en esta sesión.**

EGMFin es herramienta de **decisión consciente** sobre el patrimonio familiar (Eric + Ana), horizonte 2026-2036. **No** es tracking automatizado, ni dashboard reactivo, ni asesor financiero.

Tres leyes: *Primero vemos · luego anticipamos · después decidimos.*
- **Vemos** → Fases 1-3 (categorización) + CONTROL (Bloque 3).
- **Decidimos** → ZBB (Bloque 5, v1 operativa desde esta sesión).
- **Anticipamos** → simulación 10 años (futuro).

ZBB (Bloque 5) es **asignación declarada del presupuesto** — el módulo de Controlling en su faceta de decisión. No observa (eso es CONTROL/PLANNER), no predice (eso es Anticipar), no propone (eso es el Asesor IA, módulo VI). La comparativa planificado vs real (Paso 2) es lectura sobre la decisión ya tomada, no evaluación: muestra las cifras lado a lado para que Eric decida.

Test ante cualquier feature: *¿refuerza el juicio del usuario o lo sustituye?* Semáforo y alertas sustituyen el juicio → fuera de v1.

---

## 1 · Ejecutado en la sesión

### T-019 (commit e62b4ca) — `v_spent_by_category_month` excluye inversión

- Migración 29 recrea la vista. WHERE pasa a `(t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))` en ambos branches (con splits y sin splits).
- Excluye `nature='inversion'`, preserva `nature IS NULL` (pendientes de clasificación — bug evitado: `NOT IN` con NULL hubiera descartado pendientes).
- `SCHEMA.md` actualizado en el mismo commit. Auditoría 9/9.

### T-011 (commit b98454a) — `raw_concept` limpio en `sync_psd2.py`

- `map_txn()`: `raw_concept` pasa de `json.dumps(txn)[:2000]` (JSON de transporte crudo) a `' | '.join(remittance_information)` (concepto bancario legible). `None` si `remittance_information` vacío. Sin fallback a `reference_number` (ese es `description`).
- Script `backfill_raw_concept_t011.py` standalone: dry-run por defecto, `--apply` para escritura. Idempotente (filtra `raw_concept LIKE '{%'`). 170 txns backfilled, 0 errores. Verificación post-apply: 0 filas con `raw_concept LIKE '{%'`. Auditoría 10/10.

### ZBB Paso 1 (commit 71aa934 + fix grants mig 30) — scaffolding + asignación

- Ruta `/budget` separada de `/planner`. `MonthSwitcher` reutilizado sin tocar.
- Fetch paralelo: categories (hojas agrupadas por padre), budgets (year/month/visibility='compartida'), `v_median_income_3m`.
- `BudgetShell` (client): `budgetMap` (Map category_id → amount_planned), `inputValues` (Map category_id → string). `spentMap` añadido en Paso 2.
- Persistencia ZBB: UPSERT ON CONFLICT `(year, month, category_id, visibility)` para amount > 0; UPDATE a 0 para rastro existente; no-op para sin-fila + 0/vacío (garantizado por caller). Sin DELETE por diseño de tabla.
- Footer sticky: Asignado (Σ amount > 0) · Sin asignar (medianIncome − asignado, rojo si negativo).
- **Fix grants (mig 30):** `authenticated` tenía solo SELECT sobre `budgets` → INSERT/UPDATE fallaban con 42501 silencioso (200 + 0 filas). `GRANT SELECT, INSERT, UPDATE` (no DELETE). Patrón mig 23. Auditoría 12/12.

### ZBB Paso 2 (commit 034a793) — comparativa planificado vs gastado real

- Fetch paralelo añade `v_spent_by_category_month` (year, month) → `SpentRowData[]`.
- Por hoja: "Gastado" (cifra real, solo lectura) + "Dif." (planificado − gastado). Diferencia negativa en `--signal-neg` (coherencia con "Sin asignar"), sin semáforo de umbral.
- Gastado aparece solo cuando > 0 (hojas sin gasto no muestran columna vacía). Diferencia aparece solo cuando hay gasto real.
- Footer añade "Gastado total" (Σ spentMap) entre Asignado y Sin asignar.
- Sin GRANT nuevo: `v_spent_by_category_month` es `security_invoker=true`, `authenticated` hereda SELECT de `transactions` vía `can_see_account`. Auditoría 17/17.

### INV-6 al checklist (commit dedicado)

- Nueva invariante en `docs/EGMFin_AUDIT_CHECKLIST.md`: grants de tabla para escritura del frontend. RLS + políticas no bastan sin GRANT de tabla a nivel SQL. Evidencia requerida: nombre de tabla + privilegios confirmados, o migración GRANT en el mismo bloque.

---

## 2 · Decisiones de la sesión

- **Persistencia ZBB (regla C+B):** hoja sin fila + 0/vacío → no persistir (base-cero puro). Hoja con fila + 0/vacío → UPDATE a 0 sin DELETE (historial intacto). `budgetMap` distingue `!has(id)` vs `get(id) === 0` vs `get(id) > 0`. Σ Asignado solo suma > 0.
- **"Sin asignar" vs remanente:** cuadra contra `v_median_income_3m` (ingresos medianos), no contra remanente. ZBB literal: planificar el ingreso esperado, no el sobrante observado.
- **`nature IS NULL` preservado:** pendientes de clasificación son gasto real, no descartarlos falsea los totales. Bug `NOT IN` con NULL evitado durante T-019.
- **`raw_concept` = concepto bancario legible.** El JSON de transporte era correcto para la ingestión pero inutilizable para reglas de clasificación y cualquier UI futura.
- **Trampa de grants Supabase elevada a invariante (INV-6) + memoria.** Las políticas RLS permiten o deniegan visibilidad, pero el GRANT de tabla controla el permiso SQL base. Sin GRANT, la operación falla con 42501 silencioso (HTTP 200, 0 filas escritas). Checklist lo captura en cada paso de escritura nueva.
- **Sin semáforo en v1.** La diferencia negativa usa `--signal-neg` por coherencia visual con "Sin asignar", no como juicio de umbral. Semáforo requiere diseño doctrinal propio (quién propone la referencia, cómo se comunica sin prescribir).

---

## 3 · Estado del proyecto al cierre

### Repo · `main`

Commits relevantes de la sesión (cronológico):
- T-019 migración + SCHEMA.md
- T-011 sync_psd2.py refactor + backfill script
- ZBB Paso 1 (page + BudgetShell + actions)
- Fix grants budgets (mig 30)
- INV-6 al checklist
- ZBB Paso 2 (page + BudgetShell comparativa)

### Schema

- **Mig 29** (`t019_v_spent_exclude_inversion.sql`): vista recreada, sin cambio de columnas.
- **Mig 30** (`grants_budgets_authenticated.sql`): GRANT INSERT, UPDATE a `authenticated` sobre `budgets`.
- Sin tablas ni columnas nuevas.

### Deuda técnica

| ID | Estado |
|----|--------|
| T-019 | **CERRADA** (mig 29) |
| T-011 | **CERRADA** (commit b98454a + backfill) |
| T-018 | Vigente, baja prioridad |
| D-001 | CHECK constraint `holding_prices` (baja) |
| D-002 | Migraciones 10/11/13 no commiteadas (media) |
| D-003 | `app/api/` — schema Copilot desactualizado (alta) |
| D-004 | `supabase/seed/` inexistente (alta) |

### Residuos de limpieza pendientes (no bloqueantes)

- `_verify_backend/` → añadir a `.gitignore`
- `egmfin-jobs/sync_psd2.py.bak_pre_v10`
- `egmfin-jobs/analyze_eb_duplicates.py`
- `EGMFin_Estado_21may2026_v10_fase4_verif_backend_fix1.md` (raíz del repo, desplazado)

---

## 4 · Estado ZBB

**v1 funcional:** asignación (Paso 1) + comparativa real (Paso 2).

**Deliberadamente fuera de v1:**
- Semáforo / umbrales (requiere diseño doctrinal).
- Visibilidad `privada_eric` / `privada_ana` (hardcoded `compartida` en v1).
- Bloqueo de edición para meses cerrados.

**Decisión latente (no deuda):** si el rastro de ceros en `budgets` (filas con `amount_planned=0`) estorba en una vista futura, se puede añadir política DELETE + GRANT DELETE. No urgente, no bloqueante.

---

## 5 · Próxima sesión · frentes posibles

- **ZBB v2:** semáforo/umbrales (requiere diseño doctrinal previo: propone referencia, no prescribe).
- **Asesor IA (módulo VI):** llenar `AdvisorSlot`. Requiere diseño doctrinal propio.
- **Inicio editorial / Horizonte** (módulos I/IV del kit).
- **Limpieza de residuos** (ver §3).

---

## 6 · Protocolo de arranque (sin cambios)

1. Memoria del proyecto.
2. `EGMFin_Dossier_V3.pdf/.md`.
3. Diseño (kit + `egm.css`).
4. `docs/SCHEMA.md`.
5. `docs/EGMFin_AUDIT_CHECKLIST.md` (incluye INV-6).
6. **Este estado** · snapshot ZBB v1 cerrado.

---

**Fin del estado. ZBB v1 operativo. Próxima sesión arranca eligiendo frente entre las opciones del §5.**

---

## Apéndice 31-may · housekeeping

- D-002/003/004 verificadas y cerradas como obsoletas (estado del repo ya las superaba).
- Residuos limpiados (commit 5ca680f).
- Hallazgo: colisiones de número lógico en migraciones → P-015. No se renumera (Supabase rastrea por nombre completo; renombrar rompe historial).
