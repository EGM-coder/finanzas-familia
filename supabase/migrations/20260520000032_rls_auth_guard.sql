-- ============================================================
-- Migración 32 — RLS auth guard (Seguridad transversal)
-- 20 may 2026
--
-- Problema: anon key (pública en el bundle) podía leer filas
-- con scope/visibility='compartida' sin JWT válido.
-- Causa: policies de Grupo C solo filtraban por user_role()
-- sin verificar que hubiera sesión autenticada.
--
-- Fix Grupo C (8 tablas): añadir auth.uid() IS NOT NULL
--   a todas las policies USING/WITH CHECK de:
--   accounts, assets, budgets, categories, liabilities,
--   savings_goals, weekly_closures, monthly_closures.
--
-- Fix Grupo D (2 funciones): añadir auth.uid() IS NOT NULL
--   a can_see_account() y can_see_transaction(), que cubren
--   transactions, bank_account_links, holdings, transaction_splits.
--
-- Grupo A (13 tablas): ya seguros — user_id=auth.uid(),
--   auth.uid() IS NOT NULL, o auth.role()='authenticated'.
-- Grupo B (2 tablas): currency_rates, holding_prices —
--   cache de mercado, intencionalmente públicas. Sin cambios.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE.
-- Atómico: BEGIN/COMMIT explícito — fallo en cualquier punto
--   revierte todo. Ninguna tabla queda con RLS on sin policy.
-- ============================================================

BEGIN;

-- ── Grupo D: funciones helper ────────────────────────────────
-- Se parchean primero; las tablas que las usan (transactions,
-- bank_account_links, holdings, transaction_splits) quedan
-- cubiertas sin necesidad de recrear sus policies.

CREATE OR REPLACE FUNCTION public.can_see_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = p_account_id
      AND (a.visibility = 'privada_' || public.user_role() OR a.visibility = 'compartida')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_see_transaction(p_transaction_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.transactions t
    JOIN public.accounts a ON a.id = t.account_id
    WHERE t.id = p_transaction_id
      AND (a.visibility = 'privada_' || public.user_role() OR a.visibility = 'compartida')
  )
$$;


-- ── Grupo C: accounts ────────────────────────────────────────
DROP POLICY IF EXISTS accounts_select ON public.accounts;
DROP POLICY IF EXISTS accounts_insert ON public.accounts;
DROP POLICY IF EXISTS accounts_update ON public.accounts;

CREATE POLICY accounts_select ON public.accounts
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY accounts_insert ON public.accounts
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY accounts_update ON public.accounts
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );


-- ── Grupo C: assets ──────────────────────────────────────────
DROP POLICY IF EXISTS assets_select ON public.assets;
DROP POLICY IF EXISTS assets_insert ON public.assets;
DROP POLICY IF EXISTS assets_update ON public.assets;

CREATE POLICY assets_select ON public.assets
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY assets_insert ON public.assets
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY assets_update ON public.assets
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );


-- ── Grupo C: budgets ─────────────────────────────────────────
DROP POLICY IF EXISTS budgets_select ON public.budgets;
DROP POLICY IF EXISTS budgets_insert ON public.budgets;
DROP POLICY IF EXISTS budgets_update ON public.budgets;

CREATE POLICY budgets_select ON public.budgets
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY budgets_insert ON public.budgets
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY budgets_update ON public.budgets
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );


-- ── Grupo C: categories ──────────────────────────────────────
-- SELECT incluye is_default=true para ver taxonomía base;
-- con el guard, anon ya no accede aunque is_default=true.
DROP POLICY IF EXISTS categories_select ON public.categories;
DROP POLICY IF EXISTS categories_insert ON public.categories;
DROP POLICY IF EXISTS categories_update ON public.categories;

CREATE POLICY categories_select ON public.categories
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (is_default = true OR visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY categories_insert ON public.categories
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_default = false
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY categories_update ON public.categories
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND is_default = false
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_default = false
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );


-- ── Grupo C: liabilities ─────────────────────────────────────
DROP POLICY IF EXISTS liabilities_select ON public.liabilities;
DROP POLICY IF EXISTS liabilities_insert ON public.liabilities;
DROP POLICY IF EXISTS liabilities_update ON public.liabilities;

CREATE POLICY liabilities_select ON public.liabilities
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY liabilities_insert ON public.liabilities
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY liabilities_update ON public.liabilities
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );


-- ── Grupo C: savings_goals ───────────────────────────────────
DROP POLICY IF EXISTS savings_goals_select ON public.savings_goals;
DROP POLICY IF EXISTS savings_goals_insert ON public.savings_goals;
DROP POLICY IF EXISTS savings_goals_update ON public.savings_goals;

CREATE POLICY savings_goals_select ON public.savings_goals
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY savings_goals_insert ON public.savings_goals
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );

CREATE POLICY savings_goals_update ON public.savings_goals
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  );


-- ── Grupo C: weekly_closures ─────────────────────────────────
DROP POLICY IF EXISTS weekly_closures_select ON public.weekly_closures;
DROP POLICY IF EXISTS weekly_closures_insert ON public.weekly_closures;
DROP POLICY IF EXISTS weekly_closures_update ON public.weekly_closures;

CREATE POLICY weekly_closures_select ON public.weekly_closures
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  );

CREATE POLICY weekly_closures_insert ON public.weekly_closures
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  );

CREATE POLICY weekly_closures_update ON public.weekly_closures
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  );


-- ── Grupo C: monthly_closures ────────────────────────────────
DROP POLICY IF EXISTS monthly_closures_select ON public.monthly_closures;
DROP POLICY IF EXISTS monthly_closures_insert ON public.monthly_closures;
DROP POLICY IF EXISTS monthly_closures_update ON public.monthly_closures;

CREATE POLICY monthly_closures_select ON public.monthly_closures
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  );

CREATE POLICY monthly_closures_insert ON public.monthly_closures
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  );

CREATE POLICY monthly_closures_update ON public.monthly_closures
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND scope IN ('privada_' || public.user_role(), 'compartida')
  );

COMMIT;
