import { SectionTitle } from '@/components/egm/SectionTitle'
import { ParamRow } from '@/components/egm/ParamRow'

interface PerfilSectionProps {
  email: string
  role: string
}

export function PerfilSection({ email, role }: PerfilSectionProps) {
  const displayRole = role === 'eric' ? 'Eric' : role === 'ana' ? 'Ana' : role

  return (
    <div className="fade fade-1">
      <SectionTitle chapter="Configuración" title="Perfil" />
      <ParamRow variant="readonly" label="Email" value={email} />
      <ParamRow variant="readonly" label="Usuario" value={displayRole} />
      <ParamRow
        variant="readonly"
        label="Visibilidad de base"
        value={role === 'eric' ? 'privada_eric + compartida' : 'privada_ana + compartida'}
        sublabel="Determinada por RLS. No editable."
      />
    </div>
  )
}
