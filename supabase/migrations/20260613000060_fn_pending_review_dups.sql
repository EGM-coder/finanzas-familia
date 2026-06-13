-- 20260613000060_fn_pending_review_dups.sql
-- Lista los grupos de transacciones PSD2 potencialmente duplicadas que NO son la firma
-- h_/er_ (esos los auto-resuelve fn_supersede_pending_booked). Son los ambiguos: requieren
-- ojo humano (todo-er_, h_ huerfano...). SECURITY INVOKER a proposito: respeta la RLS de
-- transactions (muro B2) -> cada usuario ve solo los duplicados de su ambito visible.

create or replace function public.fn_pending_review_dups()
returns table(account_name text, txn_date date, amount numeric, description text, n bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select a.name, t.date, t.amount, t.description, count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where t.source = 'psd2' and t.superseded_by is null
  group by a.name, t.date, t.amount, t.description
  having count(*) > 1
  order by t.date desc;
$$;

grant execute on function public.fn_pending_review_dups() to authenticated;

comment on function public.fn_pending_review_dups() is
  'Grupos de duplicados PSD2 ambiguos (no h_/er_) para revision humana. INVOKER: respeta RLS B2.';

-- FIN migración --
