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
    """Primera fecha dd/mm/yyyy de la fila de PERIODO → día 1 del mes."""
    DATE_RE = re.compile(r'\b(\d{2}/\d{2}/\d{4})\b')
    for line in lines:
        if re.search(r'PERIOD', line, re.IGNORECASE):
            m = DATE_RE.search(line)
            if m:
                d_s, mo_s, y_s = m.group(1).split('/')
                return date(int(y_s), int(mo_s), 1)
    raise ValueError("Periodo no encontrado en el PDF")


def extract_liquido_total(text: str) -> Decimal:
    """LIQUIDO TOTAL seguido del importe (\\s+ cruza salto de línea)."""
    m = re.search(
        r'LIQUIDO\s+TOTAL\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})',
        text,
        re.IGNORECASE,
    )
    if not m:
        raise ValueError("'LIQUIDO TOTAL' no encontrado en el PDF")
    return parse_money(m.group(1))


def extract_importe_cuenta(lines: list[str]) -> Optional[Decimal]:
    """
    Extrae el importe de la línea de cuenta ****4940.
    Usado como doble-check contra LIQUIDO TOTAL.
    """
    for line in lines:
        if '4940' in line:
            # Intenta patrón "Importe: X"
            m = re.search(
                r'Importe\s*:?\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})',
                line,
                re.IGNORECASE,
            )
            if m:
                return parse_money(m.group(1))
            # Fallback: último importe en la línea con la cuenta
            v = rightmost_money(line)
            if v is not None:
                return v
    return None


def extract_gross(text: str) -> Decimal:
    """
    Ancla 'Importe remuneración mensual' → importe siguiente.
    Equivale a REM. TOTAL; más robusto que buscar la columna.
    """
    m = re.search(
        r'Importe\s+remuneraci[oó]n\s+mensual\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})',
        text,
        re.IGNORECASE,
    )
    if not m:
        raise ValueError("'Importe remuneración mensual' no encontrado")
    return parse_money(m.group(1))


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


def extract_bonus(lines: list[str]) -> Decimal:
    """
    Código 2053 = Libre Disposición (bonus variable).
    Retorna 0 si la línea no existe en el PDF.
    El importe es el de DEVENGOS (único en esta línea).
    TODO: paga_extra — código de devengo aún desconocido; punto de extensión.
    """
    for line in lines:
        if re.match(r'\s*2053\b', line):
            v = rightmost_money(line)
            if v is not None:
                return v
    return Decimal('0')


# ──────────────────────────────────────────────────────────────
# Parseo completo de un PDF → filas para incomes
# ──────────────────────────────────────────────────────────────

