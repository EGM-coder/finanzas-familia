# EGMFin · SCHEMA.md — Fuente de verdad (1-jun-2026)

> **Generado desde:** lectura directa de las 39 migraciones en `supabase/migrations/`  
> **Herramienta:** `npx supabase db dump --linked` requiere Docker — no disponible en este entorno.  
> **Mantenimiento:** actualizar en el mismo commit que cualquier migración nueva (PRO-1 + PRO-8).  
> **P-009 (regla permanente):** antes de cualquier query nuevo, verificar columnas reales aquí o con `\d+ tabla`.

---

## 0 · Principios de seguridad

- **RLS habilitado** en todas las tablas. Nunca `service_role` en frontend.
- **Patrones de policy (3 grupos):**
  - **Grupo A** (estricto, por user_id): `incomes`, `work_abroad_days`, `bank_connections` — solo el dueño.
  - **Grupo C** (tri-state visibility): `accounts`, `assets`, `budgets`, `categories`, `liabilities`, `savings_goals`, `weekly_closures`, `monthly_closures` — `auth.uid() IS NOT NULL AND (visibility='privada_'||user_role() OR visibility='compartida')`. Guard `auth.uid() IS NOT NULL` añadido en mig 32 (antes anon key podía leer `compartida`).
  - **Grupo D** (función helper): `transactions`, `holdings`, `transaction_splits`, `bank_account_links` — `can_see_account()` o `can_see_transaction()`, ambas con `auth.uid() IS NOT NULL` desde mig 32.
- **Visibilidad tri-state:** `privada_eric` | `privada_ana` | `compartida`. Aplica a `accounts`, `assets`, `budgets`, `savings_goals`, `liabilities`, `categories` (cuando `is_default=false`), `weekly_closures`, `monthly_closures`.
- **Tablas públicas (mercado):** `holding_prices`, `currency_rates` — SELECT con `TRUE`, sin restricción de usuario.
- **Tablas compartidas sin filtro V1:** `stock_options`, `manual_holdings`, `manual_holdings_history`, `maristas_items`, `projects`, `stock_prices` — `auth.role()='authenticated'`.
- **Vistas:** todas con `security_invoker=true` — heredan RLS del usuario que ejecuta.
- **INV-6:** RLS sin GRANT de tabla → 42501 silencioso (200 + 0 filas). Ver grants por tabla en §4.
- **Sin DELETE** en tablas de historial: `transactions`, `budgets`, `weekly_closures`, `monthly_closures`, `incomes`.

---

## 1 · Funciones helper (RLS core)

### `public.user_role() → text`
`sql SECURITY DEFINER STABLE` — Retorna `'eric'` o `'ana'` leyendo `profiles.role` para `auth.uid()`. Núcleo de todas las policies tri-state.

### `public.set_updated_at() → trigger`
`plpgsql` — Setea `new.updated_at = now()` antes de UPDATE. Aplicada via trigger en todas las tablas con `updated_at`.

### `public.can_see_account(p_account_id uuid) → boolean`
`sql SECURITY DEFINER STABLE` — `auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM accounts WHERE id=p_account_id AND visibility matches)`. Usada en: `transactions`, `holdings`, `bank_account_links`.

### `public.can_see_transaction(p_transaction_id uuid) → boolean`
`sql SECURITY DEFINER STABLE` — Navega `transaction_splits → transactions → accounts`, verifica visibility con `auth.uid() IS NOT NULL`. Usada en: `transaction_splits`.

### `public.can_see_order(p_order_id uuid) → boolean`
`sql SECURITY DEFINER STABLE` — `auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM purchase_orders WHERE id=p_order_id AND visibility matches)`. Usada en: `purchase_order_lines`.

### `public.capture_patrimonio_snapshot() → patrimonio_snapshots`
`plpgsql SECURITY DEFINER` — Lee vista `patrimonio_neto`, hace UPSERT ON CONFLICT `(snapshot_date)`. `GRANT EXECUTE TO authenticated`.

### `public.fn_manual_holdings_snapshot() → trigger`
`plpgsql` — Trigger AFTER INSERT OR UPDATE en `manual_holdings`. Upserta en `manual_holdings_history` cuando cambia `current_value_eur`.

---

## 2 · Tablas

### 2.1 · `public.accounts` *(mig 01 + 07 + 10)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `name` | text NOT NULL | |
| `institution` | text NOT NULL | |
| `type` | text NOT NULL | CHECK: `bank`, `investment`, `broker`, `cash`, `pension`, `card` (mig 07), `tesoreria_tae` (mig 10) |
| `visibility` | text NOT NULL | CHECK: `privada_eric`, `privada_ana`, `compartida` |
| `currency` | text NOT NULL | DEFAULT 'EUR' |
| `is_active` | bool NOT NULL | DEFAULT true |
| `notes` | text | |
| `sort_order` | int NOT NULL | DEFAULT 0 |
| `linked_account_id` | uuid FK accounts(id) | mig 07; solo en type='card' |
| `initial_balance` | numeric(12,2) NOT NULL | mig 07; DEFAULT 0 |
| `created_at` | timestamptz NOT NULL | DEFAULT now() |
| `updated_at` | timestamptz NOT NULL | DEFAULT now(); trigger set_updated_at |

**Constraints:** `accounts_card_linked_check` — (type='card' AND linked_account_id IS NOT NULL) OR (type≠'card' AND linked_account_id IS NULL).  
**Índices:** `accounts_linked_idx` on (linked_account_id).  
**RLS:** Grupo C (mig 32 guard).

---

### 2.2 · `public.categories` *(mig 01 + seed mig 06 + migs 24–28)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `parent_id` | uuid FK categories(id) | ON DELETE RESTRICT |
| `icon` | text | |
| `color` | text | hex #RRGGBB |
| `is_default` | bool NOT NULL | DEFAULT false |
| `is_active` | bool NOT NULL | DEFAULT true |
| `visibility` | text | NULL si is_default=true; tri-state si is_default=false |
| `sort_order` | int NOT NULL | DEFAULT 0 |
| `created_at` | timestamptz NOT NULL | DEFAULT now() |
| `updated_at` | timestamptz NOT NULL | DEFAULT now() |

**Constraint:** `categories_visibility_check` — (is_default=true AND visibility IS NULL) OR (is_default=false AND visibility IN (...)).  
**RLS:** Grupo C, SELECT incluye `is_default=true`; INSERT/UPDATE solo `is_default=false`.

