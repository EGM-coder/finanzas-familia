'use client'
import type { StockOptionRow } from '../page'

type Props = {
  options:     StockOptionRow[]
  active:      string
  activeLabel: string
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function shortDate(iso: string): string {
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}-${months[parseInt(m) - 1]}-${y.slice(2)}`
}

function year(iso: string): number {
  return parseInt(iso.split('-')[0])
}

export function ContingenciaPanel({ options, active, activeLabel }: Props) {
  const visible = active === 'eric' || active === 'todo'

  const emptyState = (msg: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <span className="label" style={{ marginBottom: 2 }}>Contingente · liquidez futura</span>
      <span className="label" style={{ fontSize: 8, color: 'var(--ink-4)', marginBottom: 0 }}>
        no suma al total
      </span>
      <div
        className="display-it"
        style={{ fontSize: 13, color: 'var(--ink-4)', flex: 1, display: 'flex', alignItems: 'center' }}
      >
        {msg}
      </div>
    </div>
  )

  if (!visible) return emptyState(`Sin activos contingentes para ${activeLabel}`)
  if (options.length === 0) return emptyState('Sin opciones activas')

  const totalIntrinsic = options.reduce((s, o) => s + o.intrinsic_total, 0)
  const sample = options[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <span className="label" style={{ marginBottom: 2 }}>Contingente · liquidez futura</span>
      <span className="label" style={{ fontSize: 8, color: 'var(--ink-4)', marginBottom: 14 }}>
        no suma al total
      </span>

      {/* Packages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
        {options.map((o, i) => (
          <div
            key={o.package_name}
            style={{
              paddingBottom: 10,
              marginBottom: i < options.length - 1 ? 10 : 0,
              borderBottom: i < options.length - 1 ? '1px solid var(--rule-2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{o.package_name}</span>
              <span className="num" style={{ fontSize: 14 }}>{fmt(o.intrinsic_total)} €</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>
              {o.num_options.toLocaleString('es-ES')} opc{' '}·{' '}
              strike {fmt(o.strike_price)} €{' '}·{' '}
              <span style={{ color: o.condition_met ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                {o.condition_met ? 'condición cumplida' : 'condición pendiente'}
              </span>
            </div>
            <div className="roman" style={{ fontSize: 11 }}>
              bloqueado · ejercitable {year(o.exercise_window_start)}–{year(o.exercise_window_end)}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ paddingTop: 10, borderTop: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="label" style={{ fontSize: 9 }}>Total intrínseco</span>
          <span className="num" style={{ fontSize: 16 }}>{fmt(totalIntrinsic)} €</span>
        </div>
        {sample.current_price_eur != null && (
          <div className="roman" style={{ fontSize: 10.5, marginTop: 3 }}>
            NDX1.DE {fmtPrice(sample.current_price_eur)} €
            {sample.price_date ? ` · ${shortDate(sample.price_date)}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}
