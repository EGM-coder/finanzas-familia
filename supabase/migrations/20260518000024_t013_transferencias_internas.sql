-- ============================================================
-- Migración 24: T-013 · nature 'transferencia' + Transferencias internas
-- ============================================================
-- Doctrina: las transferencias internas no modifican patrimonio
-- (movimiento entre cuentas equivalentes o pago de tarjeta), por
-- tanto deben neutralizarse en reports de cash flow (lógica Fase 4).
-- Las aportaciones a broker NO son transferencias: son inversiones
-- (modifican patrimonio) y van con category=Inversiones + nature=inversion.
-- ============================================================

-- 1a) Ampliar CHECK constraint de transactions.nature
alter table public.transactions
  drop constraint transactions_nature_check;

alter table public.transactions
  add constraint transactions_nature_check
  check (nature in (
    'fijo_recurrente',
    'variable_recurrente',
    'extraordinario',
    'inversion',
    'ahorro',
    'transferencia'
  ));

-- 1b) Ampliar CHECK constraint de classification_rules.set_nature
--     (coherencia: las reglas deben poder asignar el mismo conjunto de valores)
alter table public.classification_rules
  drop constraint classification_rules_set_nature_check;

alter table public.classification_rules
  add constraint classification_rules_set_nature_check
  check (set_nature in (
    'fijo_recurrente',
    'variable_recurrente',
    'extraordinario',
    'inversion',
    'ahorro',
    'transferencia'
  ));

-- 2) Categoría padre "Transferencias internas"
--    is_default=true (categoría del sistema, visible para todos).
--    color: #5a5a6a (gris-azulado neutro, denota no-flujo real).
--    sort_order: 13 (siguiente tras las 12 categorías raíz del seed).
insert into public.categories (name, is_default, is_active, color, sort_order)
values ('Transferencias internas', true, true, '#5a5a6a', 13);

-- 3) Sub-categorías hoja (parent_id via subquery — robusto a id auto-generado)
insert into public.categories (name, parent_id, is_default, is_active, color, sort_order)
select
  hoja.name,
  padre.id,
  true,
  true,
  '#5a5a6a',
  hoja.ord
from (
  select id from public.categories
  where name = 'Transferencias internas' and parent_id is null
) padre
cross join (values
  ('Entre cuentas corrientes',    1),
  ('Pago de tarjeta',             2),
  ('Aportación cuenta de ahorro', 3)
) as hoja(name, ord);
