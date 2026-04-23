create or replace view public.account_balances
  with (security_invoker = true)
as
select
  a.id as account_id,
  a.initial_balance + coalesce(sum(t.amount), 0) as current_balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id, a.initial_balance;
