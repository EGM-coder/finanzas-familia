-- ============================================================
-- MIGRACIÓN 2: TABLAS TRANSACCIONALES
-- transactions, transaction_splits, classification_rules + RLS
-- ============================================================

-- Función helper: ¿puede el usuario actual ver esta cuenta?
-- security definer: bypassa RLS de accounts para evitar recursión
create or replace function public.can_see_account(p_account_id uuid)
returns boolean
language sql
security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = p_account_id
      and (a.visibility = 'privada_' || public.user_role() or a.visibility = 'compartida')
  )
$$;

-- Función helper: ¿puede el usuario actual ver esta transacción?
-- Navega transaction → account y reutiliza la lógica de visibilidad
create or replace function public.can_see_transaction(p_transaction_id uuid)
returns boolean
language sql
security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.transactions t
    join public.accounts a on a.id = t.account_id
    where t.id = p_transaction_id
      and (a.visibility = 'privada_' || public.user_role() or a.visibility = 'compartida')
  )
$$;

-- ============================================================
-- TABLA: transactions
-- Visibilidad heredada de la cuenta referenciada (account_id)
-- Sin DELETE: integridad del histórico financiero
-- ============================================================

create table public.transactions (
  id              uuid          primary key default gen_random_uuid(),
  date            date          not null,
  amount          numeric(12,2) not null,
  currency        text          not null default 'EUR',
  description     text,
  raw_concept     text,
  account_id      uuid          not null references public.accounts(id) on delete restrict,
  category_id     uuid          references public.categories(id) on delete restrict,
  project_id      uuid          references public.projects(id) on delete restrict,
  nature          text          check (nature in ('fijo_recurrente', 'variable_recurrente', 'extraordinario', 'inversion', 'ahorro')),
  paid_by_user_id uuid          references auth.users(id) on delete restrict,
  titular         text          not null check (titular in ('eric', 'ana', 'compartido')),
  source          text          not null default 'manual' check (source in ('manual', 'csv', 'psd2', 'gmail_parse')),
  source_id       text,
  counterparty    text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

alter table public.transactions enable row level security;

create trigger set_updated_at_transactions
  before update on public.transactions
  for each row execute function public.set_updated_at();

create index transactions_date_idx         on public.transactions(date desc);
create index transactions_account_date_idx on public.transactions(account_id, date desc);
create index transactions_category_idx     on public.transactions(category_id);
create index transactions_titular_date_idx on public.transactions(titular, date desc);

-- RLS: usa helper para evitar subquery recursiva sobre accounts
create policy "transactions_select" on public.transactions
  for select using (public.can_see_account(account_id));

create policy "transactions_insert" on public.transactions
  for insert with check (public.can_see_account(account_id));

create policy "transactions_update" on public.transactions
  for update
  using  (public.can_see_account(account_id))
  with check (public.can_see_account(account_id));

-- ============================================================
-- TABLA: transaction_splits
-- Divide una transacción entre múltiples categorías/proyectos
-- Visibilidad heredada de la transacción padre
-- ON DELETE CASCADE: los splits mueren con su transacción
-- ============================================================

create table public.transaction_splits (
  id             uuid          primary key default gen_random_uuid(),
  transaction_id uuid          not null references public.transactions(id) on delete cascade,
  amount         numeric(12,2) not null,
  category_id    uuid          references public.categories(id) on delete restrict,
  project_id     uuid          references public.projects(id) on delete restrict,
  note           text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

alter table public.transaction_splits enable row level security;

create trigger set_updated_at_transaction_splits
  before update on public.transaction_splits
  for each row execute function public.set_updated_at();

create index transaction_splits_transaction_id_idx on public.transaction_splits(transaction_id);

-- RLS: usa helper que navega split → transaction → account
create policy "transaction_splits_select" on public.transaction_splits
  for select using (public.can_see_transaction(transaction_id));

create policy "transaction_splits_insert" on public.transaction_splits
  for insert with check (public.can_see_transaction(transaction_id));

create policy "transaction_splits_update" on public.transaction_splits
  for update
  using  (public.can_see_transaction(transaction_id))
  with check (public.can_see_transaction(transaction_id));

-- ============================================================
-- TABLA: classification_rules
-- Reglas automáticas para clasificar transacciones importadas
-- Compartidas entre ambos usuarios
-- Prioridad: número menor = se evalúa antes
-- ============================================================

create table public.classification_rules (
  id              uuid        primary key default gen_random_uuid(),
  priority        integer     not null default 100,
  match_field     text        not null check (match_field in ('counterparty', 'raw_concept', 'description')),
  match_operator  text        not null check (match_operator in ('contains', 'equals', 'starts_with', 'regex')),
  match_value     text        not null,
  set_category_id uuid        references public.categories(id) on delete set null,
  set_project_id  uuid        references public.projects(id) on delete set null,
  set_nature      text        check (set_nature in ('fijo_recurrente', 'variable_recurrente', 'extraordinario', 'inversion', 'ahorro')),
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.classification_rules enable row level security;

create trigger set_updated_at_classification_rules
  before update on public.classification_rules
  for each row execute function public.set_updated_at();

-- Compartidas: cualquier usuario autenticado lee y gestiona
create policy "classification_rules_select" on public.classification_rules
  for select using (auth.uid() is not null);

create policy "classification_rules_insert" on public.classification_rules
  for insert with check (auth.uid() is not null);

create policy "classification_rules_update" on public.classification_rules
  for update
  using  (auth.uid() is not null)
  with check (auth.uid() is not null);
