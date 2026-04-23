-- ============================================================
-- MIGRACIÓN 4: TABLAS DE INGRESOS
-- incomes, work_abroad_days + RLS
-- Muro estricto: user_id = auth.uid() — cada uno ve solo los suyos
-- ============================================================

-- ============================================================
-- TABLA: incomes
-- Nóminas, extras, bonus, dietas — privado por usuario
-- Sin DELETE: historial de ingresos intacto
-- ============================================================

create table public.incomes (
  id                   uuid          primary key default gen_random_uuid(),
  date                 date          not null,
  user_id              uuid          not null references auth.users(id) on delete restrict,
  type                 text          not null check (type in ('nomina_mensual', 'paga_extra', 'bonus', 'dietas', 'otro')),
  gross_amount         numeric(12,2) not null,
  irpf_withheld        numeric(12,2) not null default 0,
  ss_withheld          numeric(12,2) not null default 0,
  net_amount           numeric(12,2) not null,
  art_7p_exempt_days   integer,
  art_7p_exempt_amount numeric(12,2),
  employer             text,
  concept              text,
  source               text          not null default 'manual' check (source in ('manual', 'csv', 'psd2', 'gmail_parse')),
  source_id            text,
  notes                text,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

alter table public.incomes enable row level security;

create trigger set_updated_at_incomes
  before update on public.incomes
  for each row execute function public.set_updated_at();

create index incomes_user_date_idx on public.incomes(user_id, date desc);
create index incomes_type_date_idx on public.incomes(type, date desc);

-- RLS estricto: cada usuario ve y gestiona únicamente sus propios ingresos
create policy "incomes_select" on public.incomes
  for select using (user_id = auth.uid());

create policy "incomes_insert" on public.incomes
  for insert with check (user_id = auth.uid());

create policy "incomes_update" on public.incomes
  for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- TABLA: work_abroad_days
-- Días trabajados fuera de España — Art. 7p IRPF
-- Privado por usuario, igual que incomes
-- ============================================================

create table public.work_abroad_days (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete restrict,
  date_from  date        not null,
  date_to    date        not null,
  country    text        not null,
  purpose    text,
  days_count integer     not null,
  year       integer     not null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_abroad_days_dates_check check (date_to >= date_from)
);

alter table public.work_abroad_days enable row level security;

create trigger set_updated_at_work_abroad_days
  before update on public.work_abroad_days
  for each row execute function public.set_updated_at();

create index work_abroad_days_user_year_idx on public.work_abroad_days(user_id, year);
create index work_abroad_days_date_from_idx on public.work_abroad_days(date_from desc);

-- RLS estricto: cada usuario ve y gestiona únicamente sus propios días
create policy "work_abroad_days_select" on public.work_abroad_days
  for select using (user_id = auth.uid());

create policy "work_abroad_days_insert" on public.work_abroad_days
  for insert with check (user_id = auth.uid());

create policy "work_abroad_days_update" on public.work_abroad_days
  for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