**Categorías base (is_default=true, seed mig 06 + migs 24-28):**
- **sort 1–12** (mig 06): Vivienda, Alimentación, Transporte, Salud, Educación, Ocio y cultura, Ropa y cuidado personal, Hijos, Servicios y suministros, Financiero e impuestos, Regalos y donaciones, Vacaciones y viajes
- **sort 10 – Financiero (hojas adicionales mig 27-28):** Hipoteca, Letra coche, IBI, Otros financieros, Crédito al consumo, Crédito estudios
- **sort 13 – Transferencias internas** (mig 24): Entre cuentas corrientes, Pago de tarjeta, Aportación cuenta de ahorro
- **sort 14 – Ingresos** (mig 25): Nómina, Dividendos, Reembolsos, Otros ingresos
- **sort 15 – Inversiones** (mig 26): Fondos indexados, Acciones individuales, Planes de pensiones, Cripto

---

### 2.3 · `public.projects` *(mig 01 + seed mig 06 + mig 26)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `slug` | text NOT NULL UNIQUE | |
| `description` | text | |
| `status` | text NOT NULL | DEFAULT 'active'; CHECK: `active`, `completed`, `archived` |
| `start_date` | date | |
| `end_date` | date | |
| `total_budget` | numeric(12,2) | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Proyectos activos:** rutina, maristas_adquisicion, maristas_equipamiento, capital-leo (mig 26), capital-biel (mig 26).  
**RLS:** `auth.uid() IS NOT NULL`.

---

### 2.4 · `public.transactions` *(mig 02 + 07 + 22 + 24 + 38 + 39)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `date` | date NOT NULL | |
| `amount` | numeric(12,2) NOT NULL | negativo = gasto; positivo = ingreso |
| `currency` | text NOT NULL | DEFAULT 'EUR' |
| `description` | text | |
| `raw_concept` | text | concepto bancario legible (T-011); NO JSON crudo |
| `account_id` | uuid NOT NULL FK accounts(id) | ON DELETE RESTRICT |
| `category_id` | uuid FK categories(id) | ON DELETE RESTRICT |
| `project_id` | uuid FK projects(id) | ON DELETE RESTRICT |
| `nature` | text | CHECK: `fijo_recurrente`, `variable_recurrente`, `extraordinario`, `inversion`, `ahorro`, `transferencia` (mig 24) |
| `paid_by_user_id` | uuid FK auth.users(id) | ON DELETE RESTRICT |
| `titular` | text NOT NULL | CHECK: `eric`, `ana`, `compartido` |
| `source` | text NOT NULL | DEFAULT 'manual'; CHECK: `manual`, `csv`, `psd2`, `gmail_parse`, `outlook_parse` (mig 39) |
| `source_id` | text | |
| `counterparty` | text | |
| `is_reimbursable` | bool NOT NULL | mig 07; DEFAULT false |
| `reimbursed_at` | timestamptz | mig 07 |
| `bank_connection_id` | uuid FK bank_connections(id) | mig 22; ON DELETE SET NULL |
| `external_id` | text | mig 22; UNIQUE PARTIAL con account_id WHERE NOT NULL |
| `order_id` | uuid FK purchase_orders(id) | mig 38; ON DELETE SET NULL |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `transactions_date_idx` (date DESC), `transactions_account_date_idx` (account_id, date DESC), `transactions_category_idx` (category_id), `transactions_titular_date_idx` (titular, date DESC), `transactions_external_id_unique` UNIQUE PARTIAL (account_id, external_id) WHERE external_id IS NOT NULL, `transactions_order_id_idx` (order_id) WHERE NOT NULL (mig 38).  
**RLS:** Grupo D — `can_see_account(account_id)`.  
**GRANTs (mig 22 Fase 3):** `authenticated` tiene SELECT, INSERT, UPDATE. Sin DELETE.

---

### 2.5 · `public.transaction_splits` *(mig 02)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `transaction_id` | uuid NOT NULL FK transactions(id) | ON DELETE CASCADE |
| `amount` | numeric(12,2) NOT NULL | |
| `category_id` | uuid FK categories(id) | ON DELETE RESTRICT |
| `project_id` | uuid FK projects(id) | ON DELETE RESTRICT |
| `note` | text | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `transaction_splits_transaction_id_idx`.  
**RLS:** Grupo D — `can_see_transaction(transaction_id)`.

---

### 2.6 · `public.classification_rules` *(mig 02 + mig 25)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `priority` | int NOT NULL | DEFAULT 100 |
| `match_field` | text NOT NULL | CHECK: `counterparty`, `raw_concept`, `description` |
| `match_operator` | text NOT NULL | CHECK: `contains`, `equals`, `starts_with`, `regex` |
| `match_value` | text NOT NULL | |
| `set_category_id` | uuid FK categories(id) | ON DELETE SET NULL |
| `set_project_id` | uuid FK projects(id) | ON DELETE SET NULL |
| `set_nature` | text | CHECK: mismos values que nature en transactions |
| `set_account_id` | uuid FK accounts(id) | mig 25; ON DELETE SET NULL |
| `set_titular` | text | mig 25; CHECK: `eric`, `ana`, `compartido` |
| `set_paid_by_user_id` | uuid FK auth.users(id) | mig 25; ON DELETE SET NULL |
| `set_is_reimbursable` | bool | mig 25 |
| `is_active` | bool NOT NULL | DEFAULT true |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**RLS:** `auth.uid() IS NOT NULL`.  
**GRANTs (mig 23 Fase 3):** `authenticated` tiene SELECT, INSERT, UPDATE, DELETE.

---

### 2.7 · `public.budgets` *(mig 03)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `year` | int NOT NULL | |
| `month` | int NOT NULL | CHECK (1–12) |
| `category_id` | uuid NOT NULL FK categories(id) | ON DELETE RESTRICT |
| `visibility` | text NOT NULL | CHECK: `privada_eric`, `privada_ana`, `compartida` |
| `amount_planned` | numeric(12,2) NOT NULL | 0 = rastro histórico; >0 = asignación activa |
| `notes` | text | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Constraint:** `budgets_unique_period` UNIQUE (year, month, category_id, visibility).  
**Índices:** `budgets_year_month_idx`, `budgets_category_idx`.  
**RLS:** Grupo C (mig 32 guard).  
**GRANTs (mig 30):** `authenticated` tiene SELECT, INSERT, UPDATE. Sin DELETE — historial presupuestario intacto (decisión cerrada mig 03).

---

