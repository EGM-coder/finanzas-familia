import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import tablero from './tablero.json'

// Deep-link URL canónica a la vista "sin clasificar" de /control
const CONTROL_SIN_CLASIF = '/control?view=apuntes&ver=sin_clasificar'

// ── Types ────────────────────────────────────────────────────

type Entry = { mk?: string; tx: string; nota?: string }

type JobRunRow = {
  job_name: string
  run_at: string
  status: 'ok' | 'error' | 'partial'
  detail: Record<string, unknown> | null
}

type BalanceCheckRow = {
  account_id: string
  check_date: string
  real_balance: number
  accounts: { name: string } | null
}

type AcctBalRow = { id: string; current_balance: number }

type DupRow = {
  account_name: string
  txn_date: string
  amount: number
  description: string | null
  n: number
}

type ClosureRow = {
  scope: string
  week_start: string
  week_end: string
  semaforo: string | null   // NULL = histórico insuficiente (< 4 semanas). D-022.
  data_health: string
  health_reason: string | null
  closed_at: string
  recent_bad_count: number
}

// ── Helpers ──────────────────────────────────────────────────

function fmtAmt(n: number) {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function ItemList({ items, withMk = false }: { items: readonly Entry[]; withMk?: boolean }) {
  return (
    <div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: withMk ? '38px 1fr' : '1fr',
            gap: withMk ? 10 : 0,
            padding: '9px 0',
            borderBottom: '1px solid var(--rule-2)',
            alignItems: 'start',
          }}
        >
          {withMk && (
            <span className="roman" style={{ fontSize: 11, color: 'var(--ink-4)', paddingTop: 1 }}>
              {item.mk ?? ''}
            </span>
          )}
          <div>
            <div style={{ fontSize: 13, lineHeight: 1.35 }}>{item.tx}</div>
            {item.nota ? (
              <div className="roman" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                {item.nota}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label" style={{ marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default async function EstadoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)

  const [dupsResult, closureResult, sinClasResult, jobRunsResult, balChecksResult, acctBalResult] =
    await Promise.all([
      supabase.rpc('fn_pending_review_dups'),
      supabase.from('v_last_closure_health').select('*'),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .is('category_id', null)
        .lt('amount', 0)
        .is('superseded_by', null),
      supabase
        .from('job_runs')
        .select('job_name,run_at,status,detail')
        .order('run_at', { ascending: false })
        .limit(40),
      supabase
        .from('balance_checks')
        .select('account_id,check_date,real_balance,accounts(name)')
        .gte('check_date', twoDaysAgo)
        .order('check_date', { ascending: false })
        .limit(30),
      supabase
        .from('account_balances_full')
        .select('id,current_balance')
        .eq('is_active', true),
    ])

  const { data: rawDups, error: dupsError } = dupsResult
  if (dupsError) console.error('[estado] fn_pending_review_dups:', dupsError.message)

  const { data: rawClosures, error: closureError } = closureResult
  if (closureError) console.error('[estado] v_last_closure_health:', closureError.message)

  const dups: DupRow[] = (rawDups as DupRow[] | null) ?? []
  const closures: ClosureRow[] = (rawClosures as ClosureRow[] | null) ?? []

  // Jobs: latest run per job_name
  const jobRuns: JobRunRow[] = (jobRunsResult.data as JobRunRow[] | null) ?? []
  const latestByJob = new Map<string, JobRunRow>()
  for (const r of jobRuns) {
    if (!latestByJob.has(r.job_name)) latestByJob.set(r.job_name, r)
  }

  // Balance checks: latest per account_id
  const balChecks: BalanceCheckRow[] = (balChecksResult.data as BalanceCheckRow[] | null) ?? []
  const latestCheckByAcct = new Map<string, BalanceCheckRow>()
  for (const c of balChecks) {
    if (!latestCheckByAcct.has(c.account_id)) latestCheckByAcct.set(c.account_id, c)
  }

  const acctBals: AcctBalRow[] = (acctBalResult.data as AcctBalRow[] | null) ?? []
  const balByAcct = new Map(acctBals.map(a => [a.id, a.current_balance]))

  const todayStr = new Date().toISOString().slice(0, 10)
  const dupCount: number | '—' = dupsError ? '—' : dups.length
  const dupColor = dupsError
    ? 'var(--signal-neg)'
    : typeof dupCount === 'number' && dupCount > 0
      ? 'var(--signal-warn)'
      : 'var(--signal-pos)'
  const sinClasCount: number = sinClasResult.count ?? 0
  const sinClasColor = sinClasCount > 0 ? 'var(--signal-warn)' : 'var(--signal-pos)'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '34px 50px 60px' }}>

      {/* ── Cabecera ─────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="label">Estado situacional</div>
          <div className="display-it" style={{ fontSize: 30, marginTop: 4 }}>
            EGM<span style={{ color: 'var(--ink-3)' }}>·</span>Fin
          </div>
          <div className="roman" style={{ fontSize: 13, marginTop: 4, color: 'var(--ink-3)' }}>
            dossier de control · tablero vivo
          </div>
        </div>
        <div className="roman" style={{ fontSize: 11, color: 'var(--ink-4)', textAlign: 'right', lineHeight: 1.7 }}>
          {tablero.meta.revision}<br />
          {tablero.meta.fecha}
        </div>
      </div>

      <div className="rule-strong" style={{ margin: '20px 0 24px' }} />

      {/* ── Strip 3 columnas ────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 32,
        paddingBottom: 24,
        borderBottom: '1px solid var(--rule)',
      }}>
        {/* Bloque actual */}
        <div>
          <div className="label" style={{ marginBottom: 8 }}>bloque</div>
          <div className="display" style={{ fontSize: 15, lineHeight: 1.3 }}>
            {tablero.bloque_actual}
          </div>
          <div className="roman" style={{
            fontSize: 12,
            marginTop: 6,
            color: tablero.bloque_estado === 'cerrado'
              ? 'var(--signal-pos)'
              : 'var(--signal-warn)',
          }}>
            {tablero.bloque_estado}
          </div>
        </div>

        {/* Foco */}
        <div>
          <div className="label" style={{ marginBottom: 8 }}>foco</div>
          <div className="display-it" style={{ fontSize: 15, lineHeight: 1.3 }}>
            {tablero.foco}
          </div>
        </div>

        {/* Salud de datos — duplicados + sin clasificar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>duplicados PSD2 · revisión</div>
            <div className="num" style={{ fontSize: 40, lineHeight: 1, color: dupColor }}>
              {dupCount}
            </div>
            <div className="display-it" style={{ fontSize: 12, marginTop: 6, color: 'var(--ink-3)' }}>
              {dupsError
                ? 'error al consultar'
                : dups.length === 0
                  ? 'sin duplicados · ok'
                  : `${dups.length} grupo${dups.length > 1 ? 's' : ''} · revisar`}
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>sin clasificar · categoría</div>
            <Link
              href={CONTROL_SIN_CLASIF}
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              <span className="num" style={{ fontSize: 40, lineHeight: 1, color: sinClasColor }}>
                {sinClasCount}
              </span>
            </Link>
            <div className="display-it" style={{ fontSize: 12, marginTop: 6, color: 'var(--ink-3)' }}>
              {sinClasCount === 0
                ? 'todo clasificado · ok'
                : <Link href={CONTROL_SIN_CLASIF} style={{ color: 'var(--signal-warn)', textDecoration: 'none' }}>
                    clasificar en control →
                  </Link>
              }
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* ── Grid 2×2 ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="Hecho">
          <ItemList items={tablero.hecho as Entry[]} withMk />
        </Card>

        <Card title="Pendiente">
          <ItemList items={tablero.pendiente as Entry[]} />
        </Card>

        <Card title="Horizonte">
          <ItemList items={tablero.horizonte as Entry[]} withMk />
        </Card>

        <Card title="Decisiones abiertas">
          <ItemList items={tablero.decisiones as Entry[]} />
        </Card>
      </div>

      <div style={{ height: 20 }} />

      {/* ── Deuda + Salud · ancho completo ──────────────── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

          {/* Deuda técnica */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Deuda técnica</div>
            <ItemList items={tablero.deuda as Entry[]} withMk />
          </div>

          {/* Salud live */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Salud de datos · live</div>

            {/* Último cierre semanal (D-020) */}
            {closureError ? (
              <div className="roman" style={{ fontSize: 12, color: 'var(--signal-neg)', marginBottom: 14 }}>
                Error cierre semanal: {closureError.message}
              </div>
            ) : closures.length === 0 ? (
              <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 14 }}>
                Sin cierres semanales aún.
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>Último cierre</div>
                {closures.map((cl) => {
                  const isOk = cl.data_health === 'ok'
                  const semaforoColor = cl.semaforo === 'verde'
                    ? 'var(--signal-pos)'
                    : cl.semaforo === 'rojo'
                      ? 'var(--signal-neg)'
                      : 'var(--signal-warn)'
                  const healthColor = cl.data_health === 'roto'
                    ? 'var(--signal-neg)'
                    : 'var(--signal-warn)'
                  const scopeLabel = cl.scope === 'compartida'
                    ? 'compartida'
                    : cl.scope.replace('privada_', '')
                  return (
                    <div
                      key={cl.scope}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '68px 1fr auto',
                        gap: 8,
                        padding: '6px 0',
                        borderBottom: '1px solid var(--rule-2)',
                        alignItems: 'baseline',
                      }}
                    >
                      <span className="roman" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {scopeLabel}
                      </span>
                      <span style={{ fontSize: 12 }}>
                        {isOk ? (
                          cl.semaforo ? (
                            <span className="num" style={{ color: semaforoColor }}>{cl.semaforo}</span>
                          ) : (
                            <span className="roman" style={{ color: 'var(--ink-4)' }}>
                              Aún sin histórico suficiente
                            </span>
                          )
                        ) : (
                          <span className="roman" style={{ color: healthColor }}>
                            {cl.data_health === 'roto' ? 'roto' : 'parcial'}
                            {cl.health_reason ? ` — ${cl.health_reason}` : ''}
                          </span>
                        )}
                      </span>
                      {Number(cl.recent_bad_count) > 0 && (
                        <span className="num" style={{ fontSize: 10, color: 'var(--signal-warn)' }}>
                          {cl.recent_bad_count}×
                        </span>
                      )}
                    </div>
                  )
                })}
                <div className="roman" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 4 }}>
                  semana {closures[0]?.week_start} – {closures[0]?.week_end}
                </div>
              </div>
            )}

            {dupsError ? (
              <div className="roman" style={{ fontSize: 13, color: 'var(--signal-neg)' }}>
                Error al consultar: {dupsError.message}
              </div>
            ) : dups.length === 0 ? (
              <div className="roman" style={{ fontSize: 13, color: 'var(--signal-pos)' }}>
                Sin duplicados PSD2 pendientes de revisión.
              </div>
            ) : (
              <div>
                {dups.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '76px 1fr 86px 28px',
                      gap: 8,
                      padding: '7px 0',
                      borderBottom: '1px solid var(--rule-2)',
                      alignItems: 'baseline',
                    }}
                  >
                    <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                      {d.txn_date}
                    </span>
                    <span style={{
                      fontSize: 12.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {d.description ?? d.account_name}
                    </span>
                    <span className="num" style={{ fontSize: 12, textAlign: 'right' }}>
                      {fmtAmt(d.amount)} €
                    </span>
                    <span className="num" style={{ fontSize: 11, textAlign: 'right', color: 'var(--signal-warn)' }}>
                      ×{d.n}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Jobs · pulso de automatización ──────────────── */}
      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>Jobs · pulso de automatización</div>
        {latestByJob.size === 0 ? (
          <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
            Sin registros aún — aparecerán tras el primer run con la versión actual.
          </div>
        ) : (
          [...latestByJob.entries()].map(([jobName, run], i, arr) => {
            const ageH = (Date.now() - new Date(run.run_at).getTime()) / 3_600_000
            const staleLimit = jobName === 'sync_psd2' ? 36 : 96   // 36h / 4 días
            const isStale    = ageH > staleLimit
            const dotColor   = run.status === 'error'
              ? 'var(--signal-neg)'
              : (isStale || run.status === 'partial')
                ? 'var(--signal-warn)'
                : 'var(--signal-pos)'
            const ageStr = ageH < 1
              ? `${Math.round(ageH * 60)}m`
              : ageH < 48
                ? `${ageH.toFixed(0)}h`
                : `${(ageH / 24).toFixed(0)}d`
            const runAtLocal = new Date(run.run_at).toLocaleString('es-ES', {
              dateStyle: 'short', timeStyle: 'short',
            })
            const statusLabel = isStale && run.status === 'ok'
              ? 'ok · congelado'
              : run.status
            return (
              <div
                key={jobName}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 130px 44px 1fr',
                  gap: 8,
                  padding: '7px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--rule-2)' : undefined,
                  alignItems: 'baseline',
                }}
              >
                <span className="num" style={{ fontSize: 12 }}>{jobName}</span>
                <span className="roman" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{runAtLocal}</span>
                <span className="num" style={{ fontSize: 11, color: dotColor }}>{ageStr}</span>
                <span className="roman" style={{ fontSize: 11, color: dotColor }}>{statusLabel}</span>
              </div>
            )
          })
        )}
      </div>

      {/* ── Ancla de saldo · verificación vs banco ───────── */}
      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <div className="label" style={{ marginBottom: 12 }}>Ancla de saldo · banco vs calculado</div>
        {latestCheckByAcct.size === 0 ? (
          <div className="roman" style={{ fontSize: 12, color: 'var(--signal-warn)' }}>
            Sin anclas aún — se llenarán en el próximo sync PSD2.
          </div>
        ) : (
          [...latestCheckByAcct.entries()].map(([acctId, check], i, arr) => {
            const acctName      = (check.accounts as { name: string } | null)?.name ?? acctId.slice(0, 8)
            const calcBalance   = balByAcct.get(acctId)
            const delta         = calcBalance !== undefined
              ? check.real_balance - calcBalance
              : null
            const isToday       = check.check_date === todayStr

            let anchorColor: string
            let anchorLabel: string
            if (!isToday) {
              anchorColor = 'var(--signal-warn)'
              anchorLabel = `sin ancla hoy · última ${check.check_date}`
            } else if (delta === null) {
              anchorColor = 'var(--ink-4)'
              anchorLabel = 'sin balance calculado'
            } else if (Math.abs(delta) <= 0.01) {
              anchorColor = 'var(--signal-pos)'
              anchorLabel = '↔ ok'
            } else {
              anchorColor = 'var(--signal-neg)'
              anchorLabel = `Δ ${delta >= 0 ? '+' : ''}${fmtAmt(delta)} €`
            }

            return (
              <div
                key={acctId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 100px 100px 1fr',
                  gap: 8,
                  padding: '7px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--rule-2)' : undefined,
                  alignItems: 'baseline',
                }}
              >
                <span className="roman" style={{ fontSize: 12 }}>{acctName}</span>
                <span className="num" style={{ fontSize: 12 }}>{fmtAmt(check.real_balance)} €</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {calcBalance !== undefined ? `${fmtAmt(calcBalance)} €` : '—'}
                </span>
                <span className="roman" style={{ fontSize: 11, color: anchorColor }}>{anchorLabel}</span>
              </div>
            )
          })
        )}
      </div>

      {/* TODO: ubicación final del acceso a /estado pendiente decisión Eric */}
      <div style={{ marginTop: 36, paddingTop: 16, borderTop: '1px solid var(--rule-2)', textAlign: 'right' }}>
        <Link href="/inicio" className="roman" style={{ fontSize: 11, color: 'var(--ink-4)', textDecoration: 'none' }}>
          ← inicio
        </Link>
      </div>
    </div>
  )
}
