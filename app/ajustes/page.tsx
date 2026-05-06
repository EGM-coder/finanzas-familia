import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const ROMAN_MONTHS = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii']

function egmDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const m  = ROMAN_MONTHS[d.getMonth()]
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}·${m}·${yy}`
}

const NAV: [string, string, string][] = [
  ['I',   'Inicio',        '/'],
  ['II',  'Flujo',         '/flujo'],
  ['III', 'Maristas',      '/maristas'],
  ['IV',  'Horizonte',     '/horizonte'],
  ['V',   'Línea de vida', '/timeline'],
  ['VI',  'Asesor IA',     '/asesor'],
  ['VII', 'Control',       '/control'],
]

const UPCOMING = ['Perfil', 'Categorías', 'Reglas de clasificación']

export default async function AjustesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = egmDate(new Date())

  return (
    <div
      className="egm"
      style={{ width: '100%', minHeight: '100vh', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' }}
    >
      {/* Sidebar */}
      <aside style={{ borderRight: '1px solid var(--rule)', padding: '28px 20px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div className="display-it" style={{ fontSize: 22, marginBottom: 4 }}>
          EGM<span style={{ color: 'var(--ink-3)' }}>·</span>Fin
        </div>
        <div className="label" style={{ marginBottom: 30 }}>Dossier vivo · v3.0</div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(([n, l, href]) => (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '7px 0', paddingLeft: 10, marginLeft: -12,
                color: 'var(--ink-3)',
                borderLeft: '2px solid transparent',
                textDecoration: 'none',
              }}
            >
              <span className="roman" style={{ fontSize: 11, minWidth: 22, color: 'var(--ink-4)' }}>{n}</span>
              <span style={{ fontSize: 13 }}>{l}</span>
            </Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />
        <div className="rule" style={{ marginBottom: 14 }} />
        <div className="label" style={{ marginBottom: 4 }}>Sesión</div>
        <Link href="/ajustes" style={{ fontSize: 13, color: 'var(--ink)', textDecoration: 'none' }}>
          Eric Gahimbare Ibáñez
        </Link>
        <div className="roman" style={{ fontSize: 11 }}>Logroño · {today}</div>
      </aside>

      {/* Main */}
      <main style={{ overflow: 'auto', padding: '34px 50px 50px' }}>
        {/* ScreenHead */}
        <div className="label">AJUSTES</div>
        <div className="display" style={{ fontSize: 38, marginTop: 4 }}>Configuración</div>
        <div className="body" style={{ fontStyle: 'italic', color: 'var(--ink-3)', marginTop: 6, fontSize: 13 }}>
          Preferencias y conexiones técnicas del sistema.
        </div>
        <div className="rule-strong" style={{ margin: '20px 0 30px' }} />

        {/* Sección activa */}
        <Link
          href="/ajustes/conexiones-bancarias"
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          <div style={{ height: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}>
            <div style={{ fontSize: 14, fontFamily: 'var(--sans)', color: 'var(--ink)' }}>Conexiones bancarias</div>
            <div className="roman" style={{ fontSize: 11, marginTop: 2 }}>
              Vincular Kutxabank y Santander vía Enable Banking
            </div>
          </div>
        </Link>

        {/* Placeholders */}
        {UPCOMING.map(label => (
          <div
            key={label}
            style={{ height: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderBottom: '1px solid var(--rule)' }}
          >
            <div style={{ fontSize: 14, fontFamily: 'var(--sans)', color: 'var(--ink-4)' }}>{label}</div>
            <div className="roman" style={{ fontSize: 11, marginTop: 2, color: 'var(--ink-4)' }}>Próximamente</div>
          </div>
        ))}
      </main>
    </div>
  )
}
