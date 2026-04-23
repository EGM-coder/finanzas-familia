-- ============================================================
-- MIGRACIÓN 1: TABLAS MAESTRAS
-- accounts, categories, projects + RLS
-- ============================================================

-- Función auxiliar: devuelve 'eric' o 'ana' según el usuario actual.
-- En public (no auth). Usada en todas las policies del muro de privacidad.
-- security definer + stable: se cachea por query, eficiente.
create or replace function public.user_role()
returns text
language sql
security definer stable
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

-- Función auxiliar: actualiza updated_at automáticamente.
-- Reutilizada vía trigger en todas las tablas con ese campo.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABLA: accounts
-- Cuentas bancarias e inversión de la familia
-- Sin DELETE: cuentas se cierran con is_active=false, nunca se borran
-- ============================================================

create table public.accounts (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  institution text        not null,
  type        text        not null check (type in ('bank', 'investment', 'broker', 'cash', 'pension')),
  visibility  text        not null check (visibility in ('privada_eric', 'privada_ana', 'compartida')),
  currency    text        not null default 'EUR',
  is_active   boolean     not null default true,
  notes       text,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.accounts enable row level security;

create trigger set_updated_at_accounts
  before update on public.accounts
  for each row execute function public.set_updated_at();

create policy "accounts_select" on public.accounts
  for select using (
    visibility = 'privada_' || public.user_role()
    or visibility = 'compartida'
  );

create policy "accounts_insert" on public.accounts
  for insert with check (
    visibility = 'privada_' || public.user_role()
    or visibility = 'compartida'
  );

create policy "accounts_update" on public.accounts
  for update
  using  (visibility = 'privada_' || public.user_role() or visibility = 'compartida')
  with check (visibility = 'privada_' || public.user_role() or visibility = 'compartida');

-- ============================================================
-- TABLA: categories
-- Árbol jerárquico de categorías funcionales
-- is_default=true → categorías base del sistema (visibles para todos, no editables)
-- is_default=false → categorías personalizadas del usuario
-- Sin DELETE: se desactivan con is_active=false
-- ============================================================

create table public.categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  parent_id   uuid        references public.categories(id) on delete restrict,
  icon        text,
  color       text,
  is_default  boolean     not null default false,
  is_active   boolean     not null default true,
  visibility  text,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_visibility_check check (
    (is_default = true  and visibility is null) or
    (is_default = false and visibility in ('privada_eric', 'privada_ana', 'compartida'))
  )
);

alter table public.categories enable row level security;

create trigger set_updated_at_categories
  before update on public.categories
  for each row execute function public.set_updated_at();

create policy "categories_select" on public.categories
  for select using (
    is_default = true
    or visibility = 'privada_' || public.user_role()
    or visibility = 'compartida'
  );

create policy "categories_insert" on public.categories
  for insert with check (
    is_default = false
    and (visibility = 'privada_' || public.user_role() or visibility = 'compartida')
  );

create policy "categories_update" on public.categories
  for update
  using  (is_default = false and (visibility = 'privada_' || public.user_role() or visibility = 'compartida'))
  with check (is_default = false and (visibility = 'privada_' || public.user_role() or visibility = 'compartida'));

-- ============================================================
-- TABLA: projects
-- Proyectos de gasto (rutina, maristas_adquisicion, etc.)
-- Compartidos entre ambos usuarios
-- Sin DELETE: se archivan con status='archived'
-- ============================================================

create table public.projects (
  id           uuid         primary key default gen_random_uuid(),
  name         text         not null,
  slug         text         not null unique,
  description  text,
  status       text         not null default 'active' check (status in ('active', 'completed', 'archived')),
  start_date   date,
  end_date     date,
  total_budget numeric(12,2),
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

alter table public.projects enable row level security;

create trigger set_updated_at_projects
  before update on public.projects
  for each row execute function public.set_updated_at();

create policy "projects_select" on public.projects
  for select using (auth.uid() is not null);

create policy "projects_insert" on public.projects
  for insert with check (auth.uid() is not null);

create policy "projects_update" on public.projects
  for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);
