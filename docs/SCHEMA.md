# EGMFin · SCHEMA.md — Fuente de verdad (28-jun-2026)

> **Generado desde:** lectura directa de las 61 migraciones en `supabase/migrations/`  
> **Herramienta:** `npx supabase db dump --linked` requiere Docker — no disponible en este entorno.  
> **Mantenimiento:** actualizar en el mismo commit que cualquier migración nueva (PRO-1 + PRO-8).  
> **P-009 (regla permanente):** antes de cualquier query nuevo, verificar columnas reales aquí o con `\d+ tabla`.

---

## 0 · Principios de seguridad

- **RLS habilitado** en todas las tablas. Nunca `service_role` en frontend.
- **Patrones de policy (3 grupos):**
  - **Grupo A** (estricto, por user_id): `incomes`, `work_abroad_days`, `bank_connections` — solo el dueño.
  - **Grupo C** (tri-state visibility): `accounts`, `assets`, `budgets`, `categories`, `liabilities`, `savings_goals`, `weekly_closures`, `monthly_closures` — `auth.uid() IS NOT NULL AND (visibility='privada_'||user_role() OR visibility='compartida')`. Guard `auth.uid() IS NOT NULL` añadido en mig 32. **SELECT de `accounts` es share-aware desde mig 56 (usa `can_see_visibility()`).**
  - **Grupo D** (función helper): `transactions`, `holdings`, `transaction_splits`, `bank_account_links`, `manual_holdings`, `manual_holdings_history` — `can_see_account()` / `can_see_transaction()` / `can_read_account()`. SELECT share-aware desde mig 56–57; escritura estricta sin cambios.
- **Principio B2 (compartir = solo lectura, mig 56–58):** `can_see_visibility()` y `can_read_account()` amplían el acceso de lectura si existe una fila activa en `shares` (scope `private_detail` o `continuity`). Escritura siempre estricta: `can_see_account()` para cuentas-ancladas, `owner_role = user_role()` para `stock_options`. `stock_options` reutiliza `can_see_visibility('privada_'||owner_role)` para SELECT — misma semántica, sin helper nuevo.
- **Visibilidad tri-state:** `privada_eric` | `privada_ana` | `compartida`. Aplica a `accounts`, `assets`, `budgets`, `savings_goals`, `liabilities`, `categories` (cuando `is_default=false`), `weekly_closures`, `monthly_closures`.
- **Tablas públicas (mercado):** `holding_prices`, `currency_rates` — SELECT con `TRUE`, sin restricción de usuario.
- **Tablas compartidas sin filtro V1:** `maristas_items`, `projects`, `stock_prices` — `auth.role()='authenticated'`.
- **Vistas:** todas con `security_invoker=true` — heredan RLS del usuario que ejecuta.
- **INV-6:** RLS sin GRANT de tabla → 42501 silencioso (200 + 0 filas). Ver grants por tabla en §4.
- **Sin DELETE** en tablas de historial: `transactions`, `budgets`, `weekly_closures`, `monthly_closures`, `incomes`.

---

## 1 · Funciones helper (RLS core)

### `public.user_role() → text`
`sql SECURITY DEFINER STABLE` — Retorna `'eric'` o `'ana'` leyendo `profiles.role` para `auth.uid()`. Núcleo de todas las policies tri-state.

### `public.set_updated_at() → trigger`
`plpgsql` — Setea `new.updated_at = now()` antes de UPDATE. Aplicada via trigger en todas las tablas con `updated_at`.

### `public.can_see_visibility(p_visibility text) → boolean` *(mig 56)*
`sql SECURITY DEFINER STABLE` — Helper share-aware para lectura. Retorna `true` si: (a) `p_visibility = 'compartida'`; (b) `p_visibility = 'privada_' || user_role()`; o (c) existe en `shares` una fila activa (`is_active=true`, `scope IN ('private_detail','continuity')`) donde `grantee_role = user_role()` y `grantor_role` coincide con la parte privada de `p_visibility`. `auth.uid() IS NOT NULL` implícito. Usada en: policy SELECT de `accounts`; internamente por `can_read_account()`.

### `public.can_read_account(p_account_id uuid) → boolean` *(mig 56)*
`sql SECURITY DEFINER STABLE` — Llama a `can_see_visibility(a.visibility)` para la cuenta dada. Usada en: policies SELECT de `holdings` y `transactions`. **No sustituye `can_see_account()`** — ésta sigue activa en INSERT/UPDATE y en `bank_account_links`.

### `public.can_see_account(p_account_id uuid) → boolean`
`sql SECURITY DEFINER STABLE` — `auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM accounts WHERE id=p_account_id AND visibility matches)`. Guard de escritura para INSERT/UPDATE en `transactions`, `holdings`, `bank_account_links`. **No share-aware** (deliberado: compartir es solo lectura).

### `public.can_see_transaction(p_transaction_id uuid) → boolean`
`sql SECURITY DEFINER STABLE` — Navega `transaction_splits → transactions → accounts`, verifica visibility con `auth.uid() IS NOT NULL`. Usada en: `transaction_splits`.

