-- mig-80 · 12-oct-2026 · P-034 — Santander común: 2 PENDING "EMISION" sin neutralizar
--
-- Síntoma: desfase fijo de −875,66 entre EGMFin y el banco desde el 01-sep-2026
--   (último delta 0: 24-ago; balance_checks lo arrastra hasta hoy).
-- Causa: el 01-sep PSD2 entregó dos movimientos PENDING (h_) con descripción "EMISION"
--   (−775,66 y −100,00). Sus BOOKED (er_) llegaron al día siguiente con la descripción
--   real ("TRANSFERENCIA A FAVOR DE Justa Cámara…", "…Leo…", "…Biel…").
--   fn_supersede_pending_booked exige que una descripción contenga a la otra →
--   "EMISION" no casa → los dos h_ quedaron activos → gasto contado dos veces.
--   775,66 + 100,00 = 875,66 = desfase exacto.
-- Corrección: marcar los dos h_ como sustituidos (reversible, P-019/T-036). Sin DELETE.
--   −100,00: dos BOOKED candidatos del mismo importe (Leo y Biel). Se apunta al que
--   elegiría fn_supersede_pending_booked (menor e.id) → er_2026-09-01.2 (Leo).
-- No se toca fn_supersede_pending_booked (ver P-034: limitación conocida).

UPDATE public.transactions
SET superseded_by = '3a5e29e9-bac8-494f-98b2-6330c7c7ef2d',   -- er_2026-09-01.0 Justa Cámara −775,66
    updated_at    = now()
WHERE id = '4bcb14e8-7a44-435f-aa6f-08d18b368ca0'             -- h_116ac1d3… EMISION −775,66
  AND superseded_by IS NULL;

UPDATE public.transactions
SET superseded_by = '57839fae-64ef-48aa-905a-b046e3f12991',   -- er_2026-09-01.2 Leo −100,00
    updated_at    = now()
WHERE id = '1e9cb824-ab80-4b6b-8540-78519ac2c3dc'             -- h_0e854c46… EMISION −100,00
  AND superseded_by IS NULL;
