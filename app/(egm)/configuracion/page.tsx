import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PerfilSection } from './_components/sections/PerfilSection'
import { VisibilidadSection } from './_components/sections/VisibilidadSection'
import { AsesorSection } from './_components/sections/AsesorSection'
import { TemaSection } from './_components/sections/TemaSection'
import { TecnicosSection } from './_components/sections/TecnicosSection'

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

  if (section === 'visibilidad') return <VisibilidadSection />
  if (section === 'asesor')      return <AsesorSection />
  if (section === 'tema')        return <TemaSection />
  if (section === 'tecnicos')    return <TecnicosSection />

  // Finanzas y Categorías — Pasos 4 y 5
  return (
    <div className="fade fade-1">
      <div className="label" style={{ marginBottom: 8 }}>Configuración</div>
      <h2 className="display" style={{ fontSize: 36, marginTop: 4 }}>
        {section === 'finanzas' ? 'Finanzas' : 'Categorías'}
      </h2>
      <div className="rule-strong" style={{ marginTop: 20, marginBottom: 28 }} />
      <p className="roman" style={{ fontSize: 14, color: 'var(--ink-3)' }}>
        En construcción.
      </p>
    </div>
  )
}
