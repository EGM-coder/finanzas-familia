-- ============================================================
-- MIGRACIÓN 7: AMPLIACIÓN MODELO CUENTAS Y TRANSACCIONES
-- Soporte para tarjetas vinculadas y gastos reembolsables
-- ============================================================

-- ── TABLA: accounts ──────────────────────────────────────────

-- 1. Ampliar CHECK de type para incluir 'card'
--    DO block busca el nombre real del constraint en pg_constraint
--    y lo dropea dinámicamente, robusto contra auto-naming de Postgres
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.accounts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%type%'
    and pg_get_constraintdef(oid) like '%bank%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.accounts drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.accounts
  add constraint accounts_type_check
  check (type in ('bank', 'investment', 'broker', 'cash', 'pension', 'card'));

-- 2. Columna para vincular tarjeta → cuenta bancaria
alter table public.accounts
  add column linked_account_id uuid references public.accounts(id) on delete restrict;

-- 3. Constraint: tarjetas siempre vinculadas, cuentas normales nunca
--    Al añadir la columna todas las filas existentes tienen linked_account_id=null
--    y type != 'card', así que el constraint pasa sin tocar datos existentes
alter table public.accounts
  add constraint accounts_card_linked_check check (
    (type = 'card'  and linked_account_id is not null) or
    (type != 'card' and linked_account_id is null)
  );

-- 4. Saldo inicial (base para calcular saldo actual = initial_balance + sum(amount))
--    Convención: amount negativo = gasto, positivo = ingreso
alter table public.accounts
  add column initial_balance numeric(12,2) not null default 0;

-- Índice para joins tarjeta → cuenta
create index accounts_linked_idx on public.accounts(linked_account_id);

-- ── TABLA: transactions ───────────────────────────────────────

-- 5. Flag para gastos reembolsables (dietas empresa, gastos adelantados, etc.)
alter table public.transactions
  add column is_reimbursable boolean not null default false;

-- 6. Fecha de reembolso efectivo (null = no aplica o pendiente)
alter table public.transactions
  add column reimbursed_at timestamptz;