### 2.8 · `public.savings_goals` *(mig 03)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `target_amount` | numeric(12,2) NOT NULL | |
| `current_amount` | numeric(12,2) NOT NULL | DEFAULT 0 |
| `target_date` | date | |
| `monthly_contribution` | numeric(12,2) | |
| `account_id` | uuid FK accounts(id) | ON DELETE SET NULL |
| `visibility` | text NOT NULL | tri-state |
| `is_active` | bool NOT NULL | DEFAULT true |
| `notes` | text | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `savings_goals_account_id_idx`.  
**RLS:** Grupo C (mig 32 guard).

---

### 2.9 · `public.incomes` *(mig 04)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `date` | date NOT NULL | |
| `user_id` | uuid NOT NULL FK auth.users(id) | ON DELETE RESTRICT |
| `type` | text NOT NULL | CHECK: `nomina_mensual`, `paga_extra`, `bonus`, `dietas`, `otro` |
| `gross_amount` | numeric(12,2) NOT NULL | |
| `irpf_withheld` | numeric(12,2) NOT NULL | DEFAULT 0 |
| `ss_withheld` | numeric(12,2) NOT NULL | DEFAULT 0 |
| `net_amount` | numeric(12,2) NOT NULL | |
| `art_7p_exempt_days` | int | |
| `art_7p_exempt_amount` | numeric(12,2) | |
| `employer` | text | |
| `concept` | text | |
| `source` | text NOT NULL | DEFAULT 'manual' |
| `source_id` | text | |
| `notes` | text | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `incomes_user_date_idx`, `incomes_type_date_idx`.  
**RLS:** Grupo A — `user_id = auth.uid()`.

---

### 2.10 · `public.work_abroad_days` *(mig 04)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL FK auth.users(id) | ON DELETE RESTRICT |
| `date_from` | date NOT NULL | |
| `date_to` | date NOT NULL | |
| `country` | text NOT NULL | |
| `purpose` | text | |
| `days_count` | int NOT NULL | |
| `year` | int NOT NULL | |
| `notes` | text | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Constraint:** `work_abroad_days_dates_check` CHECK (date_to >= date_from).  
**Índices:** `work_abroad_days_user_year_idx`, `work_abroad_days_date_from_idx`.  
**RLS:** Grupo A — `user_id = auth.uid()`.

---

### 2.11 · `public.assets` *(mig 05)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `type` | text NOT NULL | CHECK: `inmueble`, `vehiculo`, `otro` |
| `owner_user_id` | uuid FK auth.users(id) | ON DELETE RESTRICT |
| `visibility` | text NOT NULL | tri-state |
| `purchase_date` | date | |
| `purchase_value` | numeric(12,2) NOT NULL | |
| `current_value` | numeric(12,2) | |
| `last_valuation_date` | date | |
| `notes` | text | |
| `is_active` | bool NOT NULL | DEFAULT true |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `assets_visibility_active_idx`.  
**RLS:** Grupo C (mig 32 guard).  
**Datos:** Apartamento Residencial Maristas (compartida, 509100 €, valoración actual 143370 €).

---

### 2.12 · `public.stock_option_grants` — ⚠️ OBSOLETA, ELIMINADA

Creada en mig 05. **Eliminada en recovery 30-abr-2026** (P-010). Sustituida por `public.stock_options` (mig 16). **No referenciar en código nuevo.**

---

### 2.13 · `public.stock_prices` *(mig 05)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `ticker` | text NOT NULL | |
| `date` | date NOT NULL | |
| `close_price` | numeric(10,4) NOT NULL | |
| `source` | text | |
| `created_at` | timestamptz NOT NULL | |

**Constraint:** UNIQUE (ticker, date).  
**Índices:** `stock_prices_ticker_date_idx`.  
**RLS:** `auth.uid() IS NOT NULL`.  
**Nota:** Uso potencialmente solapado con `holding_prices` (mig 10). Confirmar antes de queries nuevos.

---

### 2.14 · `public.maristas_items` *(mig 05)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `category` | text NOT NULL | CHECK: `adquisicion`, `cocina`, `banos`, `iluminacion`, `mobiliario`, `electrodomesticos`, `otros` |
| `supplier` | text | |
| `concept` | text NOT NULL | |
| `budget_amount` | numeric(12,2) NOT NULL | |
| `committed_amount` | numeric(12,2) NOT NULL | DEFAULT 0 |
| `paid_amount` | numeric(12,2) NOT NULL | DEFAULT 0 |
| `budget_date` | date | |
| `expected_delivery` | date | |
| `actual_delivery` | date | |
| `status` | text NOT NULL | DEFAULT 'presupuestado'; CHECK: `presupuestado`, `contratado`, `pagado_parcial`, `pagado_total`, `entregado` |
| `contract_reference` | text | |
| `notes` | text | |
| `is_active` | bool NOT NULL | DEFAULT true |
| `sort_order` | int NOT NULL | DEFAULT 0 |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `maristas_items_category_sort_idx`, `maristas_items_status_idx`.  
**RLS:** `auth.uid() IS NOT NULL`.

---

### 2.15 · `public.liabilities` *(mig 08)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `type` | text NOT NULL | CHECK: `hipoteca`, `prestamo_personal`, `financiacion_consumo`, `linea_credito`, `otros` |
| `lender` | text | |
| `visibility` | text NOT NULL | tri-state |
| `original_principal` | numeric(12,2) NOT NULL | |
| `current_balance` | numeric(12,2) NOT NULL | |
| `interest_rate` | numeric(5,4) | |
| `interest_type` | text | CHECK: `fijo`, `variable`, `mixto` |
| `start_date` | date | |
| `end_date` | date | |
| `monthly_payment` | numeric(12,2) | |
| `status` | text NOT NULL | DEFAULT 'activa'; CHECK: `activa`, `proyectada`, `cerrada` |
| `linked_asset_id` | uuid FK assets(id) | ON DELETE SET NULL |
| `notes` | text | |
| `is_active` | bool NOT NULL | DEFAULT true |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `liabilities_visibility_status_idx`, `liabilities_linked_asset_idx`.  
**RLS:** Grupo C (mig 32 guard).

---

### 2.16 · `public.holdings` *(mig 10)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL FK accounts(id) | ON DELETE CASCADE |
| `asset_type` | text NOT NULL | CHECK: `accion`, `fondo_indexado`, `etf`, `cripto`, `bono` |
| `ticker` | text | |
| `isin` | text | |
| `name` | text NOT NULL | |
| `quantity` | numeric(20,8) NOT NULL | DEFAULT 0 |
| `avg_price_original` | numeric(20,8) | |
| `original_currency` | text NOT NULL | DEFAULT 'EUR' |
| `avg_price_eur` | numeric(20,8) | coste medio en EUR; NO es precio actual |
| `notes` | text | |
| `is_active` | bool NOT NULL | DEFAULT true |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `idx_holdings_account`, `idx_holdings_ticker`, `idx_holdings_isin`.  
**RLS:** Grupo D — `can_see_account(account_id)`.

