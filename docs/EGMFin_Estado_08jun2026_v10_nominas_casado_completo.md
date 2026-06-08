# EGMFin · Estado 08-jun-2026 (v10) — Nóminas + Casado completo

## Hecho en esta sesión

### Módulo Nóminas + Casado — entregado end-to-end

Verificado en DB: feb–may 2026 = `cuadrado`. Mayo M:N: 2 incomes (`nomina_mensual` 3.209,81 + `bonus` 14.404,14) ↔ 1 depósito 17.613,95 → `v_income_reconciliation` = cuadrado.

---

## Piezas del sistema

| Pieza | Archivo / objeto | Estado |
|---|---|---|
| Parser endurecido | `egmfin-jobs/parse_nominas.py` | ✓ en producción |
| Bucket PDFs | `nominas` (Supabase Storage, mig 47) | ✓ |
| Tabla enlace M:N | `public.income_charges` (mig 50) | ✓ en DB |
| Vista reconciliación | `public.v_income_reconciliation` (mig 50) | ✓ en DB |
| Server actions | `app/(egm)/ingresos/_actions/nominas.ts` | ✓ |
| Panel UI | `app/(egm)/ingresos/page.tsx` + `NominasShell.tsx` | ✓ navegable |
| Punto de entrada | Inicio → bloque Flujo → "conciliación nóminas →" | ✓ |

---

## Parser — estado final

### Net extraction
`extract_net`: suma **TODOS** los "Importe:" del PDF (multi-transferencia diciembre: 2.531,01 + 5.567,17 = 8.098,18).  
Cross-check opcional: busca línea con "T.DEVENGOS", lee la siguiente línea no vacía, toma **penúltimo** token = T.DEVENGOS y **último** token = T.DEDUCC. `assert |net − (devengos − deducc)| ≤ 0.01`. Si el header no se localiza → WARN y continúa (soft, no bloquea).

### Componentes del split
| Componente | Ancla | Tipo en incomes | IRPF/SS |
|---|---|---|---|
| Extras (bonus, paga_extra) | Códigos EXTRA_CODES sobre líneas | `bonus` / `paga_extra` | IRPF = gross × rate; SS = 0 |
| Dietas/reembolsos | Concepto con "Dieta", "Klm" o "Kilom" | `dietas` | IRPF = 0; SS = 0 (suplido V1) |
| Mensual | Residual (garantiza cuadratura) | `nomina_mensual` | irpf/ss del PDF menos extras |

### EXTRA_CODES
```python
EXTRA_CODES = {
    '2053': 'bonus',      # Libre Disposición
    '4000': 'paga_extra', # Paga extra (regularización)
    '4001': 'paga_extra', # Paga Extra Navidad
    '3068': 'paga_extra', # Compl. Paga Extra maternidad
}
```
Múltiples códigos → mismo type: `extract_extras` acumula (`+=`), no sobreescribe.

### Mapeo de campos verificado en PDFs reales Nordex

| Campo | Ancla en el PDF | Notas |
|---|---|---|
| `net_amount` | Suma de todas las líneas con `Importe:` (dos puntos) | "Importe remuneración" e "Importe prorrata" no llevan dos puntos → sin colisión |
| `gross_amount` | Línea con `remuneraci` Y `mensual` (ASCII) → rightmost money | Ancla ASCII para evitar encoding issues en runner |
| `irpf_withheld` | Línea `/401` → rightmost money | |
| `irpf_rate` | Línea `/401` → patrón `\d{1,3}\.\d{2}` (punto, sin coma) → ÷100 | Formato diferente al dinero |
| `ss_withheld` | Suma de `/350` + `/370` + `/380` + todas las `/SC0` | `/SC0` puede repetirse |
| `periodo` | Primera pareja `dd/mm/yyyy\D+?dd/mm/yyyy` en texto completo | Busca sobre texto completo, no línea a línea |
| extras | Código EXTRA_CODES al inicio de línea → suma con signo | 4000 puede tener reversión negativa |
| dietas | "Dieta" / "Klm" / "Kilom" en el concepto | Rightmost money |

### Golden tests
| Fixture | Verificado |
|---|---|
| `2026-01`: net 3.223,55; gross 5.343,95; irpf 1.526,69; ss 333,83 | ✓ |
| `2026-05`: net 17.613,95; bonus 20.577,35; 2 filas | ✓ |
| `112025`: paga_extra 243,06 (−4.857,46 + 5.100,52) | ✓ fixture |
| `122025`: net 8.098,18; paga_extra 5.503,92 (4001+3068) | golden partial (dietas TBD) |

---

## Casado Nóminas — arquitectura M:N

