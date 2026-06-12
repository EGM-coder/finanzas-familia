'use client'
import { useMemo, useState } from 'react'
import type { ComposicionRow } from '../page'
import { ComposicionPanel } from './ComposicionPanel'

type Props = {
  rows:           ComposicionRow[]
  totalByTitular: Record<string, number>
  totalTodo:      number
}

const LABEL: Record<string, string> = {
  eric:  'Eric',
  ana:   'Ana',
  comun: 'Familia',
  leo:   'Leo',
  biel:  'Biel',
}

const TITULAR_ORDER = ['eric', 'ana', 'comun', 'leo', 'biel']

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

const CARD: React.CSSProperties = {
  borderRadius: 'var(--radius)',
  boxShadow:    'var(--shadow)',
  padding:      '20px 22px',
}

export function CuentasClient({ rows, totalByTitular, totalTodo }: Props) {
  const titulares = TITULAR_ORDER.filter(t => totalByTitular[t] != null)
  const [active, setActive] = useState<string>('todo')

  const total       = active === 'todo' ? totalTodo : (totalByTitular[active] ?? 0)
  const activeLabel = active === 'todo' ? 'Todo'    : (LABEL[active] ?? active)

  // Segmentos del titular activo; para 'todo' agrega por segmento
  const activeSegmentos = useMemo(() => {
    if (active === 'todo') {
      const map = new Map<string, { segmento: string; orden: number; valor: number }>()
      for (const r of rows) {
        const prev = map.get(r.segmento)
        if (prev) { prev.valor += r.valor }
        else { map.set(r.segmento, { segmento: r.segmento, orden: r.orden, valor: r.valor }) }
      }
      return Array.from(map.values())
    }
    return rows
      .filter(r => r.titular === active)
      .map(({ segmento, orden, valor }) => ({ segmento, orden, valor }))
  }, [rows, active])

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '34px 50px 28px', display: 'flex', flexDirection: 'column' }}>

      {/* ── Cabecera ──────────────────────────────────────────── */}
      <div className="fade" style={{ marginBottom: 20 }}>
        <div className="label">Cuentas · {activeLabel}</div>
        <div className="display num" style={{ fontSize: 72, letterSpacing: '-0.025em', lineHeight: 1.02, marginTop: 4 }}>
          {fmt(total)}
          <span className="display" style={{ fontSize: 28, color: 'var(--ink-3)' }}> €</span>
        </div>
        <div className="display-it" style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>
          líquido + inversión · patrimonio completo en Inicio
        </div>
      </div>

      {/* ── Espina por titular ────────────────────────────────── */}
      <div className="fade fade-1" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
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

      {/* ── 4 paneles ─────────────────────────────────────────── */}
      <div
        className="fade fade-2"
        style={{
          display:             'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows:    'minmax(220px, auto) minmax(160px, auto)',
          gap:                 16,
        }}
      >
        {/* U2 — Composición (donut) */}
        <div className="card" style={CARD}>
          <ComposicionPanel
            segmentos={activeSegmentos}
            total={total}
            titularLabel={activeLabel}
            onSelectSegment={() => { /* U4: cablear navegación a detalle de segmento */ }}
          />
        </div>

        {/* U3 — Performance */}
        <div className="card" style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span className="label">Performance</span>
          <span className="roman" style={{ fontSize: 11, alignSelf: 'flex-end' }}>—</span>
        </div>

        {/* U8 — Asesor */}
        <div className="card" style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span className="label">Asesor</span>
          <span className="roman" style={{ fontSize: 11, alignSelf: 'flex-end' }}>—</span>
        </div>

        {/* U5 — Contingente */}
        <div className="card" style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span className="label">Contingente</span>
          <span className="roman" style={{ fontSize: 11, alignSelf: 'flex-end' }}>—</span>
        </div>
      </div>
    </div>
  )
}
