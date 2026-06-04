import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { computeConsumo } from '../_lib/computeConsumo'
import { InicioHero } from './_components/InicioHero'

// ── Helpers ──────────────────────────────────────────────────────

function editorialDate(d: Date): string {
  const months = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
  const yy = String(d.getFullYear()).slice(-2)
  return `${d.getDate()}\u00b7${months[d.getMonth()]}\u00b7${yy}`
}

function editorialMonth(d: Date): string {
  const months = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
  return `${months[d.getMonth()]}\u00b7${d.getFullYear()}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(
    Math.abs(Math.round(n)),
  )
}

type SovRow = {
  vested: boolean
  exercisable_now: boolean
  exercise_window_start: string | null
  num_options: number
}

function buildVestingNote(sov: SovRow[]): string {
  if (!sov.length) return 'sin opciones activas'

  if (sov.some((r) => r.exercisable_now)) {
    const count = sov.filter((r) => r.exercisable_now).reduce((s, r) => s + r.num_options, 0)
    return `ejercitable ahora · ${count} opciones`
  }

  if (sov.some((r) => r.vested)) return 'vested · fuera de ventana de ejercicio'

  const earliest = [...sov]
    .filter((r) => r.exercise_window_start)
    .sort(
      (a, b) =>
        new Date(a.exercise_window_start!).getTime() -
        new Date(b.exercise_window_start!).getTime(),
    )[0]

  const year = earliest ? new Date(earliest.exercise_window_start!).getFullYear() : null
  return year
    ? `informativo · no ejercitable hasta ${year}`
    : 'informativo · ventana de ejercicio pendiente'
}

// ── Page ─────────────────────────────────────────────────────────

export default async function InicioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const padM = String(month).padStart(2, '0')
  const start = `${year}-${padM}-01`
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  const end = `${ny}-${String(nm).padStart(2, '0')}-01`

  // ── Round 1 · vistas patrimonio + proyectos + mediana + cats ─
  const [pnRes, snapRes, sovRes, projRes, medianRes, incomeCatsRes] = await Promise.all([
    supabase
      .from('patrimonio_neto')
      .select(
        'liquidos_y_holdings, inmuebles, activos_total, deudas_activas, patrimonio_neto_actual, stock_options_intrinsic',
      )
      .maybeSingle(),
    supabase
      .from('patrimonio_snapshot_with_delta')
      .select('delta_neto_actual')
      .maybeSingle(),
    supabase
      .from('stock_options_valued')
      .select('package_name, num_options, intrinsic_total, vested, exercisable_now, exercise_window_start'),
    supabase.from('projects').select('id, name').eq('status', 'active'),
    supabase
      .from('v_median_income_3m')
      .select('median_monthly_income')
      .eq('user_id', user.id)
      .maybeSingle(),
    // Hojas de ingreso recurrente: Nómina y Dividendos, hijas de "Ingresos"
    supabase
      .from('categories')
      .select('id, name, parent_id')
      .in('name', ['Ingresos', 'Nómina', 'Dividendos'])
      .eq('is_active', true),
  ])

  const maristasProjectId =
    (projRes.data ?? []).find((p) => /maristas/i.test(p.name))?.id ?? null

  // Resolver IDs de hojas de ingreso recurrente por nombre + parentesco
  const cats = incomeCatsRes.data ?? []
  const ingresosParentId = cats.find((c) => c.name === 'Ingresos')?.id ?? null
  const nominaId = cats.find(
    (c) => c.name === 'Nómina' && c.parent_id === ingresosParentId,
  )?.id ?? null
  const dividendosId = cats.find(
    (c) => c.name === 'Dividendos' && c.parent_id === ingresosParentId,
  )?.id ?? null
  const incomeCatIds = [nominaId, dividendosId].filter((id): id is string => id != null)

  // ── Round 2 · flujo del mes ──────────────────────────────────
  // ingresos leídos desde transactions (misma fuente que patrimonio_neto),
  // filtrados por hojas Nómina + Dividendos, excluyendo transferencias.
  // incomes no se toca — reservada para módulo fiscal futuro.
  const [txnsRes, fixedRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, nature, project_id, category_id')
      .eq('source', 'psd2')
      .is('superseded_by', null)
      .gte('date', start)
      .lt('date', end),
    supabase
      .from('v_fixed_expenses_observed')
      .select('total_spent')
      .eq('year', year)
      .eq('month', month),
  ])

  // ── Patrimonio ───────────────────────────────────────────────
  const pn = pnRes.data
  const liquidos    = Number(pn?.liquidos_y_holdings  ?? 0)
  const inmuebles   = Number(pn?.inmuebles            ?? 0)
  const activosTotal = Number(pn?.activos_total       ?? 0)
  const deudasActivas = Number(pn?.deudas_activas     ?? 0)
  const patrimonioNeto = Number(pn?.patrimonio_neto_actual ?? 0)
  const stockIntrinsic = Number(pn?.stock_options_intrinsic ?? 0)
  const pctLiquidos = activosTotal > 0 ? Math.round((liquidos / activosTotal) * 100) : null
  const deltaNeto = snapRes.data?.delta_neto_actual != null
    ? Number(snapRes.data.delta_neto_actual) : null
  const hasDelta = deltaNeto != null && Math.abs(deltaNeto) > 0.5
  const deltaPos = (deltaNeto ?? 0) >= 0

  // ── Stock options ────────────────────────────────────────────
  const sov = (sovRes.data ?? []) as SovRow[]
  const vestingNote = buildVestingNote(sov)

  // ── Flujo del mes ────────────────────────────────────────────
  const txns = txnsRes.data ?? []
  const ingresosMes = incomeCatIds.length > 0
    ? txns
        .filter(
          (r) =>
            r.amount > 0 &&
            r.nature !== 'transferencia' &&
            r.category_id != null &&
            incomeCatIds.includes(r.category_id),
        )
        .reduce((s, r) => s + Number(r.amount), 0)
    : 0
  const ingresosPendiente = ingresosMes === 0
  const consumoMes  = computeConsumo(txns, maristasProjectId)
  const fijosMes    = (fixedRes.data ?? []).reduce((s, r) => s + Number(r.total_spent), 0)
  const margenMes   = ingresosMes - consumoMes
  const medianIncome = medianRes.data?.median_monthly_income
    ? Number(medianRes.data.median_monthly_income) : null

  // ── Composición rows ─────────────────────────────────────────
  type Row = { roman: string; name: string; note?: string; amount: number; pct: number | null; neg?: boolean }
  const composicion: Row[] = [
    { roman: 'I',   name: 'Líquido y fondos', amount: liquidos,     pct: pctLiquidos },
    { roman: 'II',  name: 'Inmueble',          note: 'en construcción · valor comprometido', amount: inmuebles, pct: null },
    { roman: 'III', name: 'Deudas activas',    amount: deudasActivas, pct: null, neg: true },
  ]

  return (
    // maxWidth with percentage padding preserves layout on narrower viewports;
    // inner grid collapses to single column with a future media query on .inicio-grid
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '34px 50px 50px' }}>

      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div
        className="fade"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <div>
          <div className="label">I · Inicio</div>
          <div className="display" style={{ fontSize: 38, marginTop: 4 }}>
            Hoy, {editorialDate(now)}
          </div>
        </div>
        <div className="roman" style={{ fontSize: 14 }}>Estado situacional · familia</div>
      </div>

      <div className="rule-strong" style={{ margin: '20px 0 32px' }} />

      {/* ── Grid principal 1.4fr · 1fr ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 40 }}>

        {/* ── Columna izquierda · patrimonio + composición ─── */}
        <div className="fade fade-1">
          <div className="label" style={{ marginBottom: 8 }}>Patrimonio neto</div>

          {/* Héroe animado (client) */}
          <InicioHero liquidos={liquidos} />

          {/* Sub-línea editorial */}
          <div className="display-it" style={{ marginTop: 8, fontSize: 14, color: 'var(--ink-3)' }}>
            Disponible hoy · inmueble y opciones Nordex aparte
          </div>

          {/* Neto actual */}
          <div className="roman" style={{ fontSize: 12, marginTop: 6 }}>
            Neto actual ·{' '}
            <span className="num" style={{ fontSize: 12 }}>{fmt(patrimonioNeto)} €</span>
          </div>

          {/* Δ temporal */}
          {hasDelta && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span
                className="num"
                style={{ fontSize: 11, color: deltaPos ? 'var(--signal-pos)' : 'var(--signal-neg)' }}
              >
                {deltaPos ? '+' : '\u2212'}{fmt(Math.abs(deltaNeto!))} €
              </span>
              <span className="label" style={{ fontSize: 9 }}>· 30 d</span>
            </div>
          )}

          {/* Composición */}
          <div className="rule" style={{ margin: '28px 0 14px' }} />
          <div className="label" style={{ marginBottom: 12 }}>Composición</div>

          {composicion.map((r) => (
            <div
              key={r.roman}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr 100px 50px',
                gap: 14,
                padding: '13px 0',
                borderBottom: '1px solid var(--rule-2)',
                alignItems: 'baseline',
              }}
            >
              <span className="roman" style={{ fontSize: 12 }}>{r.roman}</span>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 500 }}>{r.name}</div>
                {r.note && (
                  <div className="roman" style={{ fontSize: 12 }}>{r.note}</div>
                )}
              </div>
              <div
                className="num"
                style={{
                  fontSize: 17,
                  textAlign: 'right',
                  color: r.neg ? 'var(--signal-neg)' : undefined,
                }}
              >
                {r.neg ? '\u2212' : ''}{fmt(r.amount)} €
              </div>
              <div
                className="num"
                style={{ fontSize: 12, textAlign: 'right', color: 'var(--ink-3)' }}
              >
                {r.pct != null ? `${r.pct}%` : ''}
              </div>
            </div>
          ))}
        </div>

        {/* ── Columna derecha · flujo + contingente ────────── */}
        <div className="fade fade-2">

          {/* Flujo card */}
          <div className="card" style={{ padding: 22 }}>
            <div className="label" style={{ marginBottom: 12 }}>
              Flujo · {editorialMonth(now)}
            </div>

            {/* Ingresos + Fijos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Ingresos</div>
                {ingresosPendiente ? (
                  <div className="roman" style={{ fontSize: 13 }}>
                    Ingresos del mes · pendiente
                  </div>
                ) : (
                  <div className="num pos" style={{ fontSize: 22 }}>
                    +{fmt(ingresosMes)}
                  </div>
                )}
                {medianIncome != null && (
                  <div className="roman" style={{ fontSize: 10.5, marginTop: 3 }}>
                    mediana 3m · {fmt(medianIncome)} €
                  </div>
                )}
              </div>
              <div>
                <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Fijos</div>
                <div className="num neg" style={{ fontSize: 22 }}>{fmt(fijosMes)}</div>
              </div>
            </div>

            <div className="rule" style={{ marginBottom: 12 }} />

            <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Margen</div>
            <div
              className="display num"
              style={{
                fontSize: 38,
                color: margenMes >= 0 ? 'var(--signal-pos)' : 'var(--signal-neg)',
              }}
            >
              {margenMes >= 0 ? '+' : '\u2212'}{fmt(Math.abs(margenMes))}
              <span style={{ fontSize: 14, color: 'var(--ink-3)' }}> €/mes</span>
            </div>
          </div>

          {/* Contingente · fuera del neto */}
          <div style={{ marginTop: 18 }}>
            <div className="label" style={{ marginBottom: 10 }}>
              Contingente · fuera del neto
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                padding: '8px 0',
                borderBottom: '1px solid var(--rule-2)',
                alignItems: 'baseline',
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 13 }}>Opciones Nordex</div>
                <div className="roman" style={{ fontSize: 10.5 }}>{vestingNote}</div>
              </div>
              <div className="num" style={{ fontSize: 13 }}>{fmt(stockIntrinsic)} €</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
