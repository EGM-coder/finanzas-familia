import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ section?: string; item?: string }>
}

const SECTIONS: Record<string, string> = {
  perfil:      'Perfil',
  finanzas:    'Finanzas',
  categorias:  'Categorías',
  visibilidad: 'Visibilidad',
  asesor:      'Asesor IA',
  tema:        'Tema',
  tecnicos:    'Técnicos',
}

export default async function ConfiguracionPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const section = SECTIONS[params.section ?? ''] ? (params.section ?? 'perfil') : 'perfil'
  const label = SECTIONS[section]

  return (
    <div className="fade fade-1">
      <div className="label" style={{ marginBottom: 8 }}>Configuración</div>
      <h1 className="display" style={{ fontSize: 36, marginTop: 4 }}>{label}</h1>
      <div className="rule-strong" style={{ marginTop: 24, marginBottom: 32 }} />
      <p className="roman" style={{ fontSize: 14, color: 'var(--ink-3)' }}>
        En construcción.
      </p>
    </div>
  )
}
