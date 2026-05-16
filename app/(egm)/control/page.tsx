import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ControlHeader } from './_components/ControlHeader'
import { ControlToggle } from './_components/ControlToggle'
import { ControlClientShell } from './_components/ControlClientShell'
import { ControlPagination } from './_components/ControlPagination'
import { ControlEmpty } from './_components/ControlEmpty'

const PAGE_SIZE = 50

interface Props {
  searchParams: Promise<{ filter?: string; page?: string }>
}

export default async function ControlPage({ searchParams }: Props) {
  const params = await searchParams
  const filter = (params.filter === 'todas' ? 'todas' : 'pendientes') as 'pendientes' | 'todas'
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [totalRes, pendientesRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'psd2'),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'psd2')
      .is('category_id', null),
  ])

  const total = totalRes.count ?? 0
  const pendientes = pendientesRes.count ?? 0

  let query = supabase
    .from('transactions')
    .select(`
      id, date, description, counterparty, raw_concept, amount, currency, nature, titular, is_reimbursable,
      accounts(institution, name),
      categories(id, name, color, parent_id),
      projects(id, name)
    `, { count: 'exact' })
    .eq('source', 'psd2')
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (filter === 'pendientes') query = query.is('category_id', null)

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  const totalForFilter = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalForFilter / PAGE_SIZE))

  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <ControlHeader />
      <ControlToggle pendientes={pendientes} total={total} active={filter} />
      {data && data.length > 0 ? (
        <>
          <ControlClientShell rows={data as unknown as Parameters<typeof ControlClientShell>[0]['rows']} />
          <ControlPagination page={page} totalPages={totalPages} total={totalForFilter} filter={filter} />
        </>
      ) : (
        <ControlEmpty filter={filter} />
      )}
    </div>
  )
}
