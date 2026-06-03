import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MonthSwitcher } from './_components/MonthSwitcher'
import { ControlMonthShell } from './_components/ControlMonthShell'
import { type EnrichedRow } from './_components/ControlMonthLedger'
import { type ServerAggregates } from './_components/AggregatesPanel'
import { PlannerShell } from '../planner/_components/PlannerShell'
import { computeConsumo } from '../_lib/computeConsumo'
import { computePlannerData, priorMonthsList, type PlannerData } from '../_lib/plannerUtils'

// ── Types ────────────────────────────────────────────────────

type CatNode = { id: string; name: string; color: string | null; parent_id: string | null }
type SpentRow = { spent: number; year: number; month: number }

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

// ── Page ─────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ mes?: string; ver?: string; view?: string; nature?: string; project_id?: string }>
}

export default async function ControlPage({ searchParams }: Props) {
  const params = await searchParams
  const mes = params.mes ?? currentMes()
  const view = params.view ?? ''          // '' = carátula (planner); 'apuntes' = ledger
  const natureFilter = params.nature ?? null
  const projectFilter = params.project_id ?? null
  const ver = params.ver === 'pendientes' ? 'pendientes' : 'todas'
  const isCurrentMonth = mes === currentMes()

  if (!/^\d{4}-\d{2}$/.test(mes)) redirect(`/control?mes=${currentMes()}`)

  const { start, end, year, month } = monthRange(mes)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── CARÁTULA (vista por defecto) ─────────────────────────
  if (view !== 'apuntes') {
    const prior6 = priorMonthsList(mes, 6)
    const prior3 = prior6.slice(0, 3)
    const prior6Earliest = prior6[prior6.length - 1]
    const prior6Start = `${prior6Earliest.year}-${String(prior6Earliest.month).padStart(2, '0')}-01`

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

    const data: PlannerData = computePlannerData(
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
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div className="label" style={{ color: 'var(--ink-3)' }}>Control</div>
          {/* Accesos rápidos */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Link
              href="/pedidos"
              style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-3)', textDecoration: 'none', letterSpacing: '0.08em' }}
            >
              Pedidos →
            </Link>
            <Link
              href={`/budget?mes=${mes}`}
              style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-3)', textDecoration: 'none', letterSpacing: '0.08em' }}
            >
              Presupuesto →
            </Link>
          </div>
        </div>

        <MonthSwitcher mes={mes} />

        <PlannerShell data={data} userId={user.id} mes={mes} maristasProjectId={maristasProjectId} />

        {/* Drill-down: todos los apuntes del mes */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--rule)' }}>
          <Link
            href={`/control?mes=${mes}&view=apuntes`}
            style={{
              fontFamily: 'var(--sans)', fontSize: 12,
              color: 'var(--ink-3)', textDecoration: 'none',
              letterSpacing: '0.06em',
            }}
          >
            Todos los apuntes del mes →
          </Link>
        </div>
      </div>
    )
  }

  // ── APUNTES (view=apuntes) ───────────────────────────────
  // Fetches ledger + aggregates; reutiliza ControlMonthShell existente

  let txnQuery = supabase
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
    .order('id', { ascending: false })

  if (natureFilter) txnQuery = txnQuery.eq('nature', natureFilter)
  if (projectFilter) txnQuery = txnQuery.eq('project_id', projectFilter)

  const [txnsRes, categoriesRes, projectsRes, superCatRes] = await Promise.all([
    txnQuery,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichedRows: EnrichedRow[] = (txnsRes.data as any[]).map((row) => {
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
  const gastoMes = computeConsumo(enrichedRows, maristasProjectId)

  const natMap = new Map<string | null, number>()
  for (const row of enrichedRows) {
    if (row.amount >= 0) continue
    natMap.set(row.nature, (natMap.get(row.nature) ?? 0) + Math.abs(row.amount))
  }
  const porNaturaleza = Array.from(natMap.entries())
    .map(([nature, total]) => ({ nature, total }))
    .sort((a, b) => b.total - a.total)

  const rootMap = new Map<string | null, { rootId: string | null; rootName: string; color: string | null; total: number }>()
  for (const row of enrichedRows) {
    if (row.amount >= 0) continue
    const root = resolveRoot(row.category_id, catMap)
    const key = root?.id ?? null
    const entry = rootMap.get(key)
    if (entry) {
      entry.total += Math.abs(row.amount)
    } else {
      rootMap.set(key, { rootId: key, rootName: root?.name ?? 'Sin categoría', color: root?.color ?? null, total: Math.abs(row.amount) })
    }
  }
  const porCategoriaRaiz = Array.from(rootMap.values()).sort((a, b) => b.total - a.total)

  const supermerArr = supermerRes.data ?? []
  const superObservado = supermerArr.length > 0 ? supermerArr.reduce((s, r) => s + Number(r.spent), 0) : null
  const fijosObservados = fixedObsRes.data?.length ? fixedObsRes.data.reduce((s, r) => s + Number(r.total_spent), 0) : null
  const ingresosNoSalariales = incomesRes.data?.length ? incomesRes.data.reduce((s, r) => s + Number(r.net_amount), 0) : null

  const serverAggregates: ServerAggregates = {
    gastoMes,
    porNaturaleza,
    porCategoriaRaiz,
    superObservado,
    fijosObservados,
    ingresoSalarialMediano: medianIncRes.data?.median_monthly_income ?? null,
    mesesConDatos: medianIncRes.data?.months_with_data ?? 0,
    ingresosNoSalariales,
  }

  // Filtro activo: label para la cabecera
  const filterLabel = natureFilter
    ? ({ fijo_recurrente: 'Fijos', variable_recurrente: 'Variables', extraordinario: 'Extraordinarios', inversion: 'Inversiones' } as Record<string, string>)[natureFilter] ?? natureFilter
    : projectFilter
      ? 'Maristas'
      : null

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      {/* Back + filter label */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <Link
          href={`/control?mes=${mes}`}
          style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-3)', textDecoration: 'none', letterSpacing: '0.06em' }}
        >
          ← Resumen
        </Link>
        {filterLabel && (
          <span className="label" style={{ fontSize: 9, color: 'var(--ink-4)' }}>
            · {filterLabel}
          </span>
        )}
      </div>

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
