import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from './_components/MonthSwitcher'
import { ControlMonthShell } from './_components/ControlMonthShell'
import { type EnrichedRow } from './_components/ControlMonthLedger'
import { type ServerAggregates } from './_components/AggregatesPanel'

interface Props {
  searchParams: Promise<{ mes?: string; ver?: string }>
}

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

export default async function ControlPage({ searchParams }: Props) {
  const params = await searchParams
  const mes = params.mes ?? currentMes()
  const ver = params.ver === 'pendientes' ? 'pendientes' : 'todas'

  if (!/^\d{4}-\d{2}$/.test(mes)) redirect(`/control?mes=${currentMes()}`)

  const { start, end, year, month } = monthRange(mes)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Round 1: txns + categories + projects + superCat (parallel) ──
  const [txnsRes, categoriesRes, projectsRes, superCatRes] = await Promise.all([
    supabase
      .from('transactions')
      .select(`
        id, date, description, counterparty, raw_concept, amount, currency,
        category_id, project_id, nature, titular, is_reimbursable,
        accounts(institution, name),
        categories(id, name, color, parent_id),
        projects(id, name)
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

  // ── Round 2: vistas dependientes de superCatId ──
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

  // ── Cómputo server-side ──────────────────────────────────────────

  // Mapa de categorías para resolver raíces sin N+1
  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  function resolveRoot(catId: string | null): { id: string; name: string; color: string | null } | null {
    if (!catId) return null
    let cat = categoryMap.get(catId)
    if (!cat) return null
    while (cat.parent_id) {
      const parent = categoryMap.get(cat.parent_id)
      if (!parent) break
      cat = parent
    }
    return { id: cat.id, name: cat.name, color: cat.color as string | null }
  }

  const rawRows = txnsRes.data ?? []

  const enrichedRows: EnrichedRow[] = rawRows.map((row) => {
    const root = resolveRoot(row.category_id)
    const por_revisar =
      !row.category_id ||
      !row.nature ||
      !row.titular ||
      !row.counterparty ||
      row.counterparty === row.raw_concept
    return { ...(row as unknown as EnrichedRow), rootColor: root?.color ?? null, por_revisar }
  })

  const countPorRevisar = enrichedRows.filter((r) => r.por_revisar).length

  // gastoMes: magnitud de salidas (amount < 0)
  const gastoMes = enrichedRows.reduce(
    (sum, r) => (r.amount < 0 ? sum + Math.abs(r.amount) : sum),
    0,
  )

  // porNaturaleza: magnitud de gastos (amount < 0) agrupada por nature
  const natMap = new Map<string | null, number>()
  for (const row of enrichedRows) {
    if (row.amount >= 0) continue
    natMap.set(row.nature, (natMap.get(row.nature) ?? 0) + Math.abs(row.amount))
  }
  const porNaturaleza = Array.from(natMap.entries())
    .map(([nature, total]) => ({ nature, total }))
    .sort((a, b) => b.total - a.total)

  // porCategoriaRaiz: magnitud de gastos agrupada por raíz de categoría
  const rootMap = new Map<
    string | null,
    { rootId: string | null; rootName: string; color: string | null; total: number }
  >()
  for (const row of enrichedRows) {
    if (row.amount >= 0) continue
    const root = resolveRoot(row.category_id)
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
  const supermerData = supermerRes.data ?? []
  const superObservado =
    supermerData.length > 0
      ? supermerData.reduce((sum, r) => sum + Number(r.spent), 0)
      : null

  const fixedData = fixedObsRes.data ?? []
  const fijosObservados =
    fixedData.length > 0
      ? fixedData.reduce((sum, r) => sum + Number(r.total_spent), 0)
      : null

  const ingresoSalarialMediano = medianIncRes.data?.median_monthly_income ?? null
  const mesesConDatos = medianIncRes.data?.months_with_data ?? 0

  const incomesData = incomesRes.data ?? []
  const ingresosNoSalariales =
    incomesData.length > 0
      ? incomesData.reduce((sum, r) => sum + Number(r.net_amount), 0)
      : null

  const serverAggregates: ServerAggregates = {
    gastoMes,
    porNaturaleza,
    porCategoriaRaiz,
    superObservado,
    fijosObservados,
    ingresoSalarialMediano,
    mesesConDatos,
    ingresosNoSalariales,
  }

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
      />
    </div>
  )
}
