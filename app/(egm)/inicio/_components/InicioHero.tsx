'use client'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(
    Math.abs(Math.round(n)),
  )
}

function useCountUp(target: number, durationSec: number): number {
  const [val, setVal] = useState(0) // empieza en 0; el counter anima hasta target
  const frameRef = useRef<number>(0)
  const startRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    startRef.current = undefined
    const durationMs = durationSec * 1000

    const step = (t: number) => {
      if (startRef.current === undefined) startRef.current = t
      const elapsed = t - startRef.current
      const p = Math.min(elapsed / durationMs, 1)
      const eased = 1 - (1 - p) ** 3 // ease-out cubic
      setVal(target * eased)
      if (p < 1) frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [target, durationSec])

  return val
}

interface Props {
  liquidos: number
  patrimonioNeto: number
  deltaNeto: number | null
}

export function InicioHero({ liquidos, patrimonioNeto, deltaNeto }: Props) {
  const shouldReduce = useReducedMotion() ?? false
  const duration = shouldReduce ? 0.15 : 0.6
  const display = useCountUp(liquidos, duration)

  const hasDelta = deltaNeto != null && Math.abs(deltaNeto) > 0.5
  const deltaPos = (deltaNeto ?? 0) >= 0

  return (
    <div>
      {/* ── Cifra héroe + breathe ── */}
      <div
        className={shouldReduce ? 'display num' : 'display num breathe'}
        style={{ fontSize: 64, lineHeight: 1, letterSpacing: '-0.02em' }}
        suppressHydrationWarning
      >
        {fmt(display)}
        <span style={{ fontSize: 32, color: 'var(--ink-3)', marginLeft: 6 }}>€</span>
      </div>

      {/* ── Sub-línea editorial ── */}
      <div className="display-it" style={{ marginTop: 6, fontSize: 15 }}>
        Disponible hoy · inmueble y opciones Nordex aparte
      </div>

      {/* ── Neto actual ── */}
      <div style={{ marginTop: 10 }}>
        <span className="roman" style={{ fontSize: 12 }}>
          Neto actual ·{' '}
          <span className="num" style={{ fontSize: 12 }}>
            {fmt(patrimonioNeto)} €
          </span>
        </span>
      </div>

      {/* ── Δ temporal · 30 d ── */}
      {hasDelta && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span
            className="num"
            style={{
              fontSize: 11,
              color: deltaPos ? 'var(--signal-pos)' : 'var(--signal-neg)',
            }}
          >
            {deltaPos ? '+' : '\u2212'}{fmt(Math.abs(deltaNeto!))} €
          </span>
          <span className="label" style={{ fontSize: 9 }}>· 30 d</span>
        </div>
      )}
    </div>
  )
}
