'use client'
import { useRouter } from 'next/navigation'
import { SectionTitle } from '@/components/egm/SectionTitle'
import { ParamRow } from '@/components/egm/ParamRow'
import { EditorialBlock } from '@/components/egm/EditorialBlock'
import { Btn } from '@/components/egm'
import { createClient } from '@/lib/supabase/client'

export function TecnicosSection() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="fade fade-1">
      <SectionTitle chapter="Configuración" title="Técnicos" />

      <ParamRow
        variant="drill"
        label="Exportar datos"
        value="CSV / JSON"
        sublabel="Genera un archivo con todas tus transacciones e ingresos."
        onClick={() => {}}
      />

      <ParamRow
        variant="disabled"
        label="Pipeline de exportación"
        value="Próximamente"
        sublabel="La exportación completa está en construcción."
      />

      <EditorialBlock style={{ marginTop: 32, marginBottom: 32 }}>
        <p>Es tu archivo. Punto.</p>
      </EditorialBlock>

      <div className="rule" style={{ marginBottom: 24 }} />

      <Btn
        variant="ghost"
        onClick={handleSignOut}
        style={{ fontSize: 11, letterSpacing: '0.12em' }}
      >
        Cerrar sesión
      </Btn>
    </div>
  )
}
