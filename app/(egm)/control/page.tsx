import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthSwitcher } from './_components/MonthSwitcher'
import { ControlMonthShell } from './_components/ControlMonthShell'

interface Props {
  searchParams: Promise<{ mes?: string }>
}

function currentMes(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(mes: string): { start: string; end: string } {
  const [year, month] = mes.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

export default async function ControlPage({ searchParams }: Props) {
  const params = await searchParams
  const mes = params.mes ?? currentMes()

  // Validate format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(mes)) redirect(`/control?mes=${currentMes()}`)

  const { start, end } = monthRange(mes)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [txnsRes, categoriesRes, projectsRes] = await Promise.all([
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
  ])

  if (txnsRes.error) throw new Error(txnsRes.error.message)

  const rows = (txnsRes.data ?? []) as unknown as Parameters<typeof ControlMonthShell>[0]['rows']
  const categories = categoriesRes.data ?? []
  const initialProjects = projectsRes.data ?? []

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <div className="label" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>Control</div>
      <MonthSwitcher mes={mes} />
      <ControlMonthShell
        rows={rows}
        categories={categories}
        initialProjects={initialProjects}
      />
    </div>
  )
}
