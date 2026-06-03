import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from './_components/MonthSwitcher'
import { ControlMonthShell } from './_components/ControlMonthShell'
import { type EnrichedRow } from './_components/ControlMonthLedger'
import { type ServerAggregates } from './_components/AggregatesPanel'
import { computeConsumo } from '../_lib/computeConsumo'

// ── Types ────────────────────────────────────────────────────

type CatNode = { id: string; name: string; color: string | null; parent_id: string | null }

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

function resolveRoot(catId: string | null, catMap: Map<string, CatNode>): CatNode | null {
  if (!catId) return null
  let cat = catMap.get(catId)
  if (!cat) return null
  while (cat.parent_id) {
    const parent = catMap.get(cat.parent_id)
    if (!parent) break
    cat = parent
  }
  return cat
}

function computeControlData(
  rawRows: ReturnType<typeof Array.prototype.map>,
  catMap: Map<string, CatNode>,
  supermerData: { spent: number }[] | null,
  fixedData: { total_spent: number }[],
  medianData: { median_monthly_income: number; months_with_data: number } | null,
  incomesData: { net_amount: number }[],
  maristasProjectId: string | null,
): { enrichedRows: EnrichedRow[]; countPorRevisar: number; serverAggregates: ServerAggregates } {
  // Enrich rows with rootColor + por_revisar flag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichedRows: EnrichedRow[] = (rawRows as any[]).map((row) => {
    const root = resolveRoot(row.category_id, catMap)
    const por_revisar =
      !row.category_id ||
      !row.nature ||
      !row.titular ||
      !row.counterparty ||
      row.counterparty === row.raw_concept
    return { ...row, rootColor: root?.color ?? null, por_revisar } as EnrichedRow
  })

  const countPorRevisar = enrichedRows.filter((r) => r.por_revisar).length

  // gastoMes: consumo = outflows excl. transferencia, inversion y capex Maristas
  const gastoMes = computeConsumo(enrichedRows, maristasProjectId)

  // porNaturaleza: magnitud de gastos por nature (amount < 0 only)
  const natMap = new Map<string | null, number>()
  for (const row of enrichedRows) {
    if (row.amount >= 0) continue
    natMap.set(row.nature, (natMap.get(row.nature) ?? 0) + Math.abs(row.amount))
  }
  const porNaturaleza = Array.from(natMap.entries())
    .map(([nature, total]) => ({ nature, total }))
    .sort((a, b) => b.total - a.total)

  // porCategoriaRaiz: magnitud de gastos por raíz de categoría (amount < 0 only)
  const rootMap = new Map<
    string | null,
    { rootId: string | null; rootName: string; color: string | null; total: number }
  >()
  for (const row of enrichedRows) {
    if (row.amount >= 0) continue
    const root = resolveRoot(row.category_id, catMap)
    const key = root?.id ?? null
    const entry = rootMap.get(key)
    if (entry) {
      entry.total += Math.abs(row.amount)
    } else {
      rootMap.set(key, {
        rootId: key,
        rootName: root?.name ?? 'Sin categoría',
        color: root?.color ?? null,
        total: Math.abs(row.amount),
      })
    }
  }
  const porCategoriaRaiz = Array.from(rootMap.values()).sort((a, b) => b.total - a.total)

  // Vistas de referencia
  const supermerArr = supermerData ?? []
  const superObservado =
    supermerArr.length > 0 ? supermerArr.reduce((s, r) => s + Number(r.spent), 0) : null

  const fijosObservados =
    fixedData.length > 0 ? fixedData.reduce((s, r) => s + Number(r.total_spent), 0) : null

  const ingresosNoSalariales =
    incomesData.length > 0 ? incomesData.reduce((s, r) => s + Number(r.net_amount), 0) : null

  const serverAggregates: ServerAggregates = {
    gastoMes,
    porNaturaleza,
    porCategoriaRaiz,
    superObservado,
    fijosObservados,
    ingresoSalarialMediano: medianData?.median_monthly_income ?? null,
    mesesConDatos: medianData?.months_with_data ?? 0,
    ingresosNoSalariales,
  }

  return { enrichedRows, countPorRevisar, serverAggregates }
}

// ── Page ─────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ mes?: string; ver?: string }>
}

export default async function ControlPage({ searchParams }: Props) {
  const params = await searchParams
  const mes = params.mes ?? currentMes()
  const ver = params.ver === 'pendientes' ? 'pendientes' : 'todas'
  const isCurrentMonth = mes === currentMes()

  if (!/^\d{4}-\d{2}$/.test(mes)) redirect(`/control?mes=${currentMes()}`)

  const { start, end, year, month } = monthRange(mes)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Round 1: txns + categories + projects + superCat ────────
  const [txnsRes, categoriesRes, projectsRes, superCatRes] = await Promise.all([
    supabase
      .from('transactions')
      .select(`
        id, date, description, counterparty, raw_concept, amount, currency,
        category_id, project_id, nature, titular, is_reimbursable,
        order_id,
        accounts(institution, name),
        categories(id, name, color, parent_id),
        projects(id, name),
        purchase_orders(merchant)
      `)
      .eq('source', 'psd2')
      .gte('date', start)
      .lt('date', end)
      .order('date', { ascending: false })
      .order('id', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, parent_id, color, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('projects')
      .select('id, name, slug')
      .eq('status', 'active')
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id')
      .eq('name', 'Supermercado')
      .eq('is_default', true)
      .single(),
  ])

  if (txnsRes.error) throw new Error(txnsRes.error.message)

  const categories = categoriesRes.data ?? []
  const initialProjects = projectsRes.data ?? []
  const superCatId = superCatRes.data?.id ?? null
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const maristasProjectId = initialProjects.find((p) => /maristas/i.test(p.name))?.id ?? null

  // ── Round 2: vistas dependientes de superCatId ───────────────
  const [supermerRes, fixedObsRes, medianIncRes, incomesRes] = await Promise.all([
    superCatId
      ? supabase
          .from('v_spent_by_category_month')
          .select('spent')
          .eq('year', year)
          .eq('month', month)
          .eq('category_id', superCatId)
      : Promise.resolve({ data: null as null, error: null }),
    supabase
      .from('v_fixed_expenses_observed')
      .select('total_spent')
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('v_median_income_3m')
      .select('median_monthly_income, months_with_data')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('incomes')
      .select('net_amount')
      .gte('date', start)
      .lt('date', end),
  ])

  // ── Compute ──────────────────────────────────────────────────
  const { enrichedRows, countPorRevisar, serverAggregates } = computeControlData(
    txnsRes.data ?? [],
    catMap,
    supermerRes.data,
    fixedObsRes.data ?? [],
    medianIncRes.data ?? null,
    incomesRes.data ?? [],
    maristasProjectId,
  )

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <div className="label" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>Control</div>
      <MonthSwitcher mes={mes} />
      <ControlMonthShell
        rows={enrichedRows}
        categories={categories}
        initialProjects={initialProjects}
        serverAggregates={serverAggregates}
        countPorRevisar={countPorRevisar}
        initialModo={ver}
        userId={user.id}
        mes={mes}
        isCurrentMonth={isCurrentMonth}
      />
    </div>
  )
}
