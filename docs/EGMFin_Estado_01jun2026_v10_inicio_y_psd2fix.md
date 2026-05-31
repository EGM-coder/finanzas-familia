# EGMFin · Estado 1 jun 2026 · v10 · Módulo I Inicio + Fix PSD2 crítico

> **Sesión:** Módulo I · Inicio en producción (layout escritorio egm-web) · Fix PSD2 422 + 4xx handling · Docs consolidados (SCHEMA.md + DESIGN_SYSTEM.md) · Flujo de ingresos migrado a transactions · Deudas D-002/003/004 cerradas.
> **Stack:** Next.js 15 App Router · React 19 · Tailwind v4 · Supabase SSR · SVG propio (sin librería de charting).
> **Doctrina:** Inicio = *vemos*. Solo lectura pura. Ninguna inferencia, ninguna predicción, ningún semáforo.

---

## 0 · Ancla doctrinal mínima

**Leer antes de cualquier otra cosa si el Dossier V3 no se ha leído en esta sesión.**

EGMFin es herramienta de **decisión consciente** sobre el patrimonio familiar (Eric + Ana), horizonte 2026-2036. **No** es tracking automatizado, ni dashboard reactivo, ni asesor financiero.

Tres leyes: *Primero vemos · luego anticipamos · después decidimos.*
- **Vemos** → Fases 1-3 (categorización) + CONTROL (Bloque 3) + **Inicio (Módulo I, esta sesión)**.
- **Decidimos** → ZBB (Bloque 5, v1 operativa desde sesión anterior).
- **Anticipamos** → simulación 10 años (futuro).

Módulo I (Inicio) es **portada situacional**: patrimonio real ahora, composición por clase, contingente separado del neto, flujo del mes observado. No predice, no propone, no compara contra objetivo. El número que ves es el número que es.

Test ante cualquier feature de Inicio: *¿es dato observado o es juicio del sistema?* Cualquier juicio → fuera.

---

## 1 · Ejecutado en la sesión

### Módulo I · Inicio · portada situacional (commits dffadb9 → 7ece912)

**Ruta:** `/inicio` → `app/(egm)/inicio/page.tsx` (Server Component) + `_components/InicioHero.tsx` (Client, solo para tween + breathe).

**Layout escritorio** según `egm-web.jsx` (WebHome), **no** `egm-app.jsx` (error corregido en commit 4f049e4):
- Padding `34px 50px 50px`, `maxWidth: 960`.
- Header flex: label "I · Inicio" + display 38px fecha editorial · roman "Estado situacional · familia" derecha.
- `rule-strong` separador de header.
- Grid principal `1.4fr 1fr`, gap 40.

**Bloque 1 · NÚCLEO** (columna izquierda):
- Héroe: `patrimonio_neto.liquidos_y_holdings`, display.num 96px, breathe CSS + tween rAF ease-out cubic 0.6s. `useReducedMotion` → 0.15s sin breathe.
- Sub-línea `.display-it`: *"Disponible hoy · inmueble y opciones Nordex aparte"*
- Neto actual `.roman`: `patrimonio_neto_actual`
- Δ temporal: `patrimonio_snapshot_with_delta.delta_neto_actual` vs 30 días (signal-pos/neg, oculto si < 0.50 €).
- "Si firmara hoy" **retirado** (commit 637a9c3): `patrimonio_neto_si_firmara_hoy` resta deudas proyectadas sin sumar el valor total del inmueble → cifra engañosamente negativa (−234k). La simulación correcta pertenece a Horizonte.

**Bloque 2 · COMPOSICIÓN** (columna izquierda, bajo rule):
- Grid `24px 1fr 100px 50px`: romano · nombre+nota · cifra · %.
- I · Líquido y fondos (`liquidos_y_holdings`) → con % sobre `activos_total`.
- II · Inmueble (`inmuebles`) → nota *"en construcción · valor comprometido"*, sin %.
- III · Deudas activas (`deudas_activas`) → signal-neg, sin %.

