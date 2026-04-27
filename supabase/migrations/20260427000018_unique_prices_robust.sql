-- Migración 18 — UNIQUE robusto en holding_prices con NULLs
-- Resuelve P-005. La constraint UNIQUE(ticker,isin,date) no protege con NULLs,
-- causando duplicados que infectan la valoración de holdings.
--
-- Afecta a P-006 (precio NDX1.DE manual coexiste con yahoo, hay que elegir uno).

-- 1. Limpiar duplicados — conservar el más reciente por (ticker, isin, date)
DELETE FROM public.holding_prices a
USING public.holding_prices b
WHERE a.created_at < b.created_at
  AND COALESCE(a.ticker, '') = COALESCE(b.ticker, '')
  AND COALESCE(a.isin, '') = COALESCE(b.isin, '')
  AND a.date = b.date;

-- 2. Drop constraint anterior (no protege con NULLs)
ALTER TABLE public.holding_prices
  DROP CONSTRAINT IF EXISTS holding_prices_ticker_isin_date_key;

-- 3. Índice único robusto
CREATE UNIQUE INDEX holding_prices_unique_idx
  ON public.holding_prices (
    COALESCE(ticker, ''),
    COALESCE(isin, ''),
    date
  );
