-- ============================================================
-- MIGRACIÓN 5: TABLAS DE PATRIMONIO
-- assets, stock_option_grants, stock_prices, maristas_items + RLS
-- ============================================================

-- ============================================================
-- TABLA: assets
-- Activos patrimoniales (inmuebles, vehículos, otros)
-- Visibilidad por campo visibility — patrón idéntico a accounts
-- Sin DELETE: activos se desactivan con is_active=false
-- ============================================================

create table public.assets (
  id                  uuid          primary key default gen_random_uuid(),
  name                text          not null,
  type                text          not null check (type in ('inmueble', 'vehiculo', 'otro')),
  owner_user_id       uuid          references auth.users(id) on delete restrict,
  visibility          text          not null check (visibility in ('privada_eric', 'privada_ana', 'compartida')),
  purchase_date       date,
  purchase_value      numeric(12,2) not null,
  current_value       numeric(12,2),
  last_valuation_date date,
  notes               text,
  is_active           boolean       not null default true,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

alter table public.assets enable row level security;

create trigger set_updated_at_assets
  before update on public.assets
  for each row execute function public.set_updated_at();

create index assets_visibility_active_idx on public.assets(visibility, is_active);

-- RLS: patrón visibility idéntico a accounts
create policy "assets_select" on public.assets
  for select using (
    visibility = 'privada_' || public.user_role() or visibility = 'compartida'
  );

create policy "assets_insert" on public.assets
  for insert with check (
    visibility = 'privada_' || public.user_role() or visibility = 'compartida'
  );

create policy "assets_update" on public.assets
  for update
  using  (visibility = 'privada_' || public.user_role() or visibility = 'compartida')
  with check (visibility = 'privada_' || public.user_role() or visibility = 'compartida');

-- ============================================================
-- TABLA: stock_option_grants
-- Paquetes de stock options Nordex (u otras empresas)
-- Estrictamente privado: user_id = auth.uid()
-- ============================================================

create table public.stock_option_grants (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users(id) on delete restrict,
  package_name    text          not null,
  grant_date      date          not null,
  options_count   integer       not null,
  strike_price    numeric(10,4) not null,
  vesting_date    date          not null,
  expiration_date date,
  notes           text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

alter table public.stock_option_grants enable row level security;

create trigger set_updated_at_stock_option_grants
  before update on public.stock_option_grants
  for each row execute function public.set_updated_at();

create index stock_option_grants_user_vesting_idx on public.stock_option_grants(user_id, vesting_date);

-- RLS estricto: cada usuario ve solo sus propios grants
create policy "stock_option_grants_select" on public.stock_option_grants
  for select using (user_id = auth.uid());

create policy "stock_option_grants_insert" on public.stock_option_grants
  for insert with check (user_id = auth.uid());

create policy "stock_option_grants_update" on public.stock_option_grants
  for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- TABLA: stock_prices
-- Precios históricos de cotización (NDX1 y otros tickers)
-- No sensible: lectura y escritura abiertas a autenticados
-- En Fase 2 lo alimentará un proceso automatizado
-- Sin updated_at: los precios son inmutables una vez registrados
-- ============================================================

create table public.stock_prices (
  id          uuid          primary key default gen_random_uuid(),
  ticker      text          not null,
  date        date          not null,
  close_price numeric(10,4) not null,
  source      text,
  created_at  timestamptz   not null default now(),
  constraint stock_prices_ticker_date_unique unique (ticker, date)
);

alter table public.stock_prices enable row level security;

create index stock_prices_ticker_date_idx on public.stock_prices(ticker, date desc);

-- RLS abierto: precios de mercado, no datos personales
create policy "stock_prices_select" on public.stock_prices
  for select using (auth.uid() is not null);

create policy "stock_prices_insert" on public.stock_prices
  for insert with check (auth.uid() is not null);

create policy "stock_prices_update" on public.stock_prices
  for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- TABLA: maristas_items
-- Partidas del proyecto Apartamento Residencial Maristas
-- Compartido: cualquier usuario autenticado lee y escribe
-- Sin DELETE: partidas se desactivan con is_active=false
-- ============================================================

create table public.maristas_items (
  id                 uuid          primary key default gen_random_uuid(),
  category           text          not null check (category in ('adquisicion', 'cocina', 'banos', 'iluminacion', 'mobiliario', 'electrodomesticos', 'otros')),
  supplier           text,
  concept            text          not null,
  budget_amount      numeric(12,2) not null,
  committed_amount   numeric(12,2) not null default 0,
  paid_amount        numeric(12,2) not null default 0,
  budget_date        date,
  expected_delivery  date,
  actual_delivery    date,
  status             text          not null default 'presupuestado' check (status in ('presupuestado', 'contratado', 'pagado_parcial', 'pagado_total', 'entregado')),
  contract_reference text,
  notes              text,
  is_active          boolean       not null default true,
  sort_order         integer       not null default 0,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

alter table public.maristas_items enable row level security;

create trigger set_updated_at_maristas_items
  before update on public.maristas_items
  for each row execute function public.set_updated_at();

create index maristas_items_category_sort_idx on public.maristas_items(category, sort_order);
create index maristas_items_status_idx        on public.maristas_items(status);

-- RLS compartido: proyecto familiar, cualquier autenticado lee y escribe
create policy "maristas_items_select" on public.maristas_items
  for select using (auth.uid() is not null);

create policy "maristas_items_insert" on public.maristas_items
  for insert with check (auth.uid() is not null);

create policy "maristas_items_update" on public.maristas_items
  for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);