**Bloque 3 · CONTINGENTE** (columna derecha, bajo flujo card):
- `stock_options_intrinsic` de `patrimonio_neto`. Nunca suma al neto.
- Nota de ejercicio leída de `stock_options_valued`: `exercise_window_start` (no `vesting_date`) — si vesting es 2028 pero ventana abre 2029, nota dice "no ejercitable hasta 2029". Lógica adaptativa: ejercitable ahora / vested fuera de ventana / no ejercitable hasta {año}.

**Bloque 4 · FLUJO DEL MES** (columna derecha, card):
- **Ingresos:** `transactions` del mes, filtro `amount > 0 AND nature != 'transferencia' AND category_id IN (Nómina, Dividendos bajo "Ingresos")`. IDs resueltos por nombre+parentesco en runtime, no hardcodeados. Estado *"Ingresos del mes · pendiente"* en `.roman` cuando ingresosMes = 0 (principio de mes antes de nómina).
- **Mediana 3m:** `v_median_income_3m` siempre visible como referencia (nota: actualmente vacía porque lee de `incomes` — ver §5 frentes futuros).
- **Fijos:** suma `v_fixed_expenses_observed.total_spent` del mes (`nature='fijo_recurrente'`).
- **Margen:** ingresos − `computeConsumo(txns, maristasProjectId)`. Display.num 38px, signal-pos/neg. `incomes` no se toca — reservada módulo fiscal futuro.

---

### Fix PSD2 crítico (commits 94173e4 + b0a277c)

**Causa raíz:** `fetch_account_transactions` pedía `date_from = now − 90 días`. El límite regulatorio PSD2 sin SCA es estrictamente < 90 días. Kutxabank y Santander devolvían 422 Client Error. El `except Exception` lo logueaba (`❌ Error fetching`) y continuaba — el job terminaba exit 0, GitHub Actions verde, 0 inserciones desde ~14-15 mayo. **Dos semanas de datos congelados sin ninguna alerta.**

**Fix doble (P-016):**

1. **Ventana 90 → 89 días** (`DAYS_BACK = 89` y `days_back: int = 89`). Sigue configurable vía env var `DAYS_BACK`.
2. **4xx ahora marca exit ≠ 0:** `except requests.exceptions.HTTPError` distingue 4xx de 5xx. El job acumula `accounts_with_4xx` (no aborta — procesa todas las cuentas), y al final: `logger.error(...)` + `sys.exit(1)`. GitHub Actions rojo + notificación. Los 5xx siguen con `continue` (transitorios, no rompen el job).

**Lección archivada en P-016:** *un sync que falla en verde es peor que uno que se cae con estruendo.*

---

### Docs consolidados (commits 06db7eb, 5e13291, c862be9, ee499c7)

- **`docs/SCHEMA.md`** reconstruido desde cero leyendo las 39 migraciones (mig 01–34 + recovery). Incluye: RLS principles, helpers, 26 tablas, 12 vistas (columnas exactas P-009 verificado), grants, índice de migraciones, notas operacionales. Pre-commit hook activo: bloquea commits de migraciones sin `SCHEMA.md` staged.
- **`docs/EGMFin_DESIGN_SYSTEM.md`** creado como fuente única: tokens (egm.css), tipografía, motion (Emil), copy (Impeccable), prohibiciones §5 completas. DES-1 añadida al checklist: todo componente nuevo auditado contra este doc.
- **D-002/003/004** cerradas como obsoletas (verificación directa en repo).
- **P-015** añadido: colisiones de número lógico en migraciones (regla PRO-8 al checklist).

---

## 2 · Decisiones de la sesión

