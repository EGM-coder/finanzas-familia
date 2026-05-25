import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from '../control/_components/MonthSwitcher'
import { PlannerShell } from './_components/PlannerShell'
import { computeConsumo } from '../_lib/computeConsumo'

// ── Types ────────────────────────────────────────────────────

export type TendenciaPoint = { mes: string; value: number | null }

export interface PlannerData {
  // Sección 1 — operativo
  consumo: number          // outflows excl. transferencia, inversion, Maristas
  ingresosMes: number
  fijosObservados: number  // informativo; no entra en fórmula
  remanente: number        // ingresosMes − consumo
  // Sección 2 — asignación de capital
  inversiones: number
  maristas: number         // filtrado por project_id, nunca por categoría
  // Sección 3 — distribución del consumo
  superObservado: number | null
  porNaturaleza: { nature: string | null; total: number }[]
  // Sección 4 — comparativas (media 3m; null = sin datos suficientes)
  baseline: {
    consumo: number | null
    superObservado: number | null
    fijosObservados: number | null
    inversiones: number | null
    maristas: number | null
  }
  // Sección 6 — tendencia (serie observada, 6 meses anteriores, orden cronológico)
  tendencia: {
    consumo:         TendenciaPoint[]
    remanente:       TendenciaPoint[]
    superObservado:  TendenciaPoint[]
    fijosObservados: TendenciaPoint[]
  }
}

// ── Pure helpers ─────────────────────────────────────────────

function currentMes(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(mes: string): { start: string; end: string; year: number; month: number } {
  const [year, month] = mes.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end, year, month }
}

function priorMonthsList(mes: string, count: number): { year: number; month: number }[] {
  const [y, m] = mes.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    let yr = y
    let mo = m - (i + 1)
    while (mo <= 0) { mo += 12; yr-- }
    return { year: yr, month: mo }
  })
}

type TxnRow = { amount: number; nature: string | null; project_id: string | null }
type TxnRowWithDate = TxnRow & { date: string }
type IncomeRowDate = { net_amount: number; date: string }
type FixedRow = { total_spent: number; year: number; month: number }
type SpentRow = { spent: number; year: number; month: number }

// Tendencia: serie observada mes a mes para la ventana de 6 meses previos.
// null = sin transacciones ese mes (hueco honesto); 0 = mes con txns pero consumo cero.
// Remanente es null si no hay registros de ingresos ese mes.
function computeTendencia(
  window6: { year: number; month: number }[],  // [mes-1, ..., mes-6] de priorMonthsList
  prior6Txns: TxnRowWithDate[],
  prior6Incomes: IncomeRowDate[],
  fixedAll: FixedRow[],
  superAll: SpentRow[] | null,
  maristasProjectId: string | null,
): PlannerData['tendencia'] {
  // Orden cronológico (más antiguo primero) para mostrar izquierda→derecha
  const chrono = [...window6].reverse()

  const txnsByMonth = new Map<string, TxnRowWithDate[]>()
  for (const t of prior6Txns) {
    const key = t.date.slice(0, 7)
    if (!txnsByMonth.has(key)) txnsByMonth.set(key, [])
    txnsByMonth.get(key)!.push(t)
  }

  const incomesByMonth = new Map<string, number>()
  for (const i of prior6Incomes) {
    const key = i.date.slice(0, 7)
    incomesByMonth.set(key, (incomesByMonth.get(key) ?? 0) + Number(i.net_amount))
  }

  const consumoSeries:  TendenciaPoint[] = []
  const remanenteSeries: TendenciaPoint[] = []
  const superSeries:    TendenciaPoint[] = []
  const fijosSeries:    TendenciaPoint[] = []

  for (const { year, month } of chrono) {
    const mes = `${year}-${String(month).padStart(2, '0')}`
    const monthTxns = txnsByMonth.get(mes)
    // null si no hay transacciones ese mes (hueco honesto, no cero)
    const consumoVal = monthTxns === undefined ? null : computeConsumo(monthTxns, maristasProjectId)
    consumoSeries.push({ mes, value: consumoVal })

    // remanente null si sin registros de ingresos ese mes
    const incomesVal = incomesByMonth.get(mes)
    const remanenteVal = incomesVal === undefined ? null : incomesVal - (consumoVal ?? 0)
    remanenteSeries.push({ mes, value: remanenteVal })

    // D-006: v_spent_by_category_month no excluye nature='inversion' (ver PARCHES D-006)
    const superRow = superAll?.find(r => r.year === year && r.month === month)
    superSeries.push({ mes, value: superRow !== undefined ? Number(superRow.spent) : null })

    const fixedRow = fixedAll.find(r => r.year === year && r.month === month)
    fijosSeries.push({ mes, value: fixedRow !== undefined ? Number(fixedRow.total_spent) : null })
  }

  return { consumo: consumoSeries, remanente: remanenteSeries, superObservado: superSeries, fijosObservados: fijosSeries }
}

