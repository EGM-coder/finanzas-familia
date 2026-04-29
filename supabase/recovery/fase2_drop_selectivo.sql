-- ============================================================================
-- FASE 2 — Drop selectivo tablas contaminadas por Copilot
-- PLATAFORMA: SUPABASE SQL EDITOR
-- EJECUTAR SOLO TRAS BACKUP CSV (Fase 1) y confirmación explícita de Eric.
--
-- Qué cae por CASCADE:
--   accounts    → account_balances (view), account_balances_full (view),
--                 patrimonio_neto (view), transactions (si tiene FK a accounts)
--   transactions→ transaction_splits (FK CASCADE)
--   bank_connections → vacía y mal modelada, se rediseña en mig 22
--   stock_option_grants → obsoleta, sustituida por stock_options (mig 16)
--
-- Qué NO se toca:
--   assets, liabilities, holdings, holding_prices, holding_prices,
--   manual_holdings, manual_holdings_history, currency_rates,
--   categories, projects, profiles, patrimonio_snapshots,
--   stock_options (tabla correcta), budgets, savings_goals,
--   work_abroad_days, incomes, maristas_items
-- ============================================================================

-- Paso 1: transacciones primero (FK a accounts — evita error en drop de accounts)
DROP TABLE IF EXISTS public.transactions CASCADE;

-- Paso 2: accounts (mata account_balances*, holdings_valued no se toca porque
--         su FK es holdings.account_id que seguirá huérfana pero la tabla vive)
DROP TABLE IF EXISTS public.accounts CASCADE;

-- Paso 3: bank_connections de Copilot (mal modelada, schema incorrecto)
DROP TABLE IF EXISTS public.bank_connections CASCADE;

-- Paso 4: stock_option_grants (vacía, obsoleta — sustituida por stock_options)
DROP TABLE IF EXISTS public.stock_option_grants CASCADE;

-- ── Verificación post-drop ─────────────────────────────────────────────────
-- Ejecutar estas líneas y verificar que devuelven 0 filas:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('accounts','transactions','bank_connections','stock_option_grants');
-- → debe devolver 0 filas

-- Verificar que tablas vivas siguen en pie:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'assets','liabilities','holdings','holding_prices',
    'manual_holdings','manual_holdings_history','currency_rates',
    'categories','projects','profiles','patrimonio_snapshots',
    'stock_options','incomes','maristas_items',
    'work_abroad_days','budgets','savings_goals'
  )
ORDER BY tablename;
-- → debe devolver 15 filas (si incomes/maristas_items/budgets/savings_goals existen)
