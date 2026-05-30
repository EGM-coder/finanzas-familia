# EGMFin · Schema Reference

> **Single source of truth** del schema. Generado desde `supabase/migrations/` consolidando lo que vive en el repo.
> **Cobertura:** migraciones 01–32.
> **Última actualización:** 20 may 2026 — mig 32 · RLS auth guard transversal.

---

## 0 · Convenciones generales

- **Sin DELETE:** archivado vía `is_active = false` o `status = 'archived'`. Integridad histórica obligatoria.
- **Auditoría:** todas las tablas tienen `created_at` + `updated_at`, este último mantenido por el trigger `set_updated_at` antes de cada UPDATE.
- **RLS habilitado** en todas las tablas. Patrones de policy en sección 1. Desde mig 32, todas las policies de tablas tri-state exigen `auth.uid() IS NOT NULL` además del filtro de visibility/scope: anon key no puede leer ningún dato aunque tenga GRANT por default de Supabase.
- **Visibilidad tri-state:** `privada_eric` | `privada_ana` | `compartida`. Aplica a `accounts`, `assets`, `budgets`, `savings_goals`, `liabilities`, `categories` (cuando `is_default=false`), `weekly_closures`, `monthly_closures`.
- **Visibilidad estricta por user_id:** `incomes`, `work_abroad_days`, `stock_option_grants` (legacy) — sólo el dueño lo ve.
- **Visibilidad compartida (cualquier autenticado):** `projects`, `classification_rules`, `maristas_items`, `holding_prices`, `currency_rates`.
- **Monedas:** todas las cifras de transacciones, balances y holdings en `EUR` por defecto. `currency_rates` consolidado en EUR.
- **UUID PK** en todas las tablas con `default gen_random_uuid()`.

---

## 1 · Funciones helper

| Función | Tipo | Returns | Uso |
|---|---|---|---|
| `public.user_role()` | sql · security definer · stable | `text` (`'eric'` o `'ana'`) | Lee de `public.profiles` mapeando `auth.uid()` → role. Cacheada por query. Núcleo de todas las RLS basadas en visibility. |
| `public.set_updated_at()` | plpgsql trigger | trigger | Setea `new.updated_at = now()` antes de UPDATE. Aplicada a todas las tablas con `updated_at`. |
| `public.can_see_account(p_account_id uuid)` | sql · security definer · stable | `boolean` | Helper RLS: ¿la sesión actual puede ver esa cuenta? Requiere `auth.uid() IS NOT NULL` *(guard añadido mig 32)*. Bypassa RLS de accounts para evitar recursión. |
| `public.can_see_transaction(p_transaction_id uuid)` | sql · security definer · stable | `boolean` | Helper RLS: navega txn → account → visibility. Requiere `auth.uid() IS NOT NULL` *(guard añadido mig 32)*. Usado en `transaction_splits`. |

---

## 2 · Tablas (orden cronológico de migración)

### 2.1 · `public.accounts` *(mig 01 + 07 + 10)*

Cuentas bancarias, brokers, tarjetas, tesorerías. Sin DELETE.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `institution` | text NOT NULL | |
| `type` | text NOT NULL CHECK | `bank` · `investment` · `broker` · `cash` · `pension` · **`card`** *(mig 07)* · **`tesoreria_tae`** *(mig 10)* |
| `visibility` | text NOT NULL CHECK | `privada_eric` · `privada_ana` · `compartida` |
| `currency` | text NOT NULL default `'EUR'` | |
| `is_active` | bool NOT NULL default `true` | |
| `notes` | text | |
| `sort_order` | int NOT NULL default `0` | |
| **`linked_account_id`** | uuid FK accounts(id) | *(mig 07)* tarjetas vinculadas a cuenta padre |
| **`initial_balance`** | numeric(12,2) NOT NULL default `0` | *(mig 07)* base para `current_balance` |
| `created_at` / `updated_at` | timestamptz | |

**Constraints adicionales (mig 07):**
- `accounts_card_linked_check`: si `type='card'` → `linked_account_id` NOT NULL; en caso contrario NULL.

**Índices:**
- `accounts_linked_idx` on `(linked_account_id)`

**RLS:** SELECT/INSERT/UPDATE basado en `visibility = 'privada_' || user_role() OR visibility = 'compartida'`.

---

### 2.2 · `public.categories` *(mig 01 + seed mig 06)*

Árbol jerárquico de categorías funcionales. `parent_id` define hijos. **12 categorías padre con `color` hex sembrado (15-may-2026, DML directo)** + **1 categoría padre vía mig 24 (18-may-2026)**; los hijos heredan color en frontend.

**Categoría añadida en mig 24 · `Transferencias internas`** (sort_order 13, color `#5a5a6a`):
- `Entre cuentas corrientes` (sort_order 1)
- `Pago de tarjeta` (sort_order 2)
- `Aportación cuenta de ahorro` (sort_order 3)

**Categoría añadida en mig 25 · `Ingresos`** (sort_order 14, color `#4a6a4a`):
- `Nómina` (sort_order 1)
- `Dividendos` (sort_order 2)
- `Reembolsos` (sort_order 3)
- `Otros ingresos` (sort_order 4)

