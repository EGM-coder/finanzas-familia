# EGMFin · Estado 25 may 2026 · v10 · Bloque 4 (PLANNER) cerrado

> **Sesión:** Bloque 3 (CONTROL) confirmado en producción · Bloque 4 (PLANNER) Pasos 1-3 completados · Dossier V3 actualizado (módulo Controlling, doble granularidad, PLANNER lectura) · checklist de auditoría doctrinal integrado al repo.
> **Stack:** Next.js 15 App Router · React 19 · Tailwind v4 · Supabase SSR · Framer Motion · SVG propio (sin librería de charting).
> **Doctrina:** Next.js = esqueleto · Figma kit = piel. PLANNER = lectura enriquecida del presente (no ZBB, no predicción).

---

## 0 · Ancla doctrinal mínima

**Leer antes de cualquier otra cosa si el Dossier V3 no se ha leído en esta sesión.**

EGMFin es herramienta de **decisión consciente** sobre el patrimonio familiar (Eric + Ana), horizonte 2026-2036. **No** es tracking automatizado, ni dashboard reactivo, ni asesor financiero.

Tres leyes: *Primero vemos · luego anticipamos · después decidimos.*
- **Vemos** → Fases 1-3 (categorización) + CONTROL (Bloque 3).
- **Decidimos** → ZBB (futuro).
- **Anticipamos** → simulación 10 años (futuro).

PLANNER (Bloque 4) es **lectura enriquecida del presente** — el módulo de Controlling en su faceta de comprensión. No decide (eso es ZBB), no predice (eso es Anticipar), no propone (eso es el Asesor IA, módulo VI). Tiene derecho a existir como capa de lectura **porque CONTROL ya cerró el ciclo de decisión operativa**.

Test ante cualquier feature: *¿refuerza el juicio del usuario o lo sustituye?* Si lo sustituye (detección, predicción, optimización, ranking por relevancia, autoseed), no entra.

---

## 1 · Ejecutado en la sesión

### Dossier V3 actualizado (opción A: enriquecer, no pivotar)
- Capítulos nuevos: **05 bis · módulo de Controlling** (doble granularidad: nivel transacción operativo hoy · nivel línea cuando exista captura de tickets, capa futura) y **05 ter · PLANNER cockpit de lectura**.
- Reglas oficializadas: transferencia interna = neutra (par espejo) · Remanente ≠ Ahorro · consumo ≠ asignación de capital · Maristas = proyecto.
- Ajuste de tiempo verbal del OCR a "capa futura" sin alterar la visión.

### Checklist de auditoría doctrinal (`docs/EGMFin_AUDIT_CHECKLIST.md`)
- Traduce el Dossier a aserciones verificables. Code se autoaudita al cerrar cada paso y devuelve informe compacto (✓/✗ + evidencia), no el código. Cambio de proceso: la auditoría sale del chat.

### Bloque 4 · PLANNER (ruta `/planner`)
- **Paso 1** (commit `6d35155`): ruta, `MonthSwitcher` reutilizado, `computePlannerData()`, `PlannerGrid`/`PlannerCard`/`PlannerShell`, tarjetas base.
- **Paso 2** (commits `c86fccd`, `650177f`): visuales (`PlannerDonut` SVG, `PlannerBarCompare`), comparativa mes vs media 3m, `PlannerNarrative` descriptiva, sección Asignación de capital. **Fix doctrinal:** helper compartido `computeConsumo()` (excluye transferencias e inversión y proyecto Maristas) usado en PLANNER y CONTROL · Maristas por `project_id` · Remanente (no "Ahorro") · sin doble conteo de fijos · Remanente a ancho completo.
- **Paso 3** (commits del paso + `843c74f` + reclasificación T-019): tarjetas de **tendencia** = serie observada de 6 meses (`PlannerTrend` SVG, sin regresión ni proyección) · `AdvisorSlot` = contenedor reservado y vacío para el Asesor IA (módulo VI), sin lógica.

---

## 2 · Decisiones doctrinales de la sesión

