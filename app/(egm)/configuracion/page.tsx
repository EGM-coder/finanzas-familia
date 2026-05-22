import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PerfilSection } from './_components/sections/PerfilSection'
import { VisibilidadSection } from './_components/sections/VisibilidadSection'
import { AsesorSection } from './_components/sections/AsesorSection'
import { TemaSection } from './_components/sections/TemaSection'
import { TecnicosSection } from './_components/sections/TecnicosSection'
import { FinanzasSection } from './_components/sections/FinanzasSection'
import { CategoriasSection } from './_components/sections/CategoriasSection'

interface Props {
  searchParams: Promise<{ section?: string; item?: string }>
}

export default async function ConfiguracionPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const section = params.section ?? 'perfil'

  if (section === 'perfil') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    return (
      <PerfilSection
        email={user.email ?? ''}
        role={profile?.role ?? ''}
      />
    )
  }

  if (section === 'finanzas') {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const [medianRes, incomesRes, supermerCatRes, fixedObsRes] = await Promise.all([
      supabase
        .from('v_median_income_3m')
        .select('median_monthly_income, months_with_data')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('incomes')
        .select('id, date, type, gross_amount, irpf_withheld, ss_withheld, net_amount, employer, concept')
        .order('date', { ascending: false })
        .limit(100),
      supabase
        .from('categories')
        .select('id')
        .eq('name', 'Supermercado')
        .eq('is_default', true)
        .single(),
      supabase
        .from('v_fixed_expenses_observed')
        .select('counterparty, total_spent, txn_count, avg_amount, first_seen, last_seen')
        .eq('year', year)
        .eq('month', month)
        .order('total_spent', { ascending: false })
        .limit(50),
    ])

    // Sum supermercado across all visibility buckets (RLS ensures only visible rows)
    let supermerSpent: number | null = null
    if (supermerCatRes.data?.id) {
      const { data: supermerRows } = await supabase
        .from('v_spent_by_category_month')
        .select('spent')
        .eq('year', year)
        .eq('month', month)
        .eq('category_id', supermerCatRes.data.id)

      if (supermerRows && supermerRows.length > 0) {
        supermerSpent = supermerRows.reduce((sum, r) => sum + Number(r.spent), 0)
      }
    }

    return (
      <FinanzasSection
        medianIncome={medianRes.data?.median_monthly_income ?? null}
        monthsWithData={medianRes.data?.months_with_data ?? 0}
        incomes={incomesRes.data ?? []}
        userId={user.id}
        fixedObserved={fixedObsRes.data ?? []}
        supermerSpent={supermerSpent}
        referenceMonth={{ year, month }}
      />
    )
  }

  if (section === 'visibilidad') return <VisibilidadSection />
  if (section === 'asesor')      return <AsesorSection />
  if (section === 'tema')        return <TemaSection />
  if (section === 'tecnicos')    return <TecnicosSection />

  if (section === 'categorias') {
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, parent_id, color, is_default, is_active, visibility, sort_order')
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    return <CategoriasSection categories={categories ?? []} />
  }

  // Default fallback — perfil
  redirect('/configuracion?section=perfil')
}
