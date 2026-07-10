#!/usr/bin/env python3
"""
parse_nominas.py — Parser de nóminas Nordex desde bucket Storage 'nominas'.

Flujo:
  1. Lista objetos del bucket 'nominas' (Supabase Storage).
  2. Descarga cada PDF a /tmp; extrae texto con: pdftotext -layout <pdf> -
  3. Parsea campos anclados a códigos de nómina Nordex España.
  4. Split bonus/mensual con cuadratura de sumas.
  5. UPSERT idempotente en incomes (source='nordex_payslip', source_id='{date}:{type}').

Disparo: workflow_dispatch (manual). Ver .github/workflows/parse_nominas.yml.

Formato números en el PDF:
  - Dinero  : miles con '.'  decimal con ','  (ej. 2.714,29)
  - Tipo/%  : punto decimal sin coma           (ej. 30.00)

Uso:
  python3 parse_nominas.py             # modo producción
  python3 parse_nominas.py --test /ruta/pdfs/  # golden test contra PDFs reales
"""

import os
import re
import sys
import logging
import subprocess
import tempfile
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Entorno
# ──────────────────────────────────────────────────────────────

SUPABASE_URL          = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY  = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
OWNER_USER_ID         = os.getenv('EGMFIN_OWNER_USER_ID')  # NO hardcoded

BUCKET    = 'nominas'
EMPLOYER  = 'Nordex Energy Spain, SAU'
SOURCE    = 'nordex_payslip'

# Regex dinero español: 3.223,55  o  -1.000,00
MONEY_RE = re.compile(r'-?\d{1,3}(?:\.\d{3})*,\d{2}')

# Regex tipo/%: 30.00  (punto, 2 decimales, sin coma)
RATE_RE  = re.compile(r'(?<!\d)(\d{1,3}\.\d{2})(?!\d)')

# Mapa de códigos de devengo extra → type de incomes.
# Cada código puede aparecer varias veces (reversión + recálculo); se suman con signo.
EXTRA_CODES: dict[str, str] = {
    '2053': 'bonus',
    '4000': 'paga_extra',
    '4001': 'paga_extra',   # Paga Extra Navidad
    '3068': 'paga_extra',   # Compl. Paga Extra maternidad
}

# Plantillas de concept por tipo de extra.
EXTRA_CONCEPTS: dict[str, str] = {
    'bonus':      'Bonus {mes} (Libre Disposición)',
    'paga_extra': 'Paga Extra {mes}',
}


# ──────────────────────────────────────────────────────────────
# Helpers de formato numérico
# ──────────────────────────────────────────────────────────────

def parse_money(s: str) -> Decimal:
    """'3.223,55' → Decimal('3223.55')"""
    return Decimal(s.replace('.', '').replace(',', '.'))


def rightmost_money(line: str) -> Optional[Decimal]:
    """Último importe de la línea (columna más a la derecha)."""
    matches = MONEY_RE.findall(line)
    return parse_money(matches[-1]) if matches else None


# ──────────────────────────────────────────────────────────────
# Extracción de texto
# ──────────────────────────────────────────────────────────────

