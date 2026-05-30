# EGMFin · Checklist de Auditoría Doctrinal

> Herramienta de proceso, no de doctrina. La doctrina vive en `EGMFin_Dossier_V3.md`; esto la traduce a aserciones verificables.
>
> **Para quién:** Claude Code, al cerrar cualquier paso/bloque, ANTES de pedir validación.
> **Objetivo:** que la auditoría salga del chat. Code se autoaudita contra esta lista y devuelve **solo el informe compacto** (§1), no el código. Si todo sale ✓, el arquitecto valida sin leer una línea. Solo se pega código en los ítems que salgan ✗ o DUDA.

---

## 0 · Cómo se usa

1. Code termina el trabajo de un paso.
2. Code recorre §2–§7 y marca cada ítem: **✓** (cumple) · **✗** (incumple) · **N/A** (no aplica a este paso) · **DUDA** (no está seguro).
3. Para cada ✓ que sea de cálculo o frontera, Code cita **la línea o el grep que lo demuestra** (no el archivo entero).
4. Code devuelve el informe del §1. Nada más.
5. Cualquier ✗ o DUDA = **PARA**. No se avanza ni se "arregla sobre la marcha" sin que el arquitecto decida.

**Regla de oro:** ante ✗, DUDA, o la tentación de inventar un campo/tabla/enum/vista para que algo encaje → parar y reportar. Nunca improvisar contra el schema o la doctrina.

---

## 1 · Formato de salida obligatorio (esto es lo único que se pega al chat)

```
AUDITORÍA — [Bloque/Paso] — commit/working
Resumen: N ítems · X ✓ · Y ✗ · Z N/A · W DUDA

✗ y DUDA (con evidencia):
- [ID] ✗  <aserción>  →  archivo:línea  →  <qué hace mal>
- [ID] DUDA  <aserción>  →  <por qué dudo>

✓ relevantes (cálculo/fronteras, con evidencia en una línea):
- [ID] ✓  <aserción>  →  archivo:línea

Dependencias nuevas en package.json: <ninguna | cuál y por qué>
Working tree: <limpio | qué hay sin commitear o sin trackear>
```

Si hay 0 ✗ y 0 DUDA, el arquitecto valida directamente. Si hay alguno, el arquitecto pide solo esas funciones.

---

## 2 · Invariantes duros (no-tocar)

- **INV-1** · Fase 3 intacta: drawer, comboboxes, `NatureSelect`, `TitularRadio`, `updateTransaction`, "Guardar como regla", `classification_rules`. Solo se invoca (`onRowClick`), nunca se edita.
- **INV-2** · Ingestión PSD2 intacta: `egmfin-jobs/`, `sync_psd2.py`, workflows, crons. (Los residuos `*.bak_pre_v10` y `analyze_eb_duplicates.py` son deuda de limpieza pre-existente, no del paso.)
- **INV-3** · RLS intocable: nada de `service_role` en frontend; toda lectura opera sobre lo que el usuario ya ve; vistas con `security_invoker=true`.
- **INV-4** · Cero DDL no autorizada: no crear tablas, columnas, enums ni vistas. Si una vista nueva fue autorizada explícitamente, va por migración + `SCHEMA.md` en el mismo commit.
- **INV-5** · Sin DELETE (integridad histórica). Archivar (`is_active=false`), no borrar.
- **INV-6** · Grants de tabla para escritura. Si el paso introduce escritura del frontend (INSERT/UPDATE/DELETE) sobre una tabla, verificar que el rol `authenticated` tiene el GRANT correspondiente a nivel de tabla (`information_schema.role_table_grants`), no solo la política RLS. RLS sin GRANT produce 42501 'permission denied' silencioso (200 + 0 filas). Evidencia requerida: nombre de tabla + privilegios de `authenticated` confirmados, o migración GRANT incluida en el mismo bloque.

## 3 · Reglas de cálculo y semántica del dinero (donde se cuelan los bugs)