**Categoría añadida en mig 26 · `Inversiones`** (sort_order 15, color `#3a5d7a`):
- `Fondos indexados` (sort_order 1)
- `Acciones individuales` (sort_order 2)
- `Planes de pensiones` (sort_order 3)
- `Cripto` (sort_order 4)

**Hojas añadidas en mig 27+28 · `Financiero e impuestos`** (estado final, sort_order 4–9):
- `Hipoteca` (4) — cuota mensual completa; convive con "Intereses hipoteca" (3) para quien separe la parte IRPF-deducible
- `Letra coche` (5)
- `Crédito al consumo` (6) — tarjetas/financieras externas (mig 28)
- `Crédito estudios` (7) — préstamos formación (mig 28)
- `IBI` (8)
- `Otros financieros` (9)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `parent_id` | uuid FK categories(id) ON DELETE RESTRICT | jerarquía |
| `icon` | text | |
| `color` | text | hex `#RRGGBB`; sembrado solo en padres |
| `is_default` | bool NOT NULL default `false` | categorías base del sistema (visibles para todos, no editables) |
| `is_active` | bool NOT NULL default `true` | |
| `visibility` | text | `privada_eric` · `privada_ana` · `compartida` · NULL si `is_default=true` |
| `sort_order` | int NOT NULL default `0` | |

**Constraint compuesto:** `categories_visibility_check`: `is_default=true` ↔ `visibility IS NULL` · `is_default=false` ↔ `visibility IN (...)`.

**RLS:** SELECT lee defaults + privadas propias + compartidas. INSERT/UPDATE solo no-defaults propias o compartidas.

---

### 2.3 · `public.projects` *(mig 01)*

Proyectos de gasto (rutina, maristas_adquisicion, etc.). Compartidos entre ambos usuarios.

**Proyectos activos sembrados:** `rutina` (mig 06) · `maristas_adquisicion` (mig 06) · `maristas_equipamiento` (mig 06) · `capital-leo` (mig 26) · `capital-biel` (mig 26). Patrón D-009: dimensión proyecto ortogonal a categoría — permite filtrar "todas las inversiones" AND "todo lo de Leo" como ángulos independientes.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `slug` | text NOT NULL UNIQUE | identificador URL-friendly |
| `description` | text | |
| `status` | text NOT NULL default `'active'` CHECK | `active` · `completed` · `archived` |
| `start_date` / `end_date` | date | |
| `total_budget` | numeric(12,2) | |

**RLS:** abierto a cualquier autenticado.

---

### 2.4 · `public.transactions` *(mig 02 + 07)*

Movimientos financieros. Visibilidad heredada de `account_id`. **Sin DELETE** (integridad histórica).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `date` | date NOT NULL | |
| `amount` | numeric(12,2) NOT NULL | negativo = gasto, positivo = ingreso |
| `currency` | text NOT NULL default `'EUR'` | |
| `description` | text | |
| `raw_concept` | text | concepto bruto del banco (PSD2) |
| `account_id` | uuid NOT NULL FK accounts(id) | |
| `category_id` | uuid FK categories(id) | NULL = sin clasificar |
| `project_id` | uuid FK projects(id) | NULL = rutina implícita |
| `nature` | text CHECK | `fijo_recurrente` · `variable_recurrente` · `extraordinario` · `inversion` · `ahorro` · **`transferencia`** *(mig 24)* — las transferencias internas no modifican patrimonio |
| `paid_by_user_id` | uuid FK auth.users(id) | quién adelantó el pago |
| `titular` | text NOT NULL CHECK | `eric` · `ana` · `compartido` |
| `source` | text NOT NULL default `'manual'` CHECK | `manual` · `csv` · `psd2` · `gmail_parse` |
| `source_id` | text | id externo (ej. ID PSD2) |
| `counterparty` | text | comercio / remitente |
| **`is_reimbursable`** | bool NOT NULL default `false` | *(mig 07)* gasto reembolsable (dietas Nordex, etc.) |
| **`reimbursed_at`** | timestamptz | *(mig 07)* fecha efectiva de reembolso (NULL = pendiente/no aplica) |
| **`bank_connection_id`** | uuid FK bank_connections(id) ON DELETE SET NULL | *(mig 22 psd2)* consent que originó la txn. NULL para txns no-PSD2 |
| **`external_id`** | text | *(mig 22 psd2)* `entry_reference` de Enable Banking. Clave de idempotencia |

**Índices:**
- `transactions_date_idx` on `(date DESC)`
- `transactions_account_date_idx` on `(account_id, date DESC)`
- `transactions_category_idx` on `(category_id)`
- `transactions_titular_date_idx` on `(titular, date DESC)`
- `transactions_external_id_unique` UNIQUE PARTIAL on `(account_id, external_id) WHERE external_id IS NOT NULL`

**RLS:** SELECT/INSERT/UPDATE basado en `can_see_account(account_id)`.

**GRANTs (mig 22):** `authenticated` tiene `SELECT, INSERT, UPDATE`. Sin DELETE (integridad histórica). `service_role` mantiene full grants para procesos automatizados (`sync_psd2.py`).

---

### 2.5 · `public.transaction_splits` *(mig 02)*

Divide una transacción entre múltiples categorías/proyectos. ON DELETE CASCADE desde txn padre. Visibilidad heredada vía `can_see_transaction()`.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `transaction_id` | uuid NOT NULL FK transactions(id) ON DELETE CASCADE |
| `amount` | numeric(12,2) NOT NULL |
| `category_id` | uuid FK categories(id) |
| `project_id` | uuid FK projects(id) |
| `note` | text |

