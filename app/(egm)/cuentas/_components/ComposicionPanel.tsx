'use client'
import { useState } from 'react'

type Segmento = { segmento: string; orden: number; valor: number }

type Props = {
  segmentos:       Segmento[]
  total:           number
  titularLabel:    string
  onSelectSegment: (segmento: string) => void
}

const R  = 64
const SW = 20
const C  = 2 * Math.PI * R  // ≈ 402.12

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

// Abbreviated names for the constrained donut centre (~100px inner ø)
const SHORT: Record<string, string> = {
  'Renta variable + ETF': 'RV + ETF',
  'Fondos indexados':     'Fondos',
}
function shortName(s: string): string { return SHORT[s] ?? s }

export function ComposicionPanel({ segmentos, total, titularLabel, onSelectSegment }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const sorted = [...segmentos].sort((a, b) => a.orden - b.orden)

  // Compute arc lengths and cumulative offsets
  let cum = 0
  const arcs = sorted.map(s => {
    const len    = total > 0 ? (s.valor / total) * C : 0
    const offset = -cum
    cum += len
    return { ...s, len, offset }
  })

  const hoveredArc = hovered ? (arcs.find(s => s.segmento === hovered) ?? null) : null
  const anyHovered = hovered !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <span className="label" style={{ marginBottom: 14 }}>Composición</span>

      <div style={{ display: 'flex', gap: 18, flex: 1, alignItems: 'center', minHeight: 0 }}>

        {/* ── Donut + centre ──────────────────────────────────── */}
        <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
          {/* SVG rotated so arc starts at 12 o'clock */}
          <svg
            viewBox="0 0 160 160"
            width={160} height={160}
            style={{ display: 'block', transform: 'rotate(-90deg)' }}
            aria-hidden
          >
            {/* Empty-state ring */}
            {total === 0 && (
              <circle cx={80} cy={80} r={R} fill="none"
                stroke="var(--rule)" strokeWidth={SW} />
            )}
            {arcs.map(s => {
              const isHov = hovered === s.segmento
              return (
                <circle
                  key={s.segmento}
                  cx={80} cy={80} r={R}
                  fill="none"
                  stroke={`var(--liq-${s.orden})`}
                  strokeWidth={isHov ? SW + 4 : SW}
                  strokeDasharray={`${s.len} ${C - s.len}`}
                  strokeDashoffset={s.offset}
                  opacity={anyHovered && !isHov ? 0.25 : 1}
                  style={{
                    transition: 'stroke-width .18s ease, opacity .18s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHovered(s.segmento)}
                  onMouseLeave={() => setHovered(null)}
                />
              )
            })}
          </svg>

          {/* Centre overlay — not rotated */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', padding: '0 18px',
            pointerEvents: 'none',
          }}>
            {hoveredArc ? (
              <>
                <span className="num" style={{ fontSize: 18, lineHeight: 1.1 }}>
                  {fmt(hoveredArc.valor)}
                </span>
                <span className="label" style={{ fontSize: 7.5, marginTop: 4, lineHeight: 1.3 }}>
                  {shortName(hoveredArc.segmento)}
                </span>
              </>
            ) : (
              <>
                <span className="num" style={{ fontSize: 20, lineHeight: 1.1 }}>
                  {fmt(total)}
                </span>
                <span className="label" style={{ fontSize: 8, marginTop: 4 }}>
                  {titularLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Leyenda ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {arcs.map(s => {
            const pct   = total > 0 ? (s.valor / total) * 100 : 0
            const isHov = hovered === s.segmento
            return (
              <div
                key={s.segmento}
                onClick={() => onSelectSegment(s.segmento)}
                onMouseEnter={() => setHovered(s.segmento)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  opacity: anyHovered && !isHov ? 0.3 : 1,
                  transition: 'opacity .18s ease',
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                  background: `var(--liq-${s.orden})`,
                }} />
                <span style={{
                  flex: 1, fontSize: 11,
                  fontWeight: isHov ? 500 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.segmento}
                </span>
                <span className="num" style={{ fontSize: 10, color: 'var(--ink-3)', flexShrink: 0 }}>
                  {pct.toFixed(0)}%
                </span>
                <span className="num" style={{ fontSize: 10, flexShrink: 0, minWidth: 44, textAlign: 'right' }}>
                  {fmt(s.valor)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-4)', flexShrink: 0, lineHeight: 1 }}>›</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
