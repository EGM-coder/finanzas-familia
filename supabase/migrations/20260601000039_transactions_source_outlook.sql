-- mig-39 · Ampliar CHECK transactions.source con outlook_parse

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_source_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_check
    CHECK (source IN (
      'manual',
      'csv',
      'psd2',
      'gmail_parse',
      'outlook_parse'
    ));
