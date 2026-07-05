"""
EGMFin · backfill_prices_history.py · 05-jul-2026
One-off: reconstruye holding_prices desde 2026-02-01 con fechas reales de cierre.

Pasos:
  1. Descarga USD/EUR diario (único par FX necesario).
  2. Por cada ticker/ISIN: borra el rango existente en BD e inserta el histórico
     de Yahoo con la fecha real del índice (no la fecha de ejecución).
     close_eur = NULL si falta el tipo de cambio del día (se reporta al final).
  3. DELETE autorizado: purga filas fecha fin-de-semana para tickers no-BTC
     (BTC e IE0032620787 tienen datos legítimos en fin de semana).

No registrar como cron; ejecutar UNA SOLA VEZ.
"""

import os
import sys
import time
from datetime import date, timedelta

import yfinance as yf
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

START_DATE = "2026-02-01"
TODAY      = date.today().isoformat()
BATCH_SIZE = 200

# ── Mapas idénticos a update_prices.py ──────────────────────────────────────
TICKER_MAP = {
    "MC":      "MC.PA",
    "RMS":     "RMS.PA",
    "RACE":    "RACE.MI",
    "REP":     "REP.MC",
    "NVDA":    "NVDA",
    "BRK.B":   "BRK-B",
    "NKE":     "NKE",
    "BTC":     "BTC-EUR",
    "VHYL":    "VHYL.AS",
    "ADBE":    "ADBE",
    "CCL":     "CCL",
    "DXCM":    "DXCM",
    "MSFT":    "MSFT",
    "RIVN":    "RIVN",
    "NDX1.DE": "NDX1.DE",
}

