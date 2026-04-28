'use client'

import { useState } from 'react'
import type { StockOptionValued } from '@/types/cuentas'
import DeltaIndicator from '@/app/components/DeltaIndicator'

const C = {
  text:      '#2A2822',
  secondary: '#5A5449',
  border:    '#DDD7C7',
  surface:   '#FFFFFF',
  negative:  '#A05C3E',
  accent:    '#4C5844',
}

const BADGE = {
  pending:     { bg: '#F0EDE6', color: '#5A5449' },
  exercisable: { bg: '#E6EDE4', color: '#3A5232' },
  blocked:     { bg: '#FDF3E3', color: '#7A5A1A' },
  closed:      { bg: '#F5EAE6', color: '#A05C3E' },
}

function fmtEur(n: number, visible: boolean, decimals = 0): string {
  if (!visible) return '•••'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function BadgeResolved({ so }: { so: StockOptionValued }) {
  const today = new Date().toISOString().slice(0, 10)
  const inWindow = today >= so.exercise_window_start && today <= so.exercise_window_end

  let style: { bg: string; color: string }
  let label: string

  if (!so.vested) {
    style = BADGE.pending
    label = `Vesting ${fmtDate(so.vesting_date)}`
  } else if (so.exercisable_now) {
    style = BADGE.exercisable
    label = 'EJERCITABLE'
  } else if (!inWindow) {
    style = BADGE.closed
    label = 'Ventana cerrada'
  } else {
    style = BADGE.blocked
    label = `Bloqueado: mín ${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(so.condition_min_price)} €`
  }

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
      background: style.bg, color: style.color,
    }}>
      {label}
    </span>
  )
}

interface Props {
  options: StockOptionValued[]
  visible: boolean
  deltaAbs: number | null
  deltaPct: number | null
  refDate: string | null
}

export default function StockOptionsCard({ options, visible, deltaAbs, deltaPct }: Props) {
  const [open, setOpen] = useState(false)

  const totalIntrinsic = options.reduce((s, o) => s + (o.intrinsic_total ?? 0), 0)

  return (
    <div style={{
      background: C.surface, borderRadius: 10,
      border: `1px solid ${C.border}`, overflow: 'hidden',
      margin: '0 16px',
    }}>
      {/* Cabecera */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ fontSize: 11, color: C.secondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Stock Options
        </div>
        <div style={{
          fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 400, lineHeight: 1.1,
          fontFeatureSettings: "'tnum'", color: C.text,
        }}>
          {fmtEur(totalIntrinsic, visible)}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: C.secondary }}>
          Valor intrínseco actual
        </div>
        {visible && (
          <div style={{ marginTop: 4 }}>
            <DeltaIndicator delta={deltaAbs} pct={deltaPct} visible={visible} />
          </div>
        )}
        <div style={{ marginTop: 3, fontSize: 10, color: C.secondary, fontStyle: 'italic' }}>
          informativo, no suma al patrimonio neto
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 16px', background: 'none', border: 'none',
          borderTop: `1px solid ${C.border}`, cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 11, color: C.secondary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Desglose
        </span>
        <span style={{
          color: C.secondary, fontSize: 16, lineHeight: 1,
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.18s ease',
        }}>›</span>
      </button>

      {/* Rows colapsables */}
      {open && options.map(so => (
        <div key={so.id} style={{
          padding: '10px 16px',
          borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
              {so.package_name}
            </span>
            <span style={{ fontSize: 12, color: C.text, fontFeatureSettings: "'tnum'" }}>
              {fmtEur(so.intrinsic_total, visible)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.secondary, marginBottom: 6 }}>
            {new Intl.NumberFormat('es-ES').format(so.num_options)} opc · strike{' '}
            {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(so.strike_price)} €
            {so.current_price_eur != null && (
              <> · precio {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(so.current_price_eur)} €</>
            )}
          </div>
          <BadgeResolved so={so} />
        </div>
      ))}
    </div>
  )
}
