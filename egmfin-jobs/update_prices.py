import os
import sys
from datetime import date
from decimal import Decimal
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
TODAY = date.today().isoformat()

TICKER_MAP = {
    "MC": "MC.PA",
    "RMS": "RMS.PA",
    "RACE": "RACE.MI",
    "REP": "REP.MC",
    "NVDA": "NVDA",
    "BRK.B": "BRK-B",
    "NKE": "NKE",
    "BTC": "BTC-EUR",
    "VHYL": "VHYL.AS",
    "ADBE": "ADBE",
    "CCL": "CCL",
    "DXCM": "DXCM",
    "MSFT": "MSFT",
    "RIVN": "RIVN",
}

ISIN_MAP = {
    "IE0032620787": "IE0032620787.IR",
}


def get_unique_tickers():
    res_h = sb.table("holdings").select("ticker, isin, original_currency").eq("is_active", True).execute()
    res_so = sb.table("stock_options").select("ticker, currency").eq("is_active", True).execute()

    seen = set()
    out = []

    for h in res_h.data:
        key = (h["ticker"], h["isin"])
        if key not in seen:
            seen.add(key)
            out.append({
                "ticker": h["ticker"],
                "isin": h["isin"],
                "currency": h["original_currency"]
            })

    for so in res_so.data:
        key = (so["ticker"], None)
        if key not in seen:
            seen.add(key)
            out.append({
                "ticker": so["ticker"],
                "isin": None,
                "currency": so["currency"]
            })

    return out


def fetch_eur_rate(currency):
    if currency == "EUR":
        return Decimal("1.0")
    pair = f"{currency}EUR=X"
    try:
        t = yf.Ticker(pair)
        info = t.history(period="1d")
        if info.empty:
            return None
        rate = Decimal(str(info["Close"].iloc[-1]))
        sb.table("currency_rates").upsert({
            "date": TODAY,
            "from_currency": currency,
            "to_currency": "EUR",
            "rate": float(rate)
        }, on_conflict="date,from_currency,to_currency").execute()
        return rate
    except Exception as e:
        print(f"  Error tipo cambio {currency}: {e}")
        return None


def fetch_price(ticker, isin, currency):
    if ticker:
        yahoo_ticker = TICKER_MAP.get(ticker, ticker)
    else:
        yahoo_ticker = ISIN_MAP.get(isin) if isin else None
    if not yahoo_ticker:
        return None, None, f"sin mapeo ({ticker}/{isin})"

    try:
        t = yf.Ticker(yahoo_ticker)
        hist = t.history(period="5d")
        if hist.empty:
            return None, None, "sin datos"
        close = Decimal(str(hist["Close"].iloc[-1]))

        if yahoo_ticker.endswith("-EUR"):
            return close, close, None

        rate = fetch_eur_rate(currency)
        if rate is None:
            return close, None, "sin tipo cambio"
        close_eur = close * rate
        return close, close_eur, None

    except Exception as e:
        return None, None, str(e)


def main():
    print(f"=== EGMFin update precios {TODAY} ===\n")
    holdings = get_unique_tickers()
    print(f"Tickers unicos: {len(holdings)}\n")

    inserted = 0
    skipped = 0

    for h in holdings:
        ticker = h["ticker"]
        isin = h["isin"]
        currency = h["currency"]
        label = ticker or isin or "?"

        close_orig, close_eur, err = fetch_price(ticker, isin, currency)

        if err:
            print(f"  X {label:8s}  {err}")
            skipped += 1
            continue

        sb.table("holding_prices").upsert({
            "ticker": ticker,
            "isin": isin,
            "date": TODAY,
            "close_original": float(close_orig),
            "currency": currency,
            "close_eur": float(close_eur) if close_eur else None,
            "source": "yahoo"
        }, on_conflict="ticker,isin,date").execute()

        eur_str = f"{float(close_eur):.2f}EUR" if close_eur else "-"
        print(f"  OK {label:8s}  {float(close_orig):>10.2f} {currency} -> {eur_str}")
        inserted += 1

    print(f"\nResumen: {inserted} actualizados, {skipped} sin datos\n")


if __name__ == "__main__":
    main()