ISIN_MAP = {
    "IE0032620787": "IE0032620787.IR",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_holdings():
    """Lee ticker/ISIN/moneda desde la BD (misma lógica que update_prices.py)."""
    seen, out = set(), []
    for h in sb.table("holdings").select("ticker,isin,original_currency") \
               .eq("is_active", True).execute().data:
        key = (h["ticker"], h["isin"])
        if key not in seen:
            seen.add(key)
            out.append(h)
    for so in sb.table("stock_options").select("ticker").execute().data:
        t = so.get("ticker")
        if t:
            key = (t, None)
            if key not in seen:
                seen.add(key)
                out.append({"ticker": t, "isin": None, "original_currency": "EUR"})
    return out


def fetch_fx_history(currency) -> dict:
    """Devuelve {date_str: float} para currency→EUR. EUR → {}."""
    if currency == "EUR":
        return {}
    pair = f"{currency}EUR=X"
    try:
        hist = yf.Ticker(pair).history(start=START_DATE)
        if hist.empty:
            print(f"  WARN: sin historial FX para {pair}")
            return {}
        rates = {ts.date().isoformat(): float(row["Close"])
                 for ts, row in hist.iterrows()}
        print(f"  FX {pair}: {len(rates)} días  "
              f"({min(rates)} → {max(rates)})")
        return rates
    except Exception as e:
        print(f"  WARN: error FX {pair}: {e}")
        return {}


def fetch_ticker_history(yahoo_symbol):
    """Descarga histórico desde START_DATE. Devuelve dict {date_str: close}."""
    try:
        hist = yf.Ticker(yahoo_symbol).history(start=START_DATE)
        if hist.empty:
            return {}
        return {ts.date().isoformat(): float(row["Close"])
                for ts, row in hist.iterrows()}
    except Exception as e:
        print(f"    ERROR yfinance {yahoo_symbol}: {e}")
        return {}


def delete_range(ticker, isin):
    """Borra todas las filas de holding_prices en [START_DATE, TODAY] para ticker/isin."""
    q = sb.table("holding_prices").delete().gte("date", START_DATE).lte("date", TODAY)
    if ticker is not None:
        q = q.eq("ticker", ticker)
    else:
        q = q.is_("ticker", "null")
    if isin is not None:
        q = q.eq("isin", isin)
    else:
        q = q.is_("isin", "null")
    q.execute()


def insert_rows(rows):
    for i in range(0, len(rows), BATCH_SIZE):
        sb.table("holding_prices").insert(rows[i:i + BATCH_SIZE]).execute()


def backfill_one(ticker, isin, yahoo_symbol, currency, fx_rates) -> tuple:
    """
    Backfill completo para un ticker/isin.
    Devuelve (n_rows_inserted, [fechas_sin_fx]).
    """
    prices = fetch_ticker_history(yahoo_symbol)
    if not prices:
        return 0, []

    is_eur_pair = yahoo_symbol.endswith("-EUR")
    rows        = []
    missing_fx  = []

    for d, close_orig in prices.items():
        if is_eur_pair or not fx_rates:
            close_eur = close_orig
        else:
            rate = fx_rates.get(d)
            if rate is None:
                close_eur = None
                missing_fx.append(d)
            else:
                close_eur = close_orig * rate

        rows.append({
            "ticker":         ticker,
            "isin":           isin,
            "date":           d,
            "close_original": close_orig,
            "currency":       currency,
            "close_eur":      close_eur,
            "source":         "yahoo",
        })

    delete_range(ticker, isin)
    insert_rows(rows)
    return len(rows), missing_fx


# ── Purga de fines de semana (operación destructiva autorizada) ──────────────

def purge_weekends():
    """
    DELETE autorizado explícitamente: elimina holding_prices con fecha
    sábado/domingo para tickers que NO sean BTC ni isin IE0032620787
    (ambos tienen datos de fin de semana legítimos).
    """
    start = date.fromisoformat(START_DATE)
    end   = date.fromisoformat(TODAY)
    weekends = [
        (start + timedelta(n)).isoformat()
        for n in range((end - start).days + 1)
        if (start + timedelta(n)).weekday() in (5, 6)
    ]
    if not weekends:
        return 0

    # Lote 1: tickers no-NULL, no-BTC
    sb.table("holding_prices").delete() \
        .in_("date", weekends) \
        .not_.is_("ticker", "null") \
        .neq("ticker", "BTC") \
        .execute()

    # Lote 2: ISIN-based (NULL ticker), excluyendo IE0032620787
    # IE0032620787 es fondo con NAV diario → puede tener datos fin de semana legítimos
    # Si no los tiene en Yahoo, el backfill no los habrá insertado; este delete es no-op.
    # Si los tiene, los dejamos. Solo borramos ISINs no conocidos (no hay otros ahora).
    # → NO purgar ticker=NULL para no afectar IE0032620787.

    return len(weekends)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"=== backfill_prices_history.py  {START_DATE} → {TODAY} ===\n")
    holdings = get_holdings()
    print(f"Holdings en BD: {len(holdings)}\n")

    # Pre-cargar tipos de cambio (solo USD necesario hoy)
    currencies_needed = set()
    for h in holdings:
        ticker = h["ticker"]
        isin   = h.get("isin")
        yahoo  = TICKER_MAP.get(ticker) if ticker else ISIN_MAP.get(isin)
        if yahoo and not yahoo.endswith("-EUR") and h["original_currency"] != "EUR":
            currencies_needed.add(h["original_currency"])

    print("Descargando tipos de cambio ...")
    fx_cache = {}
    for currency in sorted(currencies_needed):
        fx_cache[currency] = fetch_fx_history(currency)
    print()

    # Backfill por ticker
    total_inserted  = 0
    all_missing_fx  = {}
    errors          = []

    for h in holdings:
        ticker   = h["ticker"]
        isin     = h.get("isin")
        currency = h["original_currency"]
        label    = ticker or isin or "?"
        yahoo    = TICKER_MAP.get(ticker) if ticker else ISIN_MAP.get(isin)

        if not yahoo:
            print(f"  SKIP {label:20s}  sin mapeo")
            continue

        fx = fx_cache.get(currency, {})
        n, missing = backfill_one(ticker, isin, yahoo, currency, fx)

        if n == 0:
            print(f"  EMPTY {label:19s}  sin datos de Yahoo")
            errors.append(label)
        else:
            total_inserted += n
            if missing:
                all_missing_fx[label] = missing
                print(f"  OK {label:20s}  {n:4d} filas  WARN {len(missing)} fechas sin FX")
            else:
                print(f"  OK {label:20s}  {n:4d} filas")

        time.sleep(0.4)  # cortesía con Yahoo

    print(f"\nTotal filas insertadas: {total_inserted}")

    if all_missing_fx:
        print("\nFechas sin tipo de cambio (close_eur=NULL):")
        for t, dates in all_missing_fx.items():
            print(f"  {t}: {', '.join(dates[:5])}{'...' if len(dates) > 5 else ''}")

    if errors:
        print(f"\nERROR: tickers sin datos de Yahoo: {', '.join(errors)}")

    # ── Purga de fines de semana (DELETE autorizado) ─────────────────────────
    print("\nPurgando fechas fin-de-semana (no-BTC) ...")
    n_weekends = purge_weekends()
    print(f"  Purga ejecutada sobre {n_weekends} fechas fin-de-semana.\n")

    if errors:
        sys.exit(1)

    print("=== Backfill completado. ===")


if __name__ == "__main__":
    main()