def extract_text(pdf_path: str) -> str:
    """pdftotext -layout <pdf> - → stdout como string."""
    result = subprocess.run(
        ['pdftotext', '-layout', pdf_path, '-'],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


# ──────────────────────────────────────────────────────────────
# Extracción de campos (anclada a códigos Nordex)
# ──────────────────────────────────────────────────────────────

def extract_period(lines: list[str]) -> date:
    """
    Busca sobre el texto completo (no linea a linea) para que los saltos
    de linea del runner no impidan casar el par de fechas.
    r'\\D+?' (non-greedy) asegura el PRIMER par = inicio+fin de periodo.
    Fallback: primera fecha suelta del documento (= inicio de periodo en esta plantilla).
    La fecha de antiguedad (01/03/2022) suele ir despues, el par la descarta.
    """
    full = '\n'.join(lines)
    m = re.search(r'(\d{2}/\d{2}/\d{4})\D+?(\d{2}/\d{2}/\d{4})', full)
    if not m:
        m = re.search(r'(\d{2}/\d{2}/\d{4})', full)
    if not m:
        raise ValueError("Periodo no encontrado en el PDF")
    d_s, mo_s, y_s = m.group(1).split('/')
    return date(int(y_s), int(mo_s), 1)


def extract_net(lines: list[str]) -> Decimal:
    """
    Suma TODOS los importes de líneas con 'Importe:' (DOS PUNTOS obligatorios).
    Necesario para meses multi-transferencia (diciembre: 2.531,01 + 5.567,17 = 8.098,18).
    'Importe remuneraci' e 'Importe prorrata' NO llevan dos puntos → no colisionan.
    """
    total = Decimal('0')
    found = False
    for line in lines:
        if re.search(r'Importe\s*:', line, re.IGNORECASE):
            v = rightmost_money(line)
            if v is not None:
                total += v
                found = True
    if not found:
        raise ValueError("'Importe:' (con dos puntos) no encontrado en el PDF")
    return total


def extract_gross(lines: list[str]) -> Decimal:
    """
    Busca la linea que contiene 'remuneraci' Y 'mensual' (ASCII, sin tilde).
    Excluye 'Importe prorrata' (sin 'mensual') y 'Importe:' (es el net).
    Evidencia: enero l.40 '... Importe remuneracion mensual  5.343,95'
    """
    for line in lines:
        lo = line.lower()
        if 'remuneraci' in lo and 'mensual' in lo:
            v = rightmost_money(line)
            if v is not None:
                return v
    raise ValueError("Linea con 'remuneraci' + 'mensual' no encontrada en el PDF")


def extract_irpf_and_rate(lines: list[str]) -> tuple[Decimal, Decimal]:
    """
    Línea /401:
      irpf ← último importe de la línea
      rate ← número formato X.XX (punto decimal, sin coma) → /100
    """
    for line in lines:
        if re.match(r'\s*/401\b', line):
            irpf = rightmost_money(line)
            rate_m = RATE_RE.search(line)
            if irpf is None or rate_m is None:
                raise ValueError(
                    f"/401 encontrado pero no se puede extraer IRPF/tasa: {line!r}"
                )
            rate = Decimal(rate_m.group(1)) / Decimal('100')
            return irpf, rate
    raise ValueError("/401 (IRPF) no encontrado en el PDF")


def extract_ss(lines: list[str]) -> Decimal:
    """
    Seguridad Social = suma de últimos importes de:
      /350, /370, /380 → una vez cada uno
      /SC0             → todas las apariciones (puede repetirse; e.g. mayo: 2 veces)
    """
    SS_RE = re.compile(r'^\s*/(350|370|380|SC0)\b')
    total = Decimal('0')
    for line in lines:
        if SS_RE.match(line):
            v = rightmost_money(line)
            if v is not None:
                total += v
    return total


def extract_extras(lines: list[str]) -> dict[str, Decimal]:
    """
    Para cada código en EXTRA_CODES, suma TODAS sus ocurrencias respetando el signo.
    Múltiples códigos que mapean al mismo type (4000+4001+3068 → 'paga_extra') se acumulan.
    Retorna solo los extras con |gross| >= 0.01.
    """
    totals: dict[str, Decimal] = {}
    for code, income_type in EXTRA_CODES.items():
        code_re = re.compile(rf'^\s*{re.escape(code)}\b')
        code_total = Decimal('0')
        for line in lines:
            if code_re.match(line):
                v = rightmost_money(line)
                if v is not None:
                    code_total += v
        if abs(code_total) >= Decimal('0.01'):
            totals[income_type] = totals.get(income_type, Decimal('0')) + code_total
    return {k: v for k, v in totals.items() if abs(v) >= Decimal('0.01')}


def extract_devengos_deducc(lines: list[str]) -> Optional[tuple[Decimal, Decimal]]:
    """
    Localiza la línea que contiene 'T.DEVENGOS' (cabecera posicional) y lee
    los valores de la SIGUIENTE línea no vacía.
    T.DEVENGOS = penúltimo token de dinero; T.DEDUCC = último token.
    Verificado en dos PDFs reales:
      dic: penúltimo=11.591,61  último=3.493,43  (dif=8.098,18)
      ene: penúltimo=5.102,41   último=1.878,86  (dif=3.223,55)
    Retorna None si no se encuentra — el caller emite WARN y continúa.
    """
    for i, line in enumerate(lines):
        if 'T.DEVENGOS' not in line:
            continue
        # Busca la siguiente línea no vacía (fila de valores)
        for j in range(i + 1, len(lines)):
            if not lines[j].strip():
                continue
            tokens = MONEY_RE.findall(lines[j])
            if len(tokens) >= 2:
                return parse_money(tokens[-2]), parse_money(tokens[-1])
            break   # línea no vacía sin suficientes tokens → cabecera inesperada
    return None


def extract_dietas(lines: list[str]) -> Decimal:
    """
    Suma el devengo (rightmost money) de líneas cuyo concepto contiene
    'dieta', 'klm' o 'kilom' (ASCII, case-insensitive).
    V1: dietas_net = dietas_gross (suplido: sin IRPF/SS aplicables).
    """
    DIETA_RE = re.compile(r'dieta|klm\b|kilom', re.IGNORECASE)
    total = Decimal('0')
    for line in lines:
        if DIETA_RE.search(line):
            v = rightmost_money(line)
            if v is not None:
                total += v
    return total


# ──────────────────────────────────────────────────────────────
# Parseo completo de un PDF → filas para incomes
# ──────────────────────────────────────────────────────────────

def parse_payslip(pdf_path: str, filename: str) -> list[dict]:
    """
    Parsea un PDF de nómina Nordex y devuelve la lista de filas
    listas para insertar en public.incomes.

    Falla ruidosamente (excepción) si:
      - No se encuentran los campos anclados
      - Las sumas de las filas no cuadran con los totales extraídos
    """
    text  = extract_text(pdf_path)
    lines = text.split('\n')

    # Campos brutos
    period_date      = extract_period(lines)
    net_total        = extract_net(lines)
    gross_total      = extract_gross(lines)
    irpf_total, rate = extract_irpf_and_rate(lines)
    ss_total         = extract_ss(lines)
    extras           = extract_extras(lines)   # {type: gross}; respeta signo
    dietas_gross     = extract_dietas(lines)

    # ── Cross-check net = T.DEVENGOS − T.DEDUCC (soft si no se hallan) ──
    totals_pair = extract_devengos_deducc(lines)
    if totals_pair is None:
        logger.warning(
            "WARN cross-check omitido en %s — cabecera T.DEVENGOS no localizada", filename
        )
    else:
        devengos, deducc = totals_pair
        diff = abs((devengos - deducc) - net_total)
        if diff > Decimal('0.01'):
            raise ValueError(
                f"CROSS-CHECK FAIL: T.DEVENGOS({devengos}) - T.DEDUCC({deducc}) = "
                f"{devengos - deducc} ≠ net_total({net_total})  |diff|={diff}  en {filename}"
            )

    date_iso  = period_date.isoformat()
    mes_label = period_date.strftime('%B %Y').capitalize()   # "Enero 2026"

    rows: list[dict] = []

    # ── Filas de extras (bonus, paga_extra, …) ────────────────
    for extra_type, extra_gross in extras.items():
        extra_irpf = (extra_gross * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        extra_net  = extra_gross - extra_irpf   # ss = 0 (base SS topada)
        concept_tmpl = EXTRA_CONCEPTS.get(extra_type, '{mes} ' + extra_type)
        rows.append({
            'type':      extra_type,
            'gross':     extra_gross,
            'irpf':      extra_irpf,
            'ss':        Decimal('0'),
            'net':       extra_net,
            'concept':   concept_tmpl.format(mes=mes_label),
            'source_id': f"{date_iso}:{extra_type}",
        })

    # ── Fila dietas (suplidos: irpf=ss=0; net=gross) ─────────
    if abs(dietas_gross) >= Decimal('0.01'):
        rows.append({
            'type':      'dietas',
            'gross':     dietas_gross,
            'irpf':      Decimal('0'),
            'ss':        Decimal('0'),
            'net':       dietas_gross,
            'concept':   f"Dietas {mes_label}",
            'source_id': f"{date_iso}:dietas",
        })

    # ── Fila mensual residual (garantiza cuadratura exacta) ───
    rows.append({
        'type':      'nomina_mensual',
        'gross':     gross_total - sum(r['gross'] for r in rows),
        'irpf':      irpf_total  - sum(r['irpf']  for r in rows),
        'ss':        ss_total,
        'net':       net_total   - sum(r['net']   for r in rows),
        'concept':   f"Nomina {mes_label}",
        'source_id': f"{date_iso}:nomina_mensual",
    })

    # ── Asserts cuadratura (siempre, fallo ruidoso) ───────────
    sum_net   = sum(r['net']   for r in rows)
    sum_irpf  = sum(r['irpf']  for r in rows)
    sum_gross = sum(r['gross'] for r in rows)

    assert sum_net   == net_total,   \
        f"ASSERT net: {sum_net} ≠ {net_total} en {filename}"
    assert sum_irpf  == irpf_total,  \
        f"ASSERT irpf: {sum_irpf} ≠ {irpf_total} en {filename}"
    assert sum_gross == gross_total, \
        f"ASSERT gross: {sum_gross} ≠ {gross_total} en {filename}"

    # ── SANITY: mensual.net en rango esperado ─────────────────
    for r in rows:
        if r['type'] == 'nomina_mensual':
            if not (Decimal('1500') <= r['net'] <= Decimal('7000')):
                logger.warning(
                    "WARN mensual.net=%s fuera de [1500, 7000] en %s "
                    "— posible codigo extra no contemplado en EXTRA_CODES",
                    r['net'], mes_label,
                )

    # ── Campos comunes ─────────────────────────────────────────
    for r in rows:
        r.update({
            'date':                  date_iso,
            'user_id':               OWNER_USER_ID,
            'employer':              EMPLOYER,
            'source':                SOURCE,
            'art_7p_exempt_days':    None,   # flujo aparte (work_abroad_days)
            'art_7p_exempt_amount':  None,
        })

    return rows


# ──────────────────────────────────────────────────────────────
# Golden tests (valores reales verificados manualmente)
# ──────────────────────────────────────────────────────────────

GOLDEN_TESTS: dict[str, dict] = {
    # Clave: cualquier substring del nombre de archivo (ej. '2026-01', '112025').
    # extras: {type: gross esperado} — valida extract_extras por tipo.
    '2026-01': {
        'net_total':   Decimal('3223.55'),
        'gross_total': Decimal('5343.95'),
        'irpf_total':  Decimal('1526.69'),
        'ss_total':    Decimal('333.83'),
        'extras':      {},
        'n_rows':      1,
    },
    '2026-05': {
        'net_total':   Decimal('17613.95'),
        'gross_total': Decimal('25935.30'),
        'irpf_total':  Decimal('7702.33'),
        'ss_total':    Decimal('352.37'),
        'extras':      {'bonus': Decimal('20577.35')},
        'n_rows':      2,
        'sum_net':     Decimal('17613.95'),
    },
    # Noviembre 2025: paga_extra = suma de las dos líneas 4000
    # (-4.857,46 + 5.100,52 = 243,06). Fixture de regresión para extract_extras.
    # Totales brutos del PDF necesarios para sum_net; completar cuando se disponga del PDF.
    '112025': {
        'extras':  {'paga_extra': Decimal('243.06')},
    },
    # Diciembre 2025: multi-transferencia (2.531,01 + 5.567,17 = 8.098,18)
    # paga_extra: 4001 (3.615,73 Navidad) + 3068 (1.888,19 Compl. Maternidad) = 5.503,92
    # dietas_gross: completar con valor real del PDF (ver bloque dietas/Klm)
    '122025': {
        'net_total': Decimal('8098.18'),
        'extras':    {'paga_extra': Decimal('5503.92')},
    },
}


def run_golden_tests(pdf_dir: str) -> None:
    """
    Parsea todos los PDFs en pdf_dir y valida contra GOLDEN_TESTS
    para los meses conocidos. Salida detallada; exit 1 si algún assert falla.
    """
    import pathlib
    failed = 0
    checked = 0
    for pdf in sorted(pathlib.Path(pdf_dir).glob('*.pdf')):
        filename = pdf.name
        logger.info("GOLDEN TEST: %s", filename)
        try:
            text  = extract_text(str(pdf))
            lines = text.split('\n')
            net_total        = extract_net(lines)
            gross_total      = extract_gross(lines)
            irpf_total, rate = extract_irpf_and_rate(lines)
            ss_total         = extract_ss(lines)
            extras           = extract_extras(lines)
            dietas_gross     = extract_dietas(lines)
            rows             = parse_payslip(str(pdf), filename)
        except Exception as e:
            logger.error("  ERROR: %s", e)
            failed += 1
            continue

        # Buscar golden entry para este archivo
        golden = next((v for k, v in GOLDEN_TESTS.items() if k in filename), None)
        if golden is None:
            logger.info("  (sin golden para %s — solo cuadratura verificada)", filename)
            continue

        checked += 1
        errs: list[str] = []

        def chk(label: str, got: Decimal, expected: Decimal) -> None:
            if got != expected:
                errs.append(f"  {label}: got={got}  expected={expected}")

        if 'net_total'   in golden: chk('net_total',   net_total,   golden['net_total'])
        if 'gross_total' in golden: chk('gross_total', gross_total, golden['gross_total'])
        if 'irpf_total'  in golden: chk('irpf_total',  irpf_total,  golden['irpf_total'])
        if 'ss_total'    in golden: chk('ss_total',    ss_total,    golden['ss_total'])

        if 'extras' in golden:
            for etype, expected_gross in golden['extras'].items():
                chk(f'extras[{etype}]', extras.get(etype, Decimal('0')), expected_gross)
            # Extras NO esperados no deben aparecer
            for etype in extras:
                if etype not in golden['extras']:
                    errs.append(f"  extras[{etype}] inesperado: got={extras[etype]}")

        if 'dietas_gross' in golden:
            chk('dietas_gross', dietas_gross, golden['dietas_gross'])

        if 'n_rows' in golden and len(rows) != golden['n_rows']:
            errs.append(f"  n_rows: got={len(rows)}  expected={golden['n_rows']}")

        if 'sum_net' in golden:
            actual_sum = sum(r['net'] for r in rows)
            chk('sum_net', actual_sum, golden['sum_net'])

        if errs:
            logger.error("  FAIL:")
            for e in errs:
                logger.error(e)
            failed += 1
        else:
            logger.info("  OK — todos los campos coinciden")

    logger.info("GOLDEN: %d archivos evaluados | %d con golden | %d fallos", len(list(pathlib.Path(pdf_dir).glob('*.pdf'))), checked, failed)
    if failed:
        sys.exit(1)


# ──────────────────────────────────────────────────────────────
# Main — modo producción
# ──────────────────────────────────────────────────────────────

def main() -> None:
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, OWNER_USER_ID]):
        logger.error(
            "Faltan variables de entorno: "
            "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EGMFIN_OWNER_USER_ID"
        )
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)  # type: ignore[arg-type]

    # Lista objetos del bucket
    res = supabase.storage.from_(BUCKET).list()
    if not res:
        logger.info("Bucket '%s' vacío — nada que procesar.", BUCKET)
        return

    parsed     = 0
    skipped    = 0
    errors     = 0
    pdfs_found = 0

    for obj in res:
        filename = obj.get('name', '')
        if not filename.lower().endswith('.pdf'):
            continue
        pdfs_found += 1

        logger.info("Procesando: %s", filename)

        tmp_path: Optional[str] = None
        try:
            # Descarga a /tmp
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                tmp_path = tmp.name

            data = supabase.storage.from_(BUCKET).download(filename)
            with open(tmp_path, 'wb') as f:
                f.write(data)

            # Parseo (falla ruidosamente si algo no cuadra)
            rows = parse_payslip(tmp_path, filename)

            # Inserción idempotente
            for row in rows:
                source_id = row['source_id']

                existing = (
                    supabase.table('incomes')
                    .select('id')
                    .eq('source', SOURCE)
                    .eq('source_id', source_id)
                    .execute()
                )
                if existing.data:
                    logger.info("  SKIP %s (ya en DB)", source_id)
                    skipped += 1
                    continue

                payload = {
                    'date':                  row['date'],
                    'user_id':               row['user_id'],
                    'type':                  row['type'],
                    'gross_amount':          float(row['gross']),
                    'irpf_withheld':         float(row['irpf']),
                    'ss_withheld':           float(row['ss']),
                    'net_amount':            float(row['net']),
                    'employer':              row['employer'],
                    'concept':               row['concept'],
                    'source':                row['source'],
                    'source_id':             source_id,
                    'art_7p_exempt_days':    row['art_7p_exempt_days'],
                    'art_7p_exempt_amount':  row['art_7p_exempt_amount'],
                }
                supabase.table('incomes').insert(payload).execute()
                logger.info("  INSERT %s (%s)", source_id, row['concept'])
                parsed += 1

        except Exception as e:
            logger.error("ERROR procesando %s: %s", filename, e, exc_info=True)
            errors += 1

        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    # Visibilidad — nunca éxito silencioso (lección del 422)
    logger.info(
        "RESULTADO: parseadas=%d | saltadas (ya en DB)=%d | errores=%d | pdfs_encontrados=%d",
        parsed, skipped, errors, pdfs_found,
    )

    # Pulso del job (D-026)
    # partial si el bucket no contenía ningún PDF (vacío lógico aunque haya otros objetos)
    run_status = 'error' if errors > 0 else ('partial' if pdfs_found == 0 else 'ok')
    try:
        supabase.table('job_runs').insert({
            'job_name': 'parse_nominas',
            'status':   run_status,
            'detail': {
                'pdfs_found': pdfs_found,
                'parsed':     parsed,
                'skipped':    skipped,
                'errors':     errors,
            },
        }).execute()
    except Exception as e:
        logger.warning("WARN: no se pudo guardar job_run: %s", e)

    if errors > 0:
        sys.exit(1)


if __name__ == '__main__':
    if '--test' in sys.argv:
        idx = sys.argv.index('--test')
        pdf_dir = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else '.'
        run_golden_tests(pdf_dir)
    else:
        main()
