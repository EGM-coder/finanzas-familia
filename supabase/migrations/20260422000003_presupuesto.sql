-- ============================================================
-- MIGRACIÓN 3: TABLAS DE PRESUPUESTO
-- budgets, savings_goals + RLS
-- ============================================================

-- ============================================================
-- TABLA: budgets
-- Presupuesto mensual por categoría y visibilidad
-- Sin DELETE: historial presupuestario intacto
-- ============================================================

create table public.budgets (
  id             uuid          primary key default gen_random_uuid(),
  year           integer       not null,
  month          integer       not null check (month between 1 and 12),
  category_id    uuid          not null references public.categories(id) on delete restrict,
  visibility     text          not null check (visibility in ('privada_eric', 'privada_ana', 'compartida')),
  amount_planned numeric(12,2) not null,
  notes          text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  constraint budgets_unique_period unique (year, month, category_id, visibility)
);

alter table public.budgets enable row level security;

create trigger set_updated_at_budgets
  before update on public.budgets
  for each row execute function public.set_updated_at();

create index budgets_year_month_idx on public.budgets(year, month);
create index budgets_category_idx   on public.budgets(category_id);

-- RLS: patrón unificado visibility — igual que accounts y savings_goals
create policy "budgets_select" on public.budgets
  for select using (
    visibility = 'privada_' || public.user_role() or visibility = 'compartida'
  );

create policy "budgets_insert" on public.budgets
  for insert with check (
    visibility = 'privada_' || public.user_role() or visibility = 'compartida'
  );

create policy "budgets_update" on public.budgets
  for update
  using  (visibility = 'privada_' || public.user_role() or visibility = 'compartida')
  with check (visibility = 'privada_' || public.user_role() or visibility = 'compartida');

-- ============================================================
-- TABLA: savings_goals
-- Objetivos de ahorro de la familia
-- Sin DELETE: objetivos se desactivan con is_active=false
-- ============================================================

create table public.savings_goals (
  id                   uuid          primary key default gen_random_uuid(),
  name                 text          not null,
  target_amount        numeric(12,2) not null,
  current_amount       numeric(12,2) not null default 0,
  target_date          date,
  monthly_contribution numeric(12,2),
  account_id           uuid          references public.accounts(id) on delete set null,
  visibility           text          not null check (visibility in ('privada_eric', 'privada_ana', 'compartida')),
  is_active            boolean       not null default true,
  notes                text,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

alter table public.savings_goals enable row level security;

create trigger set_updated_at_savings_goals
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

create index savings_goals_account_id_idx on public.savings_goals(account_id);

create policy "savings_goals_select" on public.savings_goals
  for select using (
    visibility = 'privada_' || public.user_role() or visibility = 'compartida'
  );

create policy "savings_goals_insert" on public.savings_goals
  for insert with check (
    visibility = 'privada_' || public.user_role() or visibility = 'compartida'
  );

create policy "savings_goals_update" on public.savings_goals
  for update
  using  (visibility = 'privada_' || public.user_role() or visibility = 'compartida')
  with check (visibility = 'privada_' || public.user_role() or visibility = 'compartida');
