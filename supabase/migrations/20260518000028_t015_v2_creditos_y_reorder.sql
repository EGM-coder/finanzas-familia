-- ============================================================
-- Migración 28: T-015 v2 · delta sobre mig 27
-- ============================================================
-- Mig 27 insertó: Hipoteca (4), Letra coche (5), IBI (6), Otros financieros (7).
-- Revisión: añadir Crédito al consumo + Crédito estudios entre Letra coche e IBI,
-- empujando IBI a sort 8 y Otros financieros a sort 9.
--
-- Estado final bajo "Financiero e impuestos" (sort 1-9):
--   1 Comisiones bancarias (seed)
--   2 IRPF (seed)
--   3 Intereses hipoteca (seed)
--   4 Hipoteca (mig 27)
--   5 Letra coche (mig 27)
--   6 Crédito al consumo (mig 28) ← nuevo
--   7 Crédito estudios (mig 28) ← nuevo
--   8 IBI (mig 27, reordenado)
--   9 Otros financieros (mig 27, reordenado)
-- ============================================================

-- 1) Reordenar IBI y Otros financieros (de mig 27)
update public.categories c
set sort_order = case
  when c.name = 'IBI'               then 8
  when c.name = 'Otros financieros' then 9
end
where c.parent_id = (
  select id from public.categories
  where name = 'Financiero e impuestos' and parent_id is null
)
and c.name in ('IBI', 'Otros financieros');

-- 2) Insertar Crédito al consumo y Crédito estudios
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
  ('Crédito al consumo', 6),
  ('Crédito estudios',   7)
) as hoja(name, ord);