---

### 2.17 · `public.holding_prices` *(mig 10 + mig 18)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `ticker` | text | P-008: no hay CHECK de (ticker OR isin NOT NULL) |
| `isin` | text | |
| `date` | date NOT NULL | |
| `close_original` | numeric(20,8) NOT NULL | en moneda original |
| `currency` | text NOT NULL | DEFAULT 'USD' |
| `close_eur` | numeric(20,8) | convertido; puede ser NULL si sin tipo de cambio |
| `source` | text | DEFAULT 'yahoo' |
| `created_at` | timestamptz NOT NULL | |

**Índices:** `idx_prices_ticker_date`, `idx_prices_isin_date`, **`holding_prices_unique_idx`** UNIQUE on (COALESCE(ticker,''), COALESCE(isin,''), date) — NULL-safe (mig 18).  
**RLS:** SELECT con `TRUE` (cache de mercado público; anon puede leer).  
**Nota P-006:** NDX1.DE tiene filas con `isin=NULL` — no es error, es precio para stock_options.  
**Nota P-008 (deuda D-001):** sin CHECK `(ticker IS NOT NULL OR isin IS NOT NULL)`.

---

### 2.18 · `public.currency_rates` *(mig 13)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `date` | date NOT NULL | |
| `from_currency` | text NOT NULL | |
| `to_currency` | text NOT NULL | DEFAULT 'EUR' |
| `rate` | numeric(20,8) NOT NULL | |
| `source` | text | DEFAULT 'yahoo' |
| `created_at` | timestamptz NOT NULL | |

**Constraint:** UNIQUE (date, from_currency, to_currency).  
**RLS:** SELECT con `TRUE`.

---

### 2.19 · `public.stock_options` *(mig 16)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `package_name` | text NOT NULL | |
| `ticker` | text NOT NULL | NDX1.DE |
| `num_options` | int NOT NULL | CHECK (num_options > 0) |
| `strike_price` | numeric(12,4) NOT NULL | |
| `currency` | text NOT NULL | DEFAULT 'EUR' |
| `granted_date` | date | |
| `vesting_date` | date NOT NULL | |
| `exercise_window_start` | date NOT NULL | |
| `exercise_window_end` | date NOT NULL | |
| `condition_pct` | numeric(5,2) | DEFAULT 15.00 |
| `notes` | text | |
| `is_active` | bool NOT NULL | DEFAULT true |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Datos:** Paquete 1 (1000 opciones, strike 11,60 €, vesting 2028), Paquete 2 (1000 opciones, strike 26,31 €, vesting 2029).  
**RLS:** `auth.role()='authenticated'` (compartido V1).

---

### 2.20 · `public.manual_holdings` *(mig 20)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL FK accounts(id) | ON DELETE CASCADE |
| `name` | text NOT NULL | |
| `asset_type` | text NOT NULL | DEFAULT 'roboadvisor'; CHECK: `roboadvisor`, `fondo_privado`, `plan_pensiones`, `otro` |
| `current_value_eur` | numeric(20,8) NOT NULL | actualizar mensualmente manual |
| `last_update_date` | date NOT NULL | DEFAULT CURRENT_DATE |
| `update_frequency` | text NOT NULL | DEFAULT 'mensual'; CHECK: `mensual`, `trimestral`, `anual` |
| `notes` | text | |
| `is_active` | bool NOT NULL | DEFAULT true |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `idx_manual_holdings_account`.  
**Trigger:** `trg_manual_holdings_snapshot` AFTER INSERT/UPDATE → inserta en `manual_holdings_history`.  
**RLS:** `auth.role()='authenticated'`.  
**Uso:** Roboadvisor MyInvestor (P-001).

---

### 2.21 · `public.manual_holdings_history` *(mig 20)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `manual_holding_id` | uuid NOT NULL FK manual_holdings(id) | ON DELETE CASCADE |
| `value_eur` | numeric(20,8) NOT NULL | |
| `snapshot_date` | date NOT NULL | |
| `created_at` | timestamptz NOT NULL | |

**Constraint:** UNIQUE (manual_holding_id, snapshot_date).  
**Índices:** `idx_mh_history_holding` on (manual_holding_id, snapshot_date DESC).  
**RLS:** `auth.role()='authenticated'`.

---

### 2.22 · `public.patrimonio_snapshots` *(mig 21)*

| Columna | Tipo | Notas |
|---|---|---|
| `snapshot_date` | date **PK** | |
| `liquidos_y_holdings` | numeric(14,2) NOT NULL | |
| `inmuebles` | numeric(14,2) NOT NULL | |
| `activos_total` | numeric(14,2) NOT NULL | |
| `deudas_activas` | numeric(14,2) NOT NULL | |
| `deudas_proyectadas` | numeric(14,2) NOT NULL | |
| `patrimonio_neto_actual` | numeric(14,2) NOT NULL | |
| `patrimonio_neto_si_firmara_hoy` | numeric(14,2) NOT NULL | |
| `stock_options_intrinsic` | numeric(14,2) NOT NULL | |
| `created_at` | timestamptz NOT NULL | |

**RLS:** `auth.uid() IS NOT NULL`.

---

### 2.23 · `public.bank_connections` *(mig 22 PSD2)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `provider` | text NOT NULL | CHECK: `enable_banking` |
| `aspsp_name` | text NOT NULL | |
| `aspsp_country` | char(2) NOT NULL | |
| `aspsp_psu_type` | text NOT NULL | DEFAULT 'personal' |
| `auth_state` | uuid | |
| `consent_session_id` | text UNIQUE | |
| `consent_valid_until` | timestamptz | |
| `user_id` | uuid NOT NULL FK auth.users(id) | ON DELETE RESTRICT |
| `status` | text NOT NULL | DEFAULT 'pending'; CHECK: `pending`, `active`, `expired`, `revoked` |
| `raw_session` | jsonb | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**RLS:** Grupo A — `user_id = auth.uid()`.  
**GRANTs (mig 23 + 24 PSD2):** INSERT, UPDATE, DELETE a `authenticated`.

---

