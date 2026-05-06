import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { connectBank } from './actions'

const ROMAN_MONTHS = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii']

function egmDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const m  = ROMAN_MONTHS[d.getMonth()]
  const yy = String(d.getFullYear()).slice(2)
  return `${dd}·${m}·${yy}`
}

function relativeTime(d: Date | null): string {
  if (!d) return 'nunca'
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'hace un momento'
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  return `hace ${Math.floor(diffH / 24)}d`
}

const STATUS_COLOR: Record<string, string> = {
  pending:  'var(--ink-3)',
  active:   'var(--signal-pos)',
  expired:  'var(--signal-neg)',
  revoked:  'var(--ink-4)',
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

const AVAILABLE_ASPSPS = [
  { name: 'Kutxabank',       country: 'ES' },
  { name: 'Banco Santander', country: 'ES' },
]

interface BankConnection {
  id: string
  aspsp_name: string
  aspsp_country: string
  status: string
  consent_valid_until: string | null
  created_at: string
  bank_account_links: { last_sync_at: string | null }[]
}

export default async function ConexionesBancariasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawConnections } = await supabase
    .from('bank_connections')
    .select('*, bank_account_links(last_sync_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const connections: BankConnection[] = (rawConnections ?? []) as BankConnection[]

  const now = new Date()
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const today = egmDate(now)

  const activeAspspNames = new Set(
    connections.filter(c => c.status === 'active').map(c => c.aspsp_name)
  )

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
        <div className="label">AJUSTES · CONEXIONES</div>
        <div className="display" style={{ fontSize: 38, marginTop: 4 }}>Conexiones bancarias</div>
        <div className="body" style={{ fontStyle: 'italic', color: 'var(--ink-3)', marginTop: 6, fontSize: 13 }}>
          Sincronización vía Enable Banking · servicio AIS · cuentas linkeadas en panel.
        </div>
        <div className="rule-strong" style={{ margin: '20px 0 30px' }} />

        {/* CONECTADAS */}
        <div className="label" style={{ marginBottom: 14 }}>Conectadas</div>

        {connections.length === 0 ? (
          <p className="body" style={{ fontStyle: 'italic', color: 'var(--ink-3)', fontSize: 14 }}>
            Ninguna conexión activa.
          </p>
        ) : (
          <div>
            {connections.map(c => {
              const numLinks = c.bank_account_links.length
              const lastSyncDates = c.bank_account_links
                .map(l => l.last_sync_at ? new Date(l.last_sync_at) : null)
                .filter((d): d is Date => d !== null)
              const lastSync = lastSyncDates.length
                ? relativeTime(new Date(Math.max(...lastSyncDates.map(d => d.getTime()))))
                : 'nunca'
              const validUntil = c.consent_valid_until ? new Date(c.consent_valid_until) : null
              const needsReconnect =
                c.status !== 'active' ||
                (validUntil !== null && validUntil < in14Days)

              return (
                <div
                  key={c.id}
                  style={{ padding: '16px 0', borderBottom: '1px solid var(--rule)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="display" style={{ fontSize: 18 }}>{c.aspsp_name}</div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span
                          className="label"
                          style={{ fontSize: 10, color: STATUS_COLOR[c.status] ?? 'var(--ink-3)', letterSpacing: '0.16em' }}
                        >
                          {c.status.toUpperCase()}
                        </span>
                        <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                          {numLinks} cuenta{numLinks !== 1 ? 's' : ''}
                        </span>
                        <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                          Sync: {lastSync}
                        </span>
                        {validUntil && (
                          <span className="roman" style={{ fontSize: 11 }}>
                            Caduca: {egmDate(validUntil)}
                          </span>
                        )}
                      </div>
                    </div>

                    {needsReconnect && (
                      <form action={connectBank}>
                        <input type="hidden" name="aspsp_name"    value={c.aspsp_name} />
                        <input type="hidden" name="aspsp_country" value={c.aspsp_country} />
                        <button type="submit" className="btn btn-ghost" style={{ fontSize: 11, padding: '8px 14px' }}>
                          Reconectar
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="rule-strong" style={{ margin: '32px 0 28px' }} />

        {/* DISPONIBLES */}
        <div className="label" style={{ marginBottom: 14 }}>Disponibles</div>

        {AVAILABLE_ASPSPS.every(a => activeAspspNames.has(a.name)) ? (
          <p className="body" style={{ fontStyle: 'italic', color: 'var(--ink-3)', fontSize: 14 }}>
            Todas las instituciones disponibles están vinculadas.
          </p>
        ) : (
          <div>
            {AVAILABLE_ASPSPS.filter(a => !activeAspspNames.has(a.name)).map(a => (
              <div
                key={a.name}
                style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <span style={{ fontSize: 14, fontFamily: 'var(--sans)', color: 'var(--ink)' }}>{a.name}</span>
                  <span className="roman" style={{ fontSize: 13, marginLeft: 6 }}>· {a.country}</span>
                </div>
                <form action={connectBank}>
                  <input type="hidden" name="aspsp_name"    value={a.name} />
                  <input type="hidden" name="aspsp_country" value={a.country} />
                  <button type="submit" className="btn" style={{ fontSize: 11, padding: '8px 14px' }}>
                    Conectar
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
