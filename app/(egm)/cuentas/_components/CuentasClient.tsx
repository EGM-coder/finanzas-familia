'use client'
import { useState } from 'react'
import type { ComposicionRow } from '../page'

type Props = {
  rows:             ComposicionRow[]
  totalByTitular:   Record<string, number>
  totalTodo:        number
}

// Display labels — comun → "Familia" per spec
const LABEL: Record<string, string> = {
  eric:  'Eric',
  ana:   'Ana',
  comun: 'Familia',
  leo:   'Leo',
  biel:  'Biel',
}

// Canonical order for the segmented control
const TITULAR_ORDER = ['eric', 'ana', 'comun', 'leo', 'biel']

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

export function CuentasClient({ totalByTitular, totalTodo }: Props) {
  // Only show titulares that appear in the RLS-filtered data
  const titulares = TITULAR_ORDER.filter(t => totalByTitular[t] != null)
  const [active, setActive] = useState<string>('todo')

  const total = active === 'todo' ? totalTodo : (totalByTitular[active] ?? 0)
  const activeLabel = active === 'todo' ? 'Todo' : (LABEL[active] ?? active)

  return (
    <div
      style={{
        maxWidth:      960,
        margin:        '0 auto',
        padding:       '34px 50px 28px',
        display:       'flex',
        flexDirection: 'column',
        gap:           0,
      }}
    >
      {/* ── Cabecera ──────────────────────────────────────────── */}
      <div className="fade" style={{ marginBottom: 20 }}>
        <div className="label">Cuentas · {activeLabel}</div>
        <div
          className="display num"
          style={{ fontSize: 72, letterSpacing: '-0.025em', lineHeight: 1.02, marginTop: 4 }}
        >
          {fmt(total)}
          <span className="display" style={{ fontSize: 28, color: 'var(--ink-3)' }}> €</span>
        </div>
        <div
          className="display-it"
          style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}
        >
          líquido + inversión · patrimonio completo en Inicio
        </div>
      </div>

      {/* ── Espina por titular (segmented control) ────────────── */}
      <div
        className="fade fade-1"
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}
      >
        {(['todo', ...titulares] as string[]).map(t => {
          const isActive = active === t
          return (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={isActive ? 'btn btn-fill' : 'btn'}
              style={{ padding: '6px 16px', fontSize: 11, letterSpacing: '0.1em' }}
            >
              {t === 'todo' ? 'Todo' : (LABEL[t] ?? t)}
            </button>
          )
        })}
      </div>

      <div className="rule" style={{ marginBottom: 24 }} />

      {/* ── 4 paneles vacíos (marcos para U2–U5/U8) ──────────── */}
      <div
        className="fade fade-2"
        style={{
          display:             'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows:    'minmax(160px, 1fr) minmax(160px, 1fr)',
          gap:                 16,
        }}
      >
        {[
          { label: 'Composición',  note: 'U2' },
          { label: 'Performance',  note: 'U3' },
          { label: 'Asesor',       note: 'U8' },
          { label: 'Contingente',  note: 'U5' },
        ].map(panel => (
          <div
            key={panel.label}
            className="card"
            style={{
              borderRadius: 'var(--radius)',
              boxShadow:    'var(--shadow)',
              padding:      '20px 22px',
              display:      'flex',
              flexDirection:'column',
              justifyContent: 'space-between',
            }}
          >
            <span className="label">{panel.label}</span>
            <span className="roman" style={{ fontSize: 11, alignSelf: 'flex-end' }}>—</span>
          </div>
        ))}
      </div>
    </div>
  )
}
