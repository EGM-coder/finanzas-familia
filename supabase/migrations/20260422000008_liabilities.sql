create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('hipoteca','prestamo_personal','financiacion_consumo','linea_credito','otros')),
  lender text,
  visibility text not null check (visibility in ('privada_eric','privada_ana','compartida')),
  original_principal numeric(12,2) not null,
  current_balance numeric(12,2) not null,
  interest_rate numeric(5,4),
  interest_type text check (interest_type in ('fijo','variable','mixto')),
  start_date date,
  end_date date,
  monthly_payment numeric(12,2),
  status text not null default 'activa' check (status in ('activa','proyectada','cerrada')),
  linked_asset_id uuid references public.assets(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.liabilities enable row level security;

create trigger set_updated_at_liabilities before update on public.liabilities for each row execute function public.set_updated_at();

create index liabilities_visibility_status_idx on public.liabilities(visibility, status);
create index liabilities_linked_asset_idx on public.liabilities(linked_asset_id);

create policy "liabilities_select" on public.liabilities for select using (visibility = 'privada_' || public.user_role() or visibility = 'compartida');
create policy "liabilities_insert" on public.liabilities for insert with check (visibility = 'privada_' || public.user_role() or visibility = 'compartida');
create policy "liabilities_update" on public.liabilities for update using (visibility = 'privada_' || public.user_role() or visibility = 'compartida') with check (visibility = 'privada_' || public.user_role() or visibility = 'compartida');
