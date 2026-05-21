'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SectionTitle } from '@/components/egm/SectionTitle'
import { ParamRow } from '@/components/egm/ParamRow'
import { EditorialBlock } from '@/components/egm/EditorialBlock'

const ASESOR_KEY = 'egmfin.asesor.enabled'

export function AsesorSection() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(localStorage.getItem(ASESOR_KEY) === 'true')
  }, [])

  function handleToggle(next: boolean) {
    setEnabled(next)
    localStorage.setItem(ASESOR_KEY, String(next))
    toast('Guardado.')
  }

  return (
    <div className="fade fade-1">
      <SectionTitle chapter="Configuración" title="Asesor IA" />

      <ParamRow
        variant="toggle"
        label="Asesor activo"
        sublabel="Sugiere contexto fiscal y patrimonial cuando hay datos suficientes."
        on={enabled}
        onChange={handleToggle}
      />

      <EditorialBlock style={{ marginTop: 28 }}>
        <p>
          El asesor usa Claude Sonnet vía Anthropic API con contexto fiscal español.
          Solo actúa cuando hay datos históricos suficientes para generar señal útil.
          Ningún dato sale del sistema sin acción explícita tuya.
        </p>
      </EditorialBlock>
    </div>
  )
}