### 2.24 · `public.bank_account_links` *(mig 22 PSD2)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid NOT NULL FK accounts(id) | ON DELETE RESTRICT |
| `bank_connection_id` | uuid NOT NULL FK bank_connections(id) | ON DELETE CASCADE |
| `external_account_uid` | text NOT NULL | |
| `external_iban` | text | |
| `is_active` | bool NOT NULL | DEFAULT true |
| `last_sync_at` | timestamptz | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Constraint:** UNIQUE (bank_connection_id, external_account_uid).  
**RLS:** Grupo D — `can_see_account(account_id)`.  
**GRANTs (mig 23 + 24 PSD2):** INSERT, UPDATE, DELETE a `authenticated`.

---

### 2.25 · `public.weekly_closures` *(mig 30)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `week_start` | date NOT NULL | lunes ISO |
| `week_end` | date NOT NULL | domingo = week_start + 6 |
| `scope` | text NOT NULL | CHECK: `privada_eric`, `privada_ana`, `compartida` |
| `total_spent` | numeric(12,2) NOT NULL | |
| `total_budget` | numeric(12,2) NOT NULL | |
| `semaforo` | text NOT NULL | CHECK: `verde`, `ambar`, `rojo` |
| `top_deviations` | jsonb NOT NULL | DEFAULT '[]' |
| `insights` | jsonb NOT NULL | DEFAULT '[]' |
| `closed_at` | timestamptz NOT NULL | DEFAULT now() |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Constraints:** `weekly_closures_unique_week_scope` UNIQUE (week_start, scope); `weekly_closures_week_end_check` CHECK (week_end = week_start + 6).  
**Índices:** `weekly_closures_week_start_idx` (week_start DESC), `weekly_closures_scope_week_start_idx` (scope, week_start DESC).  
**RLS:** Grupo C (mig 32 guard) con `scope` en vez de `visibility`.  
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated` (mig 30). Sin DELETE.

---

### 2.26 · `public.monthly_closures` *(mig 31)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `year` | int NOT NULL | |
| `month` | int NOT NULL | CHECK (1–12) |
| `scope` | text NOT NULL | CHECK: `privada_eric`, `privada_ana`, `compartida` |
| `total_spent` | numeric(12,2) NOT NULL | |
| `total_budget` | numeric(12,2) NOT NULL | |
| `semaforo` | text NOT NULL | CHECK: `verde`, `ambar`, `rojo` |
| `top_deviations` | jsonb NOT NULL | DEFAULT '[]' |
| `category_breakdown` | jsonb NOT NULL | DEFAULT '[]' |
| `comparison_with_prev_month` | jsonb | |
| `insights` | jsonb NOT NULL | DEFAULT '[]' |
| `closed_at` | timestamptz NOT NULL | DEFAULT now() |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Constraint:** `monthly_closures_unique_year_month_scope` UNIQUE (year, month, scope).  
**Índices:** `monthly_closures_year_month_idx` (year DESC, month DESC), `monthly_closures_scope_year_month_idx` (scope, year DESC, month DESC).  
**RLS:** Grupo C (mig 32 guard) con `scope`.  
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated` (mig 31). Sin DELETE.

---

### 2.27 · `public.purchase_orders` *(mig 35)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `source` | text NOT NULL | CHECK: `amazon_email`, `amazon_csv`, `paypal_email`, `paypal_csv`, `manual` |
| `source_order_id` | text | |
| `merchant` | text | |
| `order_date` | date NOT NULL | |
| `total_amount` | numeric(12,2) NOT NULL | |
| `currency` | text NOT NULL | DEFAULT 'EUR' |
| `titular` | text NOT NULL | CHECK: `eric`, `ana`, `compartido` |
| `visibility` | text NOT NULL | CHECK: `privada_eric`, `privada_ana`, `compartida` |
| `is_financed` | bool NOT NULL | DEFAULT false |
| `installment_count` | int | nº de cuotas si is_financed |
| `installment_amount` | numeric(12,2) | importe por cuota |
| `first_charge_date` | date | fecha del primer cargo bancario |
| `match_status` | text NOT NULL | DEFAULT 'sin_linkar'; CHECK: `sin_linkar`, `parcial`, `completo` |
| `ai_suggested` | bool NOT NULL | DEFAULT false |
| `notes` | text | |
| `created_at` | timestamptz NOT NULL | DEFAULT now() |
| `updated_at` | timestamptz NOT NULL | DEFAULT now(); trigger set_updated_at |

**Índices:** `purchase_orders_source_id_unique` UNIQUE PARTIAL (source, source_order_id) WHERE NOT NULL; `purchase_orders_order_date_idx` (order_date DESC); `purchase_orders_match_status_idx` (match_status) WHERE != 'completo'; `purchase_orders_titular_idx` (titular).  
**RLS:** SELECT/INSERT/UPDATE — `auth.uid() IS NOT NULL AND (visibility='privada_'||user_role() OR visibility='compartida')`.  
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated`.

---

### 2.28 · `public.purchase_order_lines` *(mig 36)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid NOT NULL FK purchase_orders(id) | ON DELETE CASCADE |
| `description` | text NOT NULL | |
| `quantity` | int NOT NULL | DEFAULT 1 |
| `unit_amount` | numeric(12,2) NOT NULL | |
| `total_amount` | numeric(12,2) NOT NULL | |
| `category_id` | uuid FK categories(id) | ON DELETE SET NULL |
| `project_id` | uuid FK projects(id) | ON DELETE SET NULL |
| `ai_suggested_category_id` | uuid FK categories(id) | ON DELETE SET NULL |
| `category_confirmed` | bool NOT NULL | DEFAULT false |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | trigger set_updated_at |

**Índices:** `purchase_order_lines_order_idx` (order_id); `purchase_order_lines_category_idx` (category_id).  
**RLS:** SELECT/INSERT/UPDATE — `can_see_order(order_id)`.  
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated`.

---

### 2.29 · `public.purchase_order_charges` *(mig 37)*

Enlace cuota bancaria ↔ pedido. Una transacción solo puede pertenecer a un pedido (UNIQUE en transaction_id).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid NOT NULL FK purchase_orders(id) | ON DELETE RESTRICT |
| `transaction_id` | uuid NOT NULL FK transactions(id) | ON DELETE RESTRICT |
| `installment_number` | int | nº de cuota (1-based) |
| `match_method` | text NOT NULL | CHECK: `manual`, `ai_proposed`, `confirmed` |
| `created_at` | timestamptz NOT NULL | DEFAULT now() |

