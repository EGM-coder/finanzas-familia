# Parches y Deuda Técnica — EGMFin

Registro de decisiones no-obvias, workarounds y deuda técnica activa.  
Formato: `P-NNN · (fecha) · estado · descripción`

---

## Convención de identificadores

| Serie | Uso |
|-------|-----|
| **D-xxx** | Decisiones doctrinales |
| **T-xxx** | Deuda técnica (este archivo) |
| **P-xxx** | Parches / lecciones aprendidas |

No mezclar series. Al asignar un identificador nuevo, verificar el mayor en uso
**de esa serie** antes de fijarlo.

---

## P-001 · 27-abr-2026 · **RESUELTO** (mig 20)
**Roboadvisor MyInvestor sin cotización pública en `holdings`**

El holding "Robot Advisor (perfil agregado)" de MyInvestor común no tiene ticker ni ISIN
con precio en `holding_prices`. La vista `holdings_valued` devolvía NULL en `current_value_eur`.

**Solución:** migración 20 introduce `manual_holdings` para activos sin cotización.
El roboadvisor se migró de `holdings` a `manual_holdings`. La vista `account_balances_full`
suma `manual_holdings.current_value_eur` además de `holdings_valued`.

**Cómo mantenerlo:** actualizar `manual_holdings.current_value_eur` mensualmente
con el valor del extracto de MyInvestor (UPDATE manual en Supabase Table Editor).

---

## P-002 · 27-abr-2026 · **ACTIVO** (vive en frontend)
**Signo de tarjetas de crédito en `account_balances_full`**

Las tarjetas acumulan gastos como amounts negativos (convenio EGMFin).
La vista `account_balances_full` multiplica por -1 el saldo de cuentas tipo `card`
para mostrar la deuda como número positivo (ej. "has gastado 450 €" no "-450 €").

**Dónde vive:** columna `current_balance` en `account_balances_full`:
```sql
WHEN a.type = 'card' THEN
  -1 * (a.initial_balance + COALESCE(SUM(t.amount), 0))
```

**Impacto frontend:** `CuentasClient.tsx` muestra saldo de tarjeta en rojo (`C.negative`)
cuando `current_balance > 0` — es decir, cuando hay deuda pendiente.

---

## P-005 · 27-abr-2026 · **RESUELTO** (mig 18)
**UNIQUE constraint débil en `holding_prices` + `update_prices.py` duplicaba filas**

El script de actualización de precios (GitHub Actions) hacía INSERT sin dedup,
generando filas duplicadas `(ticker, date)`. Las consultas LATERAL devolvían
precios aleatorios según `created_at`.

**Solución:** migración 18 añade `UNIQUE(ticker, date)` robusto (primero elimina
duplicados existentes) y cambia el script a DELETE + INSERT para ser idempotente.

---

## P-006 · 27-abr-2026 · **ACTIVO** (decisión de diseño)
**Precio de NDX1.DE en `holding_prices` sin holding asociado**

`stock_options_valued` necesita `holding_prices` para calcular el valor intrínseco
de las opciones Nordex. Pero NDX1.DE no tiene un holding en `holdings` (las opciones
no son acciones en cartera).

**Solución:** se inserta el precio de NDX1.DE directamente en `holding_prices`
con `ticker = 'NDX1.DE'` e ISIN NULL. El script `update_prices.py` lo actualiza diariamente
porque `stock_options.ticker` está incluido en `get_unique_tickers()`.

**Riesgo:** si alguien filtra `holding_prices` asumiendo que todo precio tiene un holding,
obtendrá filas "huérfanas". Usar JOIN con `holdings` si solo se quieren precios de cartera.

---

## P-007 · 27-abr-2026 · **RESUELTO** (mig 17)
**`account_balances_full` no exponía `is_active` ni `sort_order`**

`page.tsx` en `/cuentas` filtra `.eq('is_active', true)` y ordena `.order('sort_order')`.
Sin esas columnas, PostgREST devolvía 0 filas silenciosamente (no error).

**Solución:** migración 17 añade `is_active` y `sort_order` a `account_balances_full`.

---

## P-008 · 27-abr-2026 · **ACTIVO**
**`holding_prices` acepta filas con ticker NULL e ISIN NULL**

No hay constraint que exija al menos uno de los dos. Una fila con ambos NULL
nunca matcheará en `holdings_valued` y contamina la tabla silenciosamente.

**Workaround activo:** el script `update_prices.py` nunca inserta sin ticker.
Pero no hay garantía DB-level. Pendiente: añadir CHECK `(ticker IS NOT NULL OR isin IS NOT NULL)`.

---

## P-009 · (regla permanente)
**Verificar nombres reales de columnas antes de cualquier query nuevo**

