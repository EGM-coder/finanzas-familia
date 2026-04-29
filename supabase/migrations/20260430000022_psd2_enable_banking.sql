-- ============================================================================
-- Migración 22 — Canal PSD2 vía Enable Banking
-- 30-abr-2026 · Recovery + diseño limpio tras incidente Copilot
--
-- Introduce:
--   · bank_connections: consent activo por institución + usuario
--   · bank_account_links: mapping cuenta EGMFin ↔ cuenta física del banco
--   · FK formal transactions.bank_connection_id → bank_connections
--
-- Decisiones de diseño:
--   · bank_connections NO almacena access_token en claro (→ raw_session jsonb)
--   · consent_session_id es el handle de Enable Banking, UNIQUE
--   · bank_account_links separa el mapping lógico del consent (N:M posible)
--   · transactions.bank_connection_id: ON DELETE SET NULL (tx no muere si
--     el consent expira/se revoca)
-- ============================================================================

-- ── 1. bank_connections ───────────────────────────────────────────────────
CREATE TABLE public.bank_connections (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             text         NOT NULL CHECK (provider IN ('enable_banking')),
  institution_id       text         NOT NULL,               -- ej. KUTXABANK_BASKBBBB
  institution_name     text         NOT NULL,               -- ej. 'Kutxabank'
  consent_session_id   text         NOT NULL UNIQUE,        -- session_id de Enable Banking
  consent_valid_until  timestamptz  NOT NULL,               -- re-auth necesaria tras esta fecha
  user_id              uuid         NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status               text         NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','expired','revoked')),
  raw_session          jsonb,                               -- payload completo del provider
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_bank_connections
  BEFORE UPDATE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: cada usuario ve y gestiona únicamente sus propios consents
CREATE POLICY bank_connections_select ON public.bank_connections
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY bank_connections_insert ON public.bank_connections
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY bank_connections_update ON public.bank_connections
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.bank_connections IS
  'Consents PSD2 activos vía Enable Banking. '
  'Una fila por institución conectada. '
  'consent_valid_until marca cuándo Eric debe re-autenticarse (típicamente 180 días). '
  'El access_token y refresh_token se almacenan en raw_session para no tenerlos en columnas en claro.';


-- ── 2. bank_account_links ─────────────────────────────────────────────────
CREATE TABLE public.bank_account_links (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid         NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  bank_connection_id    uuid         NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  external_account_id   text         NOT NULL,              -- account_id del provider
  external_iban         text,
  is_active             boolean      NOT NULL DEFAULT true,
  last_sync_at          timestamptz,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (bank_connection_id, external_account_id)
);

ALTER TABLE public.bank_account_links ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_bank_account_links
  BEFORE UPDATE ON public.bank_account_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: hereda visibilidad del account_id vinculado (usa helper existente)
CREATE POLICY bank_account_links_select ON public.bank_account_links
  FOR SELECT USING (public.can_see_account(account_id));
CREATE POLICY bank_account_links_insert ON public.bank_account_links
  FOR INSERT WITH CHECK (public.can_see_account(account_id));
CREATE POLICY bank_account_links_update ON public.bank_account_links
  FOR UPDATE
  USING  (public.can_see_account(account_id))
  WITH CHECK (public.can_see_account(account_id));

COMMENT ON TABLE public.bank_account_links IS
  'Mapping entre cuentas lógicas EGMFin (accounts) y cuentas físicas de Enable Banking. '
  'Soporta cuentas EGMFin sin bank_connection (Trade Republic, Degiro, etc.) que nunca tendrán PSD2. '
  'external_account_id es el id devuelto por Enable Banking en GET /api/v1/accounts.';


-- ── 3. FK formal transactions.bank_connection_id ──────────────────────────
-- La columna ya existe desde fase3_recrear_schema.sql sin FK.
-- Aquí añadimos el constraint formal ahora que bank_connections existe.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_bank_connection_fk
  FOREIGN KEY (bank_connection_id)
  REFERENCES public.bank_connections(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.external_id IS
  'ID de transacción del provider PSD2 (Enable Banking). '
  'Combinado con account_id da unicidad — índice UNIQUE parcial en fase3. '
  'NULL para transacciones manuales, csv, gmail_parse, xls_kutxabank.';

COMMENT ON COLUMN public.transactions.bank_connection_id IS
  'Consent que originó esta transacción. '
  'NULL para transacciones no-PSD2. SET NULL si el consent se revoca.';


-- ── 4. Verificación ───────────────────────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('bank_connections','bank_account_links')
ORDER BY tablename;
-- → 2 filas

SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'public.transactions'::regclass
  AND conname = 'transactions_bank_connection_fk';
-- → 1 fila (tipo 'f' = foreign key)