- **CALC-1 · Transferencia interna = neutra.** Todo cómputo de gasto/consumo/baseline **excluye** `nature='transferencia'`. *Verificar:* el filtro de gasto no es solo `amount < 0`; excluye transferencias. *Reportar la línea del reduce de gasto.*
- **CALC-2 · Fórmula compartida.** El cálculo de "consumo/gasto" es el mismo helper en CONTROL y PLANNER (no dos fórmulas que puedan divergir). *Verificar:* existe una función compartida, no lógica duplicada.
- **CALC-3 · Remanente ≠ Ahorro.** Lo calculado (ingresos − consumo) se llama **Remanente**. "Ahorro" se reserva para `nature='ahorro'` (decisión humana). *Verificar:* ningún valor calculado se etiqueta "ahorro" en variable, prop o UI.
- **CALC-4 · Consumo ≠ asignación de capital.** Inversión (`nature='inversion'`) y capex de proyectos (Maristas) no entran en el consumo: son destino del remanente. *Verificar:* no se suman al gasto de consumo.
- **CALC-5 · Sin doble conteo.** Ningún concepto se resta o suma dos veces (p. ej. fijos que ya están dentro del gasto total y vuelven a restarse). *Verificar:* cada euro entra una sola vez en cada total.
- **CALC-6 · Maristas = proyecto.** El importe de Maristas se filtra por `project_id`, nunca por categoría. *Reportar la línea del filtro.*
- **CALC-7 · Nulos no se ocultan.** `nature=null` / `category_id=null` van a un cubo "Sin clasificar"/"Sin categoría", no se descartan (descartarlos falsea los totales).
- **CALC-8 · Enum real.** Las naturalezas usan los valores reales del CHECK vivo, no una lista asumida.

## 4 · Anti-deriva doctrinal (EGMFin ve y refleja; no infiere)

- **DOC-1 · Sin inferencia:** no se detecta periodicidad, no se marcan suscripciones, no se identifican duplicados automáticamente (P-014).
- **DOC-2 · Sin predicción:** nada de regresión/proyección. "Tendencia" = serie observada, jamás extrapolación.
- **DOC-3 · Sin optimización/sugerencia:** no se proponen bajas, downgrades ni "cestas optimizadas". Eso es Asesor IA (módulo VI), aplazado.
- **DOC-4 · Sin OCR / nivel-línea:** la granularidad es la transacción; el detalle de ticket es capa futura.
- **DOC-5 · Sin ranking por relevancia:** el sistema no decide *qué* mostrar por probabilidad/importancia. El orden es neutral (cronológico, por importe), no algorítmico.
- **DOC-6 · "Por revisar" = ausencia de decisión** (`category_id`/`nature`/`titular` null), no juicio de calidad del dato. Sin comparar contra `raw_concept`.
- **DOC-7 · Narrativa descriptiva:** cifras y comparación neutral. Sin adjetivos de valor, sin "deberías", sin recomendaciones.
- **DOC-8 · Sin autoseed:** lo observado nunca rellena automáticamente una decisión declarada.

## 5 · Datos y presentación

- **DAT-1 · `raw_concept` nunca visible.** La contrapartida se muestra (`counterparty ?? description`), nunca el bruto del banco.
- **DAT-2 · Reutilización:** vistas/componentes existentes se reutilizan, no se recrean (súper, fijos-espejo, drawer, `MonthSwitcher`…).
- **VIS-1 · Identidad editorial:** tokens del sistema (hairlines, serif Newsreader, Geist Mono). Sin sombras, radius, gradientes, chips de fondo, emojis ni iconos chart-up. Sin librerías de charting (SVG propio).
- **VIS-2 · Sin barras de progreso presupuestario / semáforo** (eso es ZBB, fase posterior).

## 6 · Higiene de proceso

- **PRO-1 · DDL solo vía migración** + `SCHEMA.md` actualizado en el mismo commit. Nunca SQL Editor.
- **PRO-2 · Imports al top** del archivo (P-017).
- **PRO-3 · Build verde** en `npx next dev` (Webpack, no Turbopack con grupos `(egm)` — T-002).
- **PRO-4 · Commits limpios:** uno por feature; no mezclar el trabajo del paso con residuos de limpieza ni con artefactos de verificación.
- **PRO-5 · Artefactos derivados fuera del repo:** dumps de schema, listados regenerables, carpetas de verificación → `.gitignore`, no a git.
- **PRO-6 · Working tree consciente:** reportar qué queda sin commitear/trackear y por qué.
- **PRO-7 · Identificadores en la serie correcta:** D-xxx = doctrina, T-xxx = deuda técnica, P-xxx = parches. No mezclar series ni reutilizar un id ya asignado. Antes de fijar uno nuevo, verificar el mayor en uso de esa serie.

## 7 · Específico del paso

> El arquitecto añade aquí 1–5 aserciones propias del paso concreto antes de entregarlo a Code (p. ej., para el Paso 3 de PLANNER: "TEND-1 · las tendencias son la serie observada, sin línea de regresión"; "DIN-1 · las tarjetas dinámicas dejan elegir el foco al usuario, no lo rankea el sistema").

- (vacío por defecto · se rellena por paso)

---

## Apéndice · por qué existe esto

En el Paso 2 de PLANNER se colaron cuatro defectos (transferencias no neutras, Maristas por categoría, "ahorro" mal nombrado, doble conteo de fijos). Dos se detectaron porque se preguntaron explícitamente; dos se escaparon porque la pregunta no se hizo. Un checklist completo, autoaplicado por Code, captura los cuatro sin que el arquitecto lea el código — y reserva los tokens para decidir, no para revisar.
