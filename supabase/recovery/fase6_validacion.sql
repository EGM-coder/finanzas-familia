-- ============================================================================
-- FASE 6 — Validación post-recovery
-- PLATAFORMA: SUPABASE SQL EDITOR
-- Ejecutar DESPUÉS de fase5_reseed_remap.sql
-- Regla: si cualquier check no cuadra → STOP, no commitear, reportar a Eric.
-- ============================================================================

-- ── 6.1 CONTEOS ESTRUCTURALES ─────────────────────────────────────────────

SELECT 'accounts'             AS tabla, COUNT(*) AS filas FROM public.accounts
UNION ALL
SELECT 'holdings',                      COUNT(*)           FROM public.holdings
UNION ALL
SELECT 'manual_holdings',               COUNT(*)           FROM public.manual_holdings
UNION ALL
SELECT 'holding_prices',                COUNT(*)           FROM public.holding_prices
UNION ALL
SELECT 'liabilities',                   COUNT(*)           FROM public.liabilities
UNION ALL
SELECT 'assets',                        COUNT(*)           FROM public.assets
UNION ALL
SELECT 'stock_options',                 COUNT(*)           FROM public.stock_options
UNION ALL
SELECT 'categories',                    COUNT(*)           FROM public.categories
UNION ALL
SELECT 'projects',                      COUNT(*)           FROM public.projects
UNION ALL
SELECT 'profiles',                      COUNT(*)           FROM public.profiles
UNION ALL
SELECT 'patrimonio_snapshots',          COUNT(*)           FROM public.patrimonio_snapshots
ORDER BY tabla;

-- ESPERADO (mínimos):
--   accounts:           25
--   holdings:           19
--   manual_holdings:     1
--   holding_prices:     68   (puede ser más si GH Actions actualizó)
--   liabilities:         3
--   assets:              1
--   stock_options:       2
--   categories:         65
--   projects:            3
--   profiles:            1
--   patrimonio_snapshots: 2  (puede crecer tras snapshot nuevo en 6.3)


-- ── 6.2 INTEGRIDAD REFERENCIAL ────────────────────────────────────────────

-- Holdings sin cuenta válida → debe ser 0
SELECT COUNT(*) AS holdings_huerfanos
FROM public.holdings
WHERE account_id NOT IN (SELECT id FROM public.accounts);

-- manual_holdings sin cuenta válida → debe ser 0
SELECT COUNT(*) AS mh_huerfanos
FROM public.manual_holdings
WHERE account_id NOT IN (SELECT id FROM public.accounts);

-- Tarjetas sin linked_account_id válido → debe ser 0
SELECT COUNT(*) AS tarjetas_huerfanas
FROM public.accounts
WHERE type = 'card'
  AND linked_account_id NOT IN (SELECT id FROM public.accounts WHERE type != 'card');

-- Tablas transaccionales vacías (OK — no había datos antes del incidente)
SELECT COUNT(*) AS transactions  FROM public.transactions;
SELECT COUNT(*) AS incomes       FROM public.incomes;
SELECT COUNT(*) AS maristas      FROM public.maristas_items;


-- ── 6.3 SNAPSHOT Y PATRIMONIO NETO ───────────────────────────────────────

-- Capturar snapshot de hoy
SELECT public.capture_patrimonio_snapshot();

-- Ver últimos 3 snapshots
SELECT snapshot_date, patrimonio_neto_actual, liquidos_y_holdings,
       inmuebles, deudas_activas, deudas_proyectadas, stock_options_intrinsic
FROM public.patrimonio_snapshots
ORDER BY snapshot_date DESC
LIMIT 3;

-- Patrimonio neto en vivo (desde vistas)
SELECT
  liquidos_y_holdings,
  inmuebles,
  activos_total,
  deudas_activas,
  deudas_proyectadas,
  patrimonio_neto_actual,
  patrimonio_neto_si_firmara_hoy,
  stock_options_intrinsic
FROM public.patrimonio_neto;

-- REGLA CRÍTICA: patrimonio_neto_actual debe ser ≈ 171.000€ (± 1.000€ del dossier 29-abr)
-- Si la diferencia es > 1.000€ → STOP. Reportar delta a Eric. NO commitear.
--
-- Desglose esperado aproximado:
--   liquidos_y_holdings: ~28.000 (cuentas corrientes + saldos TR + holdings valorados)
--   inmuebles:          ~143.370 (Maristas, pagos a cuenta según mig 12)
--   deudas_activas:       ~3.000 (hipoteca/s activas)
--   deudas_proyectadas: ~300.000 (hipoteca Maristas proyectada)
--   patrimonio_neto_actual:        ≈ 171.000
--   patrimonio_neto_si_firmara_hoy:≈ -130.000 (negativo con hipoteca proyectada)


-- ── 6.4 VISTAS VIVAS ──────────────────────────────────────────────────────

-- account_balances_full: debe devolver 25 filas (una por cuenta)
SELECT COUNT(*) FROM public.account_balances_full;
-- → 25

-- holdings_valued: muestra valor actual de cada posición
SELECT h.name, a.name AS cuenta, hv.current_value_eur, hv.price_date
FROM public.holdings_valued hv
JOIN public.accounts a ON a.id = hv.account_id
JOIN public.holdings h ON h.id = hv.id
ORDER BY hv.current_value_eur DESC NULLS LAST
LIMIT 10;

-- stock_options_valued: debe devolver 2 filas (Nordex Package 1 y 2)
SELECT package_name, current_price_eur, intrinsic_total, exercisable_now
FROM public.stock_options_valued;
-- → 2 filas

-- patrimonio_snapshot_with_delta: debe devolver 1 fila
SELECT snapshot_date, patrimonio_neto_actual, delta_neto_actual, delta_neto_actual_pct
FROM public.patrimonio_snapshot_with_delta;


-- ── 6.5 RLS BÁSICO ────────────────────────────────────────────────────────
-- Verificar que RLS está activo en las tablas recreadas
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('accounts','transactions','transaction_splits','classification_rules',
                    'bank_connections','bank_account_links')
ORDER BY tablename;
-- → todas deben tener rowsecurity = true


-- ── 6.6 TRIGGERS ─────────────────────────────────────────────────────────
-- Verificar que set_updated_at existe en tablas recreadas
SELECT event_object_table AS tabla, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%updated_at%'
ORDER BY event_object_table;
-- → debe incluir: accounts, transactions, transaction_splits, classification_rules,
--                 bank_connections, bank_account_links


-- ── RESUMEN PASS/FAIL ─────────────────────────────────────────────────────
-- Todos los checks que devuelven 0 en huérfanos → PASS
-- patrimonio_neto_actual ∈ [170.000, 172.000] → PASS
-- 25 accounts, 19 holdings, 1 manual_holding, 2 stock_options → PASS
-- Si todo PASS → proceder a Fase 7 (docs) y commit.
