-- ============================================================
-- MIGRACIÓN 6: SEED — CATEGORÍAS Y PROYECTOS INICIALES
-- Categorías: is_default=true, visibility=null, is_active=true
-- 12 categorías raíz (sin "Proyecto Maristas" — Maristas se
-- gestiona vía project_id en transactions + tabla maristas_items)
-- ============================================================

with

  -- ── NIVEL 1: categorías raíz ─────────────────────────────
  lvl1 as (
    insert into public.categories (name, is_default, is_active, sort_order)
    values
      ('Vivienda',                true, true,  1),
      ('Alimentación',            true, true,  2),
      ('Transporte',              true, true,  3),
      ('Salud',                   true, true,  4),
      ('Educación',               true, true,  5),
      ('Ocio y cultura',          true, true,  6),
      ('Ropa y cuidado personal', true, true,  7),
      ('Hijos',                   true, true,  8),
      ('Servicios y suministros', true, true,  9),
      ('Financiero e impuestos',  true, true, 10),
      ('Regalos y donaciones',    true, true, 11),
      ('Vacaciones y viajes',     true, true, 12)
    returning id, name
  ),

  -- ── NIVEL 2: subcategorías ───────────────────────────────

  sub_vivienda as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Alquiler',       1),
      ('Hipoteca',       2),
      ('Comunidad',      3),
      ('IBI',            4),
      ('Seguro hogar',   5),
      ('Mantenimiento',  6),
      ('Mobiliario',     7)
    ) as s(name, ord)
    where lvl1.name = 'Vivienda'
  ),

  sub_alimentacion as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Supermercado',  1),
      ('Restaurantes',  2),
      ('Cafetería',     3),
      ('Delivery',      4)
    ) as s(name, ord)
    where lvl1.name = 'Alimentación'
  ),

  sub_transporte as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Combustible',          1),
      ('Peajes y parking',     2),
      ('Seguro coche',         3),
      ('Mantenimiento coche',  4),
      ('Transporte público',   5),
      ('Taxi/Uber',            6)
    ) as s(name, ord)
    where lvl1.name = 'Transporte'
  ),

  sub_salud as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Médico privado',  1),
      ('Farmacia',        2),
      ('Gimnasio',        3),
      ('Seguro salud',    4)
    ) as s(name, ord)
    where lvl1.name = 'Salud'
  ),

  sub_educacion as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Guardería Leo',     1),
      ('Guardería Biel',    2),
      ('Material escolar',  3),
      ('Extraescolares',    4)
    ) as s(name, ord)
    where lvl1.name = 'Educación'
  ),

  sub_ocio as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Streaming',  1),
      ('Libros',     2),
      ('Eventos',    3),
      ('Golf',       4)
    ) as s(name, ord)
    where lvl1.name = 'Ocio y cultura'
  ),

  sub_ropa as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Ropa adultos',  1),
      ('Ropa niños',    2),
      ('Peluquería',    3),
      ('Cosmética',     4)
    ) as s(name, ord)
    where lvl1.name = 'Ropa y cuidado personal'
  ),

  sub_hijos as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Juguetes',                1),
      ('Cuidados y salud',        2),
      ('Actividades infantiles',  3),
      ('Pañales y consumibles',   4)
    ) as s(name, ord)
    where lvl1.name = 'Hijos'
  ),

  sub_servicios as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Luz',         1),
      ('Agua',        2),
      ('Gas',         3),
      ('Internet',    4),
      ('Móvil Eric',  5),
      ('Móvil Ana',   6)
    ) as s(name, ord)
    where lvl1.name = 'Servicios y suministros'
  ),

  sub_financiero as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Comisiones bancarias',  1),
      ('IRPF',                  2),
      ('Intereses hipoteca',    3)
    ) as s(name, ord)
    where lvl1.name = 'Financiero e impuestos'
  ),

  sub_regalos as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Regalos familia',  1),
      ('Regalos amigos',   2),
      ('Donaciones',       3)
    ) as s(name, ord)
    where lvl1.name = 'Regalos y donaciones'
  ),

  sub_vacaciones as (
    insert into public.categories (name, parent_id, is_default, is_active, sort_order)
    select s.name, lvl1.id, true, true, s.ord
    from lvl1 cross join (values
      ('Alojamiento',          1),
      ('Vuelos y transporte',  2),
      ('Actividades viaje',    3),
      ('Restauración viaje',   4)
    ) as s(name, ord)
    where lvl1.name = 'Vacaciones y viajes'
  )

select 'seed categorías completado' as result;

-- ── PROYECTOS INICIALES ───────────────────────────────────────
insert into public.projects (name, slug, status, description)
values
  (
    'Rutina familiar',
    'rutina',
    'active',
    'Gastos e ingresos del día a día familiar'
  ),
  (
    'Maristas — Adquisición',
    'maristas_adquisicion',
    'active',
    'Compra del apartamento Residencial Maristas (promotor COBLANSA, diseño MAIO)'
  ),
  (
    'Maristas — Equipamiento',
    'maristas_equipamiento',
    'active',
    'Equipamiento y decoración del apartamento Maristas'
  );
