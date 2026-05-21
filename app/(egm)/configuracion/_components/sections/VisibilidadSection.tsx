'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SectionTitle } from '@/components/egm/SectionTitle'
import { ParamRow } from '@/components/egm/ParamRow'
import { EditorialBlock } from '@/components/egm/EditorialBlock'

const SCOPE_KEY = 'egmfin.scope'

const SCOPE_OPTIONS = [
  { value: 'compartida',   label: 'Compartida' },
  { value: 'privada_eric', label: 'Eric' },
  { value: 'privada_ana',  label: 'Ana' },
]

export function VisibilidadSection() {
  const [scope, setScope] = useState<string>('compartida')

  useEffect(() => {
    const stored = localStorage.getItem(SCOPE_KEY)
    if (stored) setScope(stored)
  }, [])

  function handleChange(value: string) {
    setScope(value)
    localStorage.setItem(SCOPE_KEY, value)
    toast('Guardado.')
  }

  return (
    <div className="fade fade-1">
      <SectionTitle chapter="Configuración" title="Visibilidad" />

      <ParamRow
        variant="radio"
        label="Vista por defecto"
        sublabel="Preferencia de pantalla. La RLS de la base de datos siempre aplica."
        options={SCOPE_OPTIONS}
        active={scope}
        onChange={handleChange}
      />

      <EditorialBlock style={{ marginTop: 28 }}>
        <p>
          Esta preferencia controla qué datos muestra la interfaz por defecto al abrir la app.
          No es un filtro de seguridad: nunca permite ver lo que la base de datos prohíbe.
        </p>
        <p style={{ marginTop: 10 }}>
          Los datos privados de cada usuario están protegidos en origen
          mediante Row-Level Security de PostgreSQL. Ninguna preferencia de pantalla puede alterar ese blindaje.
        </p>
      </EditorialBlock>
    </div>
  )
}
