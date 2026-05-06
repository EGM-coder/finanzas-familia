-- ============================================================================
-- Migración 22 — Canal PSD2 vía Enable Banking (modo Restricted Production)
-- 06-may-2026 · Versión consolidada con fixes de validación contra flujo real
--
-- App: EGMFin (55e3ec68-5176-4439-836c-d1c683ca80dd) · cuentas whitelisted:
--   · Kutxabank ES17...
--   · Banco Santander ES62...
-- Coste: 0 € (modo restricted limita acceso a cuentas linkeadas en panel).
-- ============================================================================

-- ── 0. Columnas en transactions (no existían tras recovery) ────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS bank_connection_id uuid,
  ADD COLUMN IF NOT EXISTS external_id        text;


-- ── 1. bank_connections ───────────────────────────────────────────────────
CREATE TABLE public.bank_connections (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             text         NOT NULL CHECK (provider IN ('enable_banking')),
  aspsp_name           text         NOT NULL,
  aspsp_country        char(2)      NOT NULL,
  aspsp_psu_type       text         NOT NULL DEFAULT 'personal'
                                    CHECK (aspsp_psu_type IN ('personal','business')),
  auth_state           uuid,
  consent_session_id   text         UNIQUE,
  consent_valid_until  timestamptz,
  user_id              uuid         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status               text         NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','active','expired','revoked')),
  raw_session          jsonb,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_bank_connections
  BEFORE UPDATE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY bank_connections_select ON public.bank_connections
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY bank_connections_insert ON public.bank_connections
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY bank_connections_update ON public.bank_connections
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.bank_connections IS
  'Consents PSD2 activos vía Enable Banking. Una fila por institución por user. '
  'Flujo: INSERT con status=pending y auth_state generado → POST /auth → callback con code → '
  'POST /sessions → UPDATE status=active, consent_session_id, consent_valid_until. '
  'consent_valid_until típicamente +180d. Re-auth necesaria al expirar.';


-- ── 2. bank_account_links ─────────────────────────────────────────────────
CREATE TABLE public.bank_account_links (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid         NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  bank_connection_id    uuid         NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  external_account_uid  text         NOT NULL,
  external_iban         text,
  is_active             boolean      NOT NULL DEFAULT true,
  last_sync_at          timestamptz,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (bank_connection_id, external_account_uid)
);

ALTER TABLE public.bank_account_links ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_bank_account_links
  BEFORE UPDATE ON public.bank_account_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY bank_account_links_select ON public.bank_account_links
  FOR SELECT USING (public.can_see_account(account_id));
CREATE POLICY bank_account_links_insert ON public.bank_account_links
  FOR INSERT WITH CHECK (public.can_see_account(account_id));
CREATE POLICY bank_account_links_update ON public.bank_account_links
  FOR UPDATE
  USING  (public.can_see_account(account_id))
  WITH CHECK (public.can_see_account(account_id));

COMMENT ON TABLE public.bank_account_links IS
  'Mapping entre cuentas lógicas EGMFin (accounts) y cuentas físicas Enable Banking. '
  'external_account_uid es el uid devuelto por POST /sessions en accounts[]. '
  'NO es el IBAN — el IBAN va en external_iban.';


-- ── 3. FK transactions.bank_connection_id ─────────────────────────────────
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_bank_connection_fk
  FOREIGN KEY (bank_connection_id)
  REFERENCES public.bank_connections(id)
  ON DELETE SET NULL;


-- ── 4. Idempotencia: índice UNIQUE parcial (account_id, external_id) ──────
CREATE UNIQUE INDEX IF NOT EXISTS transactions_external_id_unique
  ON public.transactions (account_id, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.external_id IS
  'entry_reference devuelto por Enable Banking en GET /accounts/{uid}/transactions. '
  'Inmutable para identification_hash igual. Usar como clave de idempotencia.';

COMMENT ON COLUMN public.transactions.bank_connection_id IS
  'Consent que originó esta transacción. NULL para transacciones no-PSD2. '
  'SET NULL si el consent se revoca (la transacción sobrevive).';


-- ── 5. Verificación ───────────────────────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('bank_connections','bank_account_links')
ORDER BY tablename;
-- → 2 filas

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='transactions'
  AND column_name IN ('bank_connection_id','external_id')
ORDER BY column_name;
-- → 2 filas

SELECT conname FROM pg_constraint
WHERE conrelid = 'public.transactions'::regclass
  AND conname = 'transactions_bank_connection_fk';
-- → 1 fila

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'transactions'
  AND indexname = 'transactions_external_id_unique';
-- → 1 fila