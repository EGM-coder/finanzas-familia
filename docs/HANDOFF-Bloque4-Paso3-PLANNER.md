# EGMFin v10 · Bloque 4 · PLANNER · Paso 3 · Handoff de ejecución

> Pégame a Claude Code en `~/Documents/finanzas-familia`. Autocontenido.
> Lee `docs/EGMFin_AUDIT_CHECKLIST.md` antes de empezar; al cerrar, autoaudítate contra él y devuelve el informe del §1 (no el código).

---

## 0 · Doctrina del paso

PLANNER es **lectura enriquecida del presente** (cockpit editorial), no ZBB, no predicción, no asesor. CONTROL limpia, PLANNER lee. Estamos en la capa de *vemos*.

Principio rector del Paso 3:

> El sistema **muestra series observadas y deja que el usuario elija el foco**. No extrapola, no rankea por relevancia, no propone. La superficie que algún día propondrá (Asesor IA, módulo VI) se **reserva como contenedor vacío**, nunca se rellena con heurística provisional.

---

## 1 · Decisiones de producto ya cerradas (no reabrir)

- **Tarjetas fijas, no dinámicas-por-relevancia.** Qué se muestra y en qué orden lo decide el diseño/usuario, no un score de importancia. (DOC-5)
- **Tendencia = serie observada.** Los últimos N meses tal como fueron. **Nunca** línea de regresión ni proyección al futuro. (DOC-2)
- **`AdvisorSlot` = contenedor sí, contenido no.** Se maqueta el hueco del asesor, vacío, hasta el módulo VI. Sin lógica de generación, sin sugerencia automática provisional. (DOC-1, DOC-3)

---

## 2 · Entregables

### 2.1 · Tarjetas de tendencia (serie observada)

Una sección nueva "Tendencia" que muestre la evolución de magnitudes **ya calculadas** a lo largo de los últimos N meses (propuesta: 6; confírmalo en el gate). Para cada magnitud, una sparkline o mini-barras de la serie real mes a mes.

Magnitudes (reutilizando el helper y las vistas ya existentes, **sin DDL**):
- **Consumo** mensual (vía `computeConsumo()` aplicado a cada mes de la ventana).
- **Remanente** mensual (ingresos − consumo de cada mes).
- **Supermercado** observado (`v_spent_by_category_month`, serie mensual).
- **Fijos** observados (`v_fixed_expenses_observed`, serie mensual).

Reglas:
- Es **la serie observada**, puntos reales por mes. Sin media móvil suavizada que parezca tendencia, sin línea de ajuste, sin proyectar el mes siguiente.
- Eje temporal real; meses sin dato = hueco honesto, no interpolado.
- Sin ranking: el orden de las tarjetas es fijo (el que definamos), no por "cuál se movió más".
- El usuario elige el foco por interacción (hover para ver el valor del mes, clic para ir a `/control?mes=` de ese mes) — eso es "dinámico" en el sentido permitido.

Componente: `PlannerTrend` (recibe `series: { mes: string; value: number }[]`, `label`, `color?`). SVG propio, tokens del sistema. **Sin librería de charting**, igual que `PlannerDonut`.

### 2.2 · AdvisorSlot (contenedor reservado, vacío)

Un bloque maquetado al cierre del dashboard, reservado para el Asesor IA (módulo VI):
- **Vacío de contenido real.** Placeholder honesto, p. ej.: *"El asesor analizará tu mes cuando esté disponible."*
- **Marcado visualmente como voz futura del asesor**, en registro distinto del resto (que es lectura descriptiva del sistema) — para que nunca se confunda dato con opinión. Sutil, editorial, sin estridencia.
- **Cero lógica de generación.** No calcula, no compara, no sugiere, no llama a ninguna IA. Es un `div` reservado con su sitio en el layout. Ninguna sugerencia automática "provisional".
- Componente: `AdvisorSlot` (sin props de datos; a lo sumo un flag futuro `enabled=false`).

---

## 3 · Gate de pre-trabajo (reporta antes de codificar)

1. **Ventana temporal:** ¿6 meses para las tendencias? Confírmalo. Implica fetch de transacciones de los últimos 6 meses (no solo 3 como el baseline). Reporta cómo lo cargas sin penalizar (una query por rango, agregación en memoria).
2. **Series desde vistas:** confirma que `v_spent_by_category_month` y `v_fixed_expenses_observed` devuelven year/month para construir la serie mensual directamente (sin recalcular).
3. **computeConsumo() por mes:** confirma que el helper se puede aplicar a una ventana de meses sin duplicar lógica (idealmente, agrupando las txns de la ventana por mes y aplicando el helper a cada grupo).
4. Reutilización: `PlannerGrid`, `PlannerCard`, `MonthSwitcher`, tokens — reutilizar, no recrear.

---

## 4 · Invariantes (del checklist; rollback si se violan)

- **INV-1/2/3** · Fase 3, ingestión PSD2 y RLS intactas. Solo lectura; vistas `security_invoker`.
- **INV-4** · **Cero DDL.** Las series salen de vistas existentes + `computeConsumo()` por mes. Si crees necesitar una vista para la serie → **PARA y pregunta** (no debería hacer falta).
- **CALC-1/2** · El consumo mensual de la serie usa el **mismo `computeConsumo()`** (excluye transferencias e inversión y el proyecto Maristas). No reimplementes la fórmula para la serie.
- **DOC-2** · Sin regresión, sin proyección, sin suavizado que simule tendencia futura.
- **DOC-3 / DOC-1** · `AdvisorSlot` sin contenido autogenerado. Ni una heurística provisional.
- **DOC-5** · Sin ranking por relevancia. Orden de tarjetas fijo.
- **VIS-1** · SVG propio, tokens, sin librerías de charting, sin sombras/radius/gradientes/emojis.
- **DAT-1** · `raw_concept` nunca visible.

## 5 · §7 del checklist — aserciones de ESTE paso (Code las verifica al cerrar)

- **TEND-1** · Las tendencias son la serie observada de los últimos N meses; no hay línea de regresión, proyección ni media móvil que simule futuro.
- **DIN-1** · Las tarjetas son fijas y su orden lo define el diseño, no un score de relevancia; la única "dinámica" es la interacción del usuario (hover/clic).
- **ADV-1** · `AdvisorSlot` se renderiza vacío, con placeholder honesto, sin ninguna lógica de cálculo, comparación o sugerencia. No invoca IA.

## 6 · Reglas operativas

- Etiqueta plataforma por paso. Step-by-step, commits limpios (serie de tendencias y AdvisorSlot pueden ir en commits separados).
- `npx next dev` (Webpack, no Turbopack con grupos `(egm)`).
- Imports al top (P-017).

## 7 · Entrega

Al terminar, devuelve **solo el informe del §1 del checklist** (✓/✗ + línea de evidencia + desviaciones), incluyendo TEND-1, DIN-1, ADV-1. No pegues el código. Si algo de diseño genera duda (como pasó con el layout del Remanente), PARA y reporta — no improvises.

---

**Empieza por el gate del §3 y reporta. No codifiques hasta confirmación.**
