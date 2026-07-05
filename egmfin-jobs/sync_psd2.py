#!/usr/bin/env python3
"""
sync_psd2.py — Sincronización de transacciones PSD2 desde Enable Banking a Supabase.

Cron: Diario tras update_prices (~UTC 22:35)

P-011 fix (12-may-2026):
- external_id robusto: usa entry_reference/transaction_id nativos con prefijo (er_, tid_)
- Fallback SHA-256 con muchos campos (incluyendo CDI, contraparte, IBAN, remittance completo)
- Counter intra-batch para duplicados verdaderos (seq1, seq2, ...)

P-013 fix (13-may-2026):
- Sustituye DELETE+INSERT por UPDATE selectivo + INSERT
- Preserva campos de categorización manual: titular, account_id, nature, category_id,
  project_id, paid_by_user_id, is_reimbursable, reimbursed_at
- Batch SELECT previo por external_id para clasificar INSERT / UPDATE / sin cambios
- Logging: "X insertadas, Y actualizadas, Z sin cambios" por banco y en total

T-011 fix (30-may-2026):
- raw_concept ahora almacena el remittance_information legible (' | '-joined), no el JSON crudo.
  Si remittance vacío → None. Backfill de txns existentes: backfill_raw_concept_t011.py.

Fase 1 v10 (14-may-2026): classification_rules en INSERT
- Carga reglas activas (is_active=true) una vez al inicio del run, ordered by priority asc
- Aplica la primera regla que matchea a cada txn nueva (rama to_insert)
- Sobreescribe en rec los campos correspondientes a set_* no-null de la regla:
    set_account_id → account_id, set_titular → titular,
    set_category_id → category_id, set_project_id → project_id,
    set_nature → nature, set_paid_by_user_id → paid_by_user_id,
    set_is_reimbursable → is_reimbursable
- UPDATEs NO disparan reglas (preservan estado manual; coherente con P-013)
- Match case-insensitive (D1)
- Reglas mal configuradas → skip + warning, NO abortan el sync (D2)
- Operadores soportados: contains, equals, starts_with, regex
- Campos soportados en match_field: counterparty, raw_concept, description

Modo DRY_RUN: exporta DRY_RUN=1 para ver qué insertaría/actualizaría sin escribir a DB.
"""

import os
import re
import sys
import json
import hashlib
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
DAYS_BACK = int(os.getenv('DAYS_BACK', '89'))  # 89 = margen seguro bajo tope PSD2 de 89 días sin SCA

# Campos del banco que el sync puede actualizar.
# NUNCA se tocan: titular, account_id, nature, category_id, project_id,
#                 paid_by_user_id, is_reimbursable, reimbursed_at
BANK_FIELDS = (
    'amount', 'date', 'description', 'raw_concept', 'currency',
    'bank_connection_id', 'counterparty', 'source_id',
)

# Fase 1 v10: mapeo de columnas set_* (en classification_rules) a campos del rec
RULE_SETTERS = {
    'set_account_id':       'account_id',
    'set_titular':          'titular',
    'set_category_id':      'category_id',
    'set_project_id':       'project_id',
    'set_nature':           'nature',
    'set_paid_by_user_id':  'paid_by_user_id',
    'set_is_reimbursable':  'is_reimbursable',
}
RULE_ALLOWED_FIELDS = {'counterparty', 'raw_concept', 'description'}
RULE_ALLOWED_OPS = {'contains', 'equals', 'starts_with', 'regex'}

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


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


