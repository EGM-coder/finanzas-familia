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
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)))
}

type SovRow = {
  vested: boolean
  exercisable_now: boolean
  vesting_date: string | null
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
    .filter((r) => r.vesting_date)
    .sort((a, b) => new Date(a.vesting_date!).getTime() - new Date(b.vesting_date!).getTime())[0]

  const year = earliest ? new Date(earliest.vesting_date!).getFullYear() : null
  return year
    ? `informativo · no ejercitable hasta ${year}`
    : 'informativo · vesting pendiente'
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

  // ── Round 1 · vistas de patrimonio + proyectos + mediana ─────
  const [pnRes, snapRes, sovRes, projRes, medianRes] = await Promise.all([
    supabase
      .from('patrimonio_neto')
      .select(
        'liquidos_y_holdings, inmuebles, activos_total, deudas_activas, patrimonio_neto_actual, patrimonio_neto_si_firmara_hoy, stock_options_intrinsic',
      )
      .maybeSingle(),
    supabase
      .from('patrimonio_snapshot_with_delta')
      .select('delta_neto_actual')
      .maybeSingle(),
    supabase
      .from('stock_options_valued')
      .select('package_name, num_options, intrinsic_total, vested, exercisable_now, vesting_date'),
    supabase.from('projects').select('id, name').eq('status', 'active'),
    supabase
      .from('v_median_income_3m')
      .select('median_monthly_income')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const maristasProjectId =
    (projRes.data ?? []).find((p) => /maristas/i.test(p.name))?.id ?? null

  // ── Round 2 · flujo del mes ──────────────────────────────────
  const [incomesRes, txnsRes, fixedRes] = await Promise.all([
    supabase.from('incomes').select('net_amount').gte('date', start).lt('date', end),
    supabase
      .from('transactions')
      .select('amount, nature, project_id')
      .eq('source', 'psd2')
      .gte('date', start)
      .lt('date', end),
    supabase
      .from('v_fixed_expenses_observed')
      .select('total_spent')
      .eq('year', year)
      .eq('month', month),
  ])

  // ── Valores de patrimonio ────────────────────────────────────
  const pn = pnRes.data
  const liquidos = Number(pn?.liquidos_y_holdings ?? 0)
  const inmuebles = Number(pn?.inmuebles ?? 0)
  const activosTotal = Number(pn?.activos_total ?? 0)
  const deudasActivas = Number(pn?.deudas_activas ?? 0)
  const patrimonioNeto = Number(pn?.patrimonio_neto_actual ?? 0)
  const patrimonioSiFirmara = Number(pn?.patrimonio_neto_si_firmara_hoy ?? 0)
  const stockIntrinsic = Number(pn?.stock_options_intrinsic ?? 0)
  const pctLiquidos = activosTotal > 0 ? Math.round((liquidos / activosTotal) * 100) : null
  const deltaNeto = snapRes.data?.delta_neto_actual != null
    ? Number(snapRes.data.delta_neto_actual)
    : null

  // ── Stock options ────────────────────────────────────────────
  const sov = (sovRes.data ?? []) as SovRow[]
  const vestingNote = buildVestingNote(sov)

  // ── Flujo del mes ────────────────────────────────────────────
  const ingresosMes = (incomesRes.data ?? []).reduce(
    (s, r) => s + Number(r.net_amount),
    0,
  )
  const consumoMes = computeConsumo(txnsRes.data ?? [], maristasProjectId)
  const fijosMes = (fixedRes.data ?? []).reduce(
    (s, r) => s + Number(r.total_spent),
    0,
  )
  const margenMes = ingresosMes - consumoMes
  const medianIncome = medianRes.data?.median_monthly_income
    ? Number(medianRes.data.median_monthly_income)
    : null

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 22px 80px' }}>

      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="fade" style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 4 }}>I · Inicio</div>
        <div className="display" style={{ fontSize: 22 }}>
          Hoy, {editorialDate(now)}
        </div>
        <div className="roman" style={{ fontSize: 12, marginTop: 3 }}>
          Estado situacional · familia
        </div>
      </div>

      {/* ── Bloque 1 · NÚCLEO ────────────────────────────────── */}
      <div className="fade fade-1">
        <InicioHero
          liquidos={liquidos}
          patrimonioNeto={patrimonioNeto}
          patrimonioSiFirmara={patrimonioSiFirmara}
          deltaNeto={deltaNeto}
        />
      </div>

      <div className="rule" style={{ margin: '24px 0' }} />

      {/* ── Bloque 2 · ASIGNACIÓN POR CLASE ─────────────────── */}
      <div className="label fade fade-2" style={{ marginBottom: 10 }}>
        Composición
      </div>

      {/* Fila I · Líquido y fondos */}
      <div
        className="fade fade-2"
        style={{
          display: 'grid',
          gridTemplateColumns: '20px 1fr auto',
          alignItems: 'baseline',
          padding: '10px 0',
          borderBottom: '1px solid var(--rule-2)',
          gap: 12,
        }}
      >
        <span className="roman" style={{ fontSize: 11 }}>I</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Líquido y fondos</span>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 15 }}>{fmt(liquidos)} €</div>
          {pctLiquidos != null && (
            <div className="label" style={{ fontSize: 9 }}>{pctLiquidos}%</div>
          )}
        </div>
      </div>

      {/* Fila II · Inmueble (Maristas) */}
      <div
        className="fade fade-3"
        style={{
          display: 'grid',
          gridTemplateColumns: '20px 1fr auto',
          alignItems: 'start',
          padding: '10px 0',
          borderBottom: '1px solid var(--rule-2)',
          gap: 12,
        }}
      >
        <span className="roman" style={{ fontSize: 11, paddingTop: 3 }}>II</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Inmueble</div>
          <div className="roman" style={{ fontSize: 11, marginTop: 2 }}>
            en construcción · valor comprometido
          </div>
        </div>
        <div className="num" style={{ fontSize: 15, paddingTop: 3 }}>{fmt(inmuebles)} €</div>
      </div>

      {/* Fila III · Deudas activas */}
      <div
        className="fade fade-4"
        style={{
          display: 'grid',
          gridTemplateColumns: '20px 1fr auto',
          alignItems: 'baseline',
          padding: '10px 0',
          gap: 12,
        }}
      >
        <span className="roman" style={{ fontSize: 11 }}>III</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Deudas activas</span>
        <span className="num" style={{ fontSize: 15, color: 'var(--signal-neg)' }}>
          {'\u2212'}{fmt(deudasActivas)} €
        </span>
      </div>

      <div className="rule" style={{ margin: '20px 0' }} />

      {/* ── Bloque 3 · CONTINGENTE ───────────────────────────── */}
      <div className="label fade fade-4" style={{ marginBottom: 8 }}>
        Contingente · fuera del neto
      </div>
      <div
        className="card-soft fade fade-4"
        style={{ padding: '12px 14px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Opciones Nordex</span>
          <span className="num" style={{ fontSize: 15 }}>
            {fmt(stockIntrinsic)} €
          </span>
        </div>
        <div className="roman" style={{ fontSize: 11, marginTop: 4 }}>
          {vestingNote}
        </div>
      </div>

      <div className="rule" style={{ margin: '20px 0' }} />

      {/* ── Bloque 4 · FLUJO DEL MES ─────────────────────────── */}
      <div className="label fade fade-5" style={{ marginBottom: 10 }}>
        Flujo · {editorialMonth(now)}
      </div>
      <div
        className="card fade fade-5"
        style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}
      >
        {/* Ingresos */}
        <div>
          <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Ingresos</div>
          <div className="num" style={{ fontSize: 17, color: 'var(--signal-pos)' }}>
            +{fmt(ingresosMes)} €
          </div>
          {medianIncome != null && (
            <div className="roman" style={{ fontSize: 10, marginTop: 3 }}>
              mediana 3m · {fmt(medianIncome)} €
            </div>
          )}
        </div>

        {/* Fijos */}
        <div style={{ textAlign: 'center' }}>
          <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Fijos</div>
          <div className="num" style={{ fontSize: 17 }}>
            {fmt(fijosMes)} €
          </div>
        </div>

        {/* Margen */}
        <div style={{ textAlign: 'right' }}>
          <div className="label" style={{ fontSize: 9, marginBottom: 4 }}>Margen</div>
          <div
            className="num"
            style={{
              fontSize: 17,
              color: margenMes >= 0 ? 'var(--signal-pos)' : 'var(--signal-neg)',
            }}
          >
            {margenMes >= 0 ? '+' : '\u2212'}{fmt(Math.abs(margenMes))} €
          </div>
        </div>
      </div>

    </div>
  )
}
