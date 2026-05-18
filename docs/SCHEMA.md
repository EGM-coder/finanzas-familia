# EGMFin · Schema Reference

> **Single source of truth** del schema. Generado desde `supabase/migrations/` consolidando lo que vive en el repo.
> **Cobertura:** migraciones 01–11 + 22–24 (presentes en el repo). **TODO:** migraciones 12–21 mencionadas en `EGMFin_Estado_04may2026.md` y siguientes — completar con sus DDL reales en una sesión de mantenimiento.
> **Última actualización:** 18 may 2026 — mig 22, 23, 24.

---

## 0 · Convenciones generales

- **Sin DELETE:** archivado vía `is_active = false` o `status = 'archived'`. Integridad histórica obligatoria.
- **Auditoría:** todas las tablas tienen `created_at` + `updated_at`, este último mantenido por el trigger `set_updated_at` antes de cada UPDATE.
- **RLS habilitado** en todas las tablas. Patrones de policy en sección 1.
- **Visibilidad tri-state:** `privada_eric` | `privada_ana` | `compartida`. Aplica a `accounts`, `assets`, `budgets`, `savings_goals`, `liabilities`, `categories` (cuando `is_default=false`).
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
| `public.can_see_account(p_account_id uuid)` | sql · security definer · stable | `boolean` | Helper RLS: ¿la sesión actual puede ver esa cuenta? Bypassa RLS de accounts para evitar recursión. |
| `public.can_see_transaction(p_transaction_id uuid)` | sql · security definer · stable | `boolean` | Helper RLS: navega txn → account → visibility. Usado en `transaction_splits`. |

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

**Índices:**
- `transactions_date_idx` on `(date DESC)`
- `transactions_account_date_idx` on `(account_id, date DESC)`
- `transactions_category_idx` on `(category_id)`
- `transactions_titular_date_idx` on `(titular, date DESC)`

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

### 2.6 · `public.classification_rules` *(mig 02)*

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
| `is_active` | bool NOT NULL default `true` | |

**OJO — no existe `set_is_reimbursable`:** si una regla debe marcar reembolsable, requiere nueva DDL en migración futura.

**RLS:** abierto a cualquier autenticado.

**GRANTs (mig 23):** `authenticated` tiene `SELECT, INSERT, UPDATE, DELETE`. Las reglas son entidades mutables sin requisito de integridad histórica. `service_role` mantiene full grants para el cron de `sync_psd2.py` (lectura masiva al aplicar reglas).

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

**Tabla eliminada en recovery del 30-abr-2026 (parche P-010).** Sustituida por `public.stock_options` (mig 16, *pendiente de documentar en este SCHEMA.md*) + vista `stock_options_valued`. No referenciar en código nuevo.

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

### 2.18 · `public.currency_rates` *(mig 11)*

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

## 3 · Vistas

### `public.account_balances` *(mig 09)*

Saldo de cada cuenta = `initial_balance + sum(transactions.amount)`.

```
account_id | current_balance
```

`security_invoker = true` — respeta RLS del usuario.

### `public.account_balances_full` *(mig 10)*

Saldo extendido. Para cuentas `broker` / `investment` añade `holdings_value_eur`:

```
id, name, institution, type, visibility, linked_account_id, initial_balance,
transactions_sum, holdings_value_eur, current_balance
```

**TODO:** mig 17 expone `is_active` y `sort_order`. Actualizar este SCHEMA.md cuando se documente.

### `public.holdings_valued` *(mig 10, refactor mig 19)*

Une `holdings` con el último precio de `holding_prices` vía `LATERAL`. Match: ticker + isin con `IS NOT DISTINCT FROM`. **Mig 19 prioriza match por ticker antes que ISIN.**

```
holdings.*, current_price_original, current_price_eur, price_date, current_value_eur
```

---

## 4 · ⚠️ Pendiente de documentar (migraciones 12–21)

Conocidas por `EGMFin_Estado_04may2026.md` y siguientes. Cuando se incorpore una sesión de mantenimiento, completar esta sección con DDL real leído de `supabase/migrations/`.

| Mig | Nombre | Resumen funcional |
|---|---|---|
| 12 | `patrimonio_neto.sql` | Vista `patrimonio_neto` agregada + asset Maristas (143.370€) |
| 14 | `card_balance_sign.sql` | Tarjetas crédito invierten signo de `amount` en balances |
| 15 | `holdings_valued_fallback.sql` | Parche temporal (eliminado en mig 20) |
| 16 | `stock_options.sql` | **Tabla `stock_options` + vista `stock_options_valued`** + recreación `patrimonio_neto`. Sustituye `stock_option_grants` (obsoleta, P-010). |
| 17 | `expose_is_active_sort_order.sql` | `account_balances_full` expone `is_active` y `sort_order` |
| 18 | `unique_prices_robust.sql` | UNIQUE robusto NULL-safe en `holding_prices` (COALESCE) |
| 19 | `holdings_valued_match_by_ticker.sql` | `holdings_valued` prioriza match por ticker; ISIN fallback |
| 20 | `manual_holdings.sql` | Tabla `manual_holdings` + histórico + trigger snapshot. Elimina parche P-001. |
| 21 | `patrimonio_snapshots.sql` | Tabla `patrimonio_snapshots` + función `capture_patrimonio_snapshot()` (SECURITY DEFINER) + vista `patrimonio_snapshot_with_delta` |

**Mig 6** (`seed_categories.sql`) y **mig 13** no aparecen en mi visión actual — el primero es seed (DML) que no genera DDL, el segundo posiblemente fue saltado o consolidado en otro.

---

## 5 · Notas operativas

- **Cualquier DDL** debe pasar por `supabase/migrations/` + `npx supabase db push`. **Nunca SQL Editor directo** (parche P-007 origen del incidente Copilot del 30-abr).
- **Antes de modificar cualquier tabla con representación visual**, validar con Eric: dónde se muestra, relación con totales, qué campos. No backend que afecte visualización sin diseño previo acordado.
- **`stock_option_grants` está obsoleta** (P-010). Usar `stock_options` + `stock_options_valued`.
- **PostgREST y COALESCE:** `holding_prices` tiene índice UNIQUE con COALESCE (NULL-safe) que rompe `on_conflict` en upserts. Usar DELETE+INSERT (patrón aplicado en `update_prices.py`).
- **Vistas con `security_invoker = true`:** respetan la RLS del usuario que las consulta, no del owner que las creó. Patrón estándar del proyecto.

---

**Fin del documento. Cuando se actualice una migración, actualizar también esta referencia en el mismo commit.**