def eb_get(path: str, params: Optional[dict] = None) -> dict:
    token = sign_jwt()
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.get(f'{EB_BASE_URL}{path}', headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_account_balance(account_uid: str) -> tuple:
    """
    Llama a GET /accounts/{uid}/balances (PSD2 AIS, Enable Banking).
    Devuelve (amount: float, reference_date: str) o (None, None) si falla.
    Preferencia de tipo: CLBD (Closing Ledger) > CLAV (Closing Available) > primera disponible.
    No aborta el sync si el endpoint no está disponible para un ASPSP concreto.
    """
    try:
        data = eb_get(f'/accounts/{account_uid}/balances')
        balances = data.get('balances', [])
        if not balances:
            return None, None
        for preferred in ('CLBD', 'CLAV'):
            for b in balances:
                if b.get('balance_type') == preferred:
                    amt   = b.get('balance_amount', {})
                    amount = float(amt.get('amount', 0))
                    cdi    = b.get('credit_debit_indicator', 'CRDT')
                    signed = -amount if cdi == 'DBIT' else amount
                    ref_date = (b.get('reference_date')
                                or datetime.now(timezone.utc).strftime('%Y-%m-%d'))
                    return signed, ref_date
        # fallback: primer balance disponible
        b      = balances[0]
        amt    = b.get('balance_amount', {})
        amount = float(amt.get('amount', 0))
        cdi    = b.get('credit_debit_indicator', 'CRDT')
        signed = -amount if cdi == 'DBIT' else amount
        ref_date = (b.get('reference_date')
                    or datetime.now(timezone.utc).strftime('%Y-%m-%d'))
        return signed, ref_date
    except Exception as e:
        logger.warning(f'  ⚠️  Balance endpoint falló para {account_uid[:8]}...: {e}')
        return None, None


def fetch_account_transactions(account_uid: str, days_back: int = 89) -> list:
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


def make_external_id(txn: dict, account_uid: str, seen_hashes: dict) -> str:
    """
    P-011 fix: external_id robusto.
    - IDs nativos EB con prefijo (er_, tid_) → idempotente entre runs
    - Fallback SHA-256 con muchos campos
    - Counter intra-batch (_seq1, _seq2) para duplicados verdaderos
    """
    if txn.get('entry_reference'):
        return f"er_{txn['entry_reference']}"
    if txn.get('transaction_id'):
        return f"tid_{txn['transaction_id']}"

    amt = txn.get('transaction_amount', {}) or {}
    creditor = (txn.get('creditor') or {}).get('name', '') or ''
    debtor = (txn.get('debtor') or {}).get('name', '') or ''
    cred_iban = (txn.get('creditor_account') or {}).get('iban', '') or ''
    deb_iban = (txn.get('debtor_account') or {}).get('iban', '') or ''
    remit = '|'.join(txn.get('remittance_information') or [])

    base = '|'.join([
        account_uid,
        str(txn.get('booking_date') or ''),
        str(txn.get('value_date') or ''),
        str(txn.get('credit_debit_indicator') or ''),
        str(amt.get('amount') or ''),
        creditor, debtor,
        cred_iban, deb_iban,
        remit,
        str(txn.get('reference_number') or ''),
    ])
    base_hash = hashlib.sha256(base.encode()).hexdigest()[:32]

    seen_hashes[base_hash] = seen_hashes.get(base_hash, 0) + 1
    if seen_hashes[base_hash] > 1:
        return f"h_{base_hash}_seq{seen_hashes[base_hash]}"
    return f"h_{base_hash}"


def map_txn(txn: dict, account_id: str, bank_connection_id: str,
            account_uid: str, seen_hashes: dict) -> dict:
    """Mapea txn de Enable Banking a estructura `transactions` de Supabase."""
    amt_obj = txn.get('transaction_amount', {}) or {}
    raw_amount = float(amt_obj.get('amount', 0))

    cdi = txn.get('credit_debit_indicator', 'CRDT')
    amount = -abs(raw_amount) if cdi == 'DBIT' else abs(raw_amount)

    remittance = txn.get('remittance_information') or []
    description = '; '.join(remittance) if remittance else (txn.get('reference_number') or 'N/A')

    if cdi == 'DBIT':
        counterparty = (txn.get('creditor') or {}).get('name', '') or ''
    else:
        counterparty = (txn.get('debtor') or {}).get('name', '') or ''

    ext_id = make_external_id(txn, account_uid, seen_hashes)

    return {
        'account_id': account_id,
        'bank_connection_id': bank_connection_id,
        'date': txn.get('booking_date') or txn.get('value_date'),
        'amount': amount,
        'currency': amt_obj.get('currency', 'EUR'),
        'description': description[:500] if description else None,
        'raw_concept': (' | '.join(remittance))[:2000] if remittance else None,
        'titular': 'eric',
        'source': 'psd2',
        'source_id': ext_id,
        'external_id': ext_id,
        'counterparty': counterparty[:200] if counterparty else None,
    }


def _bank_fields_changed(existing: dict, new_rec: dict) -> bool:
    """True si algún campo de banco difiere entre la fila existente y el nuevo registro."""
    for field in BANK_FIELDS:
        ex_val = existing.get(field)
        new_val = new_rec.get(field)
        if field == 'amount':
            # Supabase puede devolver Decimal o float; normalizar
            if round(float(ex_val or 0), 6) != round(float(new_val or 0), 6):
                return True
        else:
            if str(ex_val or '') != str(new_val or ''):
                return True
    return False


def load_active_rules() -> list:
    """
    Fase 1 v10: carga reglas de classification_rules activas, ordered by priority asc.
    Una sola llamada al inicio del run; las reglas se mantienen en memoria.

    P-024 (05-jul-2026): set_account_id debe apuntar a una subcuenta SOLO si esa
    subcuenta tiene un feed PSD2 granular propio (entrada activa en bank_account_links).
    Las liquidaciones agregadas (TARJ.CRDTO, LIQUIDACION TARJETA…) pertenecen al IBAN
    donde el banco las registra. La regla d03dbac0 que desviaba TARJ.CRDTO al account
    'Tarjeta Kutxabank Eric' fue desactivada en mig-68 por no cumplir esta condición.
    """
    response = sb.table('classification_rules').select('*') \
        .eq('is_active', True).order('priority').execute()
    return response.data or []


def _match_rule(rec: dict, rule: dict) -> bool:
    """
    Devuelve True si la regla matchea contra rec. Case-INsensitive (D1).
    Operadores: contains, equals, starts_with, regex.
    Reglas mal configuradas (campo/operador inválidos, regex roto) → False + warning.
    """
    field = rule.get('match_field')
    op = rule.get('match_operator')
    val = rule.get('match_value')
    rule_id = rule.get('id', '?')

    if field not in RULE_ALLOWED_FIELDS:
        logger.warning(f"    ⚠️  rule#{rule_id} match_field inválido: {field!r} (skip)")
        return False
    if op not in RULE_ALLOWED_OPS:
        logger.warning(f"    ⚠️  rule#{rule_id} match_operator inválido: {op!r} (skip)")
        return False
    if not val:
        logger.warning(f"    ⚠️  rule#{rule_id} match_value vacío (skip)")
        return False

    field_value = rec.get(field) or ''
    if not field_value:
        return False

    fv_lower = field_value.lower()
    mv_lower = val.lower()

    if op == 'contains':
        return mv_lower in fv_lower
    if op == 'equals':
        return fv_lower == mv_lower
    if op == 'starts_with':
        return fv_lower.startswith(mv_lower)
    if op == 'regex':
        try:
            return re.search(val, field_value, re.IGNORECASE) is not None
        except re.error as e:
            logger.warning(f"    ⚠️  rule#{rule_id} regex inválida {val!r}: {e} (skip)")
            return False
    return False


def _apply_first_matching_rule(rec: dict, rules: list) -> Optional[dict]:
    """
    Aplica al rec la primera regla activa que matchea. Sobreescribe campos del rec
    para cada columna set_* no-null de la regla. Devuelve la regla aplicada (o None).
    """
    for rule in rules:
        if not _match_rule(rec, rule):
            continue
        for set_col, rec_col in RULE_SETTERS.items():
            if rule.get(set_col) is not None:
                rec[rec_col] = rule[set_col]
        return rule
    return None


def sync_psd2():
    mode = '🔬 DRY-RUN' if DRY_RUN else '🔄 LIVE'
    logger.info(f'{mode} Iniciando sincronización PSD2...')

    # Fase 1 v10: cargar reglas activas una vez por run
    rules = load_active_rules()
    logger.info(f'📋 {len(rules)} reglas de categorización activas')

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
    total_updated = 0
    accounts_with_4xx = 0
    total_unchanged = 0
    total_rules_applied = 0

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
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else 0
            logger.error(f'  ❌ HTTP {status} de {aspsp}: {e}')
            if 400 <= status < 500:
                accounts_with_4xx += 1  # P-016: 4xx marca el job rojo al final
            continue
        except Exception as e:
            logger.error(f'  ❌ Error fetching {aspsp}: {e}')
            continue

        logger.info(f'  📋 {len(txns)} txns descargadas en {DAYS_BACK} días')
        total_txns += len(txns)

        # P-011: seen_hashes por cuenta (no global) → counter por batch
        seen_hashes: dict = {}
        records = [map_txn(t, account_id, bc_id, uid, seen_hashes) for t in txns]

        collisions = sum(1 for v in seen_hashes.values() if v > 1)
        if collisions:
            logger.info(f'  🔍 {collisions} colisiones de hash resueltas con sufijo _seqN')

        ext_ids = [r['external_id'] for r in records]
        if len(set(ext_ids)) != len(ext_ids):
            logger.error(f'  ❌ DUPLICADOS DETECTADOS tras fix: {len(ext_ids) - len(set(ext_ids))}')
            continue

        # P-013: batch SELECT para clasificar INSERT / UPDATE / sin cambios
        select_fields = ', '.join(['external_id'] + list(BANK_FIELDS))
        existing_rows = sb.table('transactions').select(select_fields) \
            .in_('external_id', ext_ids).eq('source', 'psd2').execute()
        existing_by_id = {row['external_id']: row for row in (existing_rows.data or [])}

        to_insert: list[dict] = []
        to_update: list[dict] = []
        unchanged_count = 0

        for rec in records:
            ex = existing_by_id.get(rec['external_id'])
            if ex is None:
                to_insert.append(rec)
            elif _bank_fields_changed(ex, rec):
                to_update.append(rec)
            else:
                unchanged_count += 1

        # Fase 1 v10: aplicar reglas a INSERTS (no a UPDATEs, que preservan estado manual)
        rules_applied_here = 0
        if rules:
            for rec in to_insert:
                matched = _apply_first_matching_rule(rec, rules)
                if matched:
                    rules_applied_here += 1
                    logger.info(
                        f"    🏷️  rule#{matched.get('id', '?')} "
                        f"(prio={matched.get('priority', '?')}) matched on "
                        f"{matched['match_field']} {matched['match_operator']} "
                        f"{matched['match_value']!r} → "
                        f"{rec['external_id'][:24]}"
                    )

        if DRY_RUN:
            for rec in to_insert[:3]:
                logger.info(
                    f"    🔬 INSERT: {rec['date']} | {rec['amount']:8.2f} EUR | "
                    f"{rec['external_id'][:30]} | {(rec['description'] or '')[:50]}"
                )
            for rec in to_update[:3]:
                logger.info(
                    f"    🔬 UPDATE: {rec['date']} | {rec['amount']:8.2f} EUR | "
                    f"{rec['external_id'][:30]} | {(rec['description'] or '')[:50]}"
                )
            logger.info(
                f'  🔬 DRY-RUN: {len(to_insert)} insertarían ({rules_applied_here} con regla) · '
                f'{len(to_update)} actualizarían · {unchanged_count} sin cambios'
            )
            total_inserted += len(to_insert)
            total_updated += len(to_update)
            total_unchanged += unchanged_count
            total_rules_applied += rules_applied_here
            continue

        # LIVE
        inserted_here = 0
        updated_here = 0

        for rec in to_insert:
            try:
                sb.table('transactions').insert(rec).execute()
                inserted_here += 1
            except Exception as e:
                logger.warning(f"    ⚠️  INSERT {rec['external_id']}: {e}")

        for rec in to_update:
            update_payload = {f: rec[f] for f in BANK_FIELDS}
            try:
                sb.table('transactions').update(update_payload) \
                    .eq('external_id', rec['external_id']) \
                    .eq('source', 'psd2').execute()
                updated_here += 1
            except Exception as e:
                logger.warning(f"    ⚠️  UPDATE {rec['external_id']}: {e}")

        total_inserted += inserted_here
        total_updated += updated_here
        total_unchanged += unchanged_count
        total_rules_applied += rules_applied_here

        logger.info(
            f'  ✅ {inserted_here} insertadas ({rules_applied_here} con regla) · '
            f'{updated_here} actualizadas · {unchanged_count} sin cambios'
        )

        sb.table('bank_account_links').update({
            'last_sync_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', link['id']).execute()

        # Ancla de saldo: saldo real del banco para balance_checks
        if not DRY_RUN:
            real_bal, bal_date = fetch_account_balance(uid)
            if real_bal is not None and bal_date is not None:
                try:
                    sb.table('balance_checks').upsert({
                        'account_id':   account_id,
                        'check_date':   bal_date,
                        'real_balance': real_bal,
                        'source':       'enable_banking',
                    }, on_conflict='account_id,check_date').execute()
                    logger.info(f'  ⚓ Balance check: {real_bal:.2f} EUR ({bal_date})')
                except Exception as e:
                    logger.warning(f'  ⚠️  No se pudo guardar balance_check: {e}')
            else:
                logger.warning(f'  ⚠️  Sin datos de balance para {aspsp}')

    if not DRY_RUN:
        try:
            res = sb.rpc('fn_supersede_pending_booked').execute()
            n_dedup = res.data if isinstance(res.data, int) else (res.data or 0)
            logger.info(f'🧹 {n_dedup} duplicados PENDING→BOOKED neutralizados')
        except Exception as e:
            logger.warning(f'⚠️  dedupe PENDING→BOOKED falló: {e}')

    logger.info(
        f'✅ Sync completada · {total_txns} descargadas · '
        f'{total_inserted} insertadas ({total_rules_applied} con regla) · '
        f'{total_updated} actualizadas · {total_unchanged} sin cambios'
    )

    # Pulso del job
    run_status = 'error' if accounts_with_4xx else 'ok'
    try:
        sb.table('job_runs').insert({
            'job_name': 'sync_psd2',
            'status':   run_status,
            'detail': {
                'txns_downloaded':  total_txns,
                'inserted':         total_inserted,
                'updated':          total_updated,
                'unchanged':        total_unchanged,
                'rules_applied':    total_rules_applied,
                'accounts_4xx':     accounts_with_4xx,
            },
        }).execute()
    except Exception as e:
        logger.warning(f'⚠️  No se pudo guardar job_run: {e}')

    if accounts_with_4xx:
        logger.error(
            f'⚠️  Sync terminó con errores 4xx en {accounts_with_4xx} cuenta(s) '
            f'— revisar consentimiento/ventana'
        )
        sys.exit(1)


if __name__ == '__main__':
    sync_psd2()
