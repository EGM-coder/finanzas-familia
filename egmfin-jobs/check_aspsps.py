#!/usr/bin/env python3
"""
check_aspsps.py — Diagnostico: que ASPSPs expone Enable Banking para unos
paises dados, y estan ciertos bancos entre ellos? Lectura pura. NO toca DB.
Reutiliza el auth JWT RS256 de sync_psd2.py (mismas env vars del .env).

Uso:
    python3 check_aspsps.py
    python3 check_aspsps.py --countries ES,NL,FR --terms "bunq,renault"
"""
import os
import argparse
from datetime import datetime, timezone, timedelta
import requests
from jose import jwt
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.getenv('ENABLE_BANKING_APPLICATION_ID')
PRIVATE_KEY = os.getenv('ENABLE_BANKING_JWT_PRIVATE_KEY')
EB_BASE_URL = 'https://api.enablebanking.com'

DEFAULT_COUNTRIES = ['ES', 'NL', 'FR', 'DE']
DEFAULT_TERMS = ['bunq', 'renault', 'n26', 'revolut', 'openbank', 'trade republic', 'myinvestor']


def sign_jwt() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        'iss': 'enablebanking.com',
        'aud': 'api.enablebanking.com',
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, PRIVATE_KEY, algorithm='RS256',
                      headers={'kid': APP_ID, 'typ': 'JWT'})


def eb_get(path, params=None):
    token = sign_jwt()
    resp = requests.get(f'{EB_BASE_URL}{path}',
                        headers={'Authorization': f'Bearer {token}'},
                        params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--countries', default=','.join(DEFAULT_COUNTRIES))
    ap.add_argument('--terms', default=','.join(DEFAULT_TERMS))
    args = ap.parse_args()
    countries = [c.strip().upper() for c in args.countries.split(',') if c.strip()]
    terms = [t.strip().lower() for t in args.terms.split(',') if t.strip()]

    if not APP_ID or not PRIVATE_KEY:
        print('ERROR: faltan ENABLE_BANKING_APPLICATION_ID o ENABLE_BANKING_JWT_PRIVATE_KEY en .env')
        raise SystemExit(1)

    found = {t: [] for t in terms}
    for country in countries:
        data = eb_get('/aspsps', params={'country': country})
        aspsps = data.get('aspsps', [])
        print(f'\n=== {country}: {len(aspsps)} ASPSPs ===')
        for a in aspsps:
            nlow = (a.get('name') or '').lower()
            for t in terms:
                if t in nlow:
                    found[t].append((country, a))

    print('\n\n========== VEREDICTO ==========')
    for t in terms:
        matches = found[t]
        if matches:
            print(f'\n[FOUND] "{t}" -> {len(matches)} coincidencia(s):')
            for country, a in matches:
                print(f'  - {country} | {a.get("name")} | psu_types={a.get("psu_types")} '
                      f'| beta={a.get("beta")} | sandbox={a.get("sandbox")} '
                      f'| max_consent={a.get("maximum_consent_validity")}')
        else:
            print(f'\n[NOT FOUND] "{t}" - no aparece en {countries}')


if __name__ == '__main__':
    main()