### Por qué M:N (no 1:N como Pedidos)
Un depósito bancario cubre **todas las filas** de ingresos del mes:
- Enero: 1 income × 1 depósito = 1 fila en `income_charges`
- Mayo: 2 incomes (mensual + bonus) × 1 depósito = 2 filas
- Diciembre: 3 incomes (mensual + paga_extra + dietas) × 2 depósitos = 6 filas (multi-transferencia)

`UNIQUE (income_id, transaction_id)` — no `UNIQUE (transaction_id)`.

### v_income_reconciliation
Vista con `security_invoker = TRUE`. Columnas clave:

| Columna | Descripción |
|---|---|
| `incomes_net` | `SUM(net_amount)` de todas las filas del mes (mensual+bonus+paga_extra+dietas) |
| `candidate_dep` | `SUM(amount)` de depósitos Nordex candidatos en transactions |
| `linked_dep` | `SUM(DISTINCT t.amount)` de depósitos enlazados — DISTINCT evita doble-conteo M:N |
| `psd2_cutoff` | `MIN(date)` de depósitos Nordex en transactions (dinámico, no hardcodeado) |
| `status` | `sin_contraparte` / `cuadrado` / `parcial` / `pendiente` |

`sin_contraparte`: mes < psd2_cutoff (pre-PSD2, esperado, no es error ni alarma).

