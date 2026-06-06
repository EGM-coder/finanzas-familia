-- ============================================================
-- Migración 49 — incomes.source: ampliar CHECK con 'nordex_payslip'
-- 06 jun 2026
--
-- Constraint previo (mig 04): manual, csv, psd2, gmail_parse.
-- Se AMPLIA añadiendo nordex_payslip para el worker parse_nominas.py.
-- No se elimina ningún valor existente (integridad histórica).
-- ============================================================

ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_source_check;

ALTER TABLE public.incomes ADD CONSTRAINT incomes_source_check
  CHECK (source IN ('manual', 'csv', 'psd2', 'gmail_parse', 'nordex_payslip'));
