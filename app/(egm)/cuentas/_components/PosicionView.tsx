'use client'
import { useState } from 'react'
import type { HoldingRow, PricePoint } from '../page'

type Props = {
  holding:       HoldingRow
  pricesByTicker: Record<string, PricePoint[]>
  pricesByIsin:   Record<string, PricePoint[]>
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtQty(n: number): string {
  if (n === Math.floor(n)) return n.toLocaleString('es-ES')
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function shortDate(iso: string): string {
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}-${months[parseInt(m) - 1]}-${y.slice(2)}`
}

// ── SVG Price Chart ───────────────────────────────────────────────

const W = 400, H = 130
const PAD = { top: 10, right: 6, bottom: 24, left: 42 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

function xOf(i: number, n: number): number {
  return PAD.left + (n > 1 ? i / (n - 1) : 0.5) * INNER_W
}

function yOf(price: number, minP: number, rangeP: number): number {
  return PAD.top + (1 - (price - minP) / rangeP) * INNER_H
}

function PriceChart({ prices }: { prices: PricePoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (prices.length < 2) {
    return (
      <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)', padding: '24px 0 8px' }}>
        histórico de precio no disponible aún
      </div>
    )
  }

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  const vals   = sorted.map(p => p.close_eur)
  const minP   = Math.min(...vals)
  const maxP   = Math.max(...vals)
  const rangeP = maxP - minP || 1

  const polyPts = sorted.map((p, i) =>
    `${xOf(i, sorted.length).toFixed(1)},${yOf(p.close_eur, minP, rangeP).toFixed(1)}`
  ).join(' ')

  const first    = sorted[0].close_eur
  const last     = sorted[sorted.length - 1].close_eur
  const delta    = last - first
  const deltaPos = delta >= 0
  const deltaPct = first > 0 ? (Math.abs(delta) / first) * 100 : 0

  const hovered  = hoverIdx !== null ? sorted[hoverIdx] : null

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xNorm = (e.clientX - rect.left) / rect.width
    const dataMin = PAD.left / W
    const dataMax = (W - PAD.right) / W
    const t = (xNorm - dataMin) / (dataMax - dataMin)
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.round(t * (sorted.length - 1))))
    setHoverIdx(idx)
  }

  // Y-axis labels at min, mid, max
  const yLabels = [
    { price: maxP, y: PAD.top },
    { price: (minP + maxP) / 2, y: PAD.top + INNER_H / 2 },
    { price: minP, y: PAD.top + INNER_H },
  ]

  // Crosshair x position as %
  const crossX = hoverIdx !== null
    ? `${(xOf(hoverIdx, sorted.length) / W * 100).toFixed(2)}%`
    : null

  return (
    <div>
      {/* Delta badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span className="num" style={{
          fontSize: 13,
          color: deltaPos ? 'var(--signal-pos)' : 'var(--signal-neg)',
        }}>
          {deltaPos ? '+' : '−'}{fmtPrice(Math.abs(delta))} €
        </span>
        <span className="roman" style={{ fontSize: 11 }}>
          · {deltaPos ? '+' : '−'}{deltaPct.toFixed(1)}% · 90 d
        </span>
        {hovered && (
          <span className="roman" style={{ fontSize: 11, marginLeft: 4, color: 'var(--ink-2)' }}>
            · {shortDate(hovered.date)} → {fmtPrice(hovered.close_eur)} €
          </span>
        )}
      </div>

      {/* Chart */}
      <div
        style={{ position: 'relative', lineHeight: 0 }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          aria-hidden
        >
          {/* Grid + Y labels */}
          {yLabels.map(({ price, y }) => (
            <g key={price}>
              <line
                x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="var(--rule)" strokeWidth="0.5"
              />
              <text x={PAD.left - 4} y={y + 3.5}
                fontSize="8.5" textAnchor="end"
                fill="var(--ink-4)" fontFamily="var(--mono)">
                {price.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Vertical crosshair */}
          {crossX !== null && hoverIdx !== null && (
            <line
              x1={xOf(hoverIdx, sorted.length)} y1={PAD.top}
              x2={xOf(hoverIdx, sorted.length)} y2={H - PAD.bottom}
              stroke="var(--ink-4)" strokeWidth="0.8" strokeDasharray="2 2"
            />
          )}

          {/* Price line */}
          <polyline
            points={polyPts}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Hover dot */}
          {hoverIdx !== null && (
            <circle
              cx={xOf(hoverIdx, sorted.length)}
              cy={yOf(sorted[hoverIdx].close_eur, minP, rangeP)}
              r="3"
              fill="var(--ink-1)"
            />
          )}
        </svg>

        {/* X-axis date range */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 2,
        }}>
          <span className="roman" style={{ fontSize: 10 }}>{shortDate(sorted[0].date)}</span>
          <span className="roman" style={{ fontSize: 10 }}>{shortDate(sorted[sorted.length - 1].date)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────

export function PosicionView({ holding: h, pricesByTicker, pricesByIsin }: Props) {
  const prices: PricePoint[] = h.ticker
    ? (pricesByTicker[h.ticker] ?? [])
    : (h.isin ? (pricesByIsin[h.isin] ?? []) : [])

  const value = h.current_value_eur ?? (
    h.current_price_eur != null ? h.quantity * h.current_price_eur : null
  )

  return (
    <div className="fade">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 3 }}>
          {h.ticker ?? h.asset_type}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          {value != null && (
            <span className="num" style={{ fontSize: 28 }}>{fmt(value)} €</span>
          )}
          {h.current_price_eur != null && (
            <span className="roman" style={{ fontSize: 12 }}>
              {fmtQty(h.quantity)} × {fmtPrice(h.current_price_eur)} €
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 3 }}>{h.name}</div>
      </div>

      {/* Chart */}
      <PriceChart prices={prices} />
    </div>
  )
}
