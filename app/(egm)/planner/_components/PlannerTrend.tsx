'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtAmount } from '../../_lib/formatters'
import { type TendenciaPoint } from '../page'

interface Props {
  series: TendenciaPoint[]
  label: string
  color?: string
  signed?: boolean  // true para series que pueden ser negativas (Remanente)
}

// SVG viewBox units (escalan con el ancho del contenedor vía width="100%")
const SLOT_W = 21   // unidades por mes
const BAR_W  = 13   // ancho de cada barra
const BAR_OFF = 4   // offset izquierdo dentro del slot: (21-13)/2
const POS_H  = 44   // altura disponible para barras positivas
const NEG_H  = 24   // altura disponible para barras negativas (solo si signed)

function mesShort(mes: string): string {
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString('es-ES', { month: 'short' })
    .replace('.', '')
}

export function PlannerTrend({ series, label, color = 'var(--ink-3)', signed = false }: Props) {
  const router = useRouter()
  const [hovered, setHovered] = useState<number | null>(null)

  const n = series.length
  const svgW = n * SLOT_W
  const svgH = signed ? POS_H + NEG_H : POS_H
  const baseY = signed ? POS_H : svgH

  const maxAbs = Math.max(...series.map(p => (p.value !== null ? Math.abs(p.value) : 0)), 1)

  function barRect(pt: TendenciaPoint, i: number) {
    if (pt.value === null) return null
    const x = i * SLOT_W + BAR_OFF
    if (!signed) {
      const h = pt.value === 0 ? 1 : Math.max(1, (pt.value / maxAbs) * (POS_H - 4))
      return { x, y: baseY - h, h, fill: color }
    }
    if (pt.value >= 0) {
      const h = pt.value === 0 ? 1 : Math.max(1, (pt.value / maxAbs) * (POS_H - 4))
      return { x, y: baseY - h, h, fill: 'var(--signal-pos)' }
    }
    const h = Math.max(1, (Math.abs(pt.value) / maxAbs) * (NEG_H - 4))
    return { x, y: baseY, h, fill: 'var(--signal-neg)' }
  }

  const hoveredPt = hovered !== null ? series[hovered] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Label + valor en hover */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 14 }}>
        <span className="label" style={{ fontSize: 9 }}>{label}</span>
        {hoveredPt && (
          <span className="num" style={{ fontSize: 10, color: 'var(--ink-2)' }}>
            {hoveredPt.value !== null ? fmtAmount(hoveredPt.value) : '—'}
            {' · '}
            {mesShort(hoveredPt.mes)}
          </span>
        )}
      </div>

      {/* Barras SVG */}
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        aria-label={label}
      >
        {signed && (
          <line
            x1={0} y1={baseY} x2={svgW} y2={baseY}
            stroke="var(--rule)" strokeWidth={0.5}
          />
        )}
        {series.map((pt, i) => {
          const bar = barRect(pt, i)
          const hitX = i * SLOT_W
          const dimmed = hovered !== null && hovered !== i
          return (
            <g
              key={pt.mes}
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`/control?mes=${pt.mes}`, { scroll: false })}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Zona de interacción */}
              <rect x={hitX} y={0} width={SLOT_W} height={svgH} fill="transparent" />
              {bar ? (
                <rect
                  x={bar.x} y={bar.y} width={BAR_W} height={bar.h}
                  fill={bar.fill}
                  opacity={dimmed ? 0.3 : 1}
                />
              ) : (
                /* Marca honesta de hueco (sin dato) */
                <line
                  x1={hitX + SLOT_W / 2} y1={baseY - 4} x2={hitX + SLOT_W / 2} y2={baseY - 1}
                  stroke="var(--rule)" strokeWidth={1}
                />
              )}
            </g>
          )
        })}
      </svg>

      {/* Etiquetas de mes */}
      <div style={{ display: 'flex' }}>
        {series.map((pt, i) => (
          <div
            key={pt.mes}
            style={{
              flex: 1, textAlign: 'center',
              opacity: hovered !== null && hovered !== i ? 0.35 : 1,
            }}
          >
            <span className="label" style={{ fontSize: 7, color: 'var(--ink-4)' }}>
              {mesShort(pt.mes)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