### RLS income_charges (lección INV-6 aplicada)
4 policies (SELECT/INSERT/UPDATE/**DELETE**) + 4 GRANTs. Predicado doble:
```sql
can_see_transaction(transaction_id)
AND EXISTS (SELECT 1 FROM incomes i WHERE i.id = income_id AND i.user_id = auth.uid())
```

### Clave de emparejamiento
Descripción del depósito: `"NOMINA NORDEX ENERGY SPAIN S.A.U SUELDOSALAR...YYYYMM"`.  
`searchCandidates` usa `description ILIKE '%YYYYMM%'` como primario.  
Fallback: `date` dentro de ±15 días del mes.  
**No empareja por importe** — mata la trampa Iberia (salario Iberia ≈ salario Nordex accidentalmente).

---

## Lecciones de sesión

| Lección | Detalle |
|---|---|
| **M:N con UNIQUE(par)** | `purchase_order_charges` tiene UNIQUE(transaction_id) válido para pedidos. Nóminas necesitan UNIQUE(income_id, transaction_id) — mismo depósito puede cubrir varios incomes. |
| **SUM(DISTINCT) en la vista** | Sin DISTINCT, un depósito enlazado a N incomes se sumaría N veces. Con DISTINCT se cuenta una vez. |
| **Emparejar por descripción no importe** | El importe de la nómina puede coincidir accidentalmente con otro gasto/ingreso. El token YYYYMM en la descripción es unívoco. |
| **sin_contraparte ≠ pendiente** | Meses pre-PSD2 no tienen contraparte bancaria por diseño. Mostrarlos como "pendiente" generaría ruido falso. Estado propio: `sin_contraparte`. |
| **RLS: GRANT + policy separados (DELETE)** | mig-37 omitió GRANT DELETE → INV-6 silencioso al desenlazar en Pedidos. mig-50 aplica las 4 operaciones desde el inicio. |
| **Trampa "Re-run" de GitHub Actions** | El botón Re-run repite el commit original, no el HEAD. Para probar código nuevo: nuevo `workflow_dispatch`. Costó ~3 ciclos de debugging. |
| **Lagunas de SCHEMA.md** | `incomes_source_check` existía pero no estaba documentado (mig-04 → corregido mig-49). Tablas Pedidos sí documentadas. |
| **T.DEVENGOS ancla posicional** | El PDF tiene etiquetas en fila N y valores en fila N+1. Anclar por "T.DEVENGOS" + siguiente línea no vacía + penúltimo/último token. No confiar en posición dentro de la misma línea. |
| **`pdftotext` ≠ local en runner** | Saltos de línea diferentes según entorno. Buscar sobre texto completo con `re.search`, no línea a línea. |

---

## Retribución — material Capa 2

### Progresión SBA (Salario Base Anual)

| Fecha | SBA | Evento |
|---|---|---|
| Antes 12/2023 | 53.750 € | — |
| 12/2023 | 64.500 € | Promoción Head of Controlling Global Sourcing |
| 2025 | 72.201,23 € | +5% revisión salarial |
| 2026 | 74.367,27 € | +3% revisión salarial |
| ~2024 | ~68.763 € (implícito) | **Hueco**: cifra exacta 2024 pendiente de confirmar |

14 pagas (nómina mensual × 12 + extra junio + extra diciembre).

### Bonus
- Target: 15% del SBA
- Achievement 2025: ~184% del target
- Bonus bruto 2025: **20.577,35 €** (abonado mayo 2026)
- Bonus neto 2025: **14.404,14 €** (IRPF ~30%)

### Paga extra diciembre 2025
- Código 4001 (Paga Extra Navidad): 3.615,73 €
- Código 3068 (Compl. Paga Extra maternidad): 1.888,19 €
- Total bruto: 5.503,92 €

---

## Previsión 2026 — Capa 3 (boceto, pendiente validar)

| Concepto | Estimación bruta | Estimación neta | Estado |
|---|---|---|---|
| Nóminas mensual (12 meses × ~3.200) | ~38.400 € | ~38.400 € | Verificado ene–may |
| Paga extra junio | ~6.200 € | ~4.340 € | Pendiente (junio) |
| Paga extra diciembre | ~6.200 € | ~4.340 € | Pendiente (diciembre) |
| Bonus 2026 | ~target 11.160 € | ~7.800 € | Pendiente (mayo 2027) |
| **Total foto 2026** | **~60.500 € neto** | | Boceto; validar jun+dic |

---

## Arquitectura de información (IA) — estado y pendientes

### Nav actual (MODULES definitivo post-sesión)
```
I   · Inicio      href: /inicio
II  · Proyectos   href: null   (placeholder multi-proyecto)
III · Control     href: /control
IV  · Horizonte   href: null   (placeholder previsión)
V   · Análisis    href: null   (placeholder)
VI  · Ajustes     href: /configuracion
```

### Cómo se llega hoy a /ingresos
Inicio → bloque Flujo → enlace "conciliación nóminas →" (texto roman pequeño bajo el dato de ingresos). La ruta `/ingresos` existe y es funcional; no está en la nav top-level.

### Cuentas — dónde vive hoy
**No construida aún.** No hay ruta `/cuentas` ni módulo Cuentas. Las cuentas se ven en Control (tabla de transacciones filtrables por cuenta). El slot en la nav no está asignado. **Pendiente decidir**: ¿slot propio en nav? ¿dentro de Inicio? ¿dentro de Control?

### Slot II · Proyectos — contenido previsto
Módulo multi-proyecto: carátula resumen + pantalla por proyecto.
Proyectos contemplados:
- Piso / Maristas (entrega mayo 2026, seguimiento adquisición + equipamiento)
- Universidad + ahorros hijos (Leo, Biel — MyInvestor)
- Sociedad agrícola (familiar)
- Airbnb (hipotético)
- + otros que surjan

Cimiento ya en DB: `transactions.project_id` FK → `projects` table.

### Ingresos — posición en IA
Bajo Inicio (no módulo top-level). El panel de conciliación de nóminas vive en `/ingresos` accesible desde Inicio. Decisión de IA: confirmar si el módulo de ingresos completo (incluyendo Capa 2 Retribución y Capa 3 Previsión) vive bajo Inicio o merece slot propio.

---

## Hilos abiertos / candidatos próximo chat

| Hilo | Prioridad | Notas |
|---|---|---|
| **Cuentas: decidir IA** | Alta | ¿Slot nav? ¿Bajo Inicio? ¿Bajo Control? Terreno real: actualmente solo existe en Control como filtro. |
| **Proyectos II: diseño** | Alta | Definir estructura: carátula + pantallas por proyecto. `transactions.project_id` ya existe. |
| **Capa 2 Retribución** | Media | Términos salariales versionados (SBA por fecha, bonus target, convenio). UI de visualización. |
| **Capa 3 Previsión** | Media | Foto neta 2026; estimaciones junio+diciembre. Módulo Horizonte (IV). |
| **Multi-transferencia junio** | Baja | Cuando llegue la nómina de junio, verificar que el parser + casado manejan 1 o 2 depósitos correctamente. |
| **Validar foto 2026** | Baja | Confirmar cifra paga extra junio y estimación bonus cuando haya más datos. |
| **Golden test diciembre completo** | Baja | Añadir `dietas_gross` exacto al golden cuando se tenga el PDF de diciembre vía runner. |

---

## Migraciones de sesión

| Nº | Timestamp | Descripción |
|---|---|---|
| 47 | 20260605000047 | Bucket privado `nominas` + policies owner-only |
| 48 | 20260605000048 | `v_median_income_3m` filtra `type='nomina_mensual'` |
| 49 | 20260606000049 | `incomes_source_check` ampliado con `nordex_payslip` |
| 50 | 20260607000050 | `income_charges` M:N + `v_income_reconciliation` |
