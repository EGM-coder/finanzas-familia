#!/usr/bin/env python3
"""
backfill_raw_concept_t011.py — Limpia raw_concept de txns PSD2 con JSON crudo.

T-011 (30-may-2026)

Contexto: hasta T-011, sync_psd2.py almacenaba raw_concept = json.dumps(txn)[:2000].
Este script reemplaza ese JSON por el remittance_information legible (' | '-joined),
igual que hace map_txn() a partir del fix T-011. Si remittance vacío → None.

Modos:
  python3 backfill_raw_concept_t011.py            # dry-run por defecto
  python3 backfill_raw_concept_t011.py --dry-run  # explícito
  python3 backfill_raw_concept_t011.py --apply    # escribe a DB

Solo toca raw_concept. No modifica ningún campo de categorización manual.
Idempotente: txns ya limpias (raw_concept que no empieza por '{') se saltan.
JSON no parseable: skip + warning, no aborta.
"""

import argparse
import json
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

SEPARATOR = '─' * 70
PREVIEW_LIMIT = 10  # líneas de preview en dry-run


# ── Lógica de extracción ─────────────────────────────────────────────────────

def extract_clean_raw_concept(raw_concept_json: str) -> str | None:
    """
    Parsea el JSON crudo de raw_concept y devuelve el remittance legible.
    Retorna None si remittance vacío. Lanza ValueError si no es JSON válido.
    """
    txn = json.loads(raw_concept_json)
    remittance = txn.get('remittance_information') or []
    return (' | '.join(remittance))[:2000] if remittance else None


# ── Carga de datos ───────────────────────────────────────────────────────────

def load_dirty_txns(sb) -> list[dict]:
    """
    Txns PSD2 cuyo raw_concept empieza por '{' (JSON crudo).
    Carga solo los campos necesarios para el backfill.
    """
    resp = (
        sb.table('transactions')
        .select('id, external_id, raw_concept')
        .eq('source', 'psd2')
        .like('raw_concept', '{%')
        .execute()
    )
    return resp.data or []


# ── Plan builder ─────────────────────────────────────────────────────────────

def build_plan(txns: list[dict]) -> tuple[list[dict], int]:
    """
    Para cada txn, intenta extraer el raw_concept limpio.
    Retorna (plan, skipped_errors).
    plan = lista de { id, external_id, old_truncated, new_value }
    """
    plan = []
    skipped = 0
    for txn in txns:
        raw = txn.get('raw_concept') or ''
        try:
            new_value = extract_clean_raw_concept(raw)
        except (json.JSONDecodeError, Exception) as e:
            ext_id = txn.get('external_id', txn.get('id', '?'))
            print(f'  ⚠️  skip {ext_id[:40]}: JSON no parseable — {e}')
            skipped += 1
            continue
        plan.append({
            'id':          txn['id'],
            'external_id': txn.get('external_id', ''),
            'old_trunc':   raw[:80],
            'new_value':   new_value,
        })
    return plan, skipped


# ── Output ───────────────────────────────────────────────────────────────────

def print_preview(plan: list[dict], skipped: int, total_dirty: int) -> None:
    print(f'\n{SEPARATOR}')
    print(f'Total con JSON crudo: {total_dirty}  |  parseables: {len(plan)}  |  skip/error: {skipped}')
    print(f'\nPrimeras {min(PREVIEW_LIMIT, len(plan))} filas:')
    print(SEPARATOR)
    for item in plan[:PREVIEW_LIMIT]:
        ext = item['external_id'][:40] or item['id']
        old = item['old_trunc']
        new = item['new_value'] if item['new_value'] is not None else '(None)'
        print(f'  ext_id : {ext}')
        print(f'  viejo  : {old}')
        print(f'  nuevo  : {new}')
        print()
    if len(plan) > PREVIEW_LIMIT:
        print(f'  … y {len(plan) - PREVIEW_LIMIT} más.')
    print(SEPARATOR)
    print(f'\nEjecuta con --apply para escribir {len(plan)} updates a DB.')
    print(f'{SEPARATOR}\n')


# ── Apply ─────────────────────────────────────────────────────────────────────

def apply_plan(sb, plan: list[dict]) -> None:
    total   = len(plan)
    success = 0
    failed  = 0

    print(f'\n{SEPARATOR}')
    print(f'Aplicando {total} updates de raw_concept...\n')

    for i, item in enumerate(plan, 1):
        try:
            sb.table('transactions') \
              .update({'raw_concept': item['new_value']}) \
              .eq('id', item['id']) \
              .eq('source', 'psd2') \
              .execute()
            success += 1
            if i <= PREVIEW_LIMIT or i == total:
                print(f'  [{i:04d}/{total}] ✓  {item["external_id"][:40]}')
            elif i == PREVIEW_LIMIT + 1:
                print(f'  … ({total - PREVIEW_LIMIT - 1} más) …')
        except Exception as e:
            print(f'  [{i:04d}/{total}] ✗  {item["external_id"][:40]}  ERROR: {e}')
            failed += 1

    print(f'\n{SEPARATOR}')
    print(f'Completado: {success} éxitos, {failed} fallos.')
    print(f'{SEPARATOR}\n')


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='Backfill raw_concept limpio (T-011).')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--dry-run', action='store_true', help='Preview sin escribir (por defecto)')
    group.add_argument('--apply',   action='store_true', help='Escribe los updates a DB')
    args = parser.parse_args()

    dry_run = not args.apply

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print('ERROR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    print(f'\n{"DRY-RUN" if dry_run else "APPLY"} · backfill raw_concept T-011')
    print(f'{SEPARATOR}')
    print('Cargando txns con raw_concept JSON crudo...')

    txns = load_dirty_txns(sb)
    print(f'{len(txns)} txns con raw_concept que empieza por "{{" encontradas.')

    if not txns:
        print('Nada que hacer. Saliendo.')
        return

    plan, skipped = build_plan(txns)

    if dry_run:
        print_preview(plan, skipped, len(txns))
    else:
        if not plan:
            print('Plan vacío (todos los parseos fallaron). Sin cambios.')
            return
        apply_plan(sb, plan)


if __name__ == '__main__':
    main()
