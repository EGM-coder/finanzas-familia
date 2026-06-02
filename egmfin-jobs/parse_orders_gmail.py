#!/usr/bin/env python3
"""
parse_orders_gmail.py — Parseo de confirmaciones Amazon/PayPal desde Gmail.

T-020: Parser Gmail · confirmaciones Amazon + PayPal.

Auth: GMAIL_CREDENTIALS_JSON (Google Cloud OAuth2 JSON)
      GMAIL_TOKEN_PATH (default ~/.secrets/gmail_token.json)
DRY_RUN=1 → muestra sin escribir a BD.
DAYS_BACK_EMAIL=90 → rango de búsqueda.
"""

import os
import re
import base64
import logging
import sys
from datetime import datetime, timezone, timedelta
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client

try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
except ImportError:
    print("ERROR: pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client")
    sys.exit(1)

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SUPABASE_URL              = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
GMAIL_CREDENTIALS_JSON    = os.getenv('GMAIL_CREDENTIALS_JSON',
                                os.path.expanduser('~/.secrets/gmail_credentials.json'))
GMAIL_TOKEN_PATH          = os.getenv('GMAIL_TOKEN_PATH',
                                os.path.expanduser('~/.secrets/gmail_token.json'))
DRY_RUN                   = os.getenv('DRY_RUN', '0') == '1'
DAYS_BACK_EMAIL           = int(os.getenv('DAYS_BACK_EMAIL', '90'))
BACKFILL                  = os.getenv('BACKFILL', '0') == '1'

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ── Auth ────────────────────────────────────────────────────

