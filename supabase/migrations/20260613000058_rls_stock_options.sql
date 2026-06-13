-- 20260613000058_rls_stock_options.sql
-- B2 Paso 4 (final) · Mete stock_options en el muro. Cierra la segunda fuga.
-- Anade owner_role (eje de propiedad). Backfill explicito a 'eric' (los dos paquetes Nordex son de Eric), luego NOT NULL.
-- RLS por operacion: SELECT share-aware reutilizando can_see_visibility('privada_'||owner_role); escritura estricta owner-only.
-- stock_options_valued (security_invoker) hereda el SELECT y deja de fugar automaticamente. Grants sin cambios (SELECT-only authenticated).

alter table public.stock_options add column if not exists owner_role text;
update public.stock_options set owner_role = 'eric' where owner_role is null;
alter table public.stock_options alter column owner_role set not null;
alter table public.stock_options add constraint stock_options_owner_role_check check (owner_role in ('eric','ana'));

-- Renombra la politica mentirosa (se llamaba eric_only pero era authenticated) por RLS real por operacion.
drop policy if exists stock_options_eric_only on public.stock_options;

create policy stock_options_select on public.stock_options
  for select using (public.can_see_visibility('privada_' || owner_role));
create policy stock_options_insert on public.stock_options
  for insert with check (auth.uid() is not null and owner_role = public.user_role());
create policy stock_options_update on public.stock_options
  for update using (auth.uid() is not null and owner_role = public.user_role())
              with check (auth.uid() is not null and owner_role = public.user_role());
create policy stock_options_delete on public.stock_options
  for delete using (auth.uid() is not null and owner_role = public.user_role());

-- FIN del fichero de migración --
