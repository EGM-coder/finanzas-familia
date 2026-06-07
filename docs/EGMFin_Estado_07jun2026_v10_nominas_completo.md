# EGMFin · Estado 07-jun-2026 (v10) — Módulo Nóminas completo

## Hecho en esta sesión

### Módulo Nóminas — entregado completo

**Infraestructura:**
- **Bucket privado `nominas`** (mig 47): Storage Supabase, `public=false`, solo PDF. Worker usa `service_role` → bypassa RLS. Policies `owner=auth.uid()` para futura subida desde la app.
- **Workflow `parse_nominas`** (`.github/workflows/parse_nominas.yml`): `workflow_dispatch` manual. Instala `poppler-utils` (apt-get) + `python-dotenv` + `supabase`. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EGMFIN_OWNER_USER_ID`.
- **`incomes_source_check` ampliado** (mig 49): añade `nordex_payslip` al CHECK. Valores completos: `manual`, `csv`, `psd2`, `gmail_parse`, `nordex_payslip`.
- **`v_median_income_3m` actualizada** (mig 48): filtra `type='nomina_mensual'` — excluye bonus y paga_extra para que no inflen la mediana usada como base de anticipación en Budget y Planner. Vista con `security_invoker=true`. Obsoleta la idea de calcular mediana desde `transactions`.

**Parser `egmfin-jobs/parse_nominas.py`:**
- Extrae texto con `pdftotext -layout` (subprocess).
- Campos anclados a códigos reales Nordex (ver §Mapeo abajo).
- Split generalizado: `EXTRA_CODES = {'2053': 'bonus', '4000': 'paga_extra'}` — extensible sin cambiar la lógica de split.
- `extract_extras`: suma TODAS las líneas de cada código respetando signo (4000 puede tener reversión negativa + recálculo positivo).
- Fila mensual = residual → cuadratura exacta garantizada.
- Asserts `Σfilas.net == net_total`, `Σfilas.irpf == irpf_total`, `Σfilas.gross == gross_total`.
- SANITY: `mensual.net` ∈ [1500, 7000] → WARN si no (detecta extras nuevos).
- Idempotencia: `source='nordex_payslip'`, `source_id=f"{date_iso}:{type}"`. SELECT previo → SKIP si ya existe.
- Visibilidad: log `parseadas=X | saltadas=Y | errores=Z`; exit 1 si cualquier error.

**Resultado en DB:**
- 11 filas `nomina_mensual` + 1 fila `bonus` (mayo 2026) en `public.incomes`.
- Planner lee `incomes` directo → muestra ingreso real del mes.
- `v_median_income_3m` ~3.210 €/mes (mediana 3m, solo `nomina_mensual`, robusta a outliers).

---

## Mapeo de códigos REAL Nordex (verificado en PDFs reales)

| Campo | Ancla | Notas |
|---|---|---|
| `net_amount` | Línea con `Importe:` (dos puntos) | Único en la línea de cuenta ****4940; "Importe remuneración" e "Importe prorrata" NO llevan dos puntos → sin colisión |
| `gross_amount` | Línea con `remuneraci` Y `mensual` (ASCII) | Rightmost money de esa línea |
| `irpf_withheld` | Línea `/401` → rightmost money | |
| `irpf_rate` | Línea `/401` → patrón `\d{1,3}\.\d{2}` (punto, sin coma) | ÷100 |
| `ss_withheld` | Suma de todas las líneas `/350`, `/370`, `/380`, `/SC0` | `/SC0` puede aparecer varias veces → sumar TODAS |
| periodo | Primera pareja de fechas `dd/mm/yyyy\D+?dd/mm/yyyy` en el texto completo | Día 1 del mes extraído |
| bonus (`2053`) | Todas las líneas `2053` → suma con signo | Libre Disposición |
| paga_extra (`4000`) | Todas las líneas `4000` → suma con signo | Puede tener reversión negativa + recálculo positivo |

**Cabecera posicional:** etiquetas en una fila, valores en la siguiente → anclar por patrón de datos (dos fechas, "Importe:", códigos numéricos), nunca por etiqueta de texto.

---

## Lecciones de la sesión

- **Cabecera = tabla posicional de 2 filas**: etiqueta ≠ línea del valor. `pdftotext -layout` mantiene la posición de columnas pero los valores están en la fila siguiente a las etiquetas. Anclar por patrón de datos, no por palabra-etiqueta (`PERIODO`, `LIQUIDO TOTAL`).
- **Anclas ASCII obligatorias**: `remuneraci` en lugar de `remuneración` (ó con tilde). Encoding del runner puede diferir del local → regex con caracteres acentuados falla silenciosamente.
- **`LIQUIDO TOTAL` es etiqueta suelta**: el neto real está en `Importe:` (con dos puntos, misma línea que la cuenta bancaria).
- **TRAMPA "Re-run" de Actions**: el botón "Re-run" de GitHub Actions replica el commit del run original, no el HEAD actual. Costó ~3 ciclos de depuración. Para probar el fix hay que disparar un nuevo `workflow_dispatch`.
- **`incomes_source_check` no documentado en SCHEMA.md**: el CHECK existía (mig 04) pero la columna `source` en §2.9 no listaba los valores. Corregido en esta sesión (mig 49 + SCHEMA.md).
- **`pdftotext` puede trocar de forma distinta en runner vs local**: `split('\n')` línea a línea falló cuando las dos fechas del periodo caían en líneas distintas. Solución: buscar sobre el texto completo con `re.search` y `\D+?` no-greedy.

---

## Interpretación de datos relevante

- **Julio/agosto 2025**: nóminas reducidas (baja paternidad); son reales, no errores.
- **Noviembre 2025**: regularización compleja — código `4000` con dos líneas (`-4.857,46 + 5.100,52 = 243,06` paga extra de julio), `0034` DIF Plus Función, `PC30` madre biológica. **Decisión: dejado como outlier** (no se re-parsea el histórico; la mediana 3m es robusta precisamente para esto). Las 11 filas ya insertadas en DB se saltan por idempotencia en re-runs.

---

## Hilos abiertos / siguiente agenda

### Nóminas — pendiente
- **Conciliación `incomes` ↔ `transactions`**: emparejar cada fila `nomina_mensual` con la transacción bancaria correspondiente (patrón Pedidos). Solo viable desde ~feb/mar 2026 (ventana PSD2 de 89 días). Las nóminas pre-PSD2 son declaradas sin contraparte bancaria → **no marcar como "pendientes de conciliación"** (generarían ruido falso).
- **Puente Mac iCloud → bucket**: subida automática de PDFs desde carpeta iCloud al bucket `nominas` + posible auto-disparo del workflow. Explorar con `fswatch` o n8n.
- **`art_7p_exempt_*`**: flujo aparte vía `work_abroad_days`. No está en la nómina mensual; se calcula al cerrar el año fiscal.

### Agenda global pendiente
- **ZBB plan-based**: replantear budget/planner — plan base de decisiones permanentes; lo mensual = ajustar deltas. Sesión de diseño pendiente.
- **Prevención duplicados en sync PSD2**: `external_id` no estable entre esquemas `h_` y `er_` → misma txn puede entrar dos veces. Decisión de diseño (no parche).
- **Reglas (admin + fix motor)**: (a) UI admin para ver/editar/borrar; (b) fix `_apply_first_matching_rule` — componer por campo, no parar en la primera regla que sombrea; (c) brittleness `PENDING`→`BOOKED` (`"CONCEPTO:"` vs `"CONCEPTO"`).
- **Drill-down por categoría en Control** (follow-up T-029).
