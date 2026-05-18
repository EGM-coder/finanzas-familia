#!/usr/bin/env python3
"""
recategorize_existing.py — Aplica reglas de clasificación a txns sin categoría.

T-007 (18-may-2026)

Modos:
  python3 recategorize_existing.py            # dry-run por defecto
  python3 recategorize_existing.py --dry-run  # explícito
  python3 recategorize_existing.py --apply    # escribe a DB

Flujo recomendado:
  1. dry-run → revisar output
  2. apply si todo OK

Solo aplica a txns con category_id IS NULL.
Solo usa reglas is_active=true.
Primera regla que matchea gana (priority ASC, created_at ASC como desempate).
Solo setea los campos set_* no-null de la regla: category_id, project_id, nature.
Los campos D-005 (set_titular, set_account_id, set_is_reimbursable, etc.) se omiten
intencionalmente en V1 — son para remap de tarjetas en sync_psd2.py (deuda T-018).
"""

import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

SEPARATOR = '─' * 70


# ── Data helpers ────────────────────────────────────────────────────────────

def load_rules(sb) -> list[dict]:
    """Reglas activas ordenadas por priority ASC, created_at ASC."""
    resp = (
        sb.table('classification_rules')
        .select('id, priority, match_field, match_operator, match_value, '
                'set_category_id, set_project_id, set_nature, created_at')
        .eq('is_active', True)
        .order('priority', desc=False)
        .order('created_at', desc=False)
        .execute()
    )
    return resp.data or []


def load_pending_transactions(sb) -> list[dict]:
    """Txns sin categoría, todos los campos de matching y contexto."""
    resp = (
        sb.table('transactions')
        .select('id, date, amount, currency, counterparty, raw_concept, '
                'description, category_id, project_id, nature, titular')
        .is_('category_id', 'null')
        .order('date', desc=False)
        .execute()
    )
    return resp.data or []


def load_category_names(sb) -> dict[str, str]:
    """Mapa id → 'Padre / Hijo' para display legible en el preview."""
    resp = sb.table('categories').select('id, name, parent_id').execute()
    rows = resp.data or []
    by_id = {r['id']: r for r in rows}
    names: dict[str, str] = {}
    for r in rows:
        if r['parent_id'] and r['parent_id'] in by_id:
            names[r['id']] = f"{by_id[r['parent_id']]['name']} / {r['name']}"
        else:
            names[r['id']] = r['name']
    return names


# ── Matching ─────────────────────────────────────────────────────────────────

def get_field_value(txn: dict, field: str) -> str:
    return (txn.get(field) or '').strip()


def match_rule(txn: dict, rule: dict) -> bool:
    field = rule.get('match_field', '')
    op    = rule.get('match_operator', '')
    val   = rule.get('match_value', '')

    if field not in ('counterparty', 'raw_concept', 'description'):
        return False

    target = get_field_value(txn, field)

    try:
        if op == 'contains':
            return val.lower() in target.lower()
        elif op == 'equals':
            return val.lower() == target.lower()
        elif op == 'starts_with':
            return target.lower().startswith(val.lower())
        elif op == 'regex':
            return re.search(val, target, re.IGNORECASE) is not None
    except Exception as e:
        print(f'  ⚠️  Regla #{rule["id"]} error en match: {e}')
    return False


def build_update_set(rule: dict) -> dict:
    """Solo los set_* no-null relevantes para recategorización pura."""
    update = {}
    if rule.get('set_category_id'):
        update['category_id'] = rule['set_category_id']
    if rule.get('set_project_id'):
        update['project_id'] = rule['set_project_id']
    if rule.get('set_nature'):
        update['nature'] = rule['set_nature']
    return update


# ── Plan builder ─────────────────────────────────────────────────────────────

def build_plan(txns: list[dict], rules: list[dict]) -> list[dict]:
    """
    Devuelve lista de dicts:
      { txn, rule_matched, update_set }
    Solo txns que matchean al menos una regla.
    """
    plan = []
    for txn in txns:
        for rule in rules:
            if match_rule(txn, rule):
                update = build_update_set(rule)
                if update:
                    plan.append({'txn': txn, 'rule': rule, 'update_set': update})
                break
    return plan


# ── Output ───────────────────────────────────────────────────────────────────

def fmt_amount(amount, currency='EUR') -> str:
    try:
        a = float(amount)
        sign = '+' if a >= 0 else ''
        return f'{sign}{a:.2f} {currency}'
    except Exception:
        return str(amount)


