-- ============================================================================
-- FASE 3 — Recrear schema EGMFin original
-- PLATAFORMA: SUPABASE SQL EDITOR
-- Ejecutar DESPUÉS de fase2_drop_selectivo.sql
--
-- Reconstruye desde migraciones 1+2+7+10 (mig 10 no commiteada; se incluye
-- inline tipo 'tesoreria_tae' y tipo card). La vista account_balances_full
-- se reconstruye en versión mig-20 (incluye manual_holdings).
-- bank_connection_id en transactions queda sin FK; se añade en mig 22.
-- ============================================================================

-- ── 3.1 TABLA accounts ────────────────────────────────────────────────────
-- Schema completo: mig 1 (base) + mig 7 (card, linked_account_id,
--                  initial_balance) + mig 10 (tesoreria_tae inline)

CREATE TABLE public.accounts (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text          NOT NULL,
  institution       text          NOT NULL,
  type              text          NOT NULL
                    CHECK (type IN ('bank','investment','broker','cash','pension','card','tesoreria_tae')),
  visibility        text          NOT NULL
                    CHECK (visibility IN ('privada_eric','privada_ana','compartida')),
  currency          text          NOT NULL DEFAULT 'EUR',
  is_active         boolean       NOT NULL DEFAULT true,
  notes             text,
  sort_order        integer       NOT NULL DEFAULT 0,
  linked_account_id uuid          REFERENCES public.accounts(id) ON DELETE RESTRICT,
  initial_balance   numeric(12,2) NOT NULL DEFAULT 0,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT accounts_card_linked_check CHECK (
    (type = 'card'  AND linked_account_id IS NOT NULL) OR
    (type != 'card' AND linked_account_id IS NULL)
  )
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_accounts
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX accounts_linked_idx ON public.accounts(linked_account_id);

CREATE POLICY accounts_select ON public.accounts
  FOR SELECT USING (
    visibility = 'privada_' || public.user_role() OR visibility = 'compartida'
  );
CREATE POLICY accounts_insert ON public.accounts
  FOR INSERT WITH CHECK (
    visibility = 'privada_' || public.user_role() OR visibility = 'compartida'
  );
CREATE POLICY accounts_update ON public.accounts
  FOR UPDATE
  USING  (visibility = 'privada_' || public.user_role() OR visibility = 'compartida')
  WITH CHECK (visibility = 'privada_' || public.user_role() OR visibility = 'compartida');


-- ── 3.2 TABLA transactions ────────────────────────────────────────────────
-- mig 2 (base) + mig 7 (is_reimbursable, reimbursed_at)
-- + columnas PSD2 nuevas (external_id, raw_payload, bank_connection_id)
-- NOTA: bank_connection_id sin FK hasta mig 22 (bank_connections aún no existe)
-- NOTA: source ampliado vs mig-2 para incluir enable_banking + xls_kutxabank

-- Si transaction_splits o classification_rules sobrevivieron al CASCADE anterior,
-- los dropeamos aquí para poder (re)crearlos limpios después.
DROP TABLE IF EXISTS public.transaction_splits  CASCADE;
DROP TABLE IF EXISTS public.classification_rules CASCADE;

CREATE TABLE public.transactions (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  date               date          NOT NULL,
  amount             numeric(12,2) NOT NULL,
  currency           text          NOT NULL DEFAULT 'EUR',
  description        text,
  raw_concept        text,
  account_id         uuid          NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  category_id        uuid          REFERENCES public.categories(id)  ON DELETE RESTRICT,
  project_id         uuid          REFERENCES public.projects(id)    ON DELETE RESTRICT,
  nature             text          CHECK (nature IN (
                                     'fijo_recurrente','variable_recurrente',
                                     'extraordinario','inversion','ahorro'
                                   )),
  paid_by_user_id    uuid          REFERENCES auth.users(id) ON DELETE RESTRICT,
  titular            text          NOT NULL CHECK (titular IN ('eric','ana','compartido')),
  source             text          NOT NULL DEFAULT 'manual'
                                   CHECK (source IN (
                                     'manual','csv','psd2','gmail_parse',
                                     'enable_banking','xls_kutxabank'
                                   )),
  source_id          text,
  counterparty       text,
  is_reimbursable    boolean       NOT NULL DEFAULT false,
  reimbursed_at      timestamptz,
  -- PSD2 / Enable Banking (FK a bank_connections se añade en mig 22)
  external_id        text,
  raw_payload        jsonb,
  bank_connection_id uuid,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_transactions
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX transactions_date_idx           ON public.transactions(date DESC);
CREATE INDEX transactions_account_date_idx   ON public.transactions(account_id, date DESC);
CREATE INDEX transactions_category_idx       ON public.transactions(category_id);
CREATE INDEX transactions_titular_date_idx   ON public.transactions(titular, date DESC);
CREATE INDEX transactions_external_id_idx    ON public.transactions(external_id);

-- Dedup PSD2: una sola tx por cuenta+external_id (ignora NULLs)
CREATE UNIQUE INDEX transactions_external_unique_idx
  ON public.transactions(account_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE POLICY transactions_select ON public.transactions
  FOR SELECT USING (public.can_see_account(account_id));
CREATE POLICY transactions_insert ON public.transactions
  FOR INSERT WITH CHECK (public.can_see_account(account_id));
CREATE POLICY transactions_update ON public.transactions
  FOR UPDATE
  USING  (public.can_see_account(account_id))
  WITH CHECK (public.can_see_account(account_id));


-- ── 3.3 TABLA transaction_splits ─────────────────────────────────────────
-- mig 2 verbatim

CREATE TABLE public.transaction_splits (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid          NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL,
  category_id    uuid          REFERENCES public.categories(id) ON DELETE RESTRICT,
  project_id     uuid          REFERENCES public.projects(id)   ON DELETE RESTRICT,
  note           text,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_transaction_splits
  BEFORE UPDATE ON public.transaction_splits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX transaction_splits_transaction_id_idx ON public.transaction_splits(transaction_id);

CREATE POLICY transaction_splits_select ON public.transaction_splits
  FOR SELECT USING (public.can_see_transaction(transaction_id));
CREATE POLICY transaction_splits_insert ON public.transaction_splits
  FOR INSERT WITH CHECK (public.can_see_transaction(transaction_id));
CREATE POLICY transaction_splits_update ON public.transaction_splits
  FOR UPDATE
  USING  (public.can_see_transaction(transaction_id))
  WITH CHECK (public.can_see_transaction(transaction_id));


-- ── 3.4 TABLA classification_rules ───────────────────────────────────────
-- mig 2 verbatim

CREATE TABLE public.classification_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  priority        integer     NOT NULL DEFAULT 100,
  match_field     text        NOT NULL CHECK (match_field IN ('counterparty','raw_concept','description')),
  match_operator  text        NOT NULL CHECK (match_operator IN ('contains','equals','starts_with','regex')),
  match_value     text        NOT NULL,
  set_category_id uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
  set_project_id  uuid        REFERENCES public.projects(id)   ON DELETE SET NULL,
  set_nature      text        CHECK (set_nature IN (
                                'fijo_recurrente','variable_recurrente',
                                'extraordinario','inversion','ahorro'
                              )),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classification_rules ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_updated_at_classification_rules
  BEFORE UPDATE ON public.classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY classification_rules_select ON public.classification_rules
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY classification_rules_insert ON public.classification_rules
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY classification_rules_update ON public.classification_rules
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- ── 3.5 RECREAR VISTAS (orden obligatorio) ───────────────────────────────

-- account_balances simple (mig 9)
CREATE OR REPLACE VIEW public.account_balances
  WITH (security_invoker = TRUE)
AS
SELECT
  a.id AS account_id,
  a.initial_balance + COALESCE(SUM(t.amount), 0) AS current_balance
FROM public.accounts a
LEFT JOIN public.transactions t ON t.account_id = a.id
GROUP BY a.id, a.initial_balance;

-- holdings_valued (mig 20 — versión definitiva sin fallback avg_price_eur)
DROP VIEW IF EXISTS public.holdings_valued CASCADE;

CREATE VIEW public.holdings_valued
WITH (security_invoker = TRUE) AS
SELECT
  h.*,
  hp.close_original AS current_price_original,
  hp.close_eur      AS current_price_eur,
  hp.date           AS price_date,
  CASE
    WHEN hp.close_eur IS NOT NULL THEN h.quantity * hp.close_eur
    WHEN hp.close_original IS NOT NULL AND h.original_currency = 'EUR' THEN h.quantity * hp.close_original
    ELSE NULL
  END AS current_value_eur
FROM public.holdings h
LEFT JOIN LATERAL (
  SELECT close_original, close_eur, date
  FROM public.holding_prices
  WHERE
    (h.ticker IS NOT NULL AND ticker = h.ticker)
    OR
    (h.ticker IS NULL AND isin IS NOT DISTINCT FROM h.isin)
  ORDER BY date DESC
  LIMIT 1
) hp ON TRUE;

-- account_balances_full (mig 20 — incluye manual_holdings + is_active + sort_order)
DROP VIEW IF EXISTS public.account_balances_full CASCADE;

CREATE VIEW public.account_balances_full
WITH (security_invoker = TRUE) AS
SELECT
  a.id, a.name, a.institution, a.type, a.visibility,
  a.linked_account_id, a.initial_balance, a.is_active, a.sort_order,
  COALESCE((SELECT SUM(t.amount)
            FROM public.transactions t WHERE t.account_id = a.id), 0) AS transactions_sum,
  COALESCE((SELECT SUM(hv.current_value_eur)
            FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0)
  + COALESCE((SELECT SUM(mh.current_value_eur)
              FROM public.manual_holdings mh WHERE mh.account_id = a.id AND mh.is_active = TRUE), 0)
    AS holdings_value_eur,
  CASE
    WHEN a.type IN ('broker','investment') THEN
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((SELECT SUM(hv.current_value_eur) FROM public.holdings_valued hv WHERE hv.account_id = a.id), 0)
      + COALESCE((SELECT SUM(mh.current_value_eur) FROM public.manual_holdings mh WHERE mh.account_id = a.id AND mh.is_active = TRUE), 0)
    WHEN a.type = 'card' THEN
      -1 * (a.initial_balance + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0))
    ELSE
      a.initial_balance
      + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.account_id = a.id), 0)
  END AS current_balance
FROM public.accounts a;

-- patrimonio_neto (mig 20 — incluye stock_options_intrinsic)
DROP VIEW IF EXISTS public.patrimonio_neto CASCADE;

CREATE VIEW public.patrimonio_neto
WITH (security_invoker = TRUE) AS
WITH
  liq   AS (SELECT COALESCE(SUM(abf.current_balance), 0) AS v
             FROM public.account_balances_full abf
             JOIN public.accounts a ON a.id = abf.id WHERE a.is_active = TRUE),
  inm   AS (SELECT COALESCE(SUM(current_value), 0) AS v FROM public.assets WHERE is_active = TRUE),
  d_act AS (SELECT COALESCE(SUM(current_balance), 0) AS v FROM public.liabilities WHERE is_active = TRUE AND status = 'activa'),
  d_pry AS (SELECT COALESCE(SUM(current_balance), 0) AS v FROM public.liabilities WHERE is_active = TRUE AND status = 'proyectada'),
  so    AS (SELECT COALESCE(SUM(intrinsic_total), 0) AS v FROM public.stock_options_valued)
SELECT
  liq.v                              AS liquidos_y_holdings,
  inm.v                              AS inmuebles,
  liq.v + inm.v                      AS activos_total,
  d_act.v                            AS deudas_activas,
  d_pry.v                            AS deudas_proyectadas,
  liq.v + inm.v - d_act.v            AS patrimonio_neto_actual,
  liq.v + inm.v - d_act.v - d_pry.v AS patrimonio_neto_si_firmara_hoy,
  so.v                               AS stock_options_intrinsic
FROM liq, inm, d_act, d_pry, so;


-- ── 3.6 VERIFICACIÓN post-recreación ─────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('accounts','transactions','transaction_splits','classification_rules')
ORDER BY tablename;
-- → 4 filas

SELECT viewname FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('account_balances','account_balances_full','holdings_valued','patrimonio_neto')
ORDER BY viewname;
-- → 4 filas

-- Verificar que holdings siguen huérfanos (aún no remapeados — Fase 5)
SELECT COUNT(*) AS holdings_huerfanos
FROM public.holdings
WHERE account_id NOT IN (SELECT id FROM public.accounts);
-- → 19 (hasta que ejecutes Fase 5 reseed + remap)