---

### 2.6 · `public.classification_rules` *(mig 02 + 25)*

Reglas automáticas de clasificación de transacciones importadas (PSD2 principalmente). Compartidas entre usuarios. Prioridad numérica (menor = antes).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `priority` | int NOT NULL default `100` | |
| `match_field` | text NOT NULL CHECK | `counterparty` · `raw_concept` · `description` |
| `match_operator` | text NOT NULL CHECK | `contains` · `equals` · `starts_with` · `regex` |
| `match_value` | text NOT NULL | string a matchear |
| `set_category_id` | uuid FK categories(id) ON DELETE SET NULL | |
| `set_project_id` | uuid FK projects(id) ON DELETE SET NULL | |
| `set_nature` | text CHECK | mismos valores que `transactions.nature` |
| **`set_account_id`** | uuid FK accounts(id) ON DELETE SET NULL | *(mig 25)* remap de cuenta destino (re-routing tarjetas PSD2) |
| **`set_titular`** | text CHECK | *(mig 25)* `eric` · `ana` · `compartido` |
| **`set_paid_by_user_id`** | uuid FK auth.users(id) ON DELETE SET NULL | *(mig 25)* quién adelantó el pago |
| **`set_is_reimbursable`** | boolean | *(mig 25)* marcar como reembolsable |
| `is_active` | bool NOT NULL default `true` | |

**Campos D-005** (`set_account_id`, `set_titular`, `set_paid_by_user_id`, `set_is_reimbursable`): diseñados para re-routing automático de tarjetas en `sync_psd2.py`. El script `recategorize_existing.py` (T-007) los omite en V1 — deuda T-018.

**RLS:** abierto a cualquier autenticado.

**GRANTs (mig 23):** `authenticated` tiene `SELECT, INSERT, UPDATE, DELETE`. Las reglas son entidades mutables sin requisito de integridad histórica. `service_role` mantiene full grants para el cron de `sync_psd2.py` (lectura masiva al aplicar reglas).

**Aplicación retroactiva manual (T-007):** `egmfin-jobs/recategorize_existing.py` aplica las reglas activas a todas las txns con `category_id IS NULL`. Primera regla que matchea gana (priority ASC, created_at ASC). Sin lógica retroactiva automática.

---

### 2.7 · `public.budgets` *(mig 03)*

Presupuesto mensual por categoría y visibilidad. UNIQUE `(year, month, category_id, visibility)`.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `year` | int NOT NULL |
| `month` | int NOT NULL CHECK (1–12) |
| `category_id` | uuid NOT NULL FK categories(id) |
| `visibility` | text NOT NULL CHECK (`privada_eric`/`privada_ana`/`compartida`) |
| `amount_planned` | numeric(12,2) NOT NULL |
| `notes` | text |

**Índices:** `(year, month)`, `(category_id)`.

---

### 2.8 · `public.savings_goals` *(mig 03)*

Objetivos de ahorro familiares con `target_amount`, `current_amount`, `target_date`, `monthly_contribution`, `account_id` opcional, `visibility`, `is_active`.

---

### 2.9 · `public.incomes` *(mig 04)*

