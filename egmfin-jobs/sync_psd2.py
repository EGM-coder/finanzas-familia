#!/usr/bin/env python3
"""
sync_psd2.py — Sincronización de transacciones PSD2 desde Enable Banking a Supabase.

Cron: Diario tras update_prices (~UTC 22:35)

Flujo:
1. Lee conexiones activas de bank_connections
2. Para cada conexión: GET /sessions/{id}/accounts/{uid}/transactions y /balances
3. Upsert transacciones en tabla transactions (source='psd2')
4. Update last_sync_at en bank_account_links
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional
import requests
from jose import jwt
import uuid

# Supabase
import supabase

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Environment
ENABLE_BANKING_APPLICATION_ID = os.getenv('ENABLE_BANKING_APPLICATION_ID')
ENABLE_BANKING_JWT_PRIVATE_KEY = os.getenv('ENABLE_BANKING_JWT_PRIVATE_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

EB_BASE_URL = 'https://api.enablebanking.com/v1'
CONSENT_VALID_BUFFER = 60  # segundos de margen

# Supabase client (service role para escritura)
sb = supabase.create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def sign_jwt(session_id: str) -> str:
    """
    Firma JWT RS256 con Enable Banking.
    """
    payload = {
        'iss': ENABLE_BANKING_APPLICATION_ID,
        'sub': session_id,
        'aud': 'https://api.enablebanking.com/v1',
        'iat': int(datetime.now(timezone.utc).timestamp()),
        'exp': int(datetime.now(timezone.utc).timestamp()) + 3600,
    }
    token = jwt.encode(
        payload,
        ENABLE_BANKING_JWT_PRIVATE_KEY,
        algorithm='RS256'
    )
    return token


def eb_fetch(endpoint: str, session_id: str, method: str = 'GET', data: Optional[dict] = None) -> dict:
    """
    Wrapper para llamadas autenticadas a Enable Banking.
    """
    token = sign_jwt(session_id)
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    
    url = f'{EB_BASE_URL}{endpoint}'
    
    try:
        if method == 'GET':
            resp = requests.get(url, headers=headers, timeout=30)
        elif method == 'POST':
            resp = requests.post(url, json=data, headers=headers, timeout=30)
        else:
            raise ValueError(f'Método {method} no soportado')
        
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.error(f'Error en EB API ({method} {endpoint}): {e}')
        return {}


def sync_psd2():
    """
    Sincroniza transacciones PSD2.
    """
    logger.info('🔄 Iniciando sincronización PSD2...')
    
    # 1. Fetch conexiones activas
    try:
        response = sb.table('bank_connections').select('*').eq('status', 'active').execute()
        connections = response.data
        logger.info(f'✅ Encontradas {len(connections)} conexiones activas')
    except Exception as e:
        logger.error(f'❌ Error fetching bank_connections: {e}')
        return
    
    if not connections:
        logger.info('ℹ️  No hay conexiones activas para sincronizar')
        return
    
    # 2. Para cada conexión activa
    for conn in connections:
        conn_id = conn['id']
        session_id = conn['session_id']
        aspsp_name = conn['aspsp_name']
        
        logger.info(f'📤 Sincronizando {aspsp_name} (session={session_id[:8]}...)')
        
        # Verificar consent válido
        consent_valid_until = conn.get('consent_valid_until')
        if consent_valid_until:
            expiry = datetime.fromisoformat(consent_valid_until)
            now = datetime.now(timezone.utc)
            if (expiry - now).total_seconds() < CONSENT_VALID_BUFFER:
                logger.warning(f'⚠️  Consent expirado o próximo a expirar para {aspsp_name}')
                continue
        
        # 3. Fetch cuentas vinculadas a esta conexión
        try:
            acc_response = sb.table('bank_account_links').select('*').eq('bank_connection_id', conn_id).execute()
            accounts = acc_response.data
        except Exception as e:
            logger.error(f'❌ Error fetching accounts para conn {conn_id}: {e}')
            continue
        
        # 4. Para cada cuenta: fetch transacciones
        for acct in accounts:
            external_account_uid = acct['external_account_uid']
            acct_id = acct['id']
            
            logger.info(f'  📋 Cuenta {external_account_uid[:16]}...')
            
            # GET /sessions/{sessionId}/accounts/{uid}/transactions
            txn_data = eb_fetch(
                f'/sessions/{session_id}/accounts/{external_account_uid}/transactions',
                session_id
            )
            
            transactions = txn_data.get('transactions', [])
            logger.info(f'    Descargadas {len(transactions)} transacciones')
            
            # Upsert transacciones
            for txn in transactions:
                entry_ref = txn.get('entryReference', str(uuid.uuid4()))
                
                txn_record = {
                    'bank_account_link_id': acct_id,
                    'bank_connection_id': conn_id,
                    'external_id': entry_ref,
                    'source': 'psd2',
                    'booking_date': txn.get('bookingDate'),
                    'value_date': txn.get('valueDate'),
                    'amount': txn.get('transactionAmount', {}).get('amount', 0.0),
                    'currency': txn.get('transactionAmount', {}).get('currency', 'EUR'),
                    'description': txn.get('remittanceInformationUnstructured', 'N/A'),
                    'entry_reference': entry_ref,
                }
                
                try:
                    # Upsert (DELETE + INSERT debido a COALESCE en unique index)
                    sb.table('transactions').delete().eq('external_id', entry_ref).eq('source', 'psd2').execute()
                    sb.table('transactions').insert(txn_record).execute()
                except Exception as e:
                    logger.warning(f'    ⚠️  Error upserting txn {entry_ref}: {e}')
            
            # Update last_sync_at
            try:
                sb.table('bank_account_links').update({
                    'last_sync_at': datetime.now(timezone.utc).isoformat()
                }).eq('id', acct_id).execute()
            except Exception as e:
                logger.warning(f'    ⚠️  Error updating last_sync_at: {e}')
    
    logger.info('✅ Sincronización PSD2 completada')


if __name__ == '__main__':
    sync_psd2()
