#!/usr/bin/env python3
"""
close_week.py — Cierre semanal automático + fraseo Claude.

Pieza 2 del loop de cierre semanal (D-020, D-022):
  1. Llama fn_close_week(target_week) vía service_role → escribe deterministas + data_health.
  2. Relee las 3 filas de weekly_closures. Para cada scope:
       a. total_spent=0          → insight templado SIN LLM: "Una semana en silencio."
       b. semaforo IS NULL       → insight templado SIN LLM: "Aún sin histórico suficiente. Decide tú."
       c. data_health≠'ok'       → insight templado SIN LLM con health_reason ya parafraseado. P-016.
       d. ok + semaforo + gasto  → construye payload de hechos, llama Anthropic (claude-haiku).
  3. exit≠0 ante fallo duro (RPC, API). Log ruidoso, nunca silencioso.

Modelo: claude-haiku-4-5-20251001 (barato, suficiente para fraseo).
Cron: lunes 06:00 UTC — semana ISO recién cerrada (lunes-domingo anterior).
"""

import os
import sys
import json
import logging
import statistics
from datetime import date, timedelta
from collections import defaultdict

import anthropic
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-7s  %(message)s',
)
logger = logging.getLogger(__name__)

SUPABASE_URL         = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
ANTHROPIC_API_KEY    = os.environ.get('ANTHROPIC_API_KEY')

MODEL = 'claude-haiku-4-5-20251001'

SYSTEM_PROMPT = (
    'Eres el motor de fraseo de un cierre semanal financiero ya calculado. '
    'Recibes hechos numéricos de la semana cerrada. Redacta 1–3 observaciones BREVES en castellano, '
    'registro editorial sobrio. '
    'Reglas inviolables: '
    '(1) cada frase anclada a un número del input; '
    '(2) describe SOLO la semana que terminó, nunca la próxima; '
    '(3) compara el gasto contra "lo habitual" — nunca uses la palabra "presupuesto"; '
    '(4) prohibido recomendar, prescribir o sugerir acciones; '
    '(5) prohibido inferir periodicidad o decir "toca"; '
    '(6) prohibido introducir cualquier dato o señal que no esté en el input. '
    'Devuelve SOLO un array JSON de strings, sin preámbulo ni markdown.'
)


def target_monday() -> date:
    """Lunes de la semana ISO recién cerrada (semana anterior completa)."""
    today = date.today()
    days_since_monday = today.weekday()   # 0=Mon … 6=Sun
    this_monday = today - timedelta(days=days_since_monday)
    return this_monday - timedelta(weeks=1)


def compute_total_habitual(sb, scope: str, week: date) -> float:
    """
    Mediana semanal por categoría (últimas 8 semanas), sumada solo para
    las categorías con gasto esta semana. Replica la lógica de fn_close_week.
    """
    prior_start = week - timedelta(weeks=8)

    cats_res = (
        sb.from_('v_spent_by_category_week')
          .select('category_id')
          .eq('visibility', scope)
          .eq('week_start', str(week))
          .execute()
    )
    this_week_cat_ids = [r['category_id'] for r in (cats_res.data or [])]
    if not this_week_cat_ids:
        return 0.0

    hist_res = (
        sb.from_('v_spent_by_category_week')
          .select('category_id,spent')
          .eq('visibility', scope)
          .gte('week_start', str(prior_start))
          .lt('week_start', str(week))
          .in_('category_id', this_week_cat_ids)
          .execute()
    )

    cat_spends: dict[str, list[float]] = defaultdict(list)
    for r in (hist_res.data or []):
        cat_spends[r['category_id']].append(float(r['spent']))

    total = 0.0
    for spends in cat_spends.values():
        if spends:
            total += statistics.median(spends)
    return round(total, 2)


def build_facts(row: dict, total_habitual: float) -> str:
    """Payload JSON de hechos para el LLM. Solo números ya calculados."""
    week_start = date.fromisoformat(str(row['week_start']))
    week_end   = week_start + timedelta(days=6)

    return json.dumps({
        'scope':          row['scope'],
        'week_start':     str(week_start),
        'week_end':       str(week_end),
        'total_spent':    float(row['total_spent']),
        'total_habitual': total_habitual,
        'semaforo':       row['semaforo'],
        'top_deviations': row.get('top_deviations') or [],
    }, ensure_ascii=False)


