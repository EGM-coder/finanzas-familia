#!/usr/bin/env python3
"""
parse_orders_outlook.py — Parseo de confirmaciones Amazon/PayPal desde Outlook/Microsoft 365.

T-021: Parser Outlook · confirmaciones Amazon + PayPal.

Auth: OUTLOOK_CLIENT_ID (Azure App Registration, flujo Device Code público)
      OUTLOOK_TOKEN_PATH (default ~/.secrets/outlook_token.json)
DRY_RUN=1 → muestra sin escribir a BD.
DAYS_BACK_EMAIL=90 → rango de búsqueda.

Los parsers de email (Amazon + PayPal) y las funciones de BD se importan
desde parse_orders_gmail para evitar duplicación de lógica.
"""

import os
import json
import logging
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv

try:
    import msal
    import requests
except ImportError:
    print("ERROR: pip install msal requests")
    sys.exit(1)

# Importar parsers y funciones BD desde el módulo Gmail
# (run() solo se llama en __main__, import seguro)
from parse_orders_gmail import (
    parse_amazon_email,
    parse_paypal_email,
    _clean_html,
    parse_email_date,
    load_categories,
    order_already_imported,
    insert_order_and_lines,
    propose_transaction_match,
    sb,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

OUTLOOK_CLIENT_ID  = os.getenv('OUTLOOK_CLIENT_ID')
OUTLOOK_TOKEN_PATH = os.getenv('OUTLOOK_TOKEN_PATH',
                         os.path.expanduser('~/.secrets/outlook_token.json'))
DRY_RUN            = os.getenv('DRY_RUN', '0') == '1'
DAYS_BACK_EMAIL    = int(os.getenv('DAYS_BACK_EMAIL', '90'))

GRAPH_SCOPES = ['https://graph.microsoft.com/Mail.Read']
GRAPH_BASE   = 'https://graph.microsoft.com/v1.0'


# ── Auth ────────────────────────────────────────────────────

def _load_cached_token() -> Optional[dict]:
    if os.path.exists(OUTLOOK_TOKEN_PATH):
        try:
            with open(OUTLOOK_TOKEN_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return None


def _save_token(token: dict):
    os.makedirs(os.path.dirname(OUTLOOK_TOKEN_PATH), exist_ok=True)
    with open(OUTLOOK_TOKEN_PATH, 'w') as f:
        json.dump(token, f)
    os.chmod(OUTLOOK_TOKEN_PATH, 0o600)


def get_access_token() -> str:
    if not OUTLOOK_CLIENT_ID:
        logger.error('❌ OUTLOOK_CLIENT_ID no configurado en .env')
        sys.exit(1)

    app = msal.PublicClientApplication(
        client_id=OUTLOOK_CLIENT_ID,
        authority='https://login.microsoftonline.com/consumers',
    )

    # Intento silencioso con cuentas cacheadas por MSAL
    cached = _load_cached_token()
    if cached:
        accounts = app.get_accounts()
        if accounts:
            result = app.acquire_token_silent(GRAPH_SCOPES, account=accounts[0])
            if result and 'access_token' in result:
                _save_token(result)
                return result['access_token']

    # Device Code flow — imprime código para pegar en microsoft.com/devicelogin
    flow = app.initiate_device_flow(scopes=GRAPH_SCOPES)
    if 'user_code' not in flow:
        logger.error(f'❌ No se pudo iniciar device flow: {flow}')
        sys.exit(1)

    print('\n' + flow['message'])
    print('Esperando autenticación...\n')
    result = app.acquire_token_by_device_flow(flow)

    if 'access_token' not in result:
        logger.error(f'❌ Auth fallida: {result.get("error_description", result)}')
        sys.exit(1)

    _save_token(result)
    return result['access_token']


# ── Búsqueda vía Microsoft Graph ────────────────────────────

OUTLOOK_FILTERS = [
    ("from/emailAddress/address eq 'auto-confirm@amazon.es'",  'amazon'),
    ("from/emailAddress/address eq 'auto-confirm@amazon.com'", 'amazon'),
    ("from/emailAddress/address eq 'servicio@paypal.es'",      'paypal'),
    ("from/emailAddress/address eq 'service@paypal.com'",      'paypal'),
    ("from/emailAddress/address eq 'service@intl.paypal.com'", 'paypal'),
]


def search_emails(token: str, days_back: int) -> list[dict]:
    after = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y-%m-%dT00:00:00Z')
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    seen, result = set(), []

    for odata_filter, _ in OUTLOOK_FILTERS:
        full_filter = f"({odata_filter}) and receivedDateTime ge {after}"
        params = {
            '$filter': full_filter,
            '$select': 'id,subject,from,receivedDateTime,body',
            '$top': 250,
        }
        try:
            resp = requests.get(
                f'{GRAPH_BASE}/me/messages',
                headers=headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            msgs = resp.json().get('value', [])
            added = 0
            for m in msgs:
                if m['id'] not in seen:
                    seen.add(m['id'])
                    result.append(m)
                    added += 1
            logger.info(f'  📧 {odata_filter[:50]} → {added} emails')
        except Exception as e:
            logger.warning(f'  ⚠️  Query falló ({odata_filter[:50]}): {e}')

    return result


def parse_graph_message(msg: dict) -> tuple[str, str, str, str]:
    subject  = msg.get('subject', '')
    date_str = msg.get('receivedDateTime', '')
    sender   = (msg.get('from', {})
                   .get('emailAddress', {})
                   .get('address', '')).lower()
    body     = msg.get('body', {}).get('content', '')
    return subject, date_str, body, sender


# ── Main ────────────────────────────────────────────────────

def run():
    mode = '🔬 DRY-RUN' if DRY_RUN else '🔄 LIVE'
    logger.info(f'{mode} parse_orders_outlook — últimos {DAYS_BACK_EMAIL} días')

    token      = get_access_token()
    categories = load_categories()
    logger.info(f'📂 {len(categories)} categorías cargadas')

    messages = search_emails(token, DAYS_BACK_EMAIL)
    logger.info(f'📧 {len(messages)} emails candidatos')

    total_orders = total_lines = total_matches = 0

    for msg in messages:
        try:
            subject, date_str, body, sender = parse_graph_message(msg)
        except Exception as e:
            logger.warning(f'  ⚠️  No se pudo leer mensaje: {e}')
            continue

        parsed = None
        if 'amazon' in sender or 'amazon' in subject.lower():
            parsed = parse_amazon_email(subject, body, date_str)
        elif 'paypal' in sender:
            parsed = parse_paypal_email(subject, body, date_str)

        if not parsed:
            logger.debug(f'  ↷ No parseable: "{subject[:60]}"')
            continue

        order_data = parsed['order']
        if order_already_imported(order_data['source'], order_data.get('source_order_id')):
            logger.debug(f"  ↷ Ya importado: {order_data.get('source_order_id')}")
            continue

        logger.info(
            f"  📦 {order_data['source']} | {order_data.get('source_order_id','—')} | "
            f"{order_data['merchant']} | {order_data['total_amount']} € | "
            f"{'financiado ' + str(order_data['installment_count']) + ' cuotas' if order_data['is_financed'] else 'pago único'} | "
            f"{len(parsed['lines'])} líneas"
        )

        order_id = insert_order_and_lines(parsed, categories)
        total_orders += 1
        total_lines  += len(parsed['lines'])
        if order_id:
            total_matches += propose_transaction_match(order_id, order_data)

    logger.info(
        f'✅ Completado · {total_orders} pedidos · {total_lines} líneas · '
        f'{total_matches} matches propuestos'
    )


if __name__ == '__main__':
    run()
