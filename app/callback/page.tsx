import { createClient } from '@/lib/supabase/server'
import { exchangeCode } from '@/lib/enable-banking'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{
    code?: string
    state?: string
    error?: string
    error_description?: string
  }>
}

const WRAPPER_STYLE: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '40px',
}

function ErrorScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="egm" style={WRAPPER_STYLE}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <div className="label" style={{ marginBottom: 12 }}>AJUSTES · CONEXIONES</div>
        <div className="display" style={{ fontSize: 32 }}>{title}</div>
        {detail && (
          <div className="body" style={{ fontStyle: 'italic', color: 'var(--ink-3)', fontSize: 14, marginTop: 10, maxHeight: '2.9em', overflow: 'hidden' }}>
            {detail}
          </div>
        )}
        <div style={{ marginTop: 28 }}>
          <Link href="/ajustes/conexiones-bancarias" className="btn btn-ghost" style={{ fontSize: 11 }}>
            Volver
          </Link>
        </div>
      </div>
    </div>
  )
}

export default async function CallbackPage({ searchParams }: Props) {
  const params = await searchParams

  // Caso 1 — error devuelto por el banco
  if (params.error) {
    return (
      <ErrorScreen
        title="No se pudo completar la conexión."
        detail={params.error_description ?? 'Error desconocido'}
      />
    )
  }

  // Caso 2 — faltan parámetros necesarios
  if (!params.code || !params.state) {
    return (
      <ErrorScreen
        title="Parámetros de retorno incompletos."
        detail="Vuelve a iniciar la conexión desde ajustes."
      />
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return <ErrorScreen title="Sesión no encontrada." detail="Inicia sesión e inténtalo de nuevo." />
  }

  // Buscar la fila pending con el auth_state
  const { data: bc, error: bcErr } = await supabase
    .from('bank_connections')
    .select('id, aspsp_name, aspsp_country')
    .eq('auth_state', params.state)
    .eq('status', 'pending')
    .eq('user_id', user.id)
    .single()

  if (bcErr || !bc) {
    return (
      <ErrorScreen
        title="Estado inválido o expirado."
        detail="Vuelve a iniciar la conexión desde ajustes."
      />
    )
  }

  let session
  try {
    session = await exchangeCode(params.code)
  } catch (err) {
    console.error('[callback] exchangeCode:', err)
    return (
      <ErrorScreen
        title="Error técnico al completar la conexión."
        detail="No se pudo intercambiar el código con Enable Banking."
      />
    )
  }

  try {
    await supabase
      .from('bank_connections')
      .update({
        status:              'active',
        consent_session_id:  session.session_id,
        consent_valid_until: session.access.valid_until,
        raw_session:         session as unknown as Record<string, unknown>,
        updated_at:          new Date().toISOString(),
      })
      .eq('id', bc.id)

    for (const account of session.accounts) {
      const iban = account.account_id?.iban

      if (iban) {
        // accounts tabla no tiene columna iban — no se puede hacer match automático
        console.warn(
          `[callback] Cuenta uid=${account.uid} iban=${iban} no matcheada — ` +
          'la tabla accounts no tiene columna iban; vincular manualmente en bank_account_links'
        )
      }
    }
  } catch (err) {
    console.error('[callback] UPDATE bank_connections / links:', err)
    return (
      <ErrorScreen
        title="Error técnico al completar la conexión."
        detail="La autenticación fue correcta pero no se pudo guardar el resultado."
      />
    )
  }

  const aspspName = bc.aspsp_name
  const numAccounts = session.accounts.length
  const returnUrl  = `/ajustes/conexiones-bancarias?connected=${encodeURIComponent(aspspName)}`

  return (
    <div className="egm" style={WRAPPER_STYLE}>
      {/* meta refresh a los 2.5 s */}
      <meta httpEquiv="refresh" content={`2;url=${returnUrl}`} />

      <div style={{ maxWidth: 480, width: '100%' }}>
        <div className="label" style={{ marginBottom: 12 }}>AJUSTES · CONEXIONES</div>
        <div className="display" style={{ fontSize: 32 }}>Conexión establecida.</div>
        <div className="body" style={{ fontStyle: 'italic', color: 'var(--ink-3)', fontSize: 14, marginTop: 10 }}>
          {aspspName} · {numAccounts} cuenta{numAccounts !== 1 ? 's' : ''} vinculada{numAccounts !== 1 ? 's' : ''}
        </div>
        <div className="roman" style={{ fontSize: 12, marginTop: 18 }}>
          Redirigiendo en 2 s · <Link href={returnUrl} style={{ color: 'var(--ink-3)' }}>ir ahora</Link>
        </div>
      </div>
    </div>
  )
}