function computePlannerData(
  txns: TxnRow[],
  fixedAll: FixedRow[],
  incomesData: { net_amount: number }[],
  maristasProjectId: string | null,
  superAll: SpentRow[] | null,
  year: number,
  month: number,
  prior3: { year: number; month: number }[],
  prior6: { year: number; month: number }[],
  prior6Txns: TxnRowWithDate[],
  prior6Incomes: IncomeRowDate[],
): PlannerData {
  // consumo = outflows excl. transferencia, inversion y capex Maristas
  const consumo = computeConsumo(txns, maristasProjectId)
  const ingresosMes = incomesData.reduce((s, r) => s + Number(r.net_amount), 0)
  const fixedCurr = fixedAll.find((r) => r.year === year && r.month === month)
  const fijosObservados = fixedCurr ? Number(fixedCurr.total_spent) : 0
  // remanente = ingresos − consumo (sin doble conteo de fijos)
  const remanente = ingresosMes - consumo

  // ── Asignación de capital ────────────────────────────────────
  const inversiones = txns
    .filter((r) => r.nature === 'inversion' && r.amount < 0)
    .reduce((s, r) => s + Math.abs(r.amount), 0)

  const maristas = txns
    .filter((r) => r.amount < 0 && maristasProjectId !== null && r.project_id === maristasProjectId)
    .reduce((s, r) => s + Math.abs(r.amount), 0)

  // ── Distribución del consumo ─────────────────────────────────
  const superCurrRow = superAll?.find((r) => r.year === year && r.month === month)
  const superObservado = superCurrRow ? Number(superCurrRow.spent) : null

  // porNaturaleza: mismo filtro que computeConsumo (excl. transferencia, inversion, Maristas)
  const natMap = new Map<string | null, number>()
  for (const r of txns) {
    if (r.amount >= 0) continue
    if (r.nature === 'transferencia' || r.nature === 'inversion') continue
    if (maristasProjectId && r.project_id === maristasProjectId) continue
    natMap.set(r.nature, (natMap.get(r.nature) ?? 0) + Math.abs(r.amount))
  }
  const porNaturaleza = Array.from(natMap.entries())
    .map(([nature, total]) => ({ nature, total }))
    .sort((a, b) => b.total - a.total)

  // ── Baseline (media 3m) — usando los 3 meses más recientes del bloque prior6 ──
  const prior3Earliest = prior3[prior3.length - 1]
  const prior3DateStart = `${prior3Earliest.year}-${String(prior3Earliest.month).padStart(2, '0')}-01`
  const prior3TxnsFiltered = prior6Txns.filter(t => t.date >= prior3DateStart)
  const n = prior3.length || 1

  const baseConsumo = computeConsumo(prior3TxnsFiltered, maristasProjectId) / n

  const baseInversiones =
    prior3TxnsFiltered
      .filter((r) => r.nature === 'inversion' && r.amount < 0)
      .reduce((s, r) => s + Math.abs(r.amount), 0) / n

  const baseMaristas =
    prior3TxnsFiltered
      .filter((r) => r.amount < 0 && maristasProjectId !== null && r.project_id === maristasProjectId)
      .reduce((s, r) => s + Math.abs(r.amount), 0) / n

  const prior3FixedVals = prior3
    .map(({ year: y, month: m }) => fixedAll.find((r) => r.year === y && r.month === m))
    .filter(Boolean)
    .map((r) => Number(r!.total_spent))
  const baseFijos =
    prior3FixedVals.length > 0 ? prior3FixedVals.reduce((s, v) => s + v, 0) / prior3FixedVals.length : null

  const prior3SuperVals = prior3
    .map(({ year: y, month: m }) => superAll?.find((r) => r.year === y && r.month === m))
    .filter(Boolean)
    .map((r) => Number(r!.spent))
  const baseSuper =
    prior3SuperVals.length > 0 ? prior3SuperVals.reduce((s, v) => s + v, 0) / prior3SuperVals.length : null

  // ── Tendencia (serie observada 6m) ──────────────────────────
  const tendencia = computeTendencia(prior6, prior6Txns, prior6Incomes, fixedAll, superAll, maristasProjectId)

  return {
    consumo, ingresosMes, fijosObservados, remanente,
    inversiones, maristas,
    superObservado, porNaturaleza,
    baseline: {
      consumo: baseConsumo,
      superObservado: baseSuper,
      fijosObservados: baseFijos,
      inversiones: baseInversiones,
      maristas: baseMaristas,
    },
    tendencia,
  }
}