### `public.can_see_order(p_order_id uuid) → boolean`
`sql SECURITY DEFINER STABLE` — `auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM purchase_orders WHERE id=p_order_id AND visibility matches)`. Usada en: `purchase_order_lines`.

### `public.fn_pending_review_dups() → table(account_name, txn_date, amount, description, n)` *(mig 60)*
`sql STABLE SECURITY INVOKER` — Lista los grupos de transacciones PSD2 activas (`superseded_by IS NULL`) con más de una fila para la misma `(account, date, amount, description)`. Excluye automáticamente los pares `h_`/`er_` ya resueltos por `fn_supersede_pending_booked`. Son los casos ambiguos (todo-`er_`, `h_` huérfana) que requieren revisión humana. **SECURITY INVOKER** (deliberado): hereda la RLS de `transactions` del usuario invocante — cada usuario solo ve duplicados de su ámbito visible (respeta muro B2). `GRANT EXECUTE TO authenticated`. Llamada desde `/estado` en cada carga de página.

**Doctrina:** los duplicados `h_`/`er_` se auto-resuelven vía `fn_supersede_pending_booked`. Los ambiguos (n>1 sin h_) se presentan en `/estado` para revisión manual; no existe lógica automática que los fusione.

### `public.fn_supersede_pending_booked() → integer` *(mig 59)*
`plpgsql SECURITY DEFINER` — Auto-resuelve el trap PSD2 PENDING→BOOKED. Busca pares donde una fila `h_*` (PENDING, hash) y una fila `er_*` (BOOKED, entry_reference) comparten `account_id`, `date`, `amount` y `description` (IS NOT DISTINCT FROM). Para cada par marca la fila `h_` como `superseded_by = er_.id`. Usa `DISTINCT ON (h.id)` para garantizar 1 er_ canónica por h_. Devuelve el número de filas neutralizadas. **Llamada por `sync_psd2.py` al final de cada run en modo LIVE** (no en DRY_RUN). Seguridad: solo toca `h_` con gemela `er_` confirmada; nunca fusiona dos `er_` (caso Iberia: mismo importe, misma fecha, dos cargos reales → no hay h_ → no se toca); `h_` huérfanas sin gemela quedan intactas para revisión humana. `GRANT EXECUTE TO authenticated` no es necesario — la llama el worker con `service_role`.

**Doctrina PENDING→BOOKED:** los duplicados `h_`/`er_` se auto-resuelven aquí. Los casos ambiguos (dos `er_` con mismo contenido, `h_` huérfana) se dejan para revisión humana; no existe lógica automática que los fusione.

### `public.fn_close_week(p_week_start date) → void` *(mig 61 + reescrita mig 63)*
`plpgsql SECURITY DEFINER` — Calcula y hace UPSERT del cierre semanal para los 3 scopes (`privada_eric`, `privada_ana`, `compartida`). Por scope: (1) `total_spent` de `v_spent_by_category_week`; (2) `baseline_weeks` = semanas distintas con dato en las últimas 8 (p_week_start−56d, p_week_start); (3) `total_habitual` = suma de medianas (percentile_cont 0.5) de las 8 semanas previas para las categorías presentes esta semana; (4) `semaforo` = NULL si baseline < 4 semanas (histórico insuficiente, estado temprano legítimo), else verde/ambar/rojo según ratio total_spent/total_habitual (≤1.00/≤1.25/>1.25); (5) `top_deviations` top-3 por (spent−habitual) DESC con delta>0 — campos: category_id, category_name, spent, habitual, delta; (6) gate de salud — pendientes, sincronización bancaria, dups, actividad_cero_sospechosa (sin budget_cobertura — D-022) → `data_health` + `health_reason` (texto parafraseado, sin palabras prohibidas §4.5); (7) `total_budget = NULL` (presupuesto diferido, T-037 DORMIDA); UPSERT preserva `insights` si ya existía. Llama la vista `v_spent_by_category_week` como DEFINER (owner tiene acceso total; el scope lo aplica la propia función). Dups inline (replica fn_pending_review_dups que es INVOKER). `GRANT EXECUTE TO service_role` únicamente. **D-020, D-022.**

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
| `visibility` | text NOT NULL | CHECK: `privada_eric`, `privada_ana`, `compartida` — muro de privacidad (quién puede VER la cuenta) |
| `titular` | text NOT NULL | CHECK: `eric`, `ana`, `comun`, `leo`, `biel` (mig 52) — eje de propiedad/destino; distinto de `visibility`: `titular` es de quién ES la cuenta, `visibility` es quién la puede leer. Herencia/sucesión = reasignar `titular`. |
| `currency` | text NOT NULL | DEFAULT 'EUR' |
| `is_active` | bool NOT NULL | DEFAULT true |
| `notes` | text | |
| `sort_order` | int NOT NULL | DEFAULT 0 |
| `linked_account_id` | uuid FK accounts(id) | mig 07; solo en type='card' |
| `initial_balance` | numeric(12,2) NOT NULL | mig 07; DEFAULT 0 |
| `created_at` | timestamptz NOT NULL | DEFAULT now() |
| `updated_at` | timestamptz NOT NULL | DEFAULT now(); trigger set_updated_at |

