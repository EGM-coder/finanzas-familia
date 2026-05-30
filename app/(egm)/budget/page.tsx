import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from '../control/_components/MonthSwitcher'
import { BudgetShell } from './_components/BudgetShell'

// ── Types ────────────────────────────────────────────────────

export type BudgetCategory = {
  id: string
  name: string
  color: string | null
  parent_id: string | null
}

export type BudgetGroup = {
  parent: BudgetCategory
  leaves: BudgetCategory[]
}

export type BudgetRowData = {
  category_id: string
  amount_planned: number  // numeric de Postgres → number; 0 = rastro histórico
}

export type SpentRowData = {
  category_id: string
  spent: number
}

// ── Helpers ──────────────────────────────────────────────────

function currentMes(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Page ─────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ mes?: string }>
}

export default async function BudgetPage({ searchParams }: Props) {
  const params = await searchParams
  const mes = params.mes ?? currentMes()

  if (!/^\d{4}-\d{2}$/.test(mes)) redirect(`/budget?mes=${currentMes()}`)

  const [year, month] = mes.split('-').map(Number)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [catsRes, budgetsRes, spentRes, medianRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, parent_id, color')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('budgets')
      .select('category_id, amount_planned')
      .eq('year', year)
      .eq('month', month)
      .eq('visibility', 'compartida'),
    supabase
      .from('v_spent_by_category_month')
      .select('category_id, spent')
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('v_median_income_3m')
      .select('median_monthly_income, months_with_data')
      .eq('user_id', user.id)
      .single(),
  ])

  const cats = (catsRes.data ?? []) as BudgetCategory[]
  const parents = cats.filter(c => !c.parent_id)
  const leaves  = cats.filter(c => !!c.parent_id)

  // Agrupar hojas por padre inmediato; omitir padres sin hojas activas
  const grouped: BudgetGroup[] = parents
    .map(p => ({ parent: p, leaves: leaves.filter(l => l.parent_id === p.id) }))
    .filter(g => g.leaves.length > 0)

  const budgets = (budgetsRes.data ?? []) as BudgetRowData[]
  const spent   = (spentRes.data   ?? []) as SpentRowData[]
  const medianIncome = medianRes.data?.median_monthly_income
    ? Number(medianRes.data.median_monthly_income)
    : null

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <div className="label" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>Presupuesto</div>
      <MonthSwitcher mes={mes} />
      <BudgetShell
        grouped={grouped}
        budgets={budgets}
        spent={spent}
        medianIncome={medianIncome}
        year={year}
        month={month}
      />
    </div>
  )
}
