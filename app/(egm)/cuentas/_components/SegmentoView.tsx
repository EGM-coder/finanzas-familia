'use client'
import type { DetalleRow } from '../page'

type Props = {
  detalleRows:  DetalleRow[]
  active:       string
  activeLabel:  string
  segmento:     string
  segmentoTotal: number
  total:        number
  onSelectAccount: (accountId: string, accountName: string, institution: string) => void
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

const TITULAR_LABEL: Record<string, string> = {
  eric: 'Eric', ana: 'Ana', comun: 'Familia', leo: 'Leo', biel: 'Biel',
}

export function SegmentoView({
  detalleRows, active, activeLabel, segmento, segmentoTotal, total, onSelectAccount,
}: Props) {
  const accounts = detalleRows
    .filter(r => r.segmento === segmento && (active === 'todo' || r.titular === active))
    .filter(r => (r.valor ?? 0) > 0.005)
    .sort((a, b) => b.valor - a.valor)

  const pct = total > 0 ? (segmentoTotal / total) * 100 : 0

  return (
    <div className="fade">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 3 }}>{segmento}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="num" style={{ fontSize: 28 }}>{fmt(segmentoTotal)} €</span>
          <span className="roman" style={{ fontSize: 12 }}>
            {pct.toFixed(1)}% de {activeLabel}
          </span>
        </div>
      </div>

      {/* Account list */}
      {accounts.length === 0 ? (
        <div className="roman" style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          Sin cuentas en este segmento
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {accounts.map((r, i) => (
            <div
              key={r.account_id + r.segmento}
              onClick={() => onSelectAccount(r.account_id, r.name, r.institution)}
              className="egm-row-clickable"
              style={{
                display:       'grid',
                gridTemplateColumns: 'auto 1fr auto auto',
                alignItems:    'center',
                gap:           12,
                padding:       '12px 8px',
                borderTop:     i > 0 ? '1px solid var(--rule-2)' : undefined,
                cursor:        'pointer',
              }}
            >
              {/* Institution badge */}
              <div style={{
                width:        32, height: 32, borderRadius: 8, flexShrink: 0,
                background:   'var(--bg-soft)',
                border:       '1px solid var(--rule)',
                display:      'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.1 }}>
                  {r.institution.slice(0, 3).toUpperCase()}
                </span>
              </div>

              {/* Name + institution */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </div>
                <div className="roman" style={{ fontSize: 11 }}>
                  {r.institution}
                  {active === 'todo' && (
                    <span style={{ marginLeft: 6 }}>· {TITULAR_LABEL[r.titular] ?? r.titular}</span>
                  )}
                </div>
              </div>

              {/* Value */}
              <span className="num" style={{ fontSize: 14 }}>{fmt(r.valor)} €</span>

              {/* Arrow */}
              <span style={{ fontSize: 14, color: 'var(--ink-4)' }}>›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
