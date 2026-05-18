-- ============================================================
-- Migración 26: T-012 · Inversiones + Capital Leo + Capital Biel
-- ============================================================
-- Categoría padre "Inversiones": #3a5d7a (azul medio, financiero,
-- más vivo que "Financiero e impuestos" que es gris-azulado oscuro).
-- Las aportaciones a broker se etiquetan: categoría=Inversiones/Fondos
-- + nature='inversion' + project=Capital Leo (o Biel) cuando aplica.
-- Proyectos sin budget (patrón D-009: dimensión proyecto ortogonal a categoría).
-- sort_order 15: siguiente tras Ingresos (mig 25, sort 14).
-- ============================================================

-- 1) Categoría padre "Inversiones"
insert into public.categories (name, is_default, is_active, color, sort_order)
values ('Inversiones', true, true, '#3a5d7a', 15);

-- 2) 4 sub-categorías hoja (parent_id via subquery — robusto a id auto-generado)
insert into public.categories (name, parent_id, is_default, is_active, color, sort_order)
select
  hoja.name,
  padre.id,
  true,
  true,
  '#3a5d7a',
  hoja.ord
from (
  select id from public.categories
  where name = 'Inversiones' and parent_id is null
) padre
cross join (values
  ('Fondos indexados',      1),
  ('Acciones individuales', 2),
  ('Planes de pensiones',   3),
  ('Cripto',                4)
) as hoja(name, ord);

-- 3) Proyectos Capital Leo y Capital Biel
insert into public.projects (name, slug, status) values
  ('Capital Leo',  'capital-leo',  'active'),
  ('Capital Biel', 'capital-biel', 'active');
