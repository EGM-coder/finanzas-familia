#!/usr/bin/env python3
"""
list_eb_accounts.py — Lista cuentas disponibles en Enable Banking para sesiones activas.
Output: UIDs + IBANs + detalles para linkage manual posterior.
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

SESSIONS = {
    'Kutxabank':       '078ef6b5-3b3a-4a99-adf3-35bc32593c05',
    'Banco Santander': 'b45fd77d-865f-41dd-8285-60a0c7e8c3d9',
}

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

def eb_get(path: str) -> dict:
    token = sign_jwt()
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.get(f'{EB_BASE_URL}{path}', headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()

if __name__ == '__main__':
    for bank, session_id in SESSIONS.items():
        print(f'\n{"="*60}\n  {bank}  (session: {session_id[:8]}...)\n{"="*60}')
        try:
            # Step 1: Lista UIDs de cuentas
            sess = eb_get(f'/sessions/{session_id}')
            uids = sess.get('accounts', [])
            print(f'Total cuentas: {len(uids)}\n')

            # Step 2: Detalles de cada cuenta
            for i, uid in enumerate(uids, 1):
                print(f'  [{i}] UID: {uid}')
                try:
                    detail = eb_get(f'/accounts/{uid}/details')
                    print(f'      IBAN: {detail.get("account_id", {}).get("iban", "N/A")}')
                    print(f'      Currency: {detail.get("currency", "N/A")}')
                    print(f'      Name: {detail.get("name", "N/A")}')
                    print(f'      Product: {detail.get("product", "N/A")}')
                    print(f'      Type: {detail.get("cash_account_type", "N/A")}')
                except requests.HTTPError as e:
                    print(f'      ❌ ERROR detail {e.response.status_code}: {e.response.text}')
                print()
        except requests.HTTPError as e:
            print(f'❌ ERROR {e.response.status_code}: {e.response.text}')
        except Exception as e:
            print(f'❌ {type(e).__name__}: {e}')