- **Fuente de ingresos del flujo = transactions**, no `incomes`. Razón: coherencia con `patrimonio_neto` (que ya lee de transactions vía `account_balances_full`). `incomes` reservada para módulo fiscal futuro (bruto/IRPF/SS por declaración).
- **Filtro de ingresos = Nómina + Dividendos** (hojas bajo "Ingresos", sort 14). Excluye explícitamente Reembolsos, Otros ingresos y `nature='transferencia'`. IDs resueltos dinámicamente por nombre+parentesco — no hardcodeados.
- **"Si firmara hoy" fuera de la portada.** El cálculo `activos − deudas_activas − deudas_proyectadas` no suma el valor del inmueble que la hipoteca financia → produce −234k engañoso. La simulación correcta requiere modelar el precio de compra completo (dato pendiente) y vive en Horizonte.
- **Exercise_window_start, no vesting_date**, para el año de la nota de opciones. Corrige el caso vesting 2028 / ventana 2029.
- **4xx bloquea el job, 5xx no.** Los errores de configuración/regulación (4xx) son deterministas — el operador debe actuar. Los de red/banco (5xx) son transitorios — reintentar en el siguiente cron.

---

## 3 · Estado del proyecto al cierre

### Repo · `main` (commits de esta sesión, cronológico)

| Commit | Descripción |
|--------|-------------|
| `5ca680f` | chore: limpieza de residuos + ignore _verify_backend/ |
| `ee499c7` | docs: housekeeping 31-may · D-002/003/004 obsoletas + P-015 + PRO-8 |
| `06db7eb` | docs: reescribir SCHEMA.md desde 39 migraciones |
| `5e13291` | docs: DESIGN_SYSTEM.md fuente única + DES-1 al checklist |
| `c862be9` | docs: reconciliar DESIGN_SYSTEM §5 con project knowledge |
| `dffadb9` | feat(inicio): Módulo I portada situacional solo lectura |
| `637a9c3` | fix(inicio): quitar "Si firmara hoy" · corregir año ejercitable |
| `4f049e4` | feat(inicio): reconstruir layout escritorio según egm-web.jsx |
| `94173e4` | fix(psd2): ventana 90→89 días · evitar 422 regulatorio |
| `b0a277c` | fix(psd2): 4xx marca job rojo · P-016 |
| `7ece912` | fix(inicio): ingresos del mes leídos de transactions, no de incomes |

### Archivos nuevos / modificados relevantes

- `app/(egm)/inicio/page.tsx` — nuevo (Server Component, Módulo I)
- `app/(egm)/inicio/_components/InicioHero.tsx` — nuevo (Client, tween + breathe)
- `egmfin-jobs/sync_psd2.py` — DAYS_BACK 90→89, 4xx handling (P-016)
- `docs/SCHEMA.md` — reescrito completo (39 migraciones)
- `docs/EGMFin_DESIGN_SYSTEM.md` — nuevo (fuente única diseño)
- `docs/EGMFin_AUDIT_CHECKLIST.md` — INV-6 + PRO-8 + DES-1
- `docs/PARCHES_Y_DEUDA_TECNICA.md` — D-002/003/004 obsoletas + P-015 + P-016

### Deuda técnica

| ID | Estado |
|----|--------|
| P-015 | ACTIVO (regla permanente: prefijo timestamp único en migraciones) |
| P-016 | RESUELTO (fix 422 + 4xx handling) |
| T-018 | Vigente, baja prioridad |
| D-001 | CHECK constraint `holding_prices` (baja) |

---

## 4 · Estado Módulo I · Inicio

**Operativo en producción.** Layout escritorio pixel-fidelity a egm-web.jsx.

**Funcionando correctamente:**
- Patrimonio neto líquido, composición por clase, Δ 30 días.
- Opciones Nordex con año de ejercicio real (exercise_window_start).
- Ingresos leídos de transactions (coherente con PN).
- Estado "pendiente" cuando no hay nómina/dividendos en el mes abierto.
- Fijos observados + margen = ingresos − consumo (computeConsumo compartido).