def phrase_with_llm(client: anthropic.Anthropic, facts: str) -> list[str]:
    """Llama al LLM y devuelve lista de strings. Lanza en fallo duro."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': facts}],
    )
    raw = response.content[0].text.strip()
    if raw.startswith('```'):
        parts = raw.split('```')
        raw = parts[1]
        if raw.startswith('json'):
            raw = raw[4:]
        raw = raw.strip()
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise ValueError(f'LLM devolvió no-lista: {parsed!r}')
    return [str(s) for s in parsed]


def main() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados')
        sys.exit(1)
    if not ANTHROPIC_API_KEY:
        logger.error(
            'ANTHROPIC_API_KEY no configurado — '
            'añadir secret en GitHub Actions antes del primer run del cron'
        )
        sys.exit(1)

    sb   = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    anth = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    week = target_monday()
    logger.info(f'Cerrando semana {week} – {week + timedelta(days=6)}')

    # ── Pieza 1: calcular deterministas + salud ───────────────────────────────────
    logger.info('Llamando fn_close_week…')
    try:
        sb.rpc('fn_close_week', {'p_week_start': str(week)}).execute()
        logger.info('fn_close_week completado')
    except Exception as exc:
        logger.error(f'fn_close_week falló: {exc}')
        sys.exit(1)

    # ── Releer las 3 filas ────────────────────────────────────────────────────────
    try:
        rows = (
            sb.table('weekly_closures')
              .select('*')
              .eq('week_start', str(week))
              .execute()
              .data or []
        )
    except Exception as exc:
        logger.error(f'No se pueden releer weekly_closures: {exc}')
        sys.exit(1)

    if not rows:
        logger.error(f'weekly_closures vacío para {week} — fn_close_week no creó filas')
        sys.exit(1)

    # ── Fraseo por scope ──────────────────────────────────────────────────────────
    exit_code = 0
    for row in rows:
        scope     = row['scope']
        health    = row['data_health']
        semaforo  = row.get('semaforo')
        spent     = float(row['total_spent'] or 0)

        logger.info(f'  scope={scope}  data_health={health}  semaforo={semaforo}')

        if spent == 0:
            # Semana sin gasto registrado — no invocar LLM.
            insights = ['Una semana en silencio.']
            logger.info('    → semana en silencio (total_spent=0)')

        elif semaforo is None:
            # Histórico insuficiente (< 4 semanas) — estado temprano legítimo, no error. D-022.
            insights = ['Aún sin histórico suficiente. Decide tú.']
            logger.info('    → sin histórico (semaforo NULL)')

        elif health != 'ok':
            # Dato roto o parcial — no frasear sobre dato incierto. P-016.
            health_reason = row.get('health_reason') or health
            insights = [{'type': 'health', 'reason': health_reason}]
            logger.info(f'    → degradado ({health}): {health_reason}')

        else:
            # data_health='ok' AND semaforo NOT NULL AND total_spent>0 → llamar Claude.
            try:
                total_habitual = compute_total_habitual(sb, scope, week)
            except Exception as exc:
                logger.warning(f'    compute_total_habitual falló para {scope}: {exc}')
                total_habitual = 0.0

            facts = build_facts(row, total_habitual)
            try:
                insights = phrase_with_llm(anth, facts)
                logger.info(f'    {len(insights)} observaciones generadas')
            except Exception as exc:
                logger.error(f'    LLM falló para {scope}: {exc}')
                exit_code = 1
                insights = [{'type': 'error', 'reason': str(exc)}]

        try:
            sb.table('weekly_closures') \
              .update({'insights': insights}) \
              .eq('week_start', str(week)) \
              .eq('scope', scope) \
              .execute()
        except Exception as exc:
            logger.error(f'    UPDATE insights {scope}: {exc}')
            exit_code = 1

    # ── Resumen ───────────────────────────────────────────────────────────────────
    n_ok  = sum(1 for r in rows if r['data_health'] == 'ok')
    n_bad = len(rows) - n_ok
    flag  = 'OK' if exit_code == 0 else 'ERROR'
    logger.info(
        f'{flag}  Cierre {week} · {len(rows)} scopes · {n_ok} ok · {n_bad} parcial/roto'
    )
    # Toast de cierre (§4.3): "Semana cerrada." — lo surfacea el frontend al leer insights.
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
