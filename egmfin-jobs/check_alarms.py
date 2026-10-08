#!/usr/bin/env python3
"""
check_alarms.py — Reenvía las alarmas de datos de EGMFin a Healthchecks.io.

Las vistas v_*_freshness viven dentro de Supabase: si nadie las mira, no avisan.
Este script las lee y traduce su estado a un ping externo:
  - alguna fila con status='rojo'  → ping('egmfin-alarmas', 'fail', motivo legible)
  - ninguna en rojo                → ping('egmfin-alarmas', 'ok')
  - no se puede leer la base       → ping('egmfin-alarmas', 'fail', motivo) — base pausada/caída

Descubre las vistas v_*_freshness en cada ejecución vía la especificación OpenAPI
de PostgREST (refleja lo expuesto en el schema public). No crea nada en BBDD.

Disparo: step final del workflow sync_psd2 (ver .github/workflows/sync_psd2.yml).

Uso:
  python3 check_alarms.py               # modo normal
  python3 check_alarms.py --test-fail   # fuerza un /fail controlado (prueba del vigilante);
                                        # no escribe en job_runs
"""

import json
import logging
import os
import re
import sys
import urllib.request
from datetime import date
from decimal import Decimal

from dotenv import load_dotenv
from supabase import create_client

import hc

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

SUPABASE_URL         = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

SLUG         = 'egmfin-alarmas'
FRESHNESS_RE = re.compile(r'^/(v_[a-z0-9_]+_freshness)$')
MESES        = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


# ── Formato ──────────────────────────────────────────────────

def fmt_eur(v) -> str:
    """3943.89 → '3.943,89'"""
    s = f"{Decimal(str(v)):,.2f}"
    return s.replace(',', '_').replace('.', ',').replace('_', '.')


def fmt_day(iso: str) -> str:
    """'2026-07-29' → '29-jul'"""
    d = date.fromisoformat(iso[:10])
    return f"{d.day}-{MESES[d.month - 1]}"


def describe_income(row: dict) -> str:
    parts = []
    if row.get('unmatched_deposit_date'):
        parts.append(
            f"abono {fmt_day(row['unmatched_deposit_date'])} "
            f"{fmt_eur(row['unmatched_deposit_amount'])} sin nómina casada, "
            f"{row['days_since_deposit']} días"
        )
    if row.get('last_income_date'):
        parts.append(
            f"última nómina {fmt_day(row['last_income_date'])}, "
            f"hace {row['days_since_last_income']} días"
        )
    return "Nómina: " + "; ".join(parts)


def describe_generic(view: str, row: dict) -> str:
    fields = ', '.join(f"{k}={v}" for k, v in row.items() if k != 'status' and v is not None)
    return f"{view}: {fields}"


DESCRIBERS = {'v_income_freshness': describe_income}


# ── Lectura ──────────────────────────────────────────────────

def discover_freshness_views() -> list[str]:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/",
        headers={'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f"Bearer {SUPABASE_SERVICE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        spec = json.load(resp)
    views = []
    for path in spec.get('paths', {}):
        m = FRESHNESS_RE.match(path)
        if m:
            views.append(m.group(1))
    return sorted(views)


def collect_reds(sb, views: list[str]) -> tuple[list[str], dict]:
    reds: list[str] = []
    statuses: dict = {}
    for view in views:
        rows = sb.table(view).select('*').execute().data or []
        statuses[view] = [r.get('status') for r in rows]
        for row in rows:
            if row.get('status') == 'rojo':
                reds.append(DESCRIBERS.get(view, lambda r, v=view: describe_generic(v, r))(row))
    return reds, statuses


# ── Main ─────────────────────────────────────────────────────

def main() -> None:
    if '--test-fail' in sys.argv:
        logger.warning("MODO PRUEBA: forzando /fail controlado en %s", SLUG)
        sent = hc.ping(SLUG, 'fail', "PRUEBA controlada de check_alarms --test-fail. Ignorar.")
        logger.info("RESULTADO prueba: ping fail %s", 'ENVIADO' if sent else 'NO enviado')
        sys.exit(0 if sent else 1)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        hc.ping(SLUG, 'fail', "check_alarms: faltan credenciales de Supabase en el workflow")
        sys.exit(1)

    try:
        sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        views = discover_freshness_views()
        logger.info("Vistas de frescura encontradas: %s", views)
        reds, statuses = collect_reds(sb, views)
    except Exception as e:
        # Base pausada/caída: justo lo que la vigilancia interna no puede contar
        logger.error("No se pudieron leer las alarmas: %s", e, exc_info=True)
        hc.ping(SLUG, 'fail', f"check_alarms no puede leer Supabase (¿base pausada?): {type(e).__name__}: {e}")
        sys.exit(1)

    if not views:
        reds.append("check_alarms: no se encontró ninguna vista v_*_freshness")

    for view, sts in statuses.items():
        logger.info("  %s → %s", view, sts)

    if reds:
        motivo = " | ".join(reds)
        logger.warning("ALARMA ROJA: %s", motivo)
        hc.ping(SLUG, 'fail', motivo)
    else:
        logger.info("Sin alarmas en rojo")
        hc.ping(SLUG, 'ok')

    # Pulso del job (D-026): el job funcionó aunque haya alarmas; el rojo va en detail
    try:
        sb.table('job_runs').insert({
            'job_name': 'check_alarms',
            'status':   'ok',
            'detail':   {'views': statuses, 'reds': reds},
        }).execute()
    except Exception as e:
        logger.warning("WARN: no se pudo guardar job_run: %s", e)


if __name__ == '__main__':
    main()
