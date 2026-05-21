'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SectionTitle } from '@/components/egm/SectionTitle'
import { ParamRow } from '@/components/egm/ParamRow'

const THEME_OPTIONS = [
  { value: 'light',  label: 'Claro' },
  { value: 'dark',   label: 'Oscuro' },
  { value: 'system', label: 'Automático' },
]

export function TemaSection() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  function handleChange(value: string) {
    setTheme(value)
    toast('Guardado.')
  }

  if (!mounted) return null

  return (
    <div className="fade fade-1">
      <SectionTitle chapter="Configuración" title="Tema" />

      <ParamRow
        variant="radio"
        label="Apariencia"
        options={THEME_OPTIONS}
        active={theme ?? 'light'}
        onChange={handleChange}
      />
    </div>
  )
}
