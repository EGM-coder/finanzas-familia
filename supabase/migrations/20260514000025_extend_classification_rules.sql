-- ============================================================
-- MIGRACIÓN 25: D-005 · EXTENSIÓN classification_rules
--
-- Añade campos set_* para re-mapeo automático de cuenta/titular
-- y reembolsable. Sin estas columnas, el re-mapeo de tarjetas
-- Eric/Ana (que PSD2 entrega a la cuenta principal) requería
-- intervención manual tras cada sync.
--
-- Casos de uso inmediatos (sembrar tras esta migración):
--   - description LIKE '%919678%'     → Tarjeta Santander Eric, titular='eric'
--   - description LIKE '%667908%' o
--     description LIKE '%5163830308%' → Tarjeta Santander Ana, titular='ana'
--   - description LIKE 'TARJ.CRDTO 4921%' → Tarjeta Kutxabank Eric
--
-- Las nuevas columnas siguen el patrón de las existentes
-- (set_category_id, set_project_id): ON DELETE SET NULL para
-- que el borrado de la entidad referenciada no rompa la regla.
-- ============================================================

alter table public.classification_rules
  add column if not exists set_account_id       uuid references public.accounts(id)  on delete set null,
  add column if not exists set_titular          text check (set_titular in ('eric', 'ana', 'compartido')),
  add column if not exists set_paid_by_user_id  uuid references auth.users(id)       on delete set null,
  add column if not exists set_is_reimbursable  boolean;