// ── Page ─────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ mes?: string }>
}

export default async function PlannerPage({ searchParams }: Props) {
  const params = await searchParams
  const mes = params.mes ?? currentMes()

  if (!/^\d{4}-\d{2}$/.test(mes)) redirect(`/planner?mes=${currentMes()}`)

  const { start, end, year, month } = monthRange(mes)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // prior6: ventana de tendencia (6m); prior3: ventana de baseline (3m más recientes del prior6)
  const prior6 = priorMonthsList(mes, 6)
  const prior3 = prior6.slice(0, 3)
  const prior6Earliest = prior6[prior6.length - 1]
  const prior6Start = `${prior6Earliest.year}-${String(prior6Earliest.month).padStart(2, '0')}-01`

  // ── Round 1 ──────────────────────────────────────────────────
  const [txnsRes, categoriesRes, fixedAllRes, incomesRes, maristasProjectRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, nature, project_id')
      .eq('source', 'psd2')
      .gte('date', start)
      .lt('date', end),
    supabase
      .from('categories')
      .select('id, name, is_default')
      .eq('is_active', true),
    supabase
      .from('v_fixed_expenses_observed')
      .select('total_spent, year, month'),
    supabase
      .from('incomes')
      .select('net_amount')
      .gte('date', start)
      .lt('date', end),
    supabase
      .from('projects')
      .select('id')
      .ilike('name', '%maristas%')
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const cats = categoriesRes.data ?? []
  const superCatId = cats.find((c) => c.name === 'Supermercado' && c.is_default)?.id ?? null
  const maristasProjectId = maristasProjectRes.data?.id ?? null

  // ── Round 2 ──────────────────────────────────────────────────
  // Una query por rango; agrupación por mes en memoria (sin DDL adicional)
  const [prior6TxnsRes, prior6IncomesRes, superAllRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, nature, project_id, date')
      .eq('source', 'psd2')
      .gte('date', prior6Start)
      .lt('date', start),
    supabase
      .from('incomes')
      .select('net_amount, date')
      .gte('date', prior6Start)
      .lt('date', start),
    superCatId
      ? supabase
          .from('v_spent_by_category_month')
          .select('spent, year, month')
          .eq('category_id', superCatId)
      : Promise.resolve({ data: null as SpentRow[] | null }),
  ])

  const data = computePlannerData(
    txnsRes.data ?? [],
    fixedAllRes.data ?? [],
    incomesRes.data ?? [],
    maristasProjectId,
    superAllRes.data,
    year,
    month,
    prior3,
    prior6,
    prior6TxnsRes.data ?? [],
    prior6IncomesRes.data ?? [],
  )

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <div className="label" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>Planner</div>
      <MonthSwitcher mes={mes} />
      <PlannerShell data={data} userId={user.id} mes={mes} maristasProjectId={maristasProjectId} />
    </div>
  )
}