Varias columnas tienen nombres que difieren del "nombre lógico" esperado:
- `holdings.avg_price_eur` (no `purchase_price_eur` ni `cost_basis`)
- `holding_prices.close_eur` (no `price_eur`)
- `account_balances_full.current_balance` (incluye holdings; no es solo tx)

**Regla:** antes de cualquier query nuevo, verificar con `\d+ tabla` en SQL Editor
o con `SELECT column_name FROM information_schema.columns WHERE table_name = '...'`.

---

## P-010 · 30-abr-2026 · **RESUELTO** (mig 22 + recovery)
**`stock_option_grants` obsoleta, sustituida por `stock_options`**

La migración 5 creó `stock_option_grants` con schema mínimo (`user_id`, `package_name`,
`grant_date`, `options_count`, `strike_price`, `vesting_date`, `expiration_date`).

Posteriormente se creó `stock_options` (mig 16) con schema más rico:
`exercise_window_start/end`, `condition_pct`, `ticker`, sin `user_id` (opciones compartidas).

La tabla `stock_option_grants` quedó vacía y nunca se usó en frontend.

**Resolución:** `stock_option_grants` eliminada en recovery 30-abr-2026.
Toda referencia frontend debe apuntar a `stock_options` + vista `stock_options_valued`.

---

## P-011 · 30-abr-2026 · **RESUELTO** (recovery completo)
**Recovery tras incidente Copilot — 29-abr-2026**

Ver `docs/POSTMORTEM_29abr2026.md` para narrativa completa.

Tablas afectadas y acción tomada:
- `accounts` → DROP + recreación desde mig 1+7+10 inline
- `transactions` → DROP + recreación con columnas PSD2 nuevas (mig 22)
- `bank_connections` → DROP (schema Copilot incorrecto) + rediseño en mig 22
- `stock_option_grants` → DROP definitivo (ver P-010)

Holdings remapeados determinísticamente por nombre de cuenta (19 filas, 7 grupos).

---

## P-012 · 12-may-2026 · **RESUELTO** (commit 2e6f4e2)
**Colisiones de external_id en sync_psd2 causan pérdida silenciosa de txns**

Sync PSD2 descargaba 164 txns desde Enable Banking pero solo persistía 162.

**Causa raíz:**
- Hash MD5 fallback en `sync_psd2.py` usaba solo 3 campos: `booking_date + amount(absoluto) + description`
- 21 txns sin `entry_reference` nativo (19 Kutxabank, 2 Santander): BIZUM sin concepto, COMISION, CUOTA PTMO, ANUL., TARJ.CRDTO
- Hash usaba `amount` sin signo → DBIT 3.25€ y CRDT 3.25€ colisionaban
- Hash sin counter intra-batch → 2x ANUL. TRANSF. idénticas (4-mar, 870€) colisionaban

**Casos concretos perdidos:**
- 30-abr Kutxabank: `COMISION CAJERO SERVIRED 3.25€` (DBIT y CRDT) → 1 perdida
- 4-mar Kutxabank: 2x `ANUL. TRANSF. 0049 COMUN extra 870€` idénticas → 1 perdida

**Fix aplicado:**
- IDs nativos EB con prefijo: `er_<entry_reference>`, `tid_<transaction_id>`
- Fallback SHA-256 con 11 campos: incluyendo `credit_debit_indicator`, contraparte, IBAN origen/destino, remittance completo
- Counter intra-batch (`_seq1`, `_seq2`) para duplicados verdaderos

**Verificación:** sync 12-may-2026 = 164/164 (vs 162/164 anterior con bug).

**Comportamiento PSD2 documentado:**
Las anulaciones (`ANUL.`, devoluciones cajero) son válidas: PSD2 muestra la verdad contable del banco. Reportes futuros pueden usar `is_reimbursable` / `reimbursed_at` (ya en schema) para neteado automático.

---

## P-013 · 13-may-2026 · **RESUELTO** (commit d413bd1)
**Sync diario borraba categorizaciones manuales de transacciones PSD2**

El loop LIVE de `sync_psd2.py` hacía `DELETE + INSERT` por cada txn descargada, sobreescribiendo todos los campos incluyendo los de categorización manual (`titular`, `account_id`, `nature`, `category_id`, `project_id`, `paid_by_user_id`, `is_reimbursable`, `reimbursed_at`).

**Caso real que dispara el parche:**
Txns de tarjeta de Ana que llegan vía cuenta Santander común se re-mapean manualmente a `titular='ana'` + cuenta `Tarjeta Santander Ana`. El siguiente sync diario las revertía a `titular='eric'` + cuenta Santander común.

