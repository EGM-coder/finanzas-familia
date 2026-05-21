'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const NAV_ITEMS = [
  { section: 'perfil',      label: 'Perfil' },
  { section: 'finanzas',    label: 'Finanzas' },
  { section: 'categorias',  label: 'Categorías' },
  { section: 'visibilidad', label: 'Visibilidad' },
  { section: 'asesor',      label: 'Asesor IA' },
  { section: 'tema',        label: 'Tema' },
  { section: 'tecnicos',    label: 'Técnicos' },
] as const

export function SettingsNav() {
  const searchParams = useSearchParams()
  const active = searchParams.get('section') ?? 'perfil'

  return (
    <nav>
      <div className="label" style={{ marginBottom: 24 }}>Configuración</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(({ section, label }) => {
          const isActive = active === section
          return (
            <li key={section}>
              <Link
                href={`/configuracion?section=${section}`}
                prefetch={false}
                style={{
                  display: 'block',
                  padding: '9px 0',
                  fontFamily: isActive ? 'var(--serif)' : 'var(--sans)',
                  fontStyle: isActive ? 'italic' : 'normal',
                  fontWeight: isActive ? 400 : 500,
                  fontSize: isActive ? 15 : 11,
                  color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                  textDecoration: isActive ? 'underline' : 'none',
                  textUnderlineOffset: '4px',
                  textDecorationThickness: '1px',
                  letterSpacing: isActive ? '-0.005em' : '0.14em',
                  textTransform: isActive ? 'none' : 'uppercase',
                  transition: 'color 0.15s',
                }}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
