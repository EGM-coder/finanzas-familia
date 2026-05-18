-- ============================================================
-- Migración 25: T-014 · categoría Ingresos + 4 sub-categorías hoja
-- ============================================================
-- Gap del seed original (mig 06): faltaban categorías para txns positivas.
-- Las 12 categorías raíz del seed son todas de gasto. Las txns PSD2
-- con amount > 0 (nóminas, dividendos, reembolsos) quedaban sin categoría.
-- Sub-categorías son hojas asignables; el padre es agrupador (C1).
-- Color #4a6a4a: verde oliva oscuro, financiero, no celebratorio,
-- coherente con la saturación baja del lenguaje editorial EGMFin.
-- sort_order 14: siguiente tras Transferencias internas (mig 24, sort 13).
-- ============================================================

-- 1) Categoría padre "Ingresos"
insert into public.categories (name, is_default, is_active, color, sort_order)
values ('Ingresos', true, true, '#4a6a4a', 14);

-- 2) 4 sub-categorías hoja (parent_id via subquery — robusto a id auto-generado)
insert into public.categories (name, parent_id, is_default, is_active, color, sort_order)
select
  hoja.name,
  padre.id,
  true,
  true,
  '#4a6a4a',
  hoja.ord
from (
  select id from public.categories
  where name = 'Ingresos' and parent_id is null
) padre
cross join (values
  ('Nómina',         1),
  ('Dividendos',     2),
  ('Reembolsos',     3),
  ('Otros ingresos', 4)
) as hoja(name, ord);
