-- ============================================================
-- Migración 27: T-015 · 4 hojas nuevas bajo "Financiero e impuestos"
-- ============================================================
-- Hipoteca: cuota mensual completa (uso normal sin separar intereses).
-- Letra coche: cuota mensual de préstamos amortizables de vehículo.
-- IBI: impuesto sobre bienes inmuebles (post-Maristas).
-- Otros financieros: catch-all.
-- "Intereses hipoteca" (sort 3) se mantiene para usuarios que separen
-- la parte deducible IRPF de la cuota. "Hipoteca" (sort 4) va contigua.
-- ============================================================

insert into public.categories (name, parent_id, is_default, is_active, color, sort_order)
select
  hoja.name,
  padre.id,
  true,
  true,
  padre.color,
  hoja.ord
from (
  select id, color
  from public.categories
  where name = 'Financiero e impuestos' and parent_id is null
) padre
cross join (values
  ('Hipoteca',          4),
  ('Letra coche',       5),
  ('IBI',               6),
  ('Otros financieros', 7)
) as hoja(name, ord);
