-- 20260705000068_fix_tarj_crdto_kutxabank.sql
-- P-024: liquidaciones TARJ.CRDTO pertenecen al IBAN, no a la subcuenta de tarjeta.
--
-- Causa raíz:
--   classification_rules rule#d03dbac0 (priority 30, starts_with 'TARJ.CRDTO 4921',
--   set_account_id → Tarjeta Kutxabank Eric) desviaba el cargo mensual de liquidación
--   al account_id de la subcuenta de crédito. El consentimiento PSD2 de Kutxabank
--   expone SOLO el IBAN (una cuenta CACC). No existe feed granular de la tarjeta.
--   Resultado: 5 liquidaciones (mar-jul 2026, total −5.734,93 €) estaban en la
--   subcuenta en lugar del IBAN → saldo IBAN inflado 5.734,93 €; subcuenta con
--   "deuda" artificial de 4.880,55 € (P-002 sobre initial_balance 854,38 sin base).
--
-- Verificación saldo esperado post-fix:
--   Kutxabank = 1.521,73 (initial) + 11.140,30 (activos IBAN) − 5.734,93 (TARJ.CRDTO)
--            = 6.927,10 € (coincide con saldo banco verificado).
--
-- Análisis de cierres semanales:
--   Las 5 txns están en 'privada_eric' (Tarjeta Kutxabank Eric.visibility).
--   Kutxabank también es 'privada_eric'. Mover entre accounts del mismo scope
--   no altera los totales de v_spent_by_category_week ni weekly_closures.
--   Adicionalmente, 3 de las 5 tienen nature='transferencia' → ya excluidas.
--   Conclusión: 0 cierres inconsistentes. No se requiere recálculo.
--
-- Routing de tarjetas Santander (débito): reglas 10/20/21 NO se tocan.

-- ── 1. Desactivar la regla de enrutado culpable (idempotente) ────────────────
-- Defensivo: filtra también por match_value para no afectar si el id cambia.
UPDATE public.classification_rules
SET   is_active  = false,
      updated_at = NOW()
WHERE id             = 'd03dbac0-5f67-4a11-9dce-87cd4bd6ef3e'
  AND match_operator = 'starts_with'
  AND match_value    = 'TARJ.CRDTO 4921';

-- ── 2a. Mover los 5 TARJ.CRDTO al IBAN Kutxabank (idempotente) ──────────────
-- Identificados por description LIKE 'TARJ.CRDTO%' + account_id actual de la tarjeta.
-- Conserva: id, external_id, category_id, nature, nature, project_id,
--           paid_by_user_id, is_reimbursable, superseded_by — solo cambia account_id.
UPDATE public.transactions
SET   account_id  = (SELECT id FROM public.accounts WHERE name = 'Kutxabank'),
      updated_at  = NOW()
WHERE description  LIKE 'TARJ.CRDTO%'
  AND account_id   = (SELECT id FROM public.accounts WHERE name = 'Tarjeta Kutxabank Eric');

-- ── 2b. Desactivar Tarjeta Kutxabank Eric (idempotente) ─────────────────────
-- initial_balance 854,38 no tenía justificación real (subcuenta sin feed granular).
-- is_active=false la excluye de patrimonio_neto, /cuentas UI y bank_account_links
-- (el único link activo de Kutxabank apuntaba ya al IBAN — verificado pre-migración).
UPDATE public.accounts
SET   initial_balance = 0,
      is_active       = false,
      updated_at      = NOW()
WHERE name = 'Tarjeta Kutxabank Eric'
  AND type = 'card';