**Calibración pendiente (no bloqueante):**
- Desglose fino del líquido (cuentas + fondos separados vs agrupado actual).
- MonthSwitcher en el bloque de flujo para navegar meses históricos.
- Mediana 3m sin datos (ver §5 · frentes futuros).

---

## 5 · Frentes futuros · próxima sesión

### Módulo fiscal: nóminas PDF → incomes → Asesor IA

Cinco decisiones pendientes antes de activar el módulo fiscal:

1. ¿Cómo se ingestan las nóminas PDF? (manual vs script de extracción).
2. ¿Qué campos exactos de `incomes` (bruto, IRPF retenido, SS empleado, neto)? ¿Coinciden con los que el Asesor IA necesita para el Art. 7p?
3. ¿Declaración individual o conjunta como escenario base de cálculo?
4. ¿Se modela la nómina de Ana también en `incomes`, o solo la de Eric (por el Art. 7p)?
5. ¿Cuántos meses históricos de nóminas retroactivas vale la pena backfillear?

### v_median_income_3m: recalcular desde transactions

`v_median_income_3m` lee de `public.incomes` (vacía) → `median_monthly_income = NULL` → la referencia de mediana en Bloque 4 no aparece. Dos opciones:

- **Opción A · vista desde transactions:** nueva vista o reescribir la existente con el mismo filtro (Nómina+Dividendos, amount > 0, excl. transferencias), agrupando por mes. DDL: migración + SCHEMA.md. Coherente con la fuente ya elegida. Disponible cuando haya ≥ 3 meses histórico en transactions.
- **Opción B · poblar incomes retroactivo:** backfill manual mes a mes. La mediana de `incomes` recupera sentido, pero el módulo fiscal recibirá datos que no proceden de documentos fiscales (riesgo de mezcla).

Opción A recomendada por coherencia con la arquitectura. Implementar cuando el sync haya recuperado ≥ 3 meses de transactions (jul 2026 en adelante si el fix PSD2 funciona desde ahora).

### Tarjeta Kutxabank Eric: vigilar próximo sync

La tarjeta Kutxabank Eric estaba parada en 1-may antes del fix 422. El primer sync exitoso post-fix (≥ 1 jun) debería traer movimientos del 4-may al 1-jun (ventana de 28 días dentro del rango 89). Si tras el próximo cron la tarjeta sigue sin datos nuevos, revisar estado del consentimiento PSD2 en Enable Banking.

### Calibración Inicio pendiente

- **Desglose del líquido:** actualmente `liquidos_y_holdings` es un único número. Considerar desglose en composición (cuentas corrientes / fondos monetarios / cartera de inversión) para mayor granularidad en Bloque 2.
- **MonthSwitcher en flujo:** el Bloque 4 muestra siempre el mes actual. Un selector de mes (reutilizando el `MonthSwitcher` existente) permitiría ver el flujo de meses históricos sin necesidad de ir a CONTROL.

### Módulos pendientes del kit web

- **Módulo III · Maristas:** seguimiento de pagos cronograma, cuota estimada, acción crítica (pareja de hecho + seguro vida 850k antes de firma).
- **Módulo IV · Horizonte:** simulador 2026–2036 (3 escenarios) — requiere diseño doctrinal previo.
- **Módulo VI · Asesor IA:** slot disponible, requiere módulo fiscal operativo como fuente de contexto.

---

## 6 · Protocolo de arranque (sin cambios)

1. Memoria del proyecto.
2. `EGMFin_Dossier_V3.pdf/.md`.
3. Diseño: `docs/EGMFin_DESIGN_SYSTEM.md` + `egm.css`.
4. `docs/SCHEMA.md`.
5. `docs/EGMFin_AUDIT_CHECKLIST.md`.
6. **Este estado** · snapshot cierre 1-jun-2026.

---

**Fin del estado. Módulo I operativo. Tubería PSD2 restaurada. Próxima sesión: elegir frente entre §5.**
