import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from '../control/_components/MonthSwitcher'
import { PlannerShell } from './_components/PlannerShell'
import {
  type PlannerData,
  priorMonthsList,
  computePlannerData,
} from '../_lib/plannerUtils'

export type { TendenciaPoint, PlannerData } from '../_lib/plannerUtils'

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

type SpentRow = { spent: number; year: number; month: number }

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

  const prior6 = priorMonthsList(mes, 6)
  const prior3 = prior6.slice(0, 3)
  const prior6Earliest = prior6[prior6.length - 1]
  const prior6Start = `${prior6Earliest.year}-${String(prior6Earliest.month).padStart(2, '0')}-01`

  const [txnsRes, categoriesRes, fixedAllRes, incomesRes, maristasProjectRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, nature, project_id')
      .eq('source', 'psd2')
      .is('superseded_by', null)
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
      .is('superseded_by', null)
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
      <div className="label" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>Planner</div>
      <MonthSwitcher mes={mes} />
      <PlannerShell data={data} userId={user.id} mes={mes} maristasProjectId={maristasProjectId} />
    </div>
  )
}
