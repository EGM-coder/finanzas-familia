#!/usr/bin/env python3
"""
hc.py — Pings a Healthchecks.io: la vigilancia de EGMFin vive FUERA de EGMFin.

Si GitHub desactiva los crons o Supabase pausa la base, las alarmas internas
(job_runs, v_*_freshness) mueren con ellas. Healthchecks avisa por correo cuando
un check recibe /fail o deja de recibir pings. Ver docs/VIGILANCIA.md.

URL: https://hc-ping.com/<HC_PING_KEY>/<slug>[/start|/fail]?create=1
  (create=1 autoprovisiona el check la primera vez que se pinguea el slug)

Garantías:
  - NUNCA lanza excepción: un fallo de Healthchecks no puede tumbar un job.
  - Sin HC_PING_KEY → no hace nada y lo loguea.
  - Timeout 10 s, 1 reintento.

Uso como librería:
  import hc
  hc.ping('egmfin-sync-psd2', 'start')
  hc.run('egmfin-sync-psd2', sync_psd2)   # start + ok/fail según el resultado

Uso desde CLI (workflows):
  python3 hc.py <slug> <start|ok|fail> [motivo]
"""

import logging
import os
import sys
import time
import traceback
import urllib.request
from typing import Callable

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger('hc')

HC_BASE      = 'https://hc-ping.com'
TIMEOUT_S    = 10
RETRIES      = 1
MAX_BODY     = 500
SUFFIX       = {'start': '/start', 'ok': '', 'fail': '/fail'}


def ping(slug: str, status: str, body: str = '') -> bool:
    """Envía un ping. Devuelve True si Healthchecks respondió 2xx. Nunca lanza."""
    try:
        key = os.getenv('HC_PING_KEY')
        if not key:
            logger.warning("HC: sin HC_PING_KEY — ping %s/%s omitido", slug, status)
            return False
        if status not in SUFFIX:
            logger.warning("HC: status desconocido %r — ping %s omitido", status, slug)
            return False

        url  = f"{HC_BASE}/{key}/{slug}{SUFFIX[status]}?create=1"
        data = body[:MAX_BODY].encode('utf-8') if body else None

        for attempt in range(RETRIES + 1):
            try:
                req = urllib.request.Request(url, data=data, method='POST')
                with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                    logger.info("HC: ping %s/%s → %s", slug, status, resp.status)
                    return 200 <= resp.status < 300
            except Exception as e:
                # El mensaje de urllib no incluye la URL → el ping key no llega al log
                logger.warning(
                    "HC: ping %s/%s intento %d falló: %s",
                    slug, status, attempt + 1, type(e).__name__,
                )
                if attempt < RETRIES:
                    time.sleep(2)
        return False
    except Exception as e:  # cinturón y tirantes: nada sale de aquí
        logger.warning("HC: error inesperado en ping %s/%s: %s", slug, status, type(e).__name__)
        return False


def run(slug: str, fn: Callable[[], object]) -> None:
    """
    Ejecuta fn() envuelto en pings: 'start' al empezar, 'ok' si termina con
    código 0 (los jobs salen con 0 en status ok y partial), 'fail' si sale con
    código ≠ 0 o lanza. Respeta el código de salida y re-lanza la excepción.
    """
    # No-op si el job ya configuró logging; update_prices usa print y no lo hace
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    ping(slug, 'start')
    try:
        fn()
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        if code == 0:
            ping(slug, 'ok')
        else:
            ping(slug, 'fail', f"{slug} terminó con exit code {code}. Ver log en GitHub Actions.")
        raise
    except BaseException as e:
        tb = traceback.format_exception_only(type(e), e)[-1].strip()
        ping(slug, 'fail', f"{slug} excepción: {tb}")
        raise
    ping(slug, 'ok')


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    if len(sys.argv) < 3:
        print("Uso: python3 hc.py <slug> <start|ok|fail> [motivo]")
        sys.exit(2)
    ping(sys.argv[1], sys.argv[2], ' '.join(sys.argv[3:]))
    # Nunca falla el step que lo llama
    sys.exit(0)
