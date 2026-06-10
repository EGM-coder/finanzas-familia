#!/usr/bin/env python3
"""
check_aspsps.py — Diagnóstico puntual: ¿qué ASPSPs expone Enable Banking
para unos países dados, y están Trade Republic / MyInvestor entre ellos?

Lectura pura contra la API de Enable Banking. NO toca Supabase ni la DB.
Reutiliza el mismo auth JWT RS256 que sync_psd2.py (mismas env vars del .env).

Uso:
    cd egmfin-jobs
    python3 check_aspsps.py
"""
import os
import json
from datetime import datetime, timezone, timedelta
import requests
from jose import jwt
from dotenv import load_dotenv

load_dotenv()

APP_ID = os.getenv('ENABLE_BANKING_APPLICATION_ID')
PRIVATE_KEY = os.getenv('ENABLE_BANKING_JWT_PRIVATE_KEY')
EB_BASE_URL = 'https://api.enablebanking.com'

COUNTRIES = ['ES', 'DE']
SEARCH_TERMS = ['trade republic', 'myinvestor']


def sign_jwt() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        'iss': 'enablebanking.com',
        'aud': 'api.enablebanking.com',
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(
        payload, PRIVATE_KEY, algorithm='RS256',
        headers={'kid': APP_ID, 'typ': 'JWT'}
    )


def eb_get(path, params=None):
    token = sign_jwt()
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.get(f'{EB_BASE_URL}{path}', headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main():
    if not APP_ID or not PRIVATE_KEY:
        print('ERROR: faltan ENABLE_BANKING_APPLICATION_ID o ENABLE_BANKING_JWT_PRIVATE_KEY en .env')
        raise SystemExit(1)

    found = {term: [] for term in SEARCH_TERMS}

    for country in COUNTRIES:
        data = eb_get('/aspsps', params={'country': country})
        aspsps = data.get('aspsps', [])
        print(f'\n=== {country}: {len(aspsps)} ASPSPs ===')
        for a in aspsps:
            nl = (a.get('name') or '').lower()
            for term in SEARCH_TERMS:
                if term in nl:
                    found[term].append((country, a))

    print('\n\n========== VEREDICTO ==========')
    for term in SEARCH_TERMS:
        matches = found[term]
        if matches:
            print(f'\n[FOUND] "{term}" -> {len(matches)} coincidencia(s):')
            for country, a in matches:
                print(f'  - {country} | {a.get("name")} | psu_types={a.get("psu_types")} '
                      f'| beta={a.get("beta")} | sandbox={a.get("sandbox")} '
                      f'| max_consent={a.get("maximum_consent_validity")}')
                print('    detalle:', json.dumps(a, ensure_ascii=False)[:600])
        else:
            print(f'\n[NOT FOUND] "{term}" - no aparece en {COUNTRIES}')


if __name__ == '__main__':
    main()
