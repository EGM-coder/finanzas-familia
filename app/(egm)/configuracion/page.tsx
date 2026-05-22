import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PerfilSection } from './_components/sections/PerfilSection'
import { VisibilidadSection } from './_components/sections/VisibilidadSection'
import { AsesorSection } from './_components/sections/AsesorSection'
import { TemaSection } from './_components/sections/TemaSection'
import { TecnicosSection } from './_components/sections/TecnicosSection'
import { FinanzasSection } from './_components/sections/FinanzasSection'

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
    const [medianRes, incomesRes] = await Promise.all([
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
    ])

    return (
      <FinanzasSection
        medianIncome={medianRes.data?.median_monthly_income ?? null}
        monthsWithData={medianRes.data?.months_with_data ?? 0}
        incomes={incomesRes.data ?? []}
        userId={user.id}
      />
    )
  }

  if (section === 'visibilidad') return <VisibilidadSection />
  if (section === 'asesor')      return <AsesorSection />
  if (section === 'tema')        return <TemaSection />
  if (section === 'tecnicos')    return <TecnicosSection />

  // Categorías — Paso 4
  return (
    <div className="fade fade-1">
      <div className="label" style={{ marginBottom: 8 }}>Configuración</div>
      <h2 className="display" style={{ fontSize: 36, marginTop: 4 }}>Categorías</h2>
      <div className="rule-strong" style={{ marginTop: 20, marginBottom: 28 }} />
      <p className="roman" style={{ fontSize: 14, color: 'var(--ink-3)' }}>En construcción.</p>
    </div>
  )
}