**Índices:** `purchase_order_charges_txn_unique` UNIQUE (transaction_id); `purchase_order_charges_order_idx` (order_id).  
**RLS:** SELECT/INSERT/UPDATE — `can_see_transaction(transaction_id)`.  
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated`.

---

## 3 · Vistas

### 3.1 · `public.account_balances` *(mig 09)*

**Columnas:** `account_id` uuid, `current_balance` numeric(12,2).  
**Fórmula:** `initial_balance + COALESCE(SUM(transactions.amount), 0)`.  
**Security_invoker:** true.

---

### 3.2 · `public.account_balances_full` *(mig 11 + 14 + 17 + 20)*

**Columnas de salida (estado final, P-009 verificado):**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | de accounts |
| `name` | text | |
| `institution` | text | |
| `type` | text | |
| `visibility` | text | |
| `linked_account_id` | uuid | |
| `initial_balance` | numeric(12,2) | |
| `is_active` | bool | **mig 17** |
| `sort_order` | int | **mig 17** |
| `transactions_sum` | numeric(12,2) | COALESCE(SUM(txns.amount), 0) |
| `holdings_value_eur` | numeric(20,8) | SUM(holdings_valued) + SUM(manual_holdings is_active) **(mig 20)** |
| `current_balance` | numeric(12,2) | Ver lógica abajo |

**Lógica current_balance:**
- `broker` / `investment`: `initial_balance + transactions_sum + holdings_value_eur`
- `card` (mig 14, P-002): `-1 * (initial_balance + transactions_sum)` — deuda como positivo
- resto: `initial_balance + transactions_sum`

**Security_invoker:** true.

---

### 3.3 · `public.holdings_valued` *(mig 10 + 15 + 19 + 20)*

**Columnas de salida (estado final, P-009 verificado):**

Todas las columnas de `holdings` más:

| Columna | Tipo | Notas |
|---|---|---|
| `current_price_original` | numeric(20,8) | en moneda original |
| `current_price_eur` | numeric(20,8) | `close_eur` del precio más reciente |
| `price_date` | date | fecha del precio usado |
| `current_value_eur` | numeric(20,8) | `quantity * close_eur` (NULL si sin precio) |

**Match de precios (mig 19 — prioriza ticker):**
- Si `holding.ticker IS NOT NULL` → `holding_prices.ticker = holding.ticker`
- Si `holding.ticker IS NULL` → `holding_prices.isin IS NOT DISTINCT FROM holding.isin`

**Sin fallback a `avg_price_eur`** (eliminado mig 20 — `current_value_eur` es NULL si no hay precio).  
**Security_invoker:** true.

---

### 3.4 · `public.patrimonio_neto` *(mig 12 + evolución 14–20)*

**Columnas de salida (estado final, P-009 verificado):**

| Columna | Tipo | Notas |
|---|---|---|
| `liquidos_y_holdings` | numeric(14,2) | SUM(account_balances_full.current_balance) WHERE is_active |
| `inmuebles` | numeric(14,2) | SUM(assets.current_value) WHERE is_active |
| `activos_total` | numeric(14,2) | liquidos_y_holdings + inmuebles |
| `deudas_activas` | numeric(14,2) | SUM(liabilities.current_balance) WHERE is_active AND status='activa' |
| `deudas_proyectadas` | numeric(14,2) | SUM(liabilities.current_balance) WHERE is_active AND status='proyectada' |
| `patrimonio_neto_actual` | numeric(14,2) | activos_total − deudas_activas |
| `patrimonio_neto_si_firmara_hoy` | numeric(14,2) | activos_total − deudas_activas − deudas_proyectadas |
| `stock_options_intrinsic` | numeric(14,2) | SUM(stock_options_valued.intrinsic_total) WHERE is_active (mig 16) |

**Security_invoker:** true.

---

### 3.5 · `public.stock_options_valued` *(mig 16)*

**Columnas:** Todas de `stock_options` (WHERE is_active=true) más:

| Columna | Tipo | Notas |
|---|---|---|
| `current_price_eur` | numeric(20,8) | último `close_eur` de holding_prices WHERE ticker matches |
| `price_date` | date | |
| `intrinsic_per_option` | numeric(12,4) | GREATEST(0, close_eur − strike_price) |
| `intrinsic_total` | numeric(14,4) | intrinsic_per_option × num_options |
| `condition_min_price` | numeric(12,4) | strike_price × (1 + condition_pct/100) |
| `condition_met` | bool | close_eur >= condition_min_price |
| `vested` | bool | vesting_date <= CURRENT_DATE |
| `exercisable_now` | bool | vested AND CURRENT_DATE BETWEEN exercise_window_start/end AND condition_met |

**Security_invoker:** true.

---

### 3.6 · `public.patrimonio_snapshot_with_delta` *(mig 21 + mig 33)*

**Columnas:** Snapshot más reciente de `patrimonio_snapshots` con deltas vs snapshot ~30 días atrás.

| Columna | Tipo |
|---|---|
| `snapshot_date` | date |
| `patrimonio_neto_actual`, `patrimonio_neto_si_firmara_hoy` | numeric |
| `liquidos_y_holdings`, `inmuebles`, `activos_total` | numeric |
| `deudas_activas`, `deudas_proyectadas`, `stock_options_intrinsic` | numeric |
| `ref_date` | date |
| `delta_neto_actual`, `delta_neto_si_firmara` | numeric |
| `delta_liquidos`, `delta_stock_options` | numeric |
| `delta_neto_actual_pct`, `delta_stock_options_pct` | numeric |
| `minutes_since_capture` | numeric |

**Security_invoker:** true (mig 33).

---

### 3.7 · `public.v_spent_by_category_month` *(mig 29 + T-019 mig 20260530000029)*

**Columnas:** `year` int, `month` int, `category_id` uuid, `visibility` text, `spent` numeric(12,2), `txn_count` int.

**Lógica splits-first:**
- Branch A (con splits): suma `ABS(splits.amount)` donde amount < 0
- Branch B (sin splits): suma `ABS(txn.amount)` donde category_id IS NOT NULL AND amount < 0
- **Filtro T-019:** `(t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))` en ambos branches — excluye transferencia e inversión, **preserva NULL** (pendientes de clasificación).

**Security_invoker:** true.

---

### 3.8 · `public.v_spent_by_category_week` *(mig 29)*

**Columnas:** `week_start` date, `category_id` uuid, `visibility` text, `spent` numeric(12,2), `txn_count` int.

**Filtro:** Mismo que `v_spent_by_category_month`. Agrupa por `date_trunc('week', date)` (lunes ISO).  
**Security_invoker:** true.

---

### 3.9 · `public.v_category_budget_status` *(mig 29)*

**Columnas:** `year` int, `month` int, `category_id` uuid, `visibility` text, `amount_planned` numeric(12,2), `spent` numeric(12,2), `remaining` numeric(12,2), `pct_used` numeric, `semaforo` text, `txn_count` int.

**Join:** FULL OUTER `budgets` ↔ `v_spent_by_category_month`.  
**Semáforo:** `verde` (≤90%) · `ambar` (90–100%) · `rojo` (>100%) · `sin_budget` (sin presupuesto).  
**Security_invoker:** true.

---

### 3.10 · `public.v_median_spend_3m_by_category` *(mig 29)*

**Columnas:** `category_id` uuid, `visibility` text, `median_spent` numeric, `months_with_data` int.

**Rango:** 3 meses completos anteriores al mes actual (sin zero-fill para meses sin datos).  
**Hereda filtro T-019** vía `v_spent_by_category_month`.  
**Security_invoker:** true.

---

### 3.11 · `public.v_median_income_3m` *(mig 29)*

**Columnas:** `user_id` uuid, `median_monthly_income` numeric, `months_with_data` int.

**Rango:** 3 meses completos anteriores al mes actual. Agrupa `SUM(net_amount)` por mes/usuario, toma percentile_cont(0.5).  
**Security_invoker:** true — cada usuario solo ve sus propios datos.

---

### 3.12 · `public.v_fixed_expenses_observed` *(mig 34)*

**Columnas:** `counterparty` text, `year` int, `month` int, `visibility` text, `total_spent` numeric(12,2), `txn_count` int, `avg_amount` numeric(12,2), `first_seen` date, `last_seen` date.

**Filtro:** `nature='fijo_recurrente' AND amount < 0`. Agrupa por counterparty/year/month/visibility.  
**Security_invoker:** true — hereda RLS de `transactions` vía `can_see_account`.

---

### 3.13 · `public.v_purchase_commitments` *(mig 38)*

**Columnas:** `mes` date, `visibility` text, `comprometido_eur` numeric, `cuotas_pendientes` int.

**Lógica:** Para pedidos financiados (`is_financed=true`, `match_status!='completo'`) con cuotas definidas, proyecta cuotas restantes mes a mes desde `first_charge_date + (cuotas_ya_pagadas + n − 1) meses`. Agrupa por mes y visibility.  
**Nota:** `cuotas_pagadas` se cuenta desde `purchase_order_charges` por `order_id`.  
**Security_invoker:** true.

---

## 4 · GRANTs resumen por tabla

| Tabla | authenticated SELECT | INSERT | UPDATE | DELETE | Notas |
|---|---|---|---|---|---|
| `accounts` | ✓ RLS | ✓ RLS | ✓ RLS | — | Grupo C |
| `categories` | ✓ RLS | ✓ mig 40 | ✓ mig 40 | — | Grupo C |
| `projects` | ✓ | ✓ | ✓ | — | |
| `transactions` | ✓ RLS | ✓ mig 22 | ✓ mig 22 | — | Sin DELETE |
| `transaction_splits` | ✓ RLS | ✓ RLS | ✓ RLS | — | |
| `classification_rules` | ✓ | ✓ mig 23 | ✓ mig 23 | ✓ mig 23 | Mutable |
| `budgets` | ✓ RLS | ✓ mig 30 | ✓ mig 30 | — | Sin DELETE |
| `savings_goals` | ✓ RLS | ✓ RLS | ✓ RLS | — | Grupo C |
| `incomes` | ✓ RLS | ✓ RLS | ✓ RLS | — | Grupo A |
| `work_abroad_days` | ✓ RLS | ✓ RLS | ✓ RLS | — | Grupo A |
| `assets` | ✓ RLS | ✓ RLS | ✓ RLS | — | Grupo C |
| `stock_prices` | ✓ | ✓ | ✓ | — | |
| `maristas_items` | ✓ | ✓ | ✓ | — | |
| `liabilities` | ✓ RLS | ✓ RLS | ✓ RLS | — | Grupo C |
| `holdings` | ✓ RLS | ✓ RLS | ✓ RLS | ✓ RLS | Grupo D |
| `holding_prices` | ✓ TRUE | — | — | — | Público |
| `currency_rates` | ✓ TRUE | — | — | — | Público |
| `stock_options` | ✓ | ✓ | ✓ | — | V1 compartido |
| `manual_holdings` | ✓ | ✓ | ✓ | — | |
| `manual_holdings_history` | ✓ | ✓ | ✓ | — | |
| `patrimonio_snapshots` | ✓ RLS | ✓ RLS | ✓ RLS | — | |
| `bank_connections` | ✓ RLS | ✓ mig 23 | ✓ mig 23 | ✓ mig 24 | Grupo A |
| `bank_account_links` | ✓ RLS | ✓ mig 23 | ✓ mig 23 | ✓ mig 24 | Grupo D |
| `weekly_closures` | ✓ RLS | ✓ mig 30 | ✓ mig 30 | — | Grupo C, sin DELETE |
| `monthly_closures` | ✓ RLS | ✓ mig 31 | ✓ mig 31 | — | Grupo C, sin DELETE |
| `purchase_orders` | ✓ RLS | ✓ mig 35 | ✓ mig 35 | — | visibility tri-state |
| `purchase_order_lines` | ✓ RLS | ✓ mig 36 | ✓ mig 36 | — | via can_see_order() |
| `purchase_order_charges` | ✓ RLS | ✓ mig 37 | ✓ mig 37 | ✓ mig 42 | via can_see_transaction() |

---

## 5 · Índice de migraciones

Dos grupos con sufijos numéricos solapados (P-015 — no renombrar; Supabase ordena por timestamp completo):

| Timestamp | Archivo | Descripción |
|---|---|---|
| 20260422000001 | `maestros.sql` | accounts, categories, projects, profiles; user_role(); set_updated_at() |
| 20260422000002 | `transaccional.sql` | transactions, transaction_splits, classification_rules |
| 20260422000003 | `presupuesto.sql` | budgets, savings_goals |
| 20260422000004 | `ingresos.sql` | incomes, work_abroad_days |
| 20260422000005 | `patrimonio.sql` | assets, stock_option_grants (obsoleta), stock_prices, maristas_items |
| 20260422000006 | `seed_categories.sql` | Seed 12 categorías base + proyectos |
| 20260422000007 | `cuentas_tarjetas.sql` | Añade type='card', linked_account_id, initial_balance a accounts |
| 20260422000008 | `liabilities.sql` | liabilities |
| 20260422000009 | `account_balances.sql` | Vista account_balances |
| 20260424000010 | `holdings.sql` | holdings, holding_prices, holdings_valued; can_see_account() |
| 20260425000011 | `account_balances_full.sql` | Vista account_balances_full (v1) |
| 20260426000012 | `patrimonio_neto.sql` | Vista patrimonio_neto (v1) |
| 20260426000013 | `currency_rates.sql` | currency_rates |
| 20260427000014 | `card_balance_sign.sql` | P-002: -1× saldo tarjetas en account_balances_full |
| 20260427000015 | `holdings_valued_fallback.sql` | holdings_valued: fallback a avg_price_eur (luego eliminado mig 20) |
| 20260427000016 | `stock_options.sql` | stock_options, stock_options_valued; intrinsic en patrimonio_neto |
| 20260427000017 | `abf_add_is_active_sort_order.sql` | P-007: añade is_active, sort_order a account_balances_full |
| 20260427000018 | `unique_prices_robust.sql` | P-005: UNIQUE NULL-safe en holding_prices |
| 20260427000019 | `holdings_valued_match_by_ticker.sql` | Prioriza ticker sobre ISIN en holdings_valued |
| 20260427000020 | `manual_holdings.sql` | manual_holdings, manual_holdings_history; suma en account_balances_full; elimina fallback avg_price_eur |
| 20260428000021 | `patrimonio_snapshots.sql` | patrimonio_snapshots; capture_patrimonio_snapshot() |
| 20260430000022 | `psd2_enable_banking.sql` | bank_connections, bank_account_links; columnas PSD2 en transactions |
| 20260506000023 | `psd2_grants.sql` | INSERT/UPDATE en bank_connections, bank_account_links |
| 20260506000024 | `psd2_delete_grants.sql` | DELETE + policies DELETE en bank_connections, bank_account_links |
| 20260514000025 | `extend_classification_rules.sql` | D-005: campos set_account_id, set_titular, set_paid_by_user_id, set_is_reimbursable |
| 20260517000022 | `grants_transactions_authenticated.sql` | INSERT/UPDATE en transactions |
| 20260517000023 | `grants_classification_rules_authenticated.sql` | INSERT/UPDATE/DELETE en classification_rules |
| 20260518000024 | `t013_transferencias_internas.sql` | nature='transferencia'; categoría Transferencias internas |
| 20260518000025 | `t014_categoria_ingresos.sql` | Categoría Ingresos |
| 20260518000026 | `t012_inversiones_y_capital_hijos.sql` | Categoría Inversiones; proyectos capital-leo, capital-biel |
| 20260518000027 | `t015_hojas_financiero.sql` | Hojas adicionales Financiero e impuestos |
| 20260518000028 | `t015_v2_creditos_y_reorder.sql` | Créditos al consumo/estudios; reorden Financiero |
| 20260520000029 | `v_aggregates.sql` | v_spent_by_category_month/week, v_category_budget_status, v_median_spend_3m_by_category, v_median_income_3m |
| 20260520000030 | `weekly_closures.sql` | weekly_closures + grants |
| 20260520000031 | `monthly_closures.sql` | monthly_closures + grants |
| 20260520000032 | `rls_auth_guard.sql` | Mig 32: guard auth.uid() IS NOT NULL en 8 tablas Grupo C + funciones Grupo D |
| 20260521000033 | `secinvoker_patrimonio_snapshot_delta.sql` | security_invoker=true en patrimonio_snapshot_with_delta |
| 20260522000034 | `v_fixed_expenses_observed.sql` | v_fixed_expenses_observed |
| 20260530000029 | `t019_v_spent_exclude_inversion.sql` | T-019: excluye nature='inversion' en v_spent_by_category_month; preserva NULL |
| 20260530000030 | `grants_budgets_authenticated.sql` | INSERT/UPDATE en budgets (INV-6 — RLS sin GRANT = 42501 silencioso) |
| 20260601000035 | `purchase_orders.sql` | purchase_orders + RLS visibility tri-state + trigger set_updated_at |
| 20260601000036 | `purchase_order_lines.sql` | purchase_order_lines + can_see_order() helper |
| 20260601000037 | `purchase_order_charges.sql` | purchase_order_charges — enlace txn ↔ pedido, UNIQUE (transaction_id) |
| 20260601000038 | `transactions_order_id.sql` | transactions.order_id FK + v_purchase_commitments |
| 20260601000039 | `transactions_source_outlook.sql` | Amplía CHECK transactions.source con outlook_parse |
| 20260602000040 | `grants_categories_authenticated.sql` | GRANT INSERT, UPDATE on categories TO authenticated (INV-6) |
| 20260603000041 | `backfill_first_charge_date.sql` | T-026a: first_charge_date = order_date para financiados (data migration) |
| 20260604000042 | `grant_delete_purchase_order_charges.sql` | T-031: GRANT DELETE en purchase_order_charges para authenticated (INV-6) |

---

## 6 · Notas operativas

- **Cualquier DDL** debe pasar por `supabase/migrations/` + actualizar este SCHEMA.md en el **mismo commit** (PRO-1 + PRO-8).
- **P-009 (permanente):** antes de cualquier query nuevo, verificar nombres reales de columnas. Trampas conocidas: `avg_price_eur` (no `cost_basis`), `close_eur` (no `price_eur`), `current_balance` en account_balances_full (incluye holdings).
- **P-015 (permanente):** el sufijo numérico corto no es único entre tandas de fechas. Verificar que el **prefijo timestamp completo** sea único antes de crear migración. No renombrar migraciones ya aplicadas.
- **INV-6 (permanente):** RLS correcto + policy correcta ≠ suficiente. Sin GRANT de tabla, authenticated recibe 42501 silencioso. Ver §4 para grants vigentes.
- **stock_option_grants** está ELIMINADA (P-010). Usar `stock_options` + `stock_options_valued`.
- **P-002 (activo):** tarjetas muestran deuda como positivo (`current_balance > 0` = hay deuda). Lógica en account_balances_full, no en frontend.
- **P-006 (activo):** NDX1.DE en holding_prices sin holding asociado — necesario para stock_options_valued. Filas "huérfanas" esperadas.
- **P-008 / D-001:** holding_prices acepta ticker=NULL AND isin=NULL. CHECK constraint pendiente (baja prioridad).
- **`supabase db dump --linked`** requiere Docker. Para volcado fiel: iniciar Docker y ejecutar `npx supabase db dump --schema public --linked > docs/schema_dump.sql` antes del siguiente release.