def print_preview(plan: list[dict], total_pending: int, cat_names: dict[str, str]) -> None:
    print(f'\n{SEPARATOR}')
    cat_counter: Counter = Counter()
    rule_counter: Counter = Counter()

    for i, item in enumerate(plan, 1):
        txn    = item['txn']
        rule   = item['rule']
        update = item['update_set']

        date       = txn.get('date', '?')
        party      = txn.get('counterparty') or txn.get('description') or '—'
        if len(party) > 50:
            party = party[:47] + '…'
        amount     = fmt_amount(txn.get('amount'), txn.get('currency', 'EUR'))
        field      = rule.get('match_field', '?')
        op         = rule.get('match_operator', '?')
        match_val  = rule.get('match_value', '?')
        rule_id    = rule.get('id', '?')[:8]

        cat_id = update.get('category_id')
        cat_label = cat_names.get(cat_id, cat_id) if cat_id else None
        proj_id   = update.get('project_id', '—') or '—'
        nature    = update.get('nature', '—') or '—'

        print(f'[{i:03d}] {date} · {party} · {amount}')
        print(f'       regla {rule_id} ({field} {op} "{match_val}")')
        arrow_parts = []
        if cat_label:
            arrow_parts.append(f'cat={cat_label}')
        if proj_id != '—':
            arrow_parts.append(f'project={proj_id}')
        if nature != '—':
            arrow_parts.append(f'nature={nature}')
        print(f'       → {" · ".join(arrow_parts) if arrow_parts else "(sin cambios en set_*)"}')

        if cat_id:
            cat_counter[cat_names.get(cat_id, cat_id)] += 1
        rule_counter[rule.get('match_value', rule_id)] += 1

    print(f'\n{SEPARATOR}')
    print(f'Resumen: {len(plan)} txns matchean (de {total_pending} pendientes), '
          f'{total_pending - len(plan)} sin match.')

    if cat_counter:
        print('\nPor categoría asignada:')
        for cat, count in cat_counter.most_common():
            print(f'  {count:3d}  {cat}')

    if rule_counter:
        print('\nPor valor de regla (txns matcheadas):')
        for val, count in rule_counter.most_common(10):
            print(f'  {count:3d}  "{val}"')

    print(f'\n{SEPARATOR}')


# ── Apply ─────────────────────────────────────────────────────────────────────

def apply_plan(sb, plan: list[dict]) -> None:
    total   = len(plan)
    success = 0
    failed  = 0

    print(f'\n{SEPARATOR}')
    print(f'Aplicando {total} updates...\n')

    for i, item in enumerate(plan, 1):
        txn_id     = item['txn']['id']
        update_set = item['update_set']
        try:
            sb.table('transactions').update(update_set).eq('id', txn_id).execute()
            print(f'[{i:03d}/{total}] ✓ {txn_id}')
            success += 1
        except Exception as e:
            print(f'[{i:03d}/{total}] ✗ {txn_id}  ERROR: {e}')
            failed += 1

    print(f'\n{SEPARATOR}')
    print(f'Completado: {success} éxitos, {failed} fallos.')
    print(f'{SEPARATOR}\n')


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Aplica reglas de clasificación a txns sin categoría.'
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', default=False,
                      help='Solo muestra preview, no modifica DB (default si no se pasa ningún flag)')
    mode.add_argument('--apply',   action='store_true', default=False,
                      help='Ejecuta los UPDATEs en DB')
    args = parser.parse_args()

    # Si no se pasa ningún flag, dry-run por defecto
    if not args.apply:
        args.dry_run = True

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print('ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar en .env')
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    print('Cargando reglas activas...')
    rules = load_rules(sb)
    print(f'  {len(rules)} reglas activas cargadas.')

    print('Cargando transacciones sin categoría...')
    txns = load_pending_transactions(sb)
    print(f'  {len(txns)} txns pendientes.')

    print('Cargando nombres de categorías...')
    cat_names = load_category_names(sb)

    if not rules:
        print('\nNo hay reglas activas. Nada que hacer.')
        return

    if not txns:
        print('\nNo hay txns pendientes. Nada que hacer.')
        return

    print('\nCalculando plan...')
    plan = build_plan(txns, rules)

    print_preview(plan, len(txns), cat_names)

    if not plan:
        print('Ninguna txn matchea las reglas activas.\n')
        return

    if args.dry_run:
        print('\n[DRY-RUN] No se ha modificado nada. Ejecuta con --apply para aplicar.\n')
    else:
        confirm = input(f'\n¿Aplicar {len(plan)} updates? [s/N] ').strip().lower()
        if confirm != 's':
            print('Abortado.\n')
            return
        apply_plan(sb, plan)


if __name__ == '__main__':
    main()