Nóminas, extras, bonus, dietas. **RLS estricta:** sólo el dueño (`user_id = auth.uid()`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `date` | date NOT NULL | |
| `user_id` | uuid NOT NULL FK auth.users(id) | |
| `type` | text NOT NULL CHECK | `nomina_mensual` · `paga_extra` · `bonus` · `dietas` · `otro` |
| `gross_amount` | numeric(12,2) NOT NULL | |
| `irpf_withheld` | numeric(12,2) default `0` | |
| `ss_withheld` | numeric(12,2) default `0` | |
| `net_amount` | numeric(12,2) NOT NULL | |
| `art_7p_exempt_days` | int | Art. 7p IRPF — días exentos |
| `art_7p_exempt_amount` | numeric(12,2) | importe asociado |
| `employer` | text | |
| `concept` | text | |
| `source` | text CHECK | `manual` · `csv` · `psd2` · `gmail_parse` |
| `source_id` | text | |
| `notes` | text | |

---

### 2.10 · `public.work_abroad_days` *(mig 04)*

Días trabajados fuera de España (Art. 7p IRPF). RLS estricta por `user_id`.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `user_id` | uuid NOT NULL FK auth.users(id) |
| `date_from` / `date_to` | date NOT NULL (check `date_to >= date_from`) |
| `country` | text NOT NULL |
| `purpose` | text |
| `days_count` | int NOT NULL |
| `year` | int NOT NULL |
| `notes` | text |

---

### 2.11 · `public.assets` *(mig 05)*

Activos patrimoniales (inmuebles, vehículos, otros). Visibilidad tri-state.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `name` | text NOT NULL |
| `type` | text NOT NULL CHECK (`inmueble`/`vehiculo`/`otro`) |
| `owner_user_id` | uuid FK auth.users(id) |
| `visibility` | text NOT NULL CHECK |
| `purchase_date` | date |
| `purchase_value` | numeric(12,2) NOT NULL |
| `current_value` | numeric(12,2) |
| `last_valuation_date` | date |
| `notes` | text |
| `is_active` | bool default `true` |

---

### 2.12 · `public.stock_option_grants` *(mig 05) — ⚠️ OBSOLETA*

**Tabla eliminada en recovery del 30-abr-2026 (parche P-010).** Sustituida por `public.stock_options` (mig 16) + vista `stock_options_valued`. No referenciar en código nuevo.

---

### 2.13 · `public.stock_prices` *(mig 05)*

Precios históricos genéricos por ticker. UNIQUE `(ticker, date)`. Probablemente parcialmente sustituida por `holding_prices` (mig 10). Confirmar uso real en estado v10+.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `ticker` | text NOT NULL |
| `date` | date NOT NULL |
| `close_price` | numeric(10,4) NOT NULL |
| `source` | text |

---

### 2.14 · `public.maristas_items` *(mig 05)*

Partidas del proyecto Apartamento Residencial Maristas. Compartido.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `category` | text NOT NULL CHECK | `adquisicion` · `cocina` · `banos` · `iluminacion` · `mobiliario` · `electrodomesticos` · `otros` |
| `supplier` | text | |
| `concept` | text NOT NULL | |
| `budget_amount` | numeric(12,2) NOT NULL | |
| `committed_amount` | numeric(12,2) default `0` | |
| `paid_amount` | numeric(12,2) default `0` | |
| `budget_date` / `expected_delivery` / `actual_delivery` | date | |
| `status` | text default `'presupuestado'` CHECK | `presupuestado` · `contratado` · `pagado_parcial` · `pagado_total` · `entregado` |
| `contract_reference` | text | |
| `is_active` | bool default `true` | |
| `sort_order` | int default `0` | |

---

### 2.15 · `public.liabilities` *(mig 08)*

Hipotecas, préstamos, financiaciones. Visibilidad tri-state.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `name` | text NOT NULL |
| `type` | text NOT NULL CHECK (`hipoteca`/`prestamo_personal`/`financiacion_consumo`/`linea_credito`/`otros`) |
| `lender` | text |
| `visibility` | text NOT NULL CHECK |
| `original_principal` | numeric(12,2) NOT NULL |
| `current_balance` | numeric(12,2) NOT NULL |
| `interest_rate` | numeric(5,4) |
| `interest_type` | text CHECK (`fijo`/`variable`/`mixto`) |
| `start_date` / `end_date` | date |
| `monthly_payment` | numeric(12,2) |
| `status` | text default `'activa'` CHECK (`activa`/`proyectada`/`cerrada`) |
| `linked_asset_id` | uuid FK assets(id) ON DELETE SET NULL |
| `is_active` | bool default `true` |

---

### 2.16 · `public.holdings` *(mig 10)*

Posiciones individuales en cuentas de inversión.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL FK accounts(id) ON DELETE CASCADE | |
| `asset_type` | text NOT NULL CHECK | `accion` · `fondo_indexado` · `etf` · `cripto` · `bono` |
| `ticker` | text | |
| `isin` | text | |
| `name` | text NOT NULL | |
| `quantity` | numeric(20,8) default `0` | |
| `avg_price_original` | numeric(20,8) | BEP en divisa nativa |
| `original_currency` | text default `'EUR'` | |
| `avg_price_eur` | numeric(20,8) | opcional |
| `is_active` | bool default `true` | |

---

### 2.17 · `public.holding_prices` *(mig 10)*

Cache de precios actualizados desde Yahoo Finance (cron `update_prices.py`). UNIQUE `(ticker, isin, date)` — **OJO: índice con COALESCE en mig 18, ver P-XXX sobre PostgREST `on_conflict`**.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `ticker` | text |
| `isin` | text |
| `date` | date NOT NULL |
| `close_original` | numeric(20,8) NOT NULL |
| `currency` | text default `'USD'` |
| `close_eur` | numeric(20,8) |
| `source` | text default `'yahoo'` |

**RLS:** SELECT abierto a todos los autenticados (no son datos personales).

---

### 2.18 · `public.currency_rates` *(mig 13)*

Tipos de cambio diarios consolidados a EUR. UNIQUE `(date, from_currency, to_currency)`.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `date` | date NOT NULL |
| `from_currency` | text NOT NULL |
| `to_currency` | text default `'EUR'` |
| `rate` | numeric(20,8) NOT NULL |
| `source` | text default `'yahoo'` |

**RLS:** SELECT abierto.

---

### 2.19 · `public.stock_options` *(mig 16)*

Paquetes de stock options Nordex. Sustituye a `stock_option_grants` (obsoleta). Sin DELETE — `is_active = false` para desactivar.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `package_name` | text NOT NULL | |
| `ticker` | text NOT NULL | `NDX1.DE` |
| `num_options` | int NOT NULL CHECK > 0 | |
| `strike_price` | numeric(12,4) NOT NULL | |
| `currency` | text NOT NULL default `'EUR'` | |
| `granted_date` | date | |
| `vesting_date` | date NOT NULL | |
| `exercise_window_start` / `exercise_window_end` | date NOT NULL | ventana de ejercicio |
| `condition_pct` | numeric(5,2) default `15.00` | precio >= strike × (1 + pct/100) para condición |
| `notes` | text | |
| `is_active` | bool NOT NULL default `true` | |

**Datos sembrados en mig 16:** Package 1 (1.000 opciones, strike 11,60 €, vesting 2028, ejercitable 2029–2030) · Package 2 (1.000 opciones, strike 26,31 €, vesting 2029, ejercitable 2030–2031). Precio inicial NDX1.DE 45,28 € insertado en `holding_prices`.

**RLS:** SELECT/INSERT/UPDATE/DELETE para cualquier `authenticated` (policy sin filtro de usuario — datos Eric, acceso compartido en V1).

---

### 2.20 · `public.manual_holdings` + `manual_holdings_history` *(mig 20)*

Activos sin cotización pública gestionados manualmente (roboadvisors, fondos privados, planes). Reemplaza el parche P-001.

**`public.manual_holdings`**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL FK accounts(id) ON DELETE CASCADE | |
| `name` | text NOT NULL | |
| `asset_type` | text NOT NULL default `'roboadvisor'` CHECK | `roboadvisor` · `fondo_privado` · `plan_pensiones` · `otro` |
| `current_value_eur` | numeric(20,8) NOT NULL | actualizado manualmente |
| `last_update_date` | date NOT NULL default `CURRENT_DATE` | |
| `update_frequency` | text NOT NULL default `'mensual'` CHECK | `mensual` · `trimestral` · `anual` |
| `notes` | text | |
| `is_active` | bool NOT NULL default `true` | |

**Trigger:** `trg_manual_holdings_snapshot` (AFTER INSERT/UPDATE) → inserta fila en `manual_holdings_history` si `current_value_eur` cambió; ON CONFLICT (manual_holding_id, snapshot_date) DO UPDATE.

**`public.manual_holdings_history`**

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `manual_holding_id` | uuid NOT NULL FK manual_holdings(id) ON DELETE CASCADE |
| `value_eur` | numeric(20,8) NOT NULL |
| `snapshot_date` | date NOT NULL |

UNIQUE `(manual_holding_id, snapshot_date)`.

**RLS (ambas tablas):** SELECT/INSERT/UPDATE/DELETE para cualquier `authenticated`.

**Índices:** `idx_manual_holdings_account` on `(account_id)` · `idx_mh_history_holding` on `(manual_holding_id, snapshot_date DESC)`.

---

### 2.21 · `public.patrimonio_snapshots` *(mig 21)*

Histórico puntual del patrimonio neto. PK = `snapshot_date` (un snapshot por día, upsertable). Llamar `capture_patrimonio_snapshot()` manualmente o desde frontend para grabar el estado actual.

| Columna | Tipo |
|---|---|
| `snapshot_date` | date PK |
| `liquidos_y_holdings` | numeric(14,2) NOT NULL |
| `inmuebles` | numeric(14,2) NOT NULL |
| `activos_total` | numeric(14,2) NOT NULL |
| `deudas_activas` | numeric(14,2) NOT NULL |
| `deudas_proyectadas` | numeric(14,2) NOT NULL |
| `patrimonio_neto_actual` | numeric(14,2) NOT NULL |
| `patrimonio_neto_si_firmara_hoy` | numeric(14,2) NOT NULL |
| `stock_options_intrinsic` | numeric(14,2) NOT NULL |
| `created_at` | timestamptz NOT NULL |

**Función:** `capture_patrimonio_snapshot()` SECURITY DEFINER — lee `patrimonio_neto` (vista) y hace upsert ON CONFLICT (snapshot_date) DO UPDATE. `GRANT EXECUTE TO authenticated`.

**RLS:** SELECT/INSERT/UPDATE para cualquier autenticado.

---

### 2.22 · `public.bank_connections` *(mig 22, psd2_enable_banking)*

Consents PSD2 activos vía Enable Banking. Una fila por institución por usuario. Flujo: INSERT con `status='pending'` y `auth_state` generado → POST /auth → callback con code → POST /sessions → UPDATE `status='active'`, `consent_session_id`, `consent_valid_until` (típicamente +180d). Re-auth necesaria al expirar.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `provider` | text NOT NULL CHECK | `enable_banking` |
| `aspsp_name` | text NOT NULL | nombre institución (ej. `Kutxabank`) |
| `aspsp_country` | char(2) NOT NULL | código ISO país |
| `aspsp_psu_type` | text NOT NULL default `'personal'` CHECK | `personal` · `business` |
| `auth_state` | uuid | estado OAuth generado al iniciar flujo |
| `consent_session_id` | text UNIQUE | id devuelto por Enable Banking al completar |
| `consent_valid_until` | timestamptz | expiración del consent |
| `user_id` | uuid NOT NULL FK auth.users(id) ON DELETE RESTRICT | propietario del consent |
| `status` | text NOT NULL default `'pending'` CHECK | `pending` · `active` · `expired` · `revoked` |
| `raw_session` | jsonb | respuesta cruda de POST /sessions |

**RLS:** SELECT/INSERT/UPDATE/DELETE filtrados por `user_id = auth.uid()`.

**GRANTs:** INSERT, UPDATE (mig 23, psd2) · DELETE + policy DELETE (mig 24, psd2) para `authenticated`.

---

### 2.23 · `public.bank_account_links` *(mig 22, psd2_enable_banking)*

Mapping entre cuentas lógicas EGMFin (`accounts`) y cuentas físicas Enable Banking. `external_account_uid` es el uid devuelto por POST /sessions en `accounts[]` — NO es el IBAN.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL FK accounts(id) ON DELETE RESTRICT | cuenta lógica EGMFin |
| `bank_connection_id` | uuid NOT NULL FK bank_connections(id) ON DELETE CASCADE | |
| `external_account_uid` | text NOT NULL | uid Enable Banking |
| `external_iban` | text | IBAN de la cuenta física |
| `is_active` | bool NOT NULL default `true` | |
| `last_sync_at` | timestamptz | última sincronización exitosa |

UNIQUE `(bank_connection_id, external_account_uid)`.

**RLS:** SELECT/INSERT/UPDATE/DELETE filtrados por `can_see_account(account_id)`.

**GRANTs:** INSERT, UPDATE (mig 23, psd2) · DELETE + policy DELETE (mig 24, psd2) para `authenticated`.

---

## 3 · Vistas

### `public.account_balances` *(mig 09)*

Saldo de cada cuenta = `initial_balance + sum(transactions.amount)`.

```
account_id | current_balance
```

`security_invoker = true` — respeta RLS del usuario.

### `public.account_balances_full` *(mig 11, evolución migs 14 · 17 · 19 · 20)*

Saldo extendido por cuenta. Evolución: mig 11 (v1 inicial) → mig 14 (fix signo tarjetas: `type='card'` multiplica saldo por -1) → mig 17 (añade `is_active`, `sort_order`) → mig 19 (recreada por cascade de holdings_valued) → mig 20 (suma `manual_holdings` a `holdings_value_eur`).

Estado final (mig 20):

```
id, name, institution, type, visibility, linked_account_id, initial_balance,
is_active, sort_order, transactions_sum, holdings_value_eur, current_balance
```

`holdings_value_eur` = suma de `holdings_valued` + `manual_holdings` (is_active=true). `security_invoker = true`.

### `public.patrimonio_neto` *(mig 12, evolución migs 14 · 15 · 16 · 17 · 19 · 20)*

Vista agregada del patrimonio familiar. Recreada en cascada cada vez que `account_balances_full` cambia. Desde mig 16 incluye `stock_options_intrinsic`.

```
liquidos_y_holdings, inmuebles, activos_total,
deudas_activas, deudas_proyectadas,
patrimonio_neto_actual, patrimonio_neto_si_firmara_hoy,
stock_options_intrinsic
```

`deudas_activas` = liabilities con `status='activa'`. `deudas_proyectadas` = `status='proyectada'` (hipoteca Maristas antes de firmar escritura). `security_invoker = true`.

### `public.holdings_valued` *(mig 10, evolución migs 15 · 19 · 20)*

Une `holdings` con el último precio de `holding_prices` vía `LATERAL`. Evolución: mig 10 (v1, match ticker+isin IS NOT DISTINCT FROM) → mig 15 (añade fallback a `avg_price_eur` para roboadvisors sin cotización) → mig 19 (prioriza match por ticker; ISIN solo cuando `holding.ticker IS NULL`) → mig 20 (elimina fallback `avg_price_eur`; roboadvisors migrados a `manual_holdings`).

Estado final (mig 20): sin fallback a `avg_price_eur`. `current_value_eur` = NULL si no hay precio cotizado.

```
holdings.*, current_price_original, current_price_eur, price_date, current_value_eur
```

`security_invoker = true`.

### `public.stock_options_valued` *(mig 16)*

Une `stock_options` (is_active=true) con el último precio de `holding_prices` por ticker. Calcula valor intrínseco y condición de ejercicio.

```
stock_options.*, current_price_eur, price_date,
intrinsic_per_option, intrinsic_total,
condition_min_price, condition_met, vested, exercisable_now
```

`intrinsic_per_option = GREATEST(0, close_eur - strike_price)`. `exercisable_now = vested AND dentro ventana AND condition_met`. `security_invoker = true`.

### `public.patrimonio_snapshot_with_delta` *(mig 21 · security_invoker mig 33)*

Compara el snapshot más reciente con el snapshot de hace ~30 días. Lectura directa de `patrimonio_snapshots`.

`security_invoker = true` desde **mig 33** (cierra exposición a `anon`: sin JWT, la RLS de `patrimonio_snapshots` filtra todas las filas).

```
snapshot_date, patrimonio_neto_actual, patrimonio_neto_si_firmara_hoy,
liquidos_y_holdings, inmuebles, activos_total, deudas_activas, deudas_proyectadas,
stock_options_intrinsic, ref_date,
delta_neto_actual, delta_neto_si_firmara, delta_liquidos, delta_stock_options,
delta_neto_actual_pct, delta_stock_options_pct, minutes_since_capture
```

### `public.v_spent_by_category_month` *(mig 29)*

Gasto real por `(year, month, category_id, visibility)`. Contrato de lectura principal de Fase 4.

**Splits-first:** si la txn tiene splits → agrega por `transaction_splits.(category_id, amount)`; si no → por `transactions.(category_id, amount)`. Implementado con `UNION ALL + NOT EXISTS`.

**Filtro:** `amount < 0` (gastos únicamente) · `(nature IS NULL OR nature NOT IN ('transferencia', 'inversion'))` — excluye transferencias internas e inversiones; preserva `nature IS NULL` (txns pendientes de categorizar). *(T-019 · mig 30)*

```
year, month, category_id, visibility, spent, txn_count
```

`spent` = `ABS(SUM(amount))` — valor positivo. `security_invoker = true`.

### `public.v_spent_by_category_week` *(mig 29)*

Mismo patrón que `v_spent_by_category_month` pero agrupado por semana ISO.

```
week_start, category_id, visibility, spent, txn_count
```

`week_start` = lunes ISO (`date_trunc('week', date::timestamp)::date`). `security_invoker = true`.

### `public.v_category_budget_status` *(mig 29)*

Join `FULL OUTER` entre `budgets` y `v_spent_by_category_month`. Devuelve categorías con budget, con gasto, o ambos. Con `budgets` vacía devuelve solo filas de gasto con `semaforo='sin_budget'`.

```
year, month, category_id, visibility,
amount_planned, spent, remaining, pct_used, semaforo, txn_count
```

`semaforo`: `verde` (≤ 90%) · `ambar` (90–100%) · `rojo` (> 100%) · `sin_budget` (sin presupuesto asignado). `security_invoker = true`.

### `public.v_median_spend_3m_by_category` *(mig 29)*

Mediana de gasto mensual por `(category_id, visibility)` sobre los 3 meses completos anteriores al mes actual. Usado por el Planner ZBB como sugerencia por categoría.

```
category_id, visibility, median_spent, months_with_data
```

`months_with_data < 3` → frontend usa fallback 0 con copy editorial *"Aún sin histórico suficiente. Decide tú."* Sin zero-fill: meses sin gasto en esa categoría no generan fila. Hereda filtro de transferencias vía `v_spent_by_category_month`. `security_invoker = true`.

### `public.v_median_income_3m` *(mig 29)*

Mediana de ingreso neto mensual por `user_id` sobre los 3 meses completos anteriores al actual. RLS de `incomes` (estricta por `user_id`) aplica vía `security_invoker`: cada usuario solo ve sus propios datos.

```
user_id, median_monthly_income, months_with_data
```

Usado por el Planner ZBB para ingreso esperado en scope personal. Scope compartido → valor manual en `localStorage` hasta Configuración (Fase 5). `security_invoker = true`.

---

### `public.v_fixed_expenses_observed` *(mig 34)*

Vista-espejo de gastos fijos observados. Agrega transacciones con `nature='fijo_recurrente'` (decisión humana ya tomada) por `counterparty + year + month + visibility`. Solo agrega; no infiere periodicidad ni detecta suscripciones.

```
counterparty, year, month, visibility,
total_spent, txn_count, avg_amount, first_seen, last_seen
```

`total_spent` y `avg_amount` = valores positivos (`ABS`). `security_invoker = true` — hereda RLS de `transactions` vía `can_see_account` (mig 32). Ana no ve fijos de cuentas `privada_eric`. Sin GRANT especial: `authenticated` hereda de `transactions`.

**Uso:** panel Finanzas · bloque "Gastos fijos observados" — referencia de lectura. **Nunca auto-rellena los gastos fijos declarados (localStorage).**

---

### `public.weekly_closures` *(mig 30)*

Cierre semanal persistido. UNIQUE(week_start, scope). Escrita por `CloseSplashWeekly` vía UPSERT ON CONFLICT.

```
id, week_start (date lunes ISO), week_end (date domingo ISO),
scope CHECK('privada_eric'|'privada_ana'|'compartida'),
total_spent numeric(12,2), total_budget numeric(12,2),
semaforo CHECK('verde'|'ambar'|'rojo'),
top_deviations jsonb default '[]', insights jsonb default '[]',
closed_at timestamptz, created_at, updated_at (trigger set_updated_at)
```

**Constraints:** `UNIQUE(week_start, scope)` · `CHECK(week_end = week_start + 6)` · `CHECK scope IN(...)` · `CHECK semaforo IN(...)`.
**Índices:** `(week_start DESC)` · `(scope, week_start DESC)`.
**RLS:** SELECT/INSERT/UPDATE si `auth.uid() IS NOT NULL AND scope IN('privada_'||user_role(), 'compartida')`. Sin DELETE.
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated`.

---

### `public.monthly_closures` *(mig 31)*

Cierre mensual persistido. UNIQUE(year, month, scope). Escrita por `CloseSplashMonthly` vía UPSERT ON CONFLICT.

```
id, year int, month int CHECK(1..12),
scope CHECK('privada_eric'|'privada_ana'|'compartida'),
total_spent numeric(12,2), total_budget numeric(12,2),
semaforo CHECK('verde'|'ambar'|'rojo'),
top_deviations jsonb default '[]', category_breakdown jsonb default '[]',
comparison_with_prev_month jsonb NULL (null en primer mes),
insights jsonb default '[]',
closed_at timestamptz, created_at, updated_at (trigger set_updated_at)
```

**Constraints:** `UNIQUE(year, month, scope)` · `CHECK month BETWEEN 1 AND 12` · `CHECK scope IN(...)` · `CHECK semaforo IN(...)`.
**Índices:** `(year DESC, month DESC)` · `(scope, year DESC, month DESC)`.
**RLS:** SELECT/INSERT/UPDATE si `auth.uid() IS NOT NULL AND scope IN('privada_'||user_role(), 'compartida')`. Sin DELETE.
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated`.

---

## 4 · Notas históricas de migraciones

### Migraciones de refactor (migs 14–20): recreaciones en cascada

Las vistas `holdings_valued`, `account_balances_full` y `patrimonio_neto` están fuertemente acopladas. Cualquier cambio a una requiere DROP CASCADE y recreación de todas en orden inverso. Patrón aplicado en cada mig de refactor: DROP `patrimonio_neto` → DROP `account_balances_full` → DROP `holdings_valued` → recrear con la nueva lógica.

| Mig | Archivo | Cambio neto |
|---|---|---|
| 14 | `card_balance_sign.sql` | `account_balances_full`: `type='card'` multiplica saldo por -1 |
| 15 | `holdings_valued_fallback.sql` | `holdings_valued`: añade fallback a `avg_price_eur` (roboadvisors sin cotización) |
| 17 | `abf_add_is_active_sort_order.sql` | `account_balances_full`: expone `is_active` y `sort_order` de `accounts` |
| 18 | `unique_prices_robust.sql` | `holding_prices`: reemplaza UNIQUE(ticker,isin,date) por índice COALESCE NULL-safe; limpia duplicados previos |
| 19 | `holdings_valued_match_by_ticker.sql` | `holdings_valued`: prioriza match por ticker; ISIN solo cuando `holding.ticker IS NULL` |
| 20 | `manual_holdings.sql` | `account_balances_full`: suma `manual_holdings` a `holdings_value_eur`; `holdings_valued`: elimina fallback `avg_price_eur` |

### Mig 06 (`seed_categories.sql`)

DML puro (INSERT). No genera DDL. Siembra categorías base y proyectos iniciales (`rutina`, `maristas_adquisicion`, `maristas_equipamiento`).

### Mig 32 (`rls_auth_guard.sql`) — Fix de seguridad RLS transversal

**Problema detectado:** la anon key (pública en el bundle del frontend) podía leer filas con `visibility/scope = 'compartida'` sin JWT autenticado, porque las policies solo filtraban por `user_role()` sin verificar existencia de sesión.

**Fix:** añadido `auth.uid() IS NOT NULL AND` como guard en:
- **8 tablas (Grupo C):** `accounts`, `assets`, `budgets`, `categories`, `liabilities`, `savings_goals`, `weekly_closures`, `monthly_closures` — policies DROP + RECREATE.
- **2 funciones (Grupo D):** `can_see_account()` + `can_see_transaction()` — cubre `transactions`, `bank_account_links`, `holdings`, `transaction_splits` sin tocar sus policies.

**No afectados:**
- **Grupo A (13 tablas):** ya seguros por `user_id = auth.uid()`, `auth.uid() IS NOT NULL` explícito, o `auth.role() = 'authenticated'`.
- **Grupo B (2 tablas):** `currency_rates`, `holding_prices` — cache de mercado sin datos personales, `USING(true)` intencional.

Migración atómica (BEGIN/COMMIT explícito). Verificado: anon ve 0 filas tras el fix; service_role sigue viendo 25 cuentas + 170 txns sin cambio.

---

### Numeración corta colisionada (migs 22–25)

El repo tiene dos grupos de migraciones con número corto 22–25 (PSD2 de abril–mayo y Fase 3 de mayo). En este documento se referencia con sufijo entre paréntesis cuando hay ambigüedad.

| Timestamp | Archivo | Descripción |
|---|---|---|
| 20260430000022 | `psd2_enable_banking.sql` | mig 22 (psd2) — tablas PSD2 + columnas en transactions |
| 20260506000023 | `psd2_grants.sql` | mig 23 (psd2) — INSERT/UPDATE en bank_connections/links |
| 20260506000024 | `psd2_delete_grants.sql` | mig 24 (psd2) — DELETE + policies DELETE en bank_connections/links |
| 20260514000025 | `extend_classification_rules.sql` | mig 25 (D-005) — campos set_* en classification_rules |
| 20260517000022 | `grants_transactions_authenticated.sql` | mig 22 (Fase 3) — INSERT/UPDATE en transactions |
| 20260517000023 | `grants_classification_rules_authenticated.sql` | mig 23 (Fase 3) — INSERT/UPDATE/DELETE en classification_rules |
| 20260518000024 | `t013_transferencias_internas.sql` | mig 24 (Fase 3) — nature 'transferencia' + categoría |
| 20260518000025 | `t014_categoria_ingresos.sql` | mig 25 (Fase 3) — categoría Ingresos |

---

## 5 · Notas operativas

- **Cualquier DDL** debe pasar por `supabase/migrations/` + `npx supabase db push`. **Nunca SQL Editor directo** (parche P-007 origen del incidente Copilot del 30-abr).
- **Antes de modificar cualquier tabla con representación visual**, validar con Eric: dónde se muestra, relación con totales, qué campos. No backend que afecte visualización sin diseño previo acordado.
- **`stock_option_grants` está obsoleta** (P-010). Usar `stock_options` + `stock_options_valued`.
- **PostgREST y COALESCE:** `holding_prices` tiene índice UNIQUE con COALESCE (NULL-safe) que rompe `on_conflict` en upserts. Usar DELETE+INSERT (patrón aplicado en `update_prices.py`).
- **Vistas con `security_invoker = true`:** respetan la RLS del usuario que las consulta, no del owner que las creó. Patrón estándar del proyecto.

---

**Fin del documento. Cuando se actualice una migración, actualizar también esta referencia en el mismo commit.**
