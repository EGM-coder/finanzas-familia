'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Module = {
  n: string
  label: string
  href: string | null  // null = disabled (no clicable, atenuado)
}

// Módulos canónicos del Dossier V3 — orden y numeración exactos.
// Pedidos y Presupuesto se acceden desde dentro de Control, no desde la nav.
const MODULES: Module[] = [
  { n: 'I',   label: 'Inicio',    href: '/inicio' },
  { n: 'II',  label: 'Proyecto',  href: null },
  { n: 'III', label: 'Control',   href: '/control' },
  { n: 'IV',  label: 'Horizonte', href: null },
  { n: 'V',   label: 'Análisis',  href: null },
  { n: 'VI',  label: 'Ajustes',   href: '/configuracion' },
]

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
          {MODULES.map(m => renderSidebarItem(m, isActive(m.href)))}
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
        {MODULES.map(m => renderTabItem(m, isActive(m.href)))}
      </nav>
    </>
  )
}

// ── Renderers ────────────────────────────────────────────────

function renderSidebarItem(m: Module, active: boolean) {
  const disabled = m.href === null
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    padding: '7px 0 7px 10px',
    marginLeft: -12,
    borderLeft: active ? '2px solid var(--ink)' : '2px solid transparent',
    color: active ? 'var(--ink)' : disabled ? 'var(--ink-4)' : 'var(--ink-3)',
    textDecoration: 'none',
    cursor: disabled ? 'default' : 'pointer',
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
    <Link key={m.n} href={m.href} style={style}>{content}</Link>
  ) : (
    <span key={m.n} style={style} aria-disabled="true">{content}</span>
  )
}

function renderTabItem(m: Module, active: boolean) {
  const disabled = m.href === null
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    color: active ? 'var(--ink)' : disabled ? 'var(--ink-4)' : 'var(--ink-4)',
    textDecoration: 'none',
    padding: '4px 0',
    minWidth: 40,
    cursor: disabled ? 'default' : 'pointer',
  }
  const content = (
    <>
      <span className="roman" style={{ fontSize: 13 }}>{m.n}</span>
      <span className="label" style={{ fontSize: 7.5, letterSpacing: '0.08em' }}>{m.label}</span>
    </>
  )
  return m.href ? (
    <Link key={m.n} href={m.href} style={style}>{content}</Link>
  ) : (
    <span key={m.n} style={style} aria-disabled="true">{content}</span>
  )
}
