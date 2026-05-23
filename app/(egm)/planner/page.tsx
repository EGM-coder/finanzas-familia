import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from '../control/_components/MonthSwitcher'
import { PlannerShell } from './_components/PlannerShell'
import { computeConsumo } from '../_lib/computeConsumo'

// ── Types ────────────────────────────────────────────────────

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
type FixedRow = { total_spent: number; year: number; month: number }
type SpentRow = { spent: number; year: number; month: number }

function computePlannerData(
  txns: TxnRow[],
  fixedAll: FixedRow[],
  incomesData: { net_amount: number }[],
  maristasProjectId: string | null,
  superAll: SpentRow[] | null,
  year: number,
  month: number,
  prior3: { year: number; month: number }[],
  prior3Txns: TxnRow[],
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

  // ── Baseline (media 3m) ──────────────────────────────────────
  const n = prior3.length || 1

  const baseConsumo = computeConsumo(prior3Txns, maristasProjectId) / n

  const baseInversiones =
    prior3Txns
      .filter((r) => r.nature === 'inversion' && r.amount < 0)
      .reduce((s, r) => s + Math.abs(r.amount), 0) / n

  const baseMaristas =
    prior3Txns
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

  const prior3 = priorMonthsList(mes, 3)
  const earliest = prior3[prior3.length - 1]
  const prior3Start = `${earliest.year}-${String(earliest.month).padStart(2, '0')}-01`

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
  const [prior3TxnsRes, superAllRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, nature, project_id')
      .eq('source', 'psd2')
      .gte('date', prior3Start)
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
    prior3TxnsRes.data ?? [],
  )

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <div className="label" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>Planner</div>
      <MonthSwitcher mes={mes} />
      <PlannerShell data={data} userId={user.id} mes={mes} maristasProjectId={maristasProjectId} />
    </div>
  )
}