def get_gmail_service():
    creds = None
    if os.path.exists(GMAIL_TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(GMAIL_TOKEN_PATH, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(GMAIL_CREDENTIALS_JSON):
                logger.error(f'❌ No encontrado: {GMAIL_CREDENTIALS_JSON}')
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(GMAIL_CREDENTIALS_JSON, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(GMAIL_TOKEN_PATH, 'w') as f:
            f.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)


# ── Búsqueda ────────────────────────────────────────────────

GMAIL_QUERIES = [
    'from:auto-confirm@amazon.es',
    'from:auto-confirm@amazon.com subject:pedido',
    'from:servicio@paypal.es',
    'from:service@paypal.com subject:pago',
    'from:service@intl.paypal.com subject:pago',
]


def search_emails(service, days_back: int) -> list[dict]:
    after = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y/%m/%d')
    seen, result = set(), []
    for q in GMAIL_QUERIES:
        full_q = f'{q} after:{after}'
        try:
            resp = service.users().messages().list(
                userId='me', q=full_q, maxResults=500
            ).execute()
            for m in resp.get('messages', []):
                if m['id'] not in seen:
                    seen.add(m['id'])
                    result.append(m)
            logger.info(f'  📧 "{full_q}" → {len(resp.get("messages",[]))} emails')
        except Exception as e:
            logger.warning(f'  ⚠️  Query falló: {e}')
    return result


def get_email_body(service, msg_id: str) -> tuple[str, str, str, str]:
    msg = service.users().messages().get(
        userId='me', id=msg_id, format='full'
    ).execute()
    headers = {h['name']: h['value'] for h in msg['payload'].get('headers', [])}
    subject  = _decode_mime_header(headers.get('Subject', ''))
    date_str = headers.get('Date', '')
    sender   = headers.get('From', '').lower()
    body     = _extract_body(msg['payload'])
    return subject, date_str, body, sender


def _decode_mime_header(value: str) -> str:
    parts = decode_header(value)
    out = []
    for part, enc in parts:
        out.append(part.decode(enc or 'utf-8', errors='replace') if isinstance(part, bytes) else part)
    return ' '.join(out)


def _extract_body(payload: dict) -> str:
    mime = payload.get('mimeType', '')
    data = payload.get('body', {}).get('data', '')
    if data and mime in ('text/plain', 'text/html'):
        return base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
    return ''.join(_extract_body(p) for p in payload.get('parts', []))


def _clean_html(body: str) -> str:
    clean = re.sub(r'<style[^>]*>.*?</style>', ' ', body, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    return re.sub(r'\s+', ' ', clean).strip()


# ── Parsers ─────────────────────────────────────────────────

def parse_email_date(date_str: str) -> str:
    try:
        return parsedate_to_datetime(date_str).strftime('%Y-%m-%d')
    except Exception:
        return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def parse_amazon_email(subject: str, body: str, date_str: str) -> Optional[dict]:
    clean = _clean_html(body)
    m = re.search(r'\b(\d{3}-\d{7}-\d{7})\b', clean)
    if not m:
        return None
    order_id = m.group(1)

    total_m = re.search(
        r'(?:Total del pedido|Total del pedido con IVA|Total\s*:?)\s*(?:EUR\s*)?([\d]+[,.][\d]{2})',
        clean, re.IGNORECASE
    )
    total = float(total_m.group(1).replace(',', '.')) if total_m else 0.0

    financing = _parse_amazon_financing(clean)
    lines     = _parse_amazon_lines(clean)
    order_date = parse_email_date(date_str)

    return {
        'order': {
            'source': 'amazon_email',
            'source_order_id': order_id,
            'merchant': 'Amazon ES',
            'order_date': order_date,
            'total_amount': total or (
                financing['installment_amount'] * financing['installment_count']
                if financing else 0
            ),
            'currency': 'EUR',
            'titular': 'eric',
            'visibility': 'privada_eric',
            'is_financed': financing is not None,
            'installment_count':  financing['installment_count']  if financing else None,
            'installment_amount': financing['installment_amount'] if financing else None,
            'first_charge_date':  financing['first_charge_date']  if financing else None,
            'match_status': 'sin_linkar',
            'ai_suggested': False,
        },
        'lines': lines,
    }


def _parse_amazon_lines(body: str) -> list[dict]:
    lines = []
    skip = {
        'total', 'envío', 'impuesto', 'iva', 'descuento', 'subtotal',
        'gastos', 'precio', 'cant.', 'cantidad', 'artículo', 'descripción',
        'importe', 'unidad', 'referencia', 'método de pago', 'dirección',
        'estimado', 'plazo', 'cuota', 'pago',
    }
    for m in re.finditer(
        r'(?:^|\n)\s*(.{10,150}?)\s{2,}(?:EUR\s*)?([\d]+[,.][\d]{2})\s*(?:€|EUR)',
        body, re.MULTILINE
    ):
        desc = m.group(1).strip()
        desc_lower = desc.lower()
        if any(kw in desc_lower for kw in skip) or len(desc) < 5:
            continue
        # Filtrar líneas que terminan en palabra de skip (ej. "1,99 € Subtotal")
        if any(desc_lower.rstrip('.').endswith(kw) for kw in skip):
            continue
        if sum(c.isdigit() or c in '€,.% ' for c in desc) / max(len(desc), 1) > 0.5:
            continue
        try:
            amount = float(m.group(2).replace(',', '.'))
        except ValueError:
            continue
        lines.append({
            'description': desc[:500],
            'quantity': 1,
            'unit_amount': amount,
            'total_amount': amount,
            'category_confirmed': False,
        })
    return lines[:20]


def _parse_amazon_financing(body: str) -> Optional[dict]:
    m = re.search(
        r'(?:paga en|plazos?)\s+(\d+)\s+(?:plazos?\s+de\s+)?([\d]+[,.][\d]{2})\s*(?:€|EUR)?',
        body, re.IGNORECASE
    )
    if m:
        return {
            'installment_count': int(m.group(1)),
            'installment_amount': float(m.group(2).replace(',', '.')),
            'first_charge_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        }
    return None


def parse_paypal_email(subject: str, body: str, date_str: str) -> Optional[dict]:
    clean = _clean_html(body)

    # "Id. de transacción: 21768415W8982841X"
    txn_m = re.search(
        r'Id\.\s+de\s+transacci[oó]n[:\s]+([A-Z0-9]{10,25})',
        clean, re.IGNORECASE
    )
    txn_id = txn_m.group(1) if txn_m else None

    # Fallback 1: número de pedido, factura o recibo
    if not txn_id:
        fallback_m = re.search(
            r'(?:N[uú]mero de (?:pedido|factura|recibo|orden)|'
            r'Order (?:ID|number)|Invoice (?:ID|number)|Receipt)[:\s#]+([A-Z0-9\-]{5,30})',
            clean, re.IGNORECASE
        )
        if fallback_m:
            txn_id = f'ref_{fallback_m.group(1)}'

    # Merchant: from subject "Recibo de su pago a MERCHANT" (most reliable)
    merchant_m = re.search(r'Recibo de su pago a (.{3,80}?)(?:\.\.\.)?$', subject, re.IGNORECASE)
    if not merchant_m:
        merchant_m = re.search(r'Vendedor\s+(.{3,80}?)(?:\s+[\w.]+@|\s+Fecha)', clean, re.IGNORECASE)
    merchant = merchant_m.group(1).strip().rstrip('.') if merchant_m else 'PayPal'

    # Total: "Total 115,98 €"
    total_m = re.search(r'Total\s+([\d]+[,.][\d]{2})\s*€', clean, re.IGNORECASE)
    total = float(total_m.group(1).replace(',', '.')) if total_m else 0.0

    financing  = _parse_paypal_financing(clean, total)
    lines      = _parse_paypal_lines(clean, merchant, total)
    order_date = parse_email_date(date_str)

    # Fallback 2: hash determinista merchant+total+fecha — evita duplicados en runs sucesivos
    # Riesgo conocido: dos cargos idénticos del mismo comercio el mismo día → solo se importa uno
    if not txn_id:
        import hashlib
        raw = f"{merchant}|{total}|{order_date}"
        txn_id = f'hash_{hashlib.sha256(raw.encode()).hexdigest()[:12]}'

    if total == 0 and not financing:
        return None

    # Notificaciones de plan de plazos sin txn_id — no son recibos, se duplicarían en cada run
    if txn_id is None and financing is not None:
        return None

    return {
        'order': {
            'source': 'paypal_email',
            'source_order_id': txn_id,
            'merchant': merchant[:200],
            'order_date': order_date,
            'total_amount': total or (
                financing['installment_amount'] * financing['installment_count']
                if financing else 0
            ),
            'currency': 'EUR',
            'titular': 'eric',
            'visibility': 'privada_eric',
            'is_financed': financing is not None,
            'installment_count':  financing['installment_count']  if financing else None,
            'installment_amount': financing['installment_amount'] if financing else None,
            'first_charge_date':  financing['first_charge_date']  if financing else None,
            'match_status': 'sin_linkar',
            'ai_suggested': False,
        },
        'lines': lines,
    }


def _parse_paypal_financing(clean: str, total: float) -> Optional[dict]:
    # Explicit "N pagos de X €"
    m = re.search(
        r'(\d+)\s+(?:pagos?|plazos?)\s+de\s+([\d]+[,.][\d]{2})\s*(?:€|EUR)?',
        clean, re.IGNORECASE
    )
    if m:
        return {
            'installment_count': int(m.group(1)),
            'installment_amount': float(m.group(2).replace(',', '.')),
            'first_charge_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        }
    # "Paga en N plazos" / "Dividido en N pagos" sin importe explícito → total / N
    m2 = re.search(
        r'(?:Paga en|Dividido en)\s+(\d+)\s+(?:plazos?|pagos?)',
        clean, re.IGNORECASE
    )
    if m2 and total > 0:
        count = int(m2.group(1))
        return {
            'installment_count': count,
            'installment_amount': round(total / count, 2),
            'first_charge_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        }
    return None


def _parse_paypal_lines(clean: str, merchant: str, total: float) -> list[dict]:
    lines = []
    # "Cant.: N  DESCRIPTION  PRICE €"
    for m in re.finditer(
        r'Cant\.\s*:\s*(\d+)\s+(.{3,200}?)\s+([\d]+[,.][\d]{2})\s*€',
        clean, re.IGNORECASE
    ):
        qty    = int(m.group(1))
        desc   = m.group(2).strip()
        amount = float(m.group(3).replace(',', '.'))
        if not (3 <= len(desc) <= 500):
            continue
        desc_lower = desc.lower()
        # Filtrar líneas que terminan en palabra de skip (ej. "1,99 € Subtotal")
        skip_suffixes = {
            'total', 'subtotal', 'impuesto', 'iva', 'descuento',
            'envío', 'gastos', 'precio', 'importe', 'cuota', 'pago',
        }
        if any(desc_lower.rstrip('.').endswith(kw) for kw in skip_suffixes):
            continue
        if sum(c.isdigit() or c in '€,.% ' for c in desc) / max(len(desc), 1) > 0.5:
            continue
        lines.append({
            'description': desc[:500],
            'quantity': qty,
            'unit_amount': round(amount / qty, 2),
            'total_amount': amount,
            'category_confirmed': False,
        })
    # Fallback: una línea con el merchant y el total
    if not lines and total > 0:
        lines.append({
            'description': merchant[:500],
            'quantity': 1,
            'unit_amount': total,
            'total_amount': total,
            'category_confirmed': False,
        })
    return lines[:20]


# ── IA: propuesta de categoría ──────────────────────────────

# Merchant-level map (lower-contains match on merchant field, checked first)
MERCHANT_CATEGORY_MAP: list[tuple[str, str]] = [
    ('apple',           'Streaming'),
    ('google payment',  'Streaming'),
    ('microsoft',       'Servicios y suministros'),
    ('sony interactive','Ocio y cultura'),
    ('iberia',          'Vuelos y transporte'),
    ('leroy merlin',    'Mantenimiento'),
]

# Keyword-level map (fallback, matches description+merchant text)
KEYWORD_MAP = {
    'alimentación':             ['supermercado','mercadona','lidl','eroski','carrefour','comida','aliment'],
    'ropa y cuidado personal':  ['ropa','camiseta','pantalón','zapato','zara','h&m','mango','camisa','vestido'],
    'hijos':                    ['bebé','niño','juguete','colegio','kids','infantil','pañal'],
    'salud':                    ['farmacia','médico','salud','parafarmacia','vitamina','suplemento'],
    'ocio y cultura':           ['libro','juego','videojuego','cine','música','deporte','hobby'],
    'educación':                ['curso','formación','máster','libro de texto'],
    'servicios y suministros':  ['suscripción','netflix','spotify','amazon prime','antivirus'],
    'tecnología':               ['móvil','tablet','ordenador','auricular','cable','cargador','apple','samsung'],
    'vivienda':                 ['hogar','mueble','decoración','ikea','cojín','lámpara'],
}


def load_category_name_map() -> dict[str, str]:
    """Returns {category_name_lower: uuid} for all active categories."""
    cats = sb.table('categories').select('id, name').eq('is_active', True).execute().data or []
    return {c['name'].lower(): c['id'] for c in cats}


def suggest_merchant_category(merchant: str, cat_name_map: dict[str, str]) -> Optional[str]:
    m = (merchant or '').lower()
    for pattern, cat_name in MERCHANT_CATEGORY_MAP:
        if pattern in m:
            return cat_name_map.get(cat_name.lower())
    return None


def suggest_category(description: str, merchant: str, categories: list[dict]) -> Optional[str]:
    text = (description + ' ' + merchant).lower()
    for cat_name, keywords in KEYWORD_MAP.items():
        if any(kw in text for kw in keywords):
            for cat in categories:
                if cat['name'].lower() == cat_name:
                    return cat['id']
    return None


def load_categories() -> list[dict]:
    return sb.table('categories').select('id, name').eq('is_active', True).execute().data or []


# ── BD: deduplicar, insertar, proponer match ────────────────

def order_already_imported(source: str, source_order_id: Optional[str]) -> bool:
    if not source_order_id:
        return False
    resp = sb.table('purchase_orders') \
        .select('id').eq('source', source).eq('source_order_id', source_order_id) \
        .limit(1).execute()
    return len(resp.data or []) > 0


def insert_order_and_lines(
    parsed: dict,
    categories: list[dict],
    cat_name_map: Optional[dict[str, str]] = None,
) -> Optional[str]:
    order_data = parsed['order']
    lines_data = parsed['lines']

    if DRY_RUN:
        logger.info(
            f"  🔬 ORDER: {order_data['source']} | {order_data['source_order_id']} | "
            f"{order_data['merchant']} | {order_data['total_amount']} € | "
            f"financiado={order_data['is_financed']} | {len(lines_data)} líneas"
        )
        for l in lines_data:
            logger.info(f"    🔬 LINE: {l['description'][:60]} | {l['total_amount']} €")
        return None

    try:
        resp = sb.table('purchase_orders').insert(order_data).execute()
        order_id = resp.data[0]['id']
    except Exception as e:
        logger.error(f'  ❌ INSERT purchase_orders: {e}')
        return None

    for line in lines_data:
        line['order_id'] = order_id
        # Merchant map takes priority over keyword map
        suggested = None
        if cat_name_map:
            suggested = suggest_merchant_category(order_data['merchant'], cat_name_map)
        if not suggested:
            suggested = suggest_category(line['description'], order_data['merchant'], categories)
        if suggested:
            line['ai_suggested_category_id'] = suggested
        try:
            sb.table('purchase_order_lines').insert(line).execute()
        except Exception as e:
            logger.warning(f"  ⚠️  INSERT line '{line['description'][:40]}': {e}")

    return order_id


def propose_transaction_match(order_id: str, order_data: dict) -> int:
    if DRY_RUN:
        return 0

    amount = -(order_data['installment_amount'] if order_data['is_financed']
               else order_data['total_amount'])
    date_ref = (order_data['first_charge_date'] if order_data['is_financed']
                else order_data['order_date'])

    try:
        date_from = (datetime.strptime(date_ref, '%Y-%m-%d') - timedelta(days=3)).strftime('%Y-%m-%d')
        date_to   = (datetime.strptime(date_ref, '%Y-%m-%d') + timedelta(days=3)).strftime('%Y-%m-%d')

        candidates = sb.table('transactions').select('id, amount, counterparty, date') \
            .gte('date', date_from).lte('date', date_to) \
            .is_('order_id', 'null').execute().data or []

        proposed = 0
        for txn in candidates:
            if abs(float(txn['amount']) - amount) > 0.02:
                continue
            existing = sb.table('purchase_order_charges') \
                .select('id').eq('transaction_id', txn['id']).limit(1).execute()
            if existing.data:
                continue
            try:
                sb.table('purchase_order_charges').insert({
                    'order_id': order_id,
                    'transaction_id': txn['id'],
                    'installment_number': 1 if order_data['is_financed'] else None,
                    'match_method': 'ai_proposed',
                }).execute()
                sb.table('transactions').update({'order_id': order_id}) \
                    .eq('id', txn['id']).execute()
                proposed += 1
                logger.info(
                    f"    🔗 Match propuesto: txn {txn['id'][:8]} ↔ pedido {order_id[:8]} "
                    f"({txn['amount']} € / {txn['date']})"
                )
            except Exception as e:
                logger.warning(f'  ⚠️  propose match: {e}')
        return proposed
    except Exception as e:
        logger.warning(f'  ⚠️  propose_transaction_match: {e}')
        return 0


# ── Backfill ─────────────────────────────────────────────────

def backfill_ai_suggestions(cat_name_map: dict[str, str]) -> None:
    """Idempotent: only touches lines where ai_suggested_category_id IS NULL
    AND category_confirmed = false AND category_id IS NULL."""
    orders = sb.table('purchase_orders').select('id, merchant').execute().data or []
    updated = skipped = 0
    for order in orders:
        merchant = order['merchant'] or ''
        suggestion = suggest_merchant_category(merchant, cat_name_map)
        if not suggestion:
            skipped += 1
            continue

        lines = (
            sb.table('purchase_order_lines')
            .select('id')
            .eq('order_id', order['id'])
            .is_('ai_suggested_category_id', 'null')
            .eq('category_confirmed', False)
            .is_('category_id', 'null')
            .execute()
            .data or []
        )
        if not lines:
            skipped += 1
            continue

        cat_name = next(
            (name for pat, name in MERCHANT_CATEGORY_MAP if pat in merchant.lower()), '?'
        )
        if DRY_RUN:
            logger.info(
                f"  🔬 BACKFILL {merchant[:40]} → {cat_name} ({len(lines)} líneas)"
            )
            updated += len(lines)
            continue

        for line in lines:
            sb.table('purchase_order_lines') \
                .update({'ai_suggested_category_id': suggestion}) \
                .eq('id', line['id']) \
                .execute()
        logger.info(
            f"  ✅ BACKFILL {merchant[:40]} → {cat_name} ({len(lines)} líneas)"
        )
        updated += len(lines)

    logger.info(f'🗂  Backfill · {updated} líneas actualizadas · {skipped} pedidos sin mapa')


# ── Main ────────────────────────────────────────────────────

def run():
    mode = '🔬 DRY-RUN' if DRY_RUN else '🔄 LIVE'
    logger.info(f'{mode} parse_orders_gmail — últimos {DAYS_BACK_EMAIL} días')

    cat_name_map = load_category_name_map()
    categories   = load_categories()
    logger.info(f'📂 {len(categories)} categorías cargadas')

    if BACKFILL:
        logger.info('🗂  Modo BACKFILL activado')
        backfill_ai_suggestions(cat_name_map)

    service = get_gmail_service()

    messages = search_emails(service, DAYS_BACK_EMAIL)
    logger.info(f'📧 {len(messages)} emails candidatos')

    total_orders = total_lines = total_matches = 0

    for msg in messages:
        try:
            subject, date_str, body, sender = get_email_body(service, msg['id'])
        except Exception as e:
            logger.warning(f'  ⚠️  No se pudo leer {msg["id"]}: {e}')
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

        order_id = insert_order_and_lines(parsed, categories, cat_name_map)
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