- **PLANNER = lectura (no ZBB).** ZBB y Anticipar son módulos posteriores. Quedó explícito en el Dossier para no confundir con el kit.
- **Remanente = ingresos − consumo** (calculado). **Ahorro = `nature='ahorro'`** (decisión humana). No se mezclan.
- **Consumo** = gasto que NO es transferencia, inversión ni capex de proyecto. Inversión y Maristas son **asignación de capital** (destino del remanente), no consumo.
- **Transferencia interna = neutra:** fuera de consumo, remanente y capital. Identificada por par espejo.
- **Maristas = proyecto** (`project_id`), nunca categoría.
- **AdvisorSlot: contenedor sí, contenido no.** Vacío hasta módulo VI; ni una heurística provisional.
- **Tendencia = serie observada,** nunca regresión/proyección. Tarjetas fijas, orden definido por diseño, no por relevancia.

---

## 3 · Estado del proyecto al cierre

### Repo `EGM-coder/finanzas-familia` · `main`
Commits relevantes de la sesión: Dossier V3 · checklist · PLANNER Pasos 1-3 · fix doctrinal consumo/Remanente/Maristas · reclasificación deuda a T-019.

### Schema
- Sin DDL nueva en Bloque 4 (PLANNER consume vistas existentes + agregación en servidor).
- Vistas reutilizadas: `v_spent_by_category_month`, `v_fixed_expenses_observed`, `v_median_income_3m`.

### Helper compartido
- `_lib/computeConsumo.ts` — única fórmula de consumo, usada por CONTROL y PLANNER (no divergen).

### Deuda técnica registrada esta sesión
- **T-019** · `v_spent_by_category_month` excluye `nature='transferencia'` pero NO `nature='inversion'`; la serie de Supermercado podría incluir un gasto marcado inversión que `computeConsumo()` excluye. Inconsistencia teórica, no práctica. Resolverla tocaría la vista (DDL) → housekeeping de backend. **Hermana de T-011** (raw_concept sucio): ambas son "ingestión/vista que no distingue lo que la doctrina sí distingue". Mirar juntas.

### Convención de identificadores (formalizada esta sesión)
- **D-xxx** = decisiones doctrinales · **T-xxx** = deuda técnica (este archivo + `PARCHES_Y_DEUDA_TECNICA.md`) · **P-xxx** = parches/lecciones. No mezclar series. Al asignar ID nuevo, verificar el mayor en uso de esa serie.

### Pendientes operativos NO bloqueantes
- T-011 · refactor `sync_psd2.py` para `raw_concept` limpio (housekeeping backend).
- T-019 · ver arriba.
- Categorización manual en curso (~90 txns pendientes, ritmo de Eric, no objetivo de sesión).
- Residuos de limpieza: `_verify_backend/` (→ .gitignore), `sync_psd2.py.bak_pre_v10`, `analyze_eb_duplicates.py`.

---

## 4 · Próxima sesión · opciones de continuación

PLANNER cerrado. Frentes posibles (decisión de Eric al arrancar):
- **ZBB** (presupuesto base-cero) — el *decidimos* pleno: asignar `amount_planned` por categoría, cuadrar a cero. Tabla `budgets` existe sin datos.
- **Asesor IA (módulo VI)** — llenar el `AdvisorSlot`. Requiere diseño doctrinal propio (propone, nunca decide).
- **Housekeeping backend** — T-011 + T-019 juntas (ingestión/vistas que no distinguen lo que la doctrina sí).
- **Inicio editorial / Horizonte** — módulos I/IV del kit.

### Protocolo de arranque (estricto, sin cambios)
1. Memoria del proyecto.
2. `EGMFin_Dossier_V3.pdf/.md` (actualizado esta sesión).
3. Diseño (kit + `egm-*.jsx` + `egm.css`).
4. `docs/SCHEMA.md`.
5. `docs/EGMFin_AUDIT_CHECKLIST.md` (nuevo · usar al cerrar pasos).
6. **Este estado** · snapshot Bloque 4 cerrado.

---

**Fin del estado. PLANNER completo. Próxima sesión arranca eligiendo frente entre las opciones del §4.**
