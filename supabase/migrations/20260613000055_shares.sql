-- 20260613000055_shares.sql
-- B2 · Tabla shares: compartición asimétrica/revocable + continuidad pre-armada.
-- El muro por defecto sigue siendo accounts.visibility; shares monta la RELACIÓN encima.
-- El helper can_see_visibility() (Mig 56) consumirá esta tabla. Granularidad: bucket entero (sin account_id).

create table public.shares (
  id            uuid primary key default gen_random_uuid(),
  grantor_role  text not null check (grantor_role in ('eric','ana')),
  grantee_role  text not null check (grantee_role in ('eric','ana')),
  scope         text not null check (scope in ('private_detail','aggregate','continuity')),
  is_active     boolean not null default true,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint shares_no_self check (grantor_role <> grantee_role),
  constraint shares_unique_grant unique (grantor_role, grantee_role, scope)
);

comment on table public.shares is 'B2: concesiones de visibilidad entre titulares. Asimetrica (fila por direccion), revocable (is_active). scope: private_detail=agil Y/N; continuity=sucesion pre-armada (nace inactiva); aggregate=reservado, no se enforce por RLS de fila.';

create trigger trg_shares_updated_at
  before update on public.shares
  for each row execute function public.set_updated_at();

alter table public.shares enable row level security;

-- Ver: si participo (grantor o grantee). Crear/editar/borrar: solo como grantor (mando sobre lo mio).
create policy shares_select on public.shares
  for select
  using (auth.uid() is not null and (grantor_role = user_role() or grantee_role = user_role()));

create policy shares_insert on public.shares
  for insert
  with check (auth.uid() is not null and grantor_role = user_role());

create policy shares_update on public.shares
  for update
  using (auth.uid() is not null and grantor_role = user_role())
  with check (auth.uid() is not null and grantor_role = user_role());

create policy shares_delete on public.shares
  for delete
  using (auth.uid() is not null and grantor_role = user_role());

-- INV-6: RLS sin GRANT = 42501 silencioso. GRANT por operacion.
grant select, insert, update, delete on public.shares to authenticated;

-- Seed: continuidad pre-armada en ambas direcciones, INACTIVA. Se activa con acto deliberado.
insert into public.shares (grantor_role, grantee_role, scope, is_active, note) values
  ('eric','ana','continuity', false, 'Continuidad pre-armada: si Eric falta, Ana ve el detalle privado de Eric. Activar con acto deliberado.'),
  ('ana','eric','continuity', false, 'Continuidad pre-armada: si Ana falta, Eric ve el detalle privado de Ana. Activar con acto deliberado.')
on conflict (grantor_role, grantee_role, scope) do nothing;

-- FIN del fichero de migración --
