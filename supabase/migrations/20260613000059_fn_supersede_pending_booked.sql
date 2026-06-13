-- 20260613000059_fn_supersede_pending_booked.sql
-- Auto-resuelve el trap PSD2 PENDING->BOOKED: neutraliza filas h_ (PENDING, hash) que ya
-- tienen gemela er_ (BOOKED, entry_reference) con mismo account/date/amount/description.
-- SEGURO: solo toca filas h_ que tienen gemela booked; nunca fusiona dos cargos booked
-- (caso Iberia) ni toca h_ huerfanos sin gemela. Single source de la regla de dedupe.

create or replace function public.fn_supersede_pending_booked()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count integer;
begin
  with pairs as (
    select distinct on (h.id) h.id as h_id, e.id as e_id
    from public.transactions h
    join public.transactions e
      on e.account_id = h.account_id
     and e.date = h.date
     and e.amount = h.amount
     and e.description is not distinct from h.description
     and e.external_id like 'er\_%'
     and e.superseded_by is null
     and e.source = 'psd2'
    where h.source = 'psd2'
      and h.external_id like 'h\_%'
      and h.superseded_by is null
    order by h.id, e.id
  )
  update public.transactions t
  set superseded_by = p.e_id, updated_at = now()
  from pairs p
  where t.id = p.h_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.fn_supersede_pending_booked() is
  'Neutraliza duplicados PSD2 PENDING(h_)->BOOKED(er_) por content-match. Devuelve nº neutralizadas. Llamada por sync_psd2.py al final del run.';

-- FIN migración --
