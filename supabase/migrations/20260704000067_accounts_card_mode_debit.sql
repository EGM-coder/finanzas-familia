-- 20260704000067_accounts_card_mode_debit.sql
-- D-025: tarjetas débito = lente de gasto, no portadoras de saldo.
--
-- Problema (reconciliación 04-jul-2026):
--   P-002 modelaba todas las subcuentas de tarjeta como portadoras de deuda
--   (saldo invertido). Las tarjetas Santander son DÉBITO: cada compra sale del
--   IBAN al instante. Con P-002 tal cual:
--     · current_balance de "Santander común" excluía los movimientos de las tarjetas
--       débito (estaban en otro account_id) → saldo del IBAN incorrecto.
--     · Tarjeta Santander Ana/Eric aparecían como "deuda positiva" en patrimonio
--       → inflaban patrimonio y distorsionaban todo el cálculo.
--   "Tarjeta Kutxabank Eric" SÍ es crédito (liquida fin de mes): P-002 se mantiene.
--
-- Solución (D-025):
--   1. accounts.card_mode ('credit'|'debit') distingue el modelo contable.
--   2. Tarjetas débito:  current_balance = 0  (no portadoras de saldo).
--   3. IBAN padre de tarjetas débito: incluye en su saldo los movimientos activos
--      (superseded_by IS NULL) de todas sus tarjetas débito vinculadas.
--   4. P-002 (deuda invertida) permanece SOLO para card_mode='credit'.
--
-- Verificación esperada post-deploy:
--   Santander común = 803,77 + 8.100,42 (IBAN activos) − 3.642,54 (TSA activos)
--                   − 938,84 (TSE activos) = 4.322,81 € (saldo banco 04-jul-2026).

-- ── 1. Columna card_mode ─────────────────────────────────────────────────────

ALTER TABLE public.accounts
  ADD COLUMN card_mode text
  CONSTRAINT accounts_card_mode_values CHECK (card_mode IN ('credit', 'debit'));

-- ── 2. Backfill (antes de añadir el constraint NOT NULL condicional) ─────────

UPDATE public.accounts
SET card_mode = 'debit'
WHERE type = 'card'
  AND name IN ('Tarjeta Santander Ana', 'Tarjeta Santander Eric');

UPDATE public.accounts
SET card_mode = 'credit'
WHERE type = 'card'
  AND name NOT IN ('Tarjeta Santander Ana', 'Tarjeta Santander Eric');

-- Coherencia: card_mode NOT NULL si y solo si type='card' (añadir post-backfill)
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_card_mode_required CHECK (
    (type = 'card'  AND card_mode IS NOT NULL)
    OR
    (type <> 'card' AND card_mode IS NULL)
  );

-- ── 3. Reconstruir account_balances_full (D-025 + mig-67) ────────────────────
--
-- Lógica current_balance:
--   broker/investment → igual que antes + holdings
--   card + debit      → 0  (D-025; saldo vive en el IBAN padre)
--   card + credit     → P-002 intacto (-1 × saldo total, deuda como positivo)
--   resto (bank/cash) → initial_balance
--                       + sum(propios activos, superseded_by IS NULL)
--                       + sum(tarjetas débito vinculadas activas, superseded_by IS NULL)

CREATE OR REPLACE VIEW public.account_balances_full
WITH (security_invoker = TRUE) AS
SELECT
  a.id,
  a.name,
  a.institution,
  a.type,
  a.visibility,
  a.linked_account_id,
  a.initial_balance,
  a.is_active,
  a.sort_order,

  -- transactions_sum: suma bruta informativa (sin filtro superseded_by)
  COALESCE((
    SELECT sum(t.amount)
    FROM   public.transactions t
    WHERE  t.account_id = a.id
  ), 0) AS transactions_sum,

  -- holdings_value_eur: sin cambios
  COALESCE((
    SELECT sum(hv.current_value_eur)
    FROM   public.holdings_valued hv
    WHERE  hv.account_id = a.id
  ), 0)
  + COALESCE((
    SELECT sum(mh.current_value_eur)
    FROM   public.manual_holdings mh
    WHERE  mh.account_id = a.id
      AND  mh.is_active  = true
  ), 0) AS holdings_value_eur,

  CASE
    -- Inversión/broker: sin cambios
    WHEN a.type = ANY (ARRAY['broker', 'investment']) THEN
      a.initial_balance
      + COALESCE((
          SELECT sum(t.amount)
          FROM   public.transactions t
          WHERE  t.account_id = a.id
        ), 0)
      + COALESCE((
          SELECT sum(hv.current_value_eur)
          FROM   public.holdings_valued hv
          WHERE  hv.account_id = a.id
        ), 0)
      + COALESCE((
          SELECT sum(mh.current_value_eur)
          FROM   public.manual_holdings mh
          WHERE  mh.account_id = a.id
            AND  mh.is_active
        ), 0)

    -- D-025: tarjeta débito → saldo = 0; el saldo vive en la cuenta IBAN padre
    WHEN a.type = 'card' AND a.card_mode = 'debit' THEN
      0::numeric

    -- P-002 intacto: tarjeta crédito → deuda expresada como positivo
    WHEN a.type = 'card' THEN
      -1::numeric * (a.initial_balance + COALESCE((
        SELECT sum(t.amount)
        FROM   public.transactions t
        WHERE  t.account_id = a.id
      ), 0))

    -- Cuentas bancarias/efectivo:
    --   propios activos + movimientos activos de tarjetas débito vinculadas
    ELSE
      a.initial_balance
      + COALESCE((
          SELECT sum(t.amount)
          FROM   public.transactions t
          WHERE  t.account_id     = a.id
            AND  t.superseded_by IS NULL
        ), 0)
      + COALESCE((
          SELECT sum(t.amount)
          FROM   public.transactions t
          JOIN   public.accounts     c ON c.id = t.account_id
          WHERE  c.linked_account_id = a.id
            AND  c.card_mode         = 'debit'
            AND  t.superseded_by    IS NULL
        ), 0)

  END AS current_balance

FROM public.accounts a;
