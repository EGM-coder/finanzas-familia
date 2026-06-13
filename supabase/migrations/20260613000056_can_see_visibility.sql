-- 20260613000056_can_see_visibility.sql
-- B2 Paso 2 · Centraliza el muro de LECTURA en can_see_visibility() y lo hace share-aware (consume tabla shares).
-- PRINCIPIO: compartir = SOLO LECTURA. Las policies de escritura siguen estrictas; can_see_account() NO se toca.
-- Repunta SOLO los SELECT de accounts, holdings y transactions.

create or replace function public.can_see_visibility(p_visibility text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select auth.uid() is not null and (
    p_visibility = 'compartida'
    or p_visibility = 'privada_' || public.user_role()
    or exists (
      select 1 from public.shares s
      where s.grantee_role = public.user_role()
        and p_visibility = 'privada_' || s.grantor_role
        and s.is_active
        and s.scope in ('private_detail','continuity')
    )
  )
$function$;

create or replace function public.can_read_account(p_account_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.accounts a
    where a.id = p_account_id
      and public.can_see_visibility(a.visibility)
  )
$function$;

grant execute on function public.can_see_visibility(text) to authenticated;
grant execute on function public.can_read_account(uuid) to authenticated;

-- Repunta SELECTs a la version share-aware. Escritura intacta (siguen usando can_see_account / inline estricto).
alter policy accounts_select     on public.accounts     using (public.can_see_visibility(visibility));
alter policy holdings_select     on public.holdings      using (public.can_read_account(account_id));
alter policy transactions_select on public.transactions  using (public.can_read_account(account_id));

-- FIN del fichero de migración --
