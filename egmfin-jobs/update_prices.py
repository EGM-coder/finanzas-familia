"""
EGMFin · update_prices.py · 04-may-2026
Restaurado tras incidente Copilot.

Fixes vs v anterior:
  · ISIN_MAP IE0032620787 → IE0032620787.IR (formato ISIN.IR de Yahoo
    para fondos UCITS irlandeses; confirmado 73.34 EUR el 04-may).
  · UPSERT → DELETE + INSERT en holding_prices porque el índice único
    es sobre expresiones COALESCE() y PostgREST no acepta on_conflict
    sobre expresiones, solo columnas planas.
  · P-010 (05-may-2026): get_unique_holdings incluye stock_options.
    NDX1.DE añadido a TICKER_MAP. Lógica equivalente al commit 5f36e9b
    perdido en incidente Copilot.

Lectura de tickers desde holdings (is_active=TRUE) + stock_options (todos).
Escribe holding_prices y currency_rates con source='yahoo'.
"""

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
    "MC":    "MC.PA",
    "RMS":   "RMS.PA",
    "RACE":  "RACE.MI",
    "REP":   "REP.MC",
    "NVDA":  "NVDA",
    "BRK.B": "BRK-B",
    "NKE":   "NKE",
    "BTC":   "BTC-EUR",
    "VHYL":  "VHYL.AS",
    "ADBE":  "ADBE",
    "CCL":   "CCL",
    "DXCM":  "DXCM",
    "MSFT":  "MSFT",
    "RIVN":  "RIVN",
    "NDX1":  "NDX1.DE",   # P-010: stock_options Nordex (XETRA)
}

ISIN_MAP = {
    "IE0032620787": "IE0032620787.IR",  # Vanguard U.S. 500 Stock Index Fund EUR Acc
}


def get_unique_holdings():
    seen = set()
    out = []

    # Fuente 1: holdings activos
    res = (
        sb.table("holdings")
        .select("ticker, isin, original_currency")
        .eq("is_active", True)
        .execute()
    )
    for h in res.data:
        key = (h["ticker"], h["isin"])
        if key not in seen:
            seen.add(key)
            out.append({
                "ticker": h["ticker"],
                "isin": h["isin"],
                "currency": h["original_currency"],
            })

    # Fuente 2: stock_options (P-010)
    # ticker = NDX1, isin = NULL, cotiza en EUR (XETRA via NDX1.DE)
    res_so = sb.table("stock_options").select("ticker").execute()
    for so in res_so.data:
        ticker = so.get("ticker")
        if not ticker:
            continue
        key = (ticker, None)
        if key not in seen:
            seen.add(key)
            out.append({
                "ticker": ticker,
                "isin": None,
                "currency": "EUR",
            })

    return out


def fetch_eur_rate(currency):
    if currency == "EUR":
        return Decimal("1.0")
    pair = f"{currency}EUR=X"
    try:
        t = yf.Ticker(pair)
        info = t.history(period="5d")
        if info.empty:
            return None
        rate = Decimal(str(info["Close"].iloc[-1]))
        # currency_rates SÍ tiene UNIQUE plano sobre (date, from_currency, to_currency)
        sb.table("currency_rates").upsert({
            "date": TODAY,
            "from_currency": currency,
            "to_currency": "EUR",
            "rate": float(rate),
            "source": "yahoo",
        }, on_conflict="date,from_currency,to_currency").execute()
        return rate
    except Exception as e:
        print(f"  Error tipo cambio {currency}: {e}")
        return None


def fetch_price(ticker, isin, currency):
    yahoo_ticker = TICKER_MAP.get(ticker) if ticker else ISIN_MAP.get(isin)
    if not yahoo_ticker:
        return None, None, f"sin mapeo ({ticker}/{isin})"

    try:
        t = yf.Ticker(yahoo_ticker)
        # period 5d para cubrir fines de semana y fondos UCITS con liquidez T+1/T+2
        hist = t.history(period="5d")
        if hist.empty:
            return None, None, "sin datos"
        close = Decimal(str(hist["Close"].iloc[-1]))

        # Caso especial: BTC-EUR ya viene en EUR
        if yahoo_ticker.endswith("-EUR"):
            return close, close, None

        rate = fetch_eur_rate(currency)
        if rate is None:
            return close, None, "sin tipo cambio"
        close_eur = close * rate
        return close, close_eur, None

    except Exception as e:
        return None, None, str(e)


def upsert_holding_price(ticker, isin, close_orig, close_eur, currency):
    """
    DELETE + INSERT en lugar de UPSERT.
    El índice único en holding_prices es sobre expresiones:
      (COALESCE(ticker,''), COALESCE(isin,''), date)
    PostgREST no acepta on_conflict con expresiones, solo columnas.
    """
    del_q = sb.table("holding_prices").delete().eq("date", TODAY)
    if ticker is not None:
        del_q = del_q.eq("ticker", ticker)
    else:
        del_q = del_q.is_("ticker", "null")
    if isin is not None:
        del_q = del_q.eq("isin", isin)
    else:
        del_q = del_q.is_("isin", "null")
    del_q.execute()

    sb.table("holding_prices").insert({
        "ticker": ticker,
        "isin": isin,
        "date": TODAY,
        "close_original": float(close_orig),
        "currency": currency,
        "close_eur": float(close_eur) if close_eur else None,
        "source": "yahoo",
    }).execute()


def main():
    print(f"=== EGMFin update precios {TODAY} ===\n")
    holdings = get_unique_holdings()
    print(f"Holdings unicos: {len(holdings)}\n")

    inserted = 0
    skipped = 0
    errors = 0

    for h in holdings:
        ticker = h["ticker"]
        isin = h["isin"]
        currency = h["currency"]
        label = ticker or isin or "?"

        close_orig, close_eur, err = fetch_price(ticker, isin, currency)

        if err:
            print(f"  X {label:14s}  {err}")
            skipped += 1
            continue

        try:
            upsert_holding_price(ticker, isin, close_orig, close_eur, currency)
        except Exception as e:
            print(f"  ! {label:14s}  insert fallo: {e}")
            errors += 1
            continue

        eur_str = f"{float(close_eur):.2f}EUR" if close_eur else "-"
        print(f"  OK {label:14s}  {float(close_orig):>10.2f} {currency} -> {eur_str}")
        inserted += 1

    print(f"\nResumen: {inserted} actualizados, {skipped} sin datos, {errors} errores\n")


if __name__ == "__main__":
    main()