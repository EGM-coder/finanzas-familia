'use client'

import type { HistoryPoint } from '@/app/hooks/usePatrimonioHistory'

interface Props {
  points: HistoryPoint[]
  height?: number
  color?: string
}

export default function Sparkline({ points, height = 30, color }: Props) {
  if (points.length < 2) {
    return (
      <div style={{ fontSize: 10, color: '#5A5449', fontStyle: 'italic', marginTop: 4 }}>
        Histórico aún sin formar — vuelve mañana
      </div>
    )
  }

  const first = points[0].value
  const last  = points[points.length - 1].value
  const resolvedColor = color ?? (
    last > first ? '#3A5232' :
    last < first ? '#A05C3E' :
    '#5A5449'
  )

  const width = 120
  const values = points.map(p => p.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1

  const toX = (i: number) => (i / (points.length - 1)) * width
  const toY = (v: number) => height - ((v - minV) / range) * (height - 2) - 1

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path
        d={d}
        fill="none"
        stroke={resolvedColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