**Constraints:** `accounts_card_linked_check` — (type='card' AND linked_account_id IS NOT NULL) OR (type≠'card' AND linked_account_id IS NULL). `accounts_titular_check` — titular IN ('eric','ana','comun','leo','biel') (mig 52).  
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
| `kind` | text NOT NULL | DEFAULT `'general'`; CHECK: `general`, `viaje`. Clasificación informativa. D-023 |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Proyectos activos:** rutina, maristas_adquisicion, maristas_equipamiento, capital-leo (mig 26), capital-biel (mig 26).  
**RLS:** `auth.uid() IS NOT NULL`.  
**D-023:** `kind` clasifica el proyecto (general/viaje) pero la exclusión de `v_spent_by_category_*` aplica a **todo** `project_id` sin distinción de `kind`.

---

### 2.4 · `public.transactions` *(mig 02 + 07 + 22 + 24 + 38 + 39 + 43)*

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
| `is_direct_charge` | bool NOT NULL | mig 43; DEFAULT false; cargo de raíl sin pedido (decisión humana explícita) |
| `superseded_by` | uuid FK transactions(id) NULL | mig 45; ON DELETE SET NULL; NULL=activa, uuid=duplicado de esa fila (excluida de vistas/sumas); reversible |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Índices:** `transactions_date_idx` (date DESC), `transactions_account_date_idx` (account_id, date DESC), `transactions_category_idx` (category_id), `transactions_titular_date_idx` (titular, date DESC), `transactions_external_id_unique` UNIQUE PARTIAL (account_id, external_id) WHERE external_id IS NOT NULL, `transactions_order_id_idx` (order_id) WHERE NOT NULL (mig 38).  
**RLS:** Grupo D — `can_see_account(account_id)`.  
**GRANTs (mig 22 Fase 3):** `authenticated` tiene SELECT, INSERT, UPDATE. Sin DELETE.  
**Duplicados neutralizados (T-036):** `superseded_by IS NOT NULL` = duplicado h_-scheme reemplazado por er_-scheme canónico. Excluido en: `v_spent_by_category_month`, `v_spent_by_category_week`, `v_fixed_expenses_observed` (mig 46) y en todas las queries directas de inicio, planner, control, searchCandidates.

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
| `source` | text NOT NULL | DEFAULT 'manual'; CHECK: `manual`, `csv`, `psd2`, `gmail_parse`, `nordex_payslip` (mig 49) |
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
| `owner_role` | text NOT NULL | CHECK: `eric`, `ana` (mig 58); backfill 'eric' para los dos paquetes existentes. Eje de propiedad. |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Datos:** Paquete 1 (1000 opciones, strike 11,60 €, vesting 2028), Paquete 2 (1000 opciones, strike 26,31 €, vesting 2029). Ambos `owner_role='eric'`.  
**RLS (mig 58):** SELECT — `can_see_visibility('privada_'||owner_role)` (share-aware; reutiliza el helper de mig 56 mapeando owner_role a visibility tri-state). INSERT/UPDATE/DELETE — `auth.uid() IS NOT NULL AND owner_role = user_role()` (estricto owner-only). Reemplaza policy `stock_options_eric_only` (ALL, `auth.role()='authenticated'`).  
**Nota:** `stock_options_valued` usa `security_invoker=true` → hereda el SELECT share-aware automáticamente; deja de fugar sin cambios en la vista.

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
**RLS:** Grupo D desde mig 57 — SELECT: `can_read_account(account_id)` (share-aware); INSERT/UPDATE/DELETE: `can_see_account(account_id)` (estricto). Reemplaza policy permisiva `manual_holdings_authenticated` (ALL, `auth.role()='authenticated'`).  
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
**RLS:** Grupo D desde mig 57 — navega `manual_holding_id → manual_holdings.account_id`. SELECT: `can_read_account(account_id)` (share-aware); INSERT/UPDATE/DELETE: `can_see_account(account_id)` (estricto). Reemplaza policy permisiva `mh_history_authenticated` (ALL).

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