**Fix aplicado:**
- Definida constante `BANK_FIELDS` con los 8 campos del banco que el sync puede tocar
- Batch SELECT previo: un solo query por cuenta, recupera filas existentes por `external_id`
- Clasificación en tres cubos: `to_insert` / `to_update` / `unchanged`
- UPDATE selectivo: solo `{f: rec[f] for f in BANK_FIELDS}`, nunca toca campos de categorización
- Helper `_bank_fields_changed()` normaliza `amount` a float para comparación correcta
- DRY_RUN acumula totales correctamente y muestra previews de INSERTs y UPDATEs

**Verificación:** DRY_RUN tras P-013 sobre las 160 txns previas = 0 insertarían / 0 actualizarían / 160 sin cambios. LIVE 14-may-2026: 6 txns nuevas insertadas / 0 actualizadas / 160 sin cambios.

---

## P-014 · (regla permanente)
**Next.js `<Link>` no acepta prop `disabled`**

Para estados deshabilitados en navegación interna con `<Link>`, conmutar el elemento (no la prop): `<Link>` cuando activo, `<span>` con estilos disabled cuando borde. Aplicado primero en `ControlPagination.tsx` (hotfix T-001, 15-may-2026). Patrón a replicar en cualquier paginación o navegación con bordes condicionales (drawer Fase 3 y posteriores).

---

## T-011 · 30-may-2026 · **RESUELTO**
**`raw_concept` almacenaba el payload JSON crudo de Enable Banking**

`sync_psd2.py` → `map_txn()` poblaba `raw_concept` con `json.dumps(txn)[:2000]` — el dict completo de Enable Banking serializado. La intención de la columna es almacenar el concepto bancario legible (remittance_information), no el JSON de transporte.

**Impacto:** DAT-1 garantizaba que `raw_concept` nunca era visible en UI, pero las reglas de clasificación (match_field='raw_concept') matcheaban contra JSON, no contra texto. El campo era inutilizable para reglas futuras del tipo "concepto contiene X".

**Solución:**
- `sync_psd2.py` · `map_txn()`: `raw_concept = ' | '.join(remittance_information)` si no vacío, `None` si vacío. Sin fallback a reference_number (description mantiene el suyo).
- `backfill_raw_concept_t011.py`: script standalone idempotente con dry-run/apply. Parsea el JSON de las txns existentes y reconstruye el valor limpio con el mismo criterio.

**Verificación:** backfill --apply 30-may-2026 = 170 éxitos, 0 fallos. SELECT post-apply: 0 filas con `raw_concept LIKE '{%'`.

---

## P-015 · 31-may-2026 · **ACTIVO** (regla permanente)
**Colisiones de número lógico en migraciones**

Los sufijos numéricos cortos (22, 23, 24, 25, 29, 30…) aparecen en más de una tanda de fechas distintas. Ejemplo: `20260506000023` (psd2_grants) y `20260517000023` (grants_classification_rules) comparten sufijo 23 pero son archivos distintos.

**Por qué no es un bug:** Supabase ordena y rastrea migraciones por el **nombre completo del archivo** (`schema_migrations` almacena el nombre entero). El timestamp del prefijo garantiza el orden de aplicación correcto.

**Por qué no se renumera:** `supabase db push` identifica migraciones ya aplicadas por nombre. Renombrar un archivo ya aplicado lo haría aparecer como migración nueva y se aplicaría dos veces, corrompiendo el historial.

**Regla:** al crear una migración, verificar que el **prefijo timestamp completo** `YYYYMMDDNNNNNN` sea único en `supabase/migrations/`. El sufijo numérico corto puede colisionar entre fechas; no es identificador único.

---

## Deuda técnica pendiente

| ID | Descripción | Prioridad |
|----|-------------|-----------|
| D-001 | CHECK constraint en `holding_prices`: exigir ticker OR isin NOT NULL (ver P-008) | Baja |
| D-002 | ~~Migraciones 10, 11, 13 no están commiteadas~~ — **OBSOLETA** (31-may-2026): archivos `...010_holdings`, `...011_account_balances_full`, `...013_currency_rates` presentes en `supabase/migrations/`. Estado ya superado. | — |
| D-003 | ~~`app/api/callback/route.ts` y `app/api/bank/` usan schema Copilot~~ — **OBSOLETA** (31-may-2026): `app/api/` no existe en el repo. Nada que limpiar. | — |
| D-004 | ~~`supabase/seed/` no existe~~ — **OBSOLETA** (31-may-2026): `supabase/seed/` existe y contiene `seed_accounts.sql` y `seed_holdings.sql`. | — |
| T-019 | **RESUELTA** (mig 29, 30-may-2026). Ver entrada T-019 arriba. | — |