def parse_payslip(pdf_path: str, filename: str) -> list[dict]:
    """
    Parsea un PDF de nómina Nordex y devuelve la lista de filas
    listas para insertar en public.incomes.

    Falla ruidosamente (excepción) si:
      - No se encuentran los campos anclados
      - El doble-check LIQUIDO TOTAL ≠ Importe cuenta
      - Las sumas de las filas no cuadran con los totales extraídos
    """
    text  = extract_text(pdf_path)
    lines = text.split('\n')

    # Campos brutos
    period_date = extract_period(lines)
    net_total   = extract_liquido_total(text)
    gross_total = extract_gross(text)
    irpf_total, rate = extract_irpf_and_rate(lines)
    ss_total    = extract_ss(lines)
    bonus_gross = extract_bonus(lines)

    # Doble-check net vs línea de cuenta bancaria
    importe_cuenta = extract_importe_cuenta(lines)
    if importe_cuenta is not None and importe_cuenta != net_total:
        raise ValueError(
            f"DOBLE-CHECK FAILED en {filename}: "
            f"LIQUIDO TOTAL {net_total} ≠ Importe cuenta {importe_cuenta}"
        )

    date_iso  = period_date.isoformat()   # "2026-01-01"
    mes_label = period_date.strftime('%-d %B %Y').lstrip('1 ') if False else \
                period_date.strftime('%B %Y').capitalize()     # "Enero 2026"

    rows: list[dict] = []

    if bonus_gross == Decimal('0'):
        # Nómina sin bonus: 1 sola fila
        rows.append({
            'type':      'nomina_mensual',
            'gross':     gross_total,
            'irpf':      irpf_total,
            'ss':        ss_total,
            'net':       net_total,
            'concept':   f"Nómina {mes_label}",
            'source_id': f"{date_iso}:nomina_mensual",
        })
    else:
        # Nómina con bonus: 2 filas (bonus + mensual residual)
        bonus_irpf    = (bonus_gross * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        bonus_net     = bonus_gross - bonus_irpf   # SS del bonus = 0 (base SS topada)

        mensual_gross = gross_total - bonus_gross
        mensual_irpf  = irpf_total  - bonus_irpf
        mensual_ss    = ss_total                   # toda la SS va a la mensual
        mensual_net   = net_total   - bonus_net    # residual garantiza cuadratura exacta

        rows.append({
            'type':      'bonus',
            'gross':     bonus_gross,
            'irpf':      bonus_irpf,
            'ss':        Decimal('0'),
            'net':       bonus_net,
            'concept':   f"Bonus {mes_label} (Libre Disposición)",
            'source_id': f"{date_iso}:bonus",
        })
        rows.append({
            'type':      'nomina_mensual',
            'gross':     mensual_gross,
            'irpf':      mensual_irpf,
            'ss':        mensual_ss,
            'net':       mensual_net,
            'concept':   f"Nómina {mes_label}",
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
                    "WARN posible extra/paga_extra no contemplada en %s: "
                    "nomina_mensual.net=%s fuera de [1500, 7000] — revisar PDF",
                    mes_label, r['net'],
                )
                # TODO paga_extra: código de devengo aún desconocido.
                # Cuando aparezca, añadir extracción análoga a bonus (2053)
                # con su propio type='paga_extra' en el CHECK de incomes.

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
    # Clave: cualquier substring del nombre de archivo (mes-año)
    '2026-01': {
        'net_total':   Decimal('3223.55'),
        'gross_total': Decimal('5343.95'),
        'irpf_total':  Decimal('1526.69'),
        'ss_total':    Decimal('333.83'),
        'bonus_gross': Decimal('0'),
        'n_rows':      1,
    },
    '2026-05': {
        'net_total':   Decimal('17613.95'),
        'gross_total': Decimal('25935.30'),
        'irpf_total':  Decimal('7702.33'),
        'ss_total':    Decimal('352.37'),
        'bonus_gross': Decimal('20577.35'),
        'n_rows':      2,
        'sum_net':     Decimal('17613.95'),
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
            net_total   = extract_liquido_total(text)
            gross_total = extract_gross(text)
            irpf_total, rate = extract_irpf_and_rate(lines)
            ss_total    = extract_ss(lines)
            bonus_gross = extract_bonus(lines)
            rows        = parse_payslip(str(pdf), filename)
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

        chk('net_total',   net_total,   golden['net_total'])
        chk('gross_total', gross_total, golden['gross_total'])
        chk('irpf_total',  irpf_total,  golden['irpf_total'])
        chk('ss_total',    ss_total,    golden['ss_total'])
        chk('bonus_gross', bonus_gross, golden['bonus_gross'])

        if len(rows) != golden['n_rows']:
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

    parsed  = 0
    skipped = 0
    errors  = 0

    for obj in res:
        filename = obj.get('name', '')
        if not filename.lower().endswith('.pdf'):
            continue

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
        "RESULTADO: parseadas=%d | saltadas (ya en DB)=%d | errores=%d",
        parsed, skipped, errors,
    )

    if errors > 0:
        sys.exit(1)


if __name__ == '__main__':
    if '--test' in sys.argv:
        idx = sys.argv.index('--test')
        pdf_dir = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else '.'
        run_golden_tests(pdf_dir)
    else:
        main()