### 2.25 · `public.weekly_closures` *(mig 30 + mig 61 + mig 63)*

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `week_start` | date NOT NULL | lunes ISO |
| `week_end` | date NOT NULL | domingo = week_start + 6 |
| `scope` | text NOT NULL | CHECK: `privada_eric`, `privada_ana`, `compartida` |
| `total_spent` | numeric(12,2) NOT NULL | |
| `total_budget` | numeric(12,2) | NULL — presupuesto diferido a módulo VIII, FY siguiente (D-022, T-037 DORMIDA) |
| `semaforo` | text | NULL = histórico insuficiente (< 4 semanas). CHECK: `verde`, `ambar`, `rojo`. Fiable SOLO si `data_health='ok'` (D-020, D-022) |
| `top_deviations` | jsonb NOT NULL | DEFAULT '[]'. Top 3 por (spent−habitual) DESC con delta>0. Campos: category_id, category_name, spent, habitual, delta (mig-63) |
| `insights` | jsonb NOT NULL | DEFAULT '[]'. Escrito por `close_week.py` (LLM o templado). Vacío hasta primer cron |
| `data_health` | text NOT NULL | DEFAULT 'ok'. CHECK: `ok`, `parcial`, `roto` (mig-61) |
| `health_reason` | text | Causas activas concatenadas con ` · `. Texto parafraseado §4.5 (mig-63) |
| `closed_at` | timestamptz NOT NULL | DEFAULT now() |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Constraints:** `weekly_closures_unique_week_scope` UNIQUE (week_start, scope); `weekly_closures_week_end_check` CHECK (week_end = week_start + 6).  
**Índices:** `weekly_closures_week_start_idx` (week_start DESC), `weekly_closures_scope_week_start_idx` (scope, week_start DESC).  
**RLS:** Grupo C (mig 32 guard) con `scope` en vez de `visibility`.  
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated` (mig 30). Sin DELETE.  
**D-020:** `data_health` es el gate de verdad. Consumidor (UI, job) lee salud antes que semaforo.  
**D-022:** `semaforo=NULL` es estado temprano legítimo (< 4 semanas de histórico), no error. `total_budget` siempre NULL hasta FY siguiente.

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

### 2.29 · `public.purchase_order_charges` *(mig 37 + 42 + 44)*

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
**RLS:** SELECT/INSERT/UPDATE — `can_see_transaction(transaction_id)`; DELETE — mig-44 `pol_charges_delete` (misma condición).  
**GRANTs:** SELECT, INSERT, UPDATE a `authenticated` (mig 37); DELETE a `authenticated` (mig 42).  
**Nota INV-6:** mig-42 añadió solo el GRANT DELETE; sin la policy DELETE (mig-44), el RLS deny-by-default bloqueaba todos los DELETE silenciosamente.

---

### 2.30 · Storage · bucket `nominas` *(mig 47)*

Bucket privado de Supabase Storage para PDFs de nómina Nordex.

| Campo | Valor |
|---|---|
| `id` | `nominas` |
| `public` | `false` (privado) |
| `file_size_limit` | 50 MB |
| `allowed_mime_types` | `application/pdf` |

**Acceso:**
- Worker `parse_nominas.py` usa `service_role` → bypassa RLS totalmente.
- Subida manual desde dashboard Supabase → service_role (Eric como project owner).
- App (futuro): policies `nominas_owner_select` / `nominas_owner_insert` — `owner = auth.uid()`.

---

### 2.31 · `public.income_charges` *(mig 50)*

Tabla de enlace M:N entre `incomes` y `transactions` para el módulo **Casado Nóminas**.  
A diferencia de `purchase_order_charges` (UNIQUE en `transaction_id`), aquí el UNIQUE es sobre **(income_id, transaction_id)**: un mismo depósito puede vincularse a varios incomes del mismo mes (ej. mayo: 1 depósito ↔ `nomina_mensual` + `bonus`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `income_id` | uuid NOT NULL FK | → `incomes(id)` ON DELETE RESTRICT |
| `transaction_id` | uuid NOT NULL FK | → `transactions(id)` ON DELETE RESTRICT |
| `match_method` | text NOT NULL | CHECK: `auto`, `manual`, `confirmed` |
| `created_at` | timestamptz | DEFAULT now() |
| `updated_at` | timestamptz | DEFAULT now(); trigger `set_updated_at()` |

**Índices:** UNIQUE `(income_id, transaction_id)`; `income_charges_income_idx` (income_id); `income_charges_transaction_idx` (transaction_id).

**RLS:** Las 4 operaciones (SELECT/INSERT/UPDATE/DELETE) con predicado doble:  
`can_see_transaction(transaction_id) AND EXISTS(incomes WHERE id=income_id AND user_id=auth.uid())`  
**GRANT:** `SELECT, INSERT, UPDATE, DELETE` a `authenticated` — ambos son obligatorios (lección INV-6 de mig 37/42/44).

---

### 2.32 · `public.shares` *(mig 55)*

Concesiones de visibilidad entre titulares. Asimétrica (una fila por dirección), revocable (`is_active`). El muro por defecto sigue siendo `accounts.visibility`; `shares` monta la relación encima. Granularidad: bucket entero (sin `account_id`). El helper `can_see_visibility()` (Mig 56) consumirá esta tabla.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `grantor_role` | text NOT NULL | CHECK: `eric`, `ana` — quien otorga |
| `grantee_role` | text NOT NULL | CHECK: `eric`, `ana` — quien recibe |
| `scope` | text NOT NULL | CHECK: `private_detail` (acceso Y/N al detalle privado), `aggregate` (reservado, no enforced por RLS de fila), `continuity` (sucesión pre-armada, nace inactiva) |
| `is_active` | boolean NOT NULL | DEFAULT true; poner a false = revocar sin borrar |
| `note` | text | Descripción opcional del acto de concesión |
| `created_at` | timestamptz NOT NULL | DEFAULT now() |
| `updated_at` | timestamptz NOT NULL | DEFAULT now(); trigger `trg_shares_updated_at` → `set_updated_at()` |

**Constraints:** `shares_no_self` CHECK (`grantor_role <> grantee_role`); `shares_unique_grant` UNIQUE (`grantor_role, grantee_role, scope`).  
**RLS:** SELECT — si participas (`grantor_role = user_role()` OR `grantee_role = user_role()`); INSERT/UPDATE/DELETE — solo como grantor (`grantor_role = user_role()`). Guard `auth.uid() IS NOT NULL` en todas las policies.  
**GRANT:** SELECT, INSERT, UPDATE, DELETE a `authenticated` (INV-6).  
**Seed:** 2 filas de continuidad pre-armadas (`eric→ana` y `ana→eric`), ambas con `is_active=false`. Se activan con acto deliberado.

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

### 3.7 · `public.v_spent_by_category_month` *(mig 29 + T-019 mig 20260530000029 + D-023 mig-64)*

**Columnas:** `year` int, `month` int, `category_id` uuid, `visibility` text, `spent` numeric(12,2), `txn_count` int.

**Lógica splits-first:**
- Branch A (con splits): suma `ABS(splits.amount)` donde amount < 0
- Branch B (sin splits): suma `ABS(txn.amount)` donde category_id IS NOT NULL AND amount < 0
- **Filtro T-019:** `(t.nature IS NULL OR t.nature NOT IN ('transferencia', 'inversion'))` en ambos branches — excluye transferencia e inversión, **preserva NULL** (pendientes de clasificación).
- **Filtro D-023:** `AND t.project_id IS NULL` en ambos branches — gasto de proyecto fuera del basis de categoría (vive en el sobre del proyecto, no como gasto de categoría).
- **Filtro T-036:** `AND t.superseded_by IS NULL` — excluye duplicados PSD2 neutralizados.

**Security_invoker:** true.

---

### 3.8 · `public.v_spent_by_category_week` *(mig 29 + D-023 mig-64)*

**Columnas:** `week_start` date, `category_id` uuid, `visibility` text, `spent` numeric(12,2), `txn_count` int.

**Filtro:** Mismo que `v_spent_by_category_month` (nature, superseded_by, **project_id IS NULL D-023**). Agrupa por `date_trunc('week', date)` (lunes ISO). Refleja **todo el gasto real** — fuente de `total_spent` en `weekly_closures`. El semáforo ya NO la usa directamente (D-024).  
**Security_invoker:** true.

---

### 3.8b · `public.v_discretionary_spend_by_category_week` *(mig-65 D-024)*

**Columnas:** `week_start` date, `category_id` uuid, `visibility` text, `spent` numeric(12,2), `txn_count` int.

**Filtro D-024:** Igual que `v_spent_by_category_week` **más** `AND t.nature IS DISTINCT FROM 'fijo_recurrente'`. NULL se incluye (pendiente de clasificar = discrecional por defecto). `extraordinario` se incluye. `fijo_recurrente` excluido del basis del semáforo — es un compromiso, no una desviación.  
**Consumers:** `fn_close_week` para `baseline_weeks`, `total_habitual`, `disc_spent_for_ratio`, `semaforo`, `top_deviations`. El INNER JOIN en ratio y top_deviations excluye automáticamente categorías sin histórico de 8 semanas.  
**Security_invoker:** true. `GRANT SELECT TO authenticated`.

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

### 3.11 · `public.v_median_income_3m` *(mig 29 + mig 48)*

**Columnas:** `user_id` uuid, `median_monthly_income` numeric, `months_with_data` int.

**Rango:** 3 meses completos anteriores al mes actual. Agrupa `SUM(net_amount)` por mes/usuario, toma percentile_cont(0.5).  
**Filtro tipo (mig 48):** `type = 'nomina_mensual'` — excluye `bonus` y `paga_extra` para que no inflen la mediana usada como base de anticipación en Budget y Planner.  
**Security_invoker:** true — cada usuario solo ve sus propios datos.  
**Nota:** deja obsoleta la idea futura de calcular la mediana desde `transactions` (no distingue nómina vs bonus).

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

### 3.14 · `public.v_income_reconciliation` *(mig 50)*

Vista de conciliación de nóminas Nordex a nivel mes. Cruza `incomes` (source=`nordex_payslip`) con `transactions` (depósitos Nordex) vía `income_charges`.

**Columnas:**

| Columna | Tipo | Descripción |
|---|---|---|
| `user_id` | uuid | Usuario propietario |
| `mes` | text | Periodo en formato `YYYY-MM` |
| `incomes_net` | numeric | `SUM(net_amount)` de todas las filas del mes (mensual + bonus + paga_extra + dietas) |
| `candidate_dep` | numeric | `SUM(amount)` de depósitos Nordex candidatos en `transactions` ese mes |
| `linked_dep` | numeric | `SUM(DISTINCT amount)` de depósitos enlazados vía `income_charges`; DISTINCT evita doble-conteo cuando 1 depósito ↔ 2 incomes |
| `n_incomes` | int | Número de filas `incomes` del mes |
| `n_linked` | int | Número de transacciones distintas enlazadas |
| `psd2_cutoff` | date | `MIN(date)` de depósitos Nordex en `transactions`; NULL si aún no hay datos PSD2 |
| `status` | text | `sin_contraparte` / `cuadrado` / `parcial` / `pendiente` (ver lógica abajo) |

**Lógica `status`:**
- `sin_contraparte` — mes anterior a `psd2_cutoff` (pre-PSD2: esperado, no es un error ni "pendiente")
- `cuadrado` — `|linked_dep − incomes_net| ≤ 0.01`
- `parcial` — hay enlace pero no cuadra
- `pendiente` — mes ≥ cutoff y sin ningún depósito enlazado

**Security_invoker:** true — cada CTE hereda RLS del usuario invocante; no mezcla datos entre usuarios.

---

### 3.15 · `public.v_cuentas_composicion` *(mig 53)*

Agrega el patrimonio por `(titular × segmento de liquidez)`. Alimenta el donut y la espina por titular del módulo /cuentas.

**Columnas:**

| Columna | Tipo | Descripción |
|---|---|---|
| `titular` | text | `eric` / `ana` / `comun` / `leo` / `biel` |
| `segmento` | text | `Efectivo` / `Renta variable + ETF` / `Fondos indexados` / `Roboadvisor` / `Cripto` / `Otros` |
| `orden` | int | Orden de visualización: 1 Efectivo, 2 RV+ETF, 3 FI, 4 Roboadvisor, 5 Cripto, 9 Otros |
| `valor` | numeric | Suma de saldos/valoraciones en EUR para ese (titular, segmento) |

**Fuentes:** `accounts` + `account_balances_full` (Efectivo) · `holdings_valued` (cotizados) · `manual_holdings` (Roboadvisor).  
**Filtro:** `is_active = true` en todas las tablas base.  
**Security_invoker:** true — la RLS de `accounts` filtra por `visibility` según el usuario invocante; Eric no ve cuentas de Ana y viceversa.  
**GRANT:** SELECT a `authenticated`.

---

### 3.16 · `public.v_cuentas_detalle` *(mig 54)*

Como `v_cuentas_composicion` pero a nivel de **cuenta individual** (`account_id`). Alimenta el drill-down del módulo /cuentas (U4).

**Columnas:**

| Columna | Tipo | Descripción |
|---|---|---|
| `account_id` | uuid | Identificador de la cuenta |
| `name` | text | Nombre de la cuenta |
| `institution` | text | Institución financiera |
| `visibility` | text | `privada_eric` / `privada_ana` / `compartida` |
| `titular` | text | `eric` / `ana` / `comun` / `leo` / `biel` |
| `segmento` | text | `Efectivo` / `Renta variable + ETF` / `Fondos indexados` / `Roboadvisor` / `Cripto` / `Otros` |
| `orden` | int | Orden: 1 Efectivo, 2 RV+ETF, 3 FI, 4 Roboadvisor, 5 Cripto, 9 Otros |
| `valor` | numeric | Suma en EUR para esa (cuenta, segmento) |

**Fuentes:** `accounts` + `account_balances_full` (Efectivo) · `holdings_valued` (cotizados) · `manual_holdings` (Roboadvisor).  
**Filtro:** `is_active = true` en todas las tablas base.  
**Security_invoker:** true — hereda RLS del usuario invocante.  
**GRANT:** SELECT a `authenticated`.  
**Verificado (12-jun-2026):** `SUM(valor) GROUP BY (titular, segmento)` = `v_cuentas_composicion` para todos los titulares, diff = 0.

### 3.X · `public.v_last_closure_health` *(mig 61)*

Por scope visible al usuario: el último cierre semanal en `weekly_closures`.

| Columna | Tipo | Descripción |
|---|---|---|
| `scope` | text | `privada_eric`, `privada_ana`, `compartida` |
| `week_start` | date | lunes ISO del último cierre |
| `week_end` | date | domingo |
| `semaforo` | text | `verde`/`ambar`/`rojo`. Solo fiable si `data_health='ok'` |
| `data_health` | text | `ok`/`parcial`/`roto` |
| `health_reason` | text | Causas activas (null si ok) |
| `closed_at` | timestamptz | Momento del último cierre |
| `recent_bad_count` | bigint | Cierres `parcial`/`roto` en las últimas 12 semanas (84 días) |

**Security_invoker:** true — el SELECT de `weekly_closures` hereda el RLS Grupo C. Eric ve `privada_eric` + `compartida`; Ana ve `privada_ana` + `compartida`.  
**GRANT:** SELECT a `authenticated`.  
**D-020:** consumidor gatea por `data_health` antes de renderizar `semaforo`.

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
| `stock_options` | ✓ RLS (share-aware) | ✓ RLS owner-only | ✓ RLS owner-only | ✓ RLS owner-only | Mig 58; can_see_visibility('privada_'||owner_role) |
| `manual_holdings` | ✓ RLS (share-aware) | ✓ RLS | ✓ RLS | ✓ RLS | Grupo D desde mig 57; worker escribe por service_role |
| `manual_holdings_history` | ✓ RLS (share-aware) | ✓ RLS | ✓ RLS | ✓ RLS | Grupo D desde mig 57; navega a account via manual_holdings |
| `patrimonio_snapshots` | ✓ RLS | ✓ RLS | ✓ RLS | — | |
| `bank_connections` | ✓ RLS | ✓ mig 23 | ✓ mig 23 | ✓ mig 24 | Grupo A |
| `bank_account_links` | ✓ RLS | ✓ mig 23 | ✓ mig 23 | ✓ mig 24 | Grupo D |
| `weekly_closures` | ✓ RLS | ✓ mig 30 | ✓ mig 30 | — | Grupo C, sin DELETE |
| `monthly_closures` | ✓ RLS | ✓ mig 31 | ✓ mig 31 | — | Grupo C, sin DELETE |
| `purchase_orders` | ✓ RLS | ✓ mig 35 | ✓ mig 35 | — | visibility tri-state |
| `purchase_order_lines` | ✓ RLS | ✓ mig 36 | ✓ mig 36 | — | via can_see_order() |
| `purchase_order_charges` | ✓ RLS | ✓ mig 37 | ✓ mig 37 | ✓ mig 42+44 | via can_see_transaction() |
| `income_charges` | ✓ mig 50 | ✓ mig 50 | ✓ mig 50 | ✓ mig 50 | can_see_transaction() + incomes.user_id |
| `shares` | ✓ mig 55 | ✓ mig 55 | ✓ mig 55 | ✓ mig 55 | SELECT si participas; INSERT/UPDATE/DELETE solo como grantor |

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
| 20260604000043 | `transactions_is_direct_charge.sql` | T-033: transactions.is_direct_charge boolean NOT NULL DEFAULT false |
| 20260604000044 | `policy_delete_purchase_order_charges.sql` | T-034: policy DELETE en purchase_order_charges (faltaba en mig-37; mig-42 solo añadió GRANT) |
| 20260604000045 | `transactions_superseded_by.sql` | T-036: columna superseded_by uuid FK self; neutralización reversible de duplicados |
| 20260604000046 | `views_exclude_superseded.sql` | T-036: v_spent_by_category_month, v_spent_by_category_week, v_fixed_expenses_observed añaden superseded_by IS NULL |
| 20260605000047 | `storage_bucket_nominas.sql` | Bucket privado 'nominas' + policies owner-only para app (worker usa service_role) |
| 20260605000048 | `v_median_income_3m_nomina_mensual.sql` | v_median_income_3m filtra type='nomina_mensual' (excluye bonus/paga_extra) |
| 20260606000049 | `incomes_source_nordex_payslip.sql` | incomes.source CHECK ampliado: añade 'nordex_payslip' para worker parse_nominas |
| 20260607000050 | `income_charges.sql` | income_charges M:N (UNIQUE income_id+transaction_id) + v_income_reconciliation; RLS+GRANT las 4 ops |
| 20260610000051 | `fix_transferencias_nature_rules.sql` | mig-51 PARCHE DATOS (solo DML, sin DDL) — 6 txns Leo/Biel (Feb+Abr) → nature='transferencia'; regla Ana (fijo_recurrente→transferencia), regla Biel (inversion→transferencia + match_value robusto), regla Leo nueva (transferencia, categoría 'Aportación cuenta de ahorro'). Idempotente. |
| 20260612000052 | `titular_accounts.sql` | mig-52: ADD COLUMN `titular` text NOT NULL CHECK(eric\|ana\|comun\|leo\|biel) en `accounts`. Backfill por nombre (Leo/Biel) y visibility (privada_eric→eric, privada_ana→ana, compartida→comun). Eje de propiedad/destino; distinto de `visibility` (muro de privacidad). Base de la espina por titular y futura sucesión. |
| 20260612000053 | `v_cuentas_composicion.sql` | mig-53: CREATE VIEW `v_cuentas_composicion` WITH (security_invoker=true) — agrega patrimonio por (titular × segmento: Efectivo/RV+ETF/FI/Roboadvisor/Cripto). Fuentes: account_balances_full + holdings_valued + manual_holdings. GRANT SELECT a authenticated. Alimenta donut y espina por titular de /cuentas. |
| 20260612000054 | `v_cuentas_detalle.sql` | mig-54: CREATE VIEW `v_cuentas_detalle` WITH (security_invoker=true) — igual que v_cuentas_composicion pero a nivel de cuenta individual (account_id). Añade name, institution, visibility. Alimenta drill-down U4 de /cuentas. Verificado: SUM = v_cuentas_composicion para todos los titulares. |
| 20260613000055 | `shares.sql` | B2: tabla `shares` (compartición asimétrica + continuidad pre-armada). RLS: SELECT si participas; INSERT/UPDATE/DELETE solo como grantor. Seed 2 filas continuidad inactivas (eric↔ana). |
| 20260613000056 | `can_see_visibility.sql` | B2: `can_see_visibility(text)` + `can_read_account(uuid)` share-aware. Repunta SELECT de `accounts`, `holdings`, `transactions`. Escritura (can_see_account) intacta. |
| 20260613000057 | `rls_manual_holdings.sql` | B2: cierra fuga manual_holdings + _history. De ALL permisivo a Grupo D: SELECT can_read_account; INSERT/UPDATE/DELETE can_see_account. |
| 20260613000058 | `rls_stock_options.sql` | B2 final: añade owner_role (NOT NULL, backfill 'eric'); RLS por operación: SELECT can_see_visibility share-aware, escritura owner-only. stock_options_valued hereda automáticamente. |
| 20260613000059 | `fn_supersede_pending_booked.sql` | fn_supersede_pending_booked(): auto-dedupe PENDING(h_)→BOOKED(er_) por content-match. Llamada por sync_psd2.py end-of-run en LIVE. |
| 20260613000060 | `fn_pending_review_dups.sql` | fn_pending_review_dups(): lista duplicados PSD2 ambiguos para revisión humana. INVOKER, respeta RLS B2. Llamada desde /estado. |
| 20260628000061 | `weekly_closures_health.sql` | (1) ALTER weekly_closures: ADD data_health (ok/parcial/roto) + health_reason. (2) fn_close_week(date) SECURITY DEFINER: total_spent, total_budget prorrateado (T-037), health gate (pendientes/psd2/dups/budget/actividad), semaforo, top_deviations, UPSERT. GRANT service_role. (3) v_last_closure_health INVOKER + GRANT authenticated. D-020. |
| 20260628000062 | `revoke_public_security_definer.sql` | P-022: REVOKE EXECUTE FROM PUBLIC en los 3 writers SECURITY DEFINER: fn_close_week(date), capture_patrimonio_snapshot(), fn_supersede_pending_booked(). GRANT service_role en capture y fn_supersede. authenticated conserva capture (mig-21). Helpers can_*/user_role intactos (→T-039). |
| 20260629000063 | `fn_close_week_vs_habitual.sql` | D-022: reescritura fn_close_week — semáforo vs habitual (mediana 8 semanas por categoría). ALTER TABLE DROP NOT NULL en semaforo y total_budget. total_budget=NULL (presupuesto diferido, T-037 DORMIDA). semaforo=NULL si baseline < 4 semanas. top_deviations ahora contiene spent/habitual/delta (no budget). Gate de salud sin budget_cobertura. health_reason parafraseado §4.5. Fix: array_append() en v_health_parts (evita ERROR 22P02 que causaba `|| 'literal'` con tipo unknown). Re-verifica REVOKE FROM PUBLIC + GRANT service_role (P-022). |
| 20260629000064 | `project_kind_view_exclusion.sql` | D-023: (1) projects.kind text NOT NULL DEFAULT 'general' CHECK (general, viaje) — clasificación informativa del proyecto. (2) v_spent_by_category_week: añade `AND t.project_id IS NULL` en ambas ramas (splits + directa). (3) v_spent_by_category_month: ídem. El gasto con project_id vive en el sobre del proyecto, no como gasto de categoría; cambia sustractivo, no rompe shape de ningún consumidor (fn_close_week, v_category_budget_status, v_median_spend_3m_by_category). |
| 20260701000065 | `fn_close_week_discrecional.sql` | D-024: (1) Nueva vista v_discretionary_spend_by_category_week = v_spent_by_category_week + AND t.nature IS DISTINCT FROM 'fijo_recurrente'. GRANT SELECT authenticated. (2) fn_close_week: total_spent sigue v_spent_by_category_week (gasto real); semaforo/total_habitual/top_deviations pasan a v_discretionary_spend_by_category_week. INNER JOIN en ratio y top_deviations → cats sin histórico discrecional excluidas del juicio. v_disc_spent_for_ratio = spent discrecional solo de cats con habitual. P-022 re-verificado (REVOKE + GRANT service_role). |

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
- **P-022 (permanente):** Postgres concede `EXECUTE` a `PUBLIC` por defecto en toda función nueva. PostgREST expone `public` a `anon`. Regla: en cada función `SECURITY DEFINER` nueva, incluir inmediatamente `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO <rol>`. Helpers INVOKER de RLS (can_*, user_role): conservar siempre `authenticated`; endurecer `anon` en T-039. Verificar con `has_function_privilege('anon', oid, 'EXECUTE')` (P-021).
- **mig-51 (10-jun-2026):** parche de datos exclusivamente (UPDATE/INSERT en `transactions` y `classification_rules`). No altera ninguna definición de tabla, vista, RLS ni GRANT — §2/§3/§4 permanecen válidos. Idempotente (guards `IS DISTINCT FROM`, `WHERE NOT EXISTS`).
