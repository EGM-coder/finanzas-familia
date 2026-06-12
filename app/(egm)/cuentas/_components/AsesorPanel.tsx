'use client'
import { useMemo, useRef, useState } from 'react'
import type { HoldingRow } from '../page'

type Segmento = { segmento: string; orden: number; valor: number }

type Props = {
  holdings:        HoldingRow[]
  active:          string
  total:           number
  activeSegmentos: Segmento[]
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function pct(value: number, of: number): string {
  if (of <= 0) return '—'
  return `${((value / of) * 100).toFixed(0)}%`
}

// ── Carrusel ─────────────────────────────────────────────────────

type CarruselProps = { slides: React.ReactNode[]; titles: string[] }

function Carrusel({ slides, titles }: CarruselProps) {
  const [idx, setIdx] = useState(0)
  const [dragX, setDragX] = useState(0)
  const dragging = useRef(false)
  const startX   = useRef(0)

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    startX.current   = e.clientX
  }

  const commit = (clientX: number) => {
    if (!dragging.current) return
    dragging.current = false
    const delta = clientX - startX.current
    if (Math.abs(delta) > 36) {
      setIdx(i => {
        if (delta < 0 && i < slides.length - 1) return i + 1
        if (delta > 0 && i > 0) return i - 1
        return i
      })
    }
    setDragX(0)
  }

  const onPointerMove  = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setDragX(e.clientX - startX.current)
  }
  const onPointerUp    = (e: React.PointerEvent) => commit(e.clientX)
  const onPointerLeave = (e: React.PointerEvent) => commit(e.clientX)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Slide container */}
      <div
        style={{ overflow: 'hidden', flex: 1, cursor: 'grab', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        <div style={{
          display:    'flex',
          height:     '100%',
          transform:  `translateX(calc(${-idx * 100}% + ${dragX}px))`,
          transition: dragX !== 0 ? 'none' : 'transform .24s cubic-bezier(.4,0,.2,1)',
          willChange: 'transform',
        }}>
          {slides.map((slide, i) => (
            <div key={i} style={{ minWidth: '100%', flexShrink: 0, paddingRight: 2 }}>
              {slide}
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, paddingTop: 10 }}>
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={titles[i]}
            style={{
              width:        idx === i ? 14 : 6,
              height:       6,
              borderRadius: 3,
              background:   idx === i ? 'var(--ink-2)' : 'var(--rule)',
              border:       'none',
              padding:      0,
              cursor:       'pointer',
              transition:   'all .2s ease',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Línea de señal — solo texto, sin color ────────────────────────

function Señal({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
      <span className="num" style={{ fontSize: 12 }}>{value}</span>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────

export function AsesorPanel({ holdings, active, total, activeSegmentos }: Props) {
  const signals = useMemo(() => {
    const activeH = active === 'todo'
      ? holdings
      : holdings.filter(h => h.titular === active)

    const cotizados = activeH.filter(
      h => ['accion', 'etf'].includes(h.asset_type) && h.current_value_eur != null
    )
    const fondos = activeH.filter(
      h => h.asset_type === 'fondo_indexado' && h.current_value_eur != null
    )

    const totalCotizados = cotizados.reduce((s, h) => s + (h.current_value_eur ?? 0), 0)

    const usdValue = activeH
      .filter(h => h.original_currency === 'USD' && h.current_value_eur != null)
      .reduce((s, h) => s + (h.current_value_eur ?? 0), 0)

    if (cotizados.length > 0) {
      const byTicker = new Map<string, number>()
      for (const h of cotizados) {
        const t = h.ticker ?? '?'
        byTicker.set(t, (byTicker.get(t) ?? 0) + (h.current_value_eur ?? 0))
      }
      const sorted = [...byTicker.entries()].sort((a, b) => b[1] - a[1])
      const [topTicker, topValue] = sorted[0]
      return {
        type:                  'cotizados' as const,
        topTicker,
        topTickerValue:        topValue,
        topTickerPctCotizados: totalCotizados > 0 ? (topValue / totalCotizados) * 100 : 0,
        topTickerPctTotal:     total > 0 ? (topValue / total) * 100 : 0,
        totalCotizados,
        usdValue,
        usdPctTotal:           total > 0 ? (usdValue / total) * 100 : 0,
      }
    }

    if (fondos.length > 0) {
      return {
        type:        'fondos' as const,
        usdValue,
        usdPctTotal: total > 0 ? (usdValue / total) * 100 : 0,
      }
    }

    const hasRoboadvisor = activeSegmentos.some(s => s.segmento === 'Roboadvisor')
    if (hasRoboadvisor) return { type: 'roboadvisor' as const }

    return { type: 'empty' as const }
  }, [holdings, active, total, activeSegmentos])

  const efectivoSeg   = activeSegmentos.find(s => s.segmento === 'Efectivo')
  const efectivoValue = efectivoSeg?.valor ?? 0
  const efectivoPct   = total > 0 ? (efectivoValue / total) * 100 : 0

  // ── Slide 1: Riesgos ─────────────────────────────────────────

  const SlideRiesgos = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Concentración */}
      <div>
        <div className="label" style={{ fontSize: 8, marginBottom: 5 }}>Concentración</div>
        {signals.type === 'cotizados' ? (
          <>
            <Señal
              label={`${signals.topTicker} · mayor posición`}
              value={`${signals.topTickerPctCotizados.toFixed(0)}% RV`}
            />
            <Señal
              label="peso sobre patrimonio total"
              value={`${signals.topTickerPctTotal.toFixed(1)}%`}
            />
          </>
        ) : signals.type === 'fondos' ? (
          <div className="roman" style={{ fontSize: 12 }}>
            Fondos indexados · diversificación global
          </div>
        ) : signals.type === 'roboadvisor' ? (
          <div className="roman" style={{ fontSize: 12 }}>
            Roboadvisor · diversificación interna opaca
          </div>
        ) : (
          <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
            Sin exposición a cotizados
          </div>
        )}
      </div>

      {/* Divisa */}
      <div>
        <div className="label" style={{ fontSize: 8, marginBottom: 5 }}>Divisa</div>
        {signals.type === 'cotizados' || signals.type === 'fondos' ? (
          signals.usdValue > 0 ? (
            <>
              <Señal
                label="exposición USD sin cobertura"
                value={`~${signals.usdPctTotal.toFixed(0)}%`}
              />
              <Señal label="valor en EUR al tipo actual" value={`${fmt(signals.usdValue)} €`} />
            </>
          ) : (
            <div className="roman" style={{ fontSize: 12 }}>
              Sin exposición USD · todo en EUR
            </div>
          )
        ) : (
          <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
            Sin datos de divisa
          </div>
        )}
      </div>
    </div>
  )

  // ── Slide 2: Liquidez ─────────────────────────────────────────

  const SlideIquidez = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="label" style={{ fontSize: 8, marginBottom: 2 }}>Efectivo disponible</div>
      {efectivoValue > 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="num" style={{ fontSize: 20 }}>{fmt(efectivoValue)}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>€</span>
          </div>
          <Señal label="sobre patrimonio líquido" value={pct(efectivoValue, total)} />
          <div className="roman" style={{ fontSize: 11, marginTop: 4 }}>
            {efectivoPct < 5
              ? 'Colchón bajo · menos del 5%'
              : efectivoPct > 30
                ? 'Efectivo elevado · considera invertir excedente'
                : 'Colchón adecuado'}
          </div>
        </>
      ) : (
        <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          Sin efectivo registrado
        </div>
      )}
    </div>
  )

  // ── Slide 3: Composición ──────────────────────────────────────

  const sorted = [...activeSegmentos].sort((a, b) => a.orden - b.orden)

  const SlideComposicion = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div className="label" style={{ fontSize: 8, marginBottom: 2 }}>
        {sorted.length} segmento{sorted.length !== 1 ? 's' : ''} · ver donut
      </div>
      {sorted.map(s => (
        <div
          key={s.segmento}
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'baseline',
            gap:            8,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.segmento}
          </span>
          <span className="num" style={{ fontSize: 11, flexShrink: 0 }}>
            {pct(s.valor, total)}
          </span>
        </div>
      ))}
      {sorted.length === 0 && (
        <div className="roman" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          Sin datos para este titular
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <span className="label" style={{ marginBottom: 2 }}>Asesor</span>
      <span className="roman" style={{ fontSize: 10, marginBottom: 12 }}>
        vista previa · sellado a datos del sistema, cero alucinación
      </span>

      <Carrusel
        slides={[SlideRiesgos, SlideIquidez, SlideComposicion]}
        titles={['Riesgos', 'Liquidez', 'Composición']}
      />
    </div>
  )
}
