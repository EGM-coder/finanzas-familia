-- 20260613000057_rls_manual_holdings.sql
-- B2 Paso 3 · Cierra la fuga estructural de manual_holdings (+ _history).
-- De politica permisiva (auth.role()='authenticated') a la MISMA estructura que holdings:
--   SELECT share-aware via can_read_account; escritura estricta via can_see_account.
-- Grants sin cambios (SELECT-only para authenticated; el worker escribe por service_role).

-- manual_holdings: account_id NOT NULL -> ancla directa.
drop policy if exists manual_holdings_authenticated on public.manual_holdings;

create policy manual_holdings_select on public.manual_holdings
  for select using (public.can_read_account(account_id));
create policy manual_holdings_insert on public.manual_holdings
  for insert with check (public.can_see_account(account_id));
create policy manual_holdings_update on public.manual_holdings
  for update using (public.can_see_account(account_id))
              with check (public.can_see_account(account_id));
create policy manual_holdings_delete on public.manual_holdings
  for delete using (public.can_see_account(account_id));

-- manual_holdings_history: solo manual_holding_id -> salto a manual_holdings para resolver la cuenta.
drop policy if exists mh_history_authenticated on public.manual_holdings_history;

create policy mh_history_select on public.manual_holdings_history
  for select using (exists (
    select 1 from public.manual_holdings mh
    where mh.id = manual_holding_id and public.can_read_account(mh.account_id)));
create policy mh_history_insert on public.manual_holdings_history
  for insert with check (exists (
    select 1 from public.manual_holdings mh
    where mh.id = manual_holding_id and public.can_see_account(mh.account_id)));
create policy mh_history_update on public.manual_holdings_history
  for update using (exists (
    select 1 from public.manual_holdings mh
    where mh.id = manual_holding_id and public.can_see_account(mh.account_id)))
              with check (exists (
    select 1 from public.manual_holdings mh
    where mh.id = manual_holding_id and public.can_see_account(mh.account_id)));
create policy mh_history_delete on public.manual_holdings_history
  for delete using (exists (
    select 1 from public.manual_holdings mh
    where mh.id = manual_holding_id and public.can_see_account(mh.account_id)));

-- FIN del fichero de migración --
