'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Module = {
  n: string
  label: string
  href: string | null
}

const MODULES: Module[] = [
  { n: 'I',    label: 'Inicio',      href: '/inicio' },
  { n: 'II',   label: 'Control',     href: '/control' },
  { n: 'III',  label: 'Pedidos',     href: '/pedidos' },
  { n: 'IV',   label: 'Horizonte',   href: '/planner' },
  { n: 'V',    label: 'Presupuesto', href: '/budget' },
  { n: 'VI',   label: 'Maristas',    href: null },
  { n: 'VII',  label: 'Asesor IA',   href: null },
]

const TAB_MODULES = MODULES.filter((m): m is Module & { href: string } => m.href !== null)

export function EgmNav() {
  const pathname = usePathname()

  function isActive(href: string | null): boolean {
    if (!href) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* ── Sidebar (desktop) ──────────────────────────── */}
      <aside
        className="hidden md:flex"
        style={{
          flexDirection: 'column',
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid var(--rule)',
          padding: '28px 20px',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div className="display-it" style={{ fontSize: 22, marginBottom: 4 }}>
          EGM<span style={{ color: 'var(--ink-3)' }}>·</span>Fin
        </div>
        <div className="label" style={{ marginBottom: 30 }}>Dossier vivo · v3.0</div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {MODULES.map(m => {
            const active = isActive(m.href)
            const sharedStyle: React.CSSProperties = {
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '7px 0 7px 10px',
              marginLeft: -12,
              borderLeft: active ? '2px solid var(--ink)' : '2px solid transparent',
              color: active ? 'var(--ink)' : m.href ? 'var(--ink-3)' : 'var(--ink-4)',
              textDecoration: 'none',
              cursor: m.href ? 'pointer' : 'default',
            }
            const content = (
              <>
                <span
                  className="roman"
                  style={{ fontSize: 11, minWidth: 22, color: active ? 'var(--ink)' : 'var(--ink-4)' }}
                >
                  {m.n}
                </span>
                <span style={{ fontSize: 13, fontWeight: active ? 500 : 400 }}>
                  {m.label}
                </span>
              </>
            )
            return m.href ? (
              <Link key={m.n} href={m.href} style={sharedStyle}>{content}</Link>
            ) : (
              <span key={m.n} style={sharedStyle}>{content}</span>
            )
          })}
        </nav>
      </aside>

      {/* ── Tab bar (mobile) ───────────────────────────── */}
      <nav
        className="flex md:hidden"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          borderTop: '1px solid var(--rule)',
          background: 'var(--bg)',
          paddingTop: 10,
          paddingBottom: 18,
          justifyContent: 'space-around',
        }}
      >
        {TAB_MODULES.map(m => {
          const active = isActive(m.href)
          return (
            <Link
              key={m.n}
              href={m.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                color: active ? 'var(--ink)' : 'var(--ink-4)',
                textDecoration: 'none',
                padding: '4px 0',
                minWidth: 50,
              }}
            >
              <span className="roman" style={{ fontSize: 14 }}>{m.n}</span>
              <span className="label" style={{ fontSize: 8.5, letterSpacing: '0.1em' }}>{m.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
