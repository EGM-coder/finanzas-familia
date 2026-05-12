#!/usr/bin/env python3
"""
sync_psd2.py — Sincronización de transacciones PSD2 desde Enable Banking a Supabase.

Cron: Diario tras update_prices (~UTC 22:35)

Flujo:
1. Lee bank_account_links activos + bank_connections activas
2. Para cada cuenta: GET /accounts/{uid}/transactions desde Enable Banking
3. Mapea + upsert en tabla transactions (source='psd2', external_id idempotente)
4. Update last_sync_at en bank_account_links

Modo DRY_RUN: exporta DRY_RUN=1 para ver qué insertaría sin escribir a DB.
"""

import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import requests
from jose import jwt
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Environment
APP_ID = os.getenv('ENABLE_BANKING_APPLICATION_ID')
PRIVATE_KEY = os.getenv('ENABLE_BANKING_JWT_PRIVATE_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
DRY_RUN = os.getenv('DRY_RUN', '0') == '1'

EB_BASE_URL = 'https://api.enablebanking.com'

# Cuántos días atrás traer (en el primer run, 90 días)
DAYS_BACK = int(os.getenv('DAYS_BACK', '90'))

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def sign_jwt() -> str:
    """JWT RS256 app-level (no per-session)."""
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


def eb_get(path: str, params: Optional[dict] = None) -> dict:
    token = sign_jwt()
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.get(f'{EB_BASE_URL}{path}', headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_account_transactions(account_uid: str, days_back: int = 90) -> list:
    """Lista de transacciones (puede paginar)."""
    date_from = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y-%m-%d')
    params = {'date_from': date_from}

    all_txns = []
    continuation_key = None
    page = 0
    while True:
        page += 1
        if continuation_key:
            params['continuation_key'] = continuation_key
        data = eb_get(f'/accounts/{account_uid}/transactions', params=params)
        batch = data.get('transactions', [])
        all_txns.extend(batch)
        continuation_key = data.get('continuation_key')
        logger.info(f'    Página {page}: {len(batch)} txns (acumulado: {len(all_txns)})')
        if not continuation_key:
            break
        if page > 50:
            logger.warning('    ⚠️  Más de 50 páginas — abortando paginación')
            break
    return all_txns


def map_txn(txn: dict, account_id: str, bank_connection_id: str) -> dict:
    """Mapea txn de Enable Banking a estructura `transactions` de Supabase."""
    amt_obj = txn.get('transaction_amount', {})
    raw_amount = float(amt_obj.get('amount', 0))
    
    # Determinar signo (Enable Banking usa credit_debit_indicator)
    cdi = txn.get('credit_debit_indicator', 'CRDT')  # CRDT = ingreso, DBIT = gasto
    if cdi == 'DBIT':
        amount = -abs(raw_amount)
    else:
        amount = abs(raw_amount)

    # Descripción
    remittance = txn.get('remittance_information', [])
    description = '; '.join(remittance) if remittance else txn.get('reference_number', 'N/A')

    # Counterparty
    if cdi == 'DBIT':
        counterparty = (txn.get('creditor', {}) or {}).get('name', '')
    else:
        counterparty = (txn.get('debtor', {}) or {}).get('name', '')

    # ID único para idempotencia
    entry_ref = txn.get('entry_reference') or txn.get('transaction_id') or txn.get('reference_number', '')
    if not entry_ref:
        # Fallback: hash de campos clave
        import hashlib
        key = f"{txn.get('booking_date')}_{raw_amount}_{description}"
        entry_ref = hashlib.md5(key.encode()).hexdigest()

    return {
        'account_id': account_id,
        'bank_connection_id': bank_connection_id,
        'date': txn.get('booking_date') or txn.get('value_date'),
        'amount': amount,
        'currency': amt_obj.get('currency', 'EUR'),
        'description': description[:500] if description else None,
        'raw_concept': json.dumps(txn)[:2000],
        'titular': 'eric',
        'source': 'psd2',
        'source_id': entry_ref,
        'external_id': entry_ref,
        'counterparty': counterparty[:200] if counterparty else None,
        # nature: NULL (categorización manual posterior)
    }


def sync_psd2():
    mode = '🔬 DRY-RUN' if DRY_RUN else '🔄 LIVE'
    logger.info(f'{mode} Iniciando sincronización PSD2...')

    # Fetch cuentas linkeadas activas + conexiones activas
    response = sb.table('bank_account_links').select(
        'id, account_id, bank_connection_id, external_account_uid, external_iban, '
        'bank_connections(id, aspsp_name, status, consent_valid_until)'
    ).eq('is_active', True).execute()
    
    links = response.data
    logger.info(f'✅ {len(links)} cuentas linkeadas activas')

    if not links:
        logger.info('ℹ️  Nada que sincronizar')
        return

    total_txns = 0
    total_inserted = 0
    
    for link in links:
        conn = link['bank_connections']
        if conn['status'] != 'active':
            logger.warning(f"  ⚠️  Conexión {conn['aspsp_name']} no activa, skip")
            continue

        aspsp = conn['aspsp_name']
        uid = link['external_account_uid']
        account_id = link['account_id']
        bc_id = link['bank_connection_id']

        logger.info(f'📤 {aspsp} | cuenta {link["external_iban"]} (UID {uid[:8]}...)')

        try:
            txns = fetch_account_transactions(uid, days_back=DAYS_BACK)
        except Exception as e:
            logger.error(f'  ❌ Error fetching: {e}')
            continue

        logger.info(f'  📋 {len(txns)} txns descargadas en {DAYS_BACK} días')
        total_txns += len(txns)

        if DRY_RUN:
            # Mostrar primeras 3 como preview
            for txn in txns[:3]:
                mapped = map_txn(txn, account_id, bc_id)
                logger.info(f"    🔬 PREVIEW: {mapped['date']} | {mapped['amount']:8.2f} EUR | {mapped['description'][:60]}")
            logger.info(f'  🔬 DRY-RUN: NO se insertan (verían {len(txns)} registros)')
            continue

        # LIVE: insert real
        records = [map_txn(t, account_id, bc_id) for t in txns]
        
        # Idempotencia: DELETE+INSERT por external_id (PostgREST + COALESCE workaround)
        inserted_here = 0
        for rec in records:
            try:
                sb.table('transactions').delete().eq('external_id', rec['external_id']).eq('source', 'psd2').execute()
                sb.table('transactions').insert(rec).execute()
                inserted_here += 1
            except Exception as e:
                logger.warning(f"    ⚠️  Error en {rec['external_id']}: {e}")
        
        total_inserted += inserted_here
        logger.info(f'  ✅ {inserted_here} txns insertadas')

        # last_sync_at
        sb.table('bank_account_links').update({
            'last_sync_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', link['id']).execute()

    logger.info(f'✅ Sync completada · {total_txns} descargadas · {total_inserted} insertadas')


if __name__ == '__main__':
    sync_psd2()
