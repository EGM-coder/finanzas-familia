#!/usr/bin/env python3
"""
close_week.py — Cierre semanal automático + fraseo Claude.

Pieza 2 del loop de cierre semanal (D-020):
  1. Llama fn_close_week(target_week) vía service_role → escribe deterministas + data_health.
  2. Relee las 3 filas de weekly_closures. Para cada scope:
       - data_health='ok'  → construye payload de hechos, llama Anthropic (claude-haiku),
         UPDATE insights con el array de strings devuelto.
       - data_health≠'ok'  → insights = [{type:'health', reason:health_reason}]
         generado en Python SIN LLM (no frasear sobre dato roto/parcial). P-016.
  3. exit≠0 ante fallo duro (RPC, API). Log ruidoso, nunca silencioso. T-038.

Modelo: claude-haiku-4-5-20251001 (barato, suficiente para fraseo).
Cron: lunes 06:00 UTC — semana ISO recién cerrada (lunes-domingo anterior).
"""

import os
import sys
import json
import logging
from datetime import date, timedelta

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
    'Recibes hechos numéricos. Redacta 1–3 observaciones BREVES en castellano, '
    'registro editorial sobrio. '
    'Reglas inviolables: '
    '(1) cada frase anclada a un número del input; '
    '(2) describe SOLO la semana que terminó, nunca la próxima; '
    '(3) prohibido recomendar, prescribir o sugerir acciones; '
    '(4) prohibido inferir periodicidad o decir "toca"; '
    '(5) prohibido introducir cualquier dato o señal que no esté en el input. '
    'Devuelve SOLO un array JSON de strings, sin preámbulo ni markdown.'
)


def target_monday() -> date:
    """Lunes de la semana ISO recién cerrada (semana anterior completa)."""
    today = date.today()
    days_since_monday = today.weekday()   # 0=Mon … 6=Sun
    this_monday = today - timedelta(days=days_since_monday)
    return this_monday - timedelta(weeks=1)


def build_facts(row: dict, medians: dict) -> str:
    """Payload JSON de hechos para el LLM. Solo números ya calculados."""
    week_start = date.fromisoformat(str(row['week_start']))
    week_end   = week_start + timedelta(days=6)

    top_devs = row.get('top_deviations') or []
    enriched = []
    for d in top_devs:
        cat_id = d.get('category_id')
        med    = medians.get(cat_id, {}).get('median_spent')
        enriched.append({
            **d,
            'median_3m': round(float(med), 2) if med is not None else None,
        })

    return json.dumps({
        'scope':         row['scope'],
        'week_start':    str(week_start),
        'week_end':      str(week_end),
        'total_spent':   float(row['total_spent']),
        'total_budget':  float(row['total_budget']),
        'semaforo':      row['semaforo'],
        'top_deviations': enriched,
    }, ensure_ascii=False)


def phrase_with_llm(client: anthropic.Anthropic, facts: str) -> list[str]:
    """Llama al LLM y devuelve lista de strings. Lanza en fallo duro (T-038)."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': facts}],
    )
    raw = response.content[0].text.strip()
    # Quitar code fences si el modelo los añade a pesar del system prompt
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
        logger.error('❌  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados')
        sys.exit(1)
    if not ANTHROPIC_API_KEY:
        logger.error(
            '❌  ANTHROPIC_API_KEY no configurado — '
            'añadir secret en GitHub Actions antes del primer run del cron'
        )
        sys.exit(1)

    sb   = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    anth = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    week = target_monday()
    logger.info(f'📅  Cerrando semana {week} – {week + timedelta(days=6)}')

    # ── Pieza 1: calcular deterministas + salud ───────────────────────────────────
    logger.info('⚙️   Llamando fn_close_week…')
    try:
        sb.rpc('fn_close_week', {'p_week_start': str(week)}).execute()
        logger.info('✅  fn_close_week completado')
    except Exception as exc:
        logger.error(f'❌  fn_close_week falló: {exc}')
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
        logger.error(f'❌  No se pueden releer weekly_closures: {exc}')
        sys.exit(1)

    if not rows:
        logger.error(f'❌  weekly_closures vacío para {week} — fn_close_week no creó filas')
        sys.exit(1)

    # ── Precargar medianas 3m para las categorías del top_deviations ─────────────
    all_cat_ids = list({
        d['category_id']
        for r in rows
        for d in (r.get('top_deviations') or [])
        if d.get('category_id')
    })
    medians: dict = {}
    if all_cat_ids:
        try:
            med_rows = (
                sb.from_('v_median_spend_3m_by_category')
                  .select('category_id, median_spent')
                  .in_('category_id', all_cat_ids)
                  .execute()
                  .data or []
            )
            medians = {r['category_id']: r for r in med_rows}
        except Exception as exc:
            logger.warning(f'⚠️   medianas 3m no disponibles: {exc}')

    # ── Fraseo por scope ──────────────────────────────────────────────────────────
    exit_code = 0
    for row in rows:
        scope  = row['scope']
        health = row['data_health']
        logger.info(
            f'  scope={scope}  data_health={health}  semaforo={row["semaforo"]}'
        )

        if health == 'ok':
            facts = build_facts(row, medians)
            try:
                insights = phrase_with_llm(anth, facts)
                logger.info(f'    🤖  {len(insights)} observaciones generadas')
            except Exception as exc:
                logger.error(f'    ❌  LLM falló para {scope}: {exc}')
                exit_code = 1
                insights = [{'type': 'error', 'reason': str(exc)}]
        else:
            # Caso degradado (data_health='parcial'|'roto'): no invocar LLM. P-016.
            health_reason = row.get('health_reason') or health
            insights = [{'type': 'health', 'reason': health_reason}]
            logger.info(f'    ⚠️   degradado → insights de salud sin LLM')

        try:
            sb.table('weekly_closures') \
              .update({'insights': insights}) \
              .eq('week_start', str(week)) \
              .eq('scope', scope) \
              .execute()
        except Exception as exc:
            logger.error(f'    ❌  UPDATE insights {scope}: {exc}')
            exit_code = 1

    # ── Resumen ───────────────────────────────────────────────────────────────────
    n_ok = sum(1 for r in rows if r['data_health'] == 'ok')
    n_bad = len(rows) - n_ok
    flag  = '✅' if exit_code == 0 else '❌'
    logger.info(
        f'{flag}  Cierre {week} · {len(rows)} scopes · {n_ok} ok · {n_bad} parcial/roto'
    )
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
